const LeaveRequest = require('../models/leaveRequest.model');
const Appointment = require('../models/appointment.model');
const DoctorSchedule = require('../models/doctorSchedule.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const notificationService = require('./notification.service');

const STATUS = LeaveRequest.schema.path('status').enumValues;
const DateHelper = require('../utils/dateHelper');


class LeaveRequestService {

  /**
   * Tạo leave request mới
   */
  async createLeaveRequest(userId, data) {
    const { startDate, endDate, reason } = data;

    if (!startDate || !endDate || !reason) {
      throw new Error('Vui lòng nhập đầy đủ thông tin');
    }

    const checkUser = await User.findById(userId).select('role');
    if (checkUser.role === 'Doctor') {
      const checkAppointment = await Appointment.find({ doctorUserId: userId, status: 'InProgress' })
      if (checkAppointment.length > 0) {
        throw new Error('Bạn không thể nghỉ phép khi có lịch khám')
      }
    }

    let startUtc;
    let endUtc;

    try {
      startUtc = DateHelper.parseVNDateOnlyStart(startDate);
      endUtc = DateHelper.parseVNDateOnlyEnd(endDate);
    } catch (e) {
      console.error('❌ Lỗi parse ngày nghỉ:', e.message);
      throw new Error('Ngày nghỉ không hợp lệ');
    }

    if (isNaN(startUtc.getTime())) {
      throw new Error('Ngày bắt đầu không hợp lệ');
    }

    if (isNaN(endUtc.getTime())) {
      throw new Error('Ngày kết thúc không hợp lệ');
    }

    const todayVNStartUtc = DateHelper.getTodayVNStartUTC();

    if (startUtc < todayVNStartUtc) {
      throw new Error('Ngày bắt đầu phải tính từ hiện tại');
    }

    if (endUtc < startUtc) {
      throw new Error('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu');
    }

    const cleanReason = reason.trim().replace(/\s{2,}/g, ' ');
    if (cleanReason.length === 0) {
      throw new Error('Lý do nghỉ không thể để trống');
    }
    if (cleanReason.length < 3) {
      throw new Error('Độ dài lý do nghỉ phép không hợp lệ (tối thiểu 3 ký tự)');
    }
    if (/[<>]/.test(cleanReason)) {
      throw new Error(
        'Lý do nghỉ không hợp lệ. Vui lòng không sử dụng ký tự < hoặc >'
      );
    }

    const existingApprovedLeave = await LeaveRequest.findOne({
      userId,
      status: { $in: ['Approved', 'Pending'] },
      startDate: { $lte: endUtc },
      endDate: { $gte: startUtc },
    });

    if (existingApprovedLeave) {
      throw new Error('Bạn đã có đơn nghỉ trong khoảng thời gian này');
    }

    const newRequest = new LeaveRequest({
      userId,
      startDate: startUtc,
      endDate: endUtc,
      reason: cleanReason,
      status: 'Pending',
    });

    await newRequest.save();

    const listManager = await User.find({ role: 'Manager' });
    try {
      await Promise.all(
        listManager.map((manager) =>
          notificationService.createNotification({
            userId: manager._id,
            createdByUserId: userId,
            title: 'Đơn xin nghỉ phép',
            message: 'Có đơn xin nghỉ phép mới cần duyệt',
            relatedAppointmentId: null,
            leaveRequestId: newRequest._id,
            link: null,
          })
        )
      );
    } catch (notifError) {
      console.warn('⚠️ Lỗi gửi notification cho manager:', notifError.message);
    }

    return newRequest;
  }



  /**
   * Lấy danh sách leave requests
   */
  async getAllLeaveRequests(filters = {}, userRole = null, userId = null) {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      startDate,
      endDate,
      sort = 'desc',
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // Chỉ xem được đơn của chính mình nếu là Doctor/Nurse/Staff
    if (userRole && ['Doctor', 'Nurse', 'Staff'].includes(userRole)) {
      filter.userId = userId;
    }

    if (status && STATUS.includes(status)) {
      filter.status = status;
    }

    // 🔍 SEARCH: theo lý do + tên người gửi đơn
    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');

      // 1) Tìm userId có fullName khớp
      const matchedUsers = await User.find({
        fullName: { $regex: regex }
      }).select('_id').lean();

      const userIds = matchedUsers.map(u => u._id);

      // 2) Gộp điều kiện vào $or
      const orConditions = [
        { reason: { $regex: regex } } // search theo lý do
      ];

      if (userIds.length > 0) {
        orConditions.push({ userId: { $in: userIds } }); // search theo tên người gửi
      }

      filter.$or = orConditions;
    }

    // Lọc theo khoảng ngày nghỉ
    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.startDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.startDate.$lte = end;
      }
    }

    const sortOrder = sort === 'asc' ? 1 : -1;

    const [total, leaveRequests] = await Promise.all([
      LeaveRequest.countDocuments(filter),
      LeaveRequest.find(filter)
        .populate({
          path: 'userId',
          select: '_id fullName role'
        })
        .populate({
          path: 'approvedByManager',
          select: 'fullName'
        })
        .select('-__v')
        .sort({ startDate: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    return {
      success: true,
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
      data: leaveRequests
    };
  }

  /**
   * Helper: Tạo notifications cho staff về appointments bị ảnh hưởng
   */
  async _notifyStaffAboutAffectedAppointments(validAppointments, doctorName, startDate, endDate, managerId, requestId) {
    const staffUsers = await User.find({ role: 'Staff', status: 'Active' }).select('_id fullName');
    if (staffUsers.length === 0) return;

    const notificationPromises = [];
    const dateRangeStr = `${new Date(startDate).toLocaleDateString('vi-VN')} đến ${new Date(endDate).toLocaleDateString('vi-VN')}`;

    for (const appointment of validAppointments) {
      const patientName = appointment.customerId?.fullName || appointment.patientUserId?.fullName || 'Bệnh nhân';
      const appointmentDate = new Date(appointment.timeslotId.startTime);
      const dateStr = appointmentDate.toLocaleDateString('vi-VN');
      const timeStr = appointmentDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      for (const staff of staffUsers) {
        notificationPromises.push(
          notificationService.createNotification({
            userId: staff._id,
            createdByUserId: managerId,
            title: 'Bác sĩ nghỉ phép - Cần gán bác sĩ thay thế',
            message: `Bác sĩ ${doctorName} nghỉ phép từ ${dateRangeStr}. Lịch hẹn với ${patientName} vào ${dateStr} lúc ${timeStr} cần được gán bác sĩ thay thế.`,
            relatedAppointmentId: appointment._id,
            leaveRequestId: requestId,
            link: `/appointments/${appointment._id}`
          }).catch(err => {
            console.error(`❌ Lỗi tạo notification cho staff ${staff._id}:`, err.message);
            return null;
          })
        );
      }
    }

    await Promise.all(notificationPromises);
    console.log(`✅ Đã tạo ${notificationPromises.length} notifications cho staff`);
  }

  /**
   * Helper: Restore DoctorSchedule về Available sau khi hết thời gian nghỉ
   */
  async _restoreDoctorSchedule(doctorUserId, startDate, endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leaveStart = new Date(startDate);
    leaveStart.setHours(0, 0, 0, 0);
    const leaveEnd = new Date(endDate);
    leaveEnd.setHours(0, 0, 0, 0);

    // Chỉ restore nếu đã quá ngày kết thúc nghỉ
    if (today <= leaveEnd) {
      return; // Chưa đến ngày restore
    }

    console.log(`🔄 [_restoreDoctorSchedule] Restoring schedules for doctor ${doctorUserId.toString()} after leave ended`);

    // Restore schedules trong khoảng thời gian leave đã hết hạn
    const updatePromises = [];
    for (const shift of ['Morning', 'Afternoon']) {
      const updatePromise = DoctorSchedule.updateMany(
        {
          doctorUserId: doctorUserId,
          date: {
            $gte: leaveStart,
            $lte: leaveEnd
          },
          shift: shift,
          status: 'Unavailable'
        },
        { $set: { status: 'Available' } }
      );
      updatePromises.push(updatePromise);
    }

    await Promise.all(updatePromises);
  }

  /**
   * Helper: Đánh dấu DoctorSchedule thành Unavailable
   */
  async _updateDoctorSchedule(doctorUserId, startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const currentDate = new Date(start);
    const lastDate = new Date(end);
    const updatePromises = [];

    while (currentDate <= lastDate) {
      const dateToMatch = new Date(currentDate);
      dateToMatch.setHours(0, 0, 0, 0);
      const dateToMatchEnd = new Date(currentDate);
      dateToMatchEnd.setHours(23, 59, 59, 999);

      for (const shift of ['Morning', 'Afternoon']) {
        const updatePromise = DoctorSchedule.updateMany(
          {
            doctorUserId: doctorUserId,
            date: {
              $gte: dateToMatch,
              $lte: dateToMatchEnd
            },
            shift: shift
          },
          { $set: { status: 'Unavailable' } }
        );
        updatePromises.push(updatePromise);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    await Promise.all(updatePromises);
  }

  /**
   * Xử lý leave request (approve/reject)
   */
  async handleLeaveRequest(requestId, managerId, status) {
    const handleRequest = await LeaveRequest.findByIdAndUpdate(
      requestId,
      {
        approvedByManager: managerId,
        status,
      },
      { new: true, runValidators: true }
    ).populate('userId', 'fullName role');

    if (!handleRequest) {
      throw new Error('Không tìm thấy yêu cầu nghỉ phép');
    }

    // Xử lý khi reject
    if (status === 'Rejected' && handleRequest.userId) {
      try {
        const doctorUserId = handleRequest.userId._id || handleRequest.userId;

        const activeLeaves = await LeaveRequest.countDocuments({
          userId: doctorUserId,
          status: 'Approved',
          endDate: { $gte: new Date() }
        });

        if (activeLeaves === 0) {
          await Doctor.updateOne(
            { doctorUserId: doctorUserId },
            { $set: { status: 'Available' } }
          );
        }

        await notificationService.createNotification({
          userId: doctorUserId,
          createdByUserId: managerId,
          title: 'Đơn xin nghỉ của bạn đã bị từ chối',
          message: `Lý do: ${handleRequest.reason}`,
          relatedAppointmentId: null,
          link: null,
        });
      } catch (error) {
        console.error('❌ Lỗi xử lý khi reject leave request:', error);
      }
    }

    // Xử lý khi approve
    if (status === 'Approved' && handleRequest.userId) {
      try {
        const doctorUserId = handleRequest.userId._id || handleRequest.userId;
        const doctorName = handleRequest.userId.fullName || handleRequest.userId.toString();
        const startDate = new Date(handleRequest.startDate);
        const endDate = new Date(handleRequest.endDate);

        const affectedAppointments = await Appointment.find({
          doctorUserId: doctorUserId,
          status: { $in: ['Pending', 'Approved', 'CheckedIn'] },
          timeslotId: { $exists: true }
        })
          .populate({
            path: 'timeslotId',
            select: 'startTime endTime',
            match: {
              startTime: { $gte: startDate, $lte: endDate }
            }
          })
          .populate('patientUserId', 'fullName')
          .populate('customerId', 'fullName')
          .populate('serviceId', 'serviceName')
          .lean();

        const validAppointments = affectedAppointments.filter(apt => apt.timeslotId !== null);

        if (validAppointments.length > 0) {
          await this._notifyStaffAboutAffectedAppointments(validAppointments, doctorName, startDate, endDate, managerId, requestId);
        }

        await this._updateDoctorSchedule(doctorUserId, startDate, endDate);

        await notificationService.createNotification({
          userId: doctorUserId,
          createdByUserId: managerId,
          title: 'Đơn xin nghỉ của bạn đã được duyệt',
          message: `Lý do: ${handleRequest.reason}`,
          relatedAppointmentId: null,
          link: null,
        });
      } catch (error) {
        console.error('❌ Lỗi xử lý khi approve leave request:', error);
      }
    }

    const map = {
      Approved: 'duyệt',
      Rejected: 'từ chối'
    };

    return { request: handleRequest, message: `Đã ${map[status]} đơn nghỉ phép` };
  }

  /**
   * Tự động restore schedules về Available sau khi hết thời gian nghỉ
   */
  async restoreExpiredLeaveSchedules() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiredLeaves = await LeaveRequest.find({
        status: 'Approved',
        endDate: { $lt: today }
      })
        .populate('userId', '_id')
        .lean();

      const doctorIds = new Set();

      for (const leave of expiredLeaves) {
        if (!leave.userId || !leave.userId._id) continue;

        const doctorUserId = leave.userId._id;
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);

        await this._restoreDoctorSchedule(doctorUserId, leaveStart, leaveEnd);
        doctorIds.add(doctorUserId.toString());
      }

      for (const doctorId of doctorIds) {
        const activeLeaves = await LeaveRequest.countDocuments({
          userId: doctorId,
          status: 'Approved',
          endDate: { $gte: today }
        });

        if (activeLeaves === 0) {
          await Doctor.updateOne(
            { doctorUserId: doctorId },
            { $set: { status: 'Available' } }
          );
        }
      }
    } catch (error) {
      console.error('❌ [restoreExpiredLeaveSchedules] Error:', error);
    }
  }

  /**
   * Kiểm tra xem bác sĩ có lịch nghỉ được duyệt trong khoảng thời gian appointment không
   */
  async isDoctorOnLeave(doctorUserId, appointmentStartTime) {
    try {
      if (!doctorUserId || !appointmentStartTime) {
        return false;
      }

      const appointmentDate = new Date(appointmentStartTime);
      // Normalize to UTC midnight to match database storage
      appointmentDate.setUTCHours(0, 0, 0, 0);

      console.log(`🔍 [isDoctorOnLeave] Checking doctor ${doctorUserId} for date ${appointmentDate.toISOString().split('T')[0]}`);
      console.log(`   Input: ${appointmentStartTime}`);
      console.log(`   Normalized (UTC midnight): ${appointmentDate.toISOString()}`);

      const leaveRequest = await LeaveRequest.findOne({
        userId: doctorUserId,
        status: 'Approved',
        startDate: { $lte: appointmentDate },
        endDate: { $gte: appointmentDate }
      });

      if (leaveRequest) {
        console.log(`✅ [isDoctorOnLeave] Doctor ${doctorUserId} IS on leave on ${appointmentDate.toISOString().split('T')[0]}`);
        console.log(`   Leave period: ${new Date(leaveRequest.startDate).toISOString().split('T')[0]} to ${new Date(leaveRequest.endDate).toISOString().split('T')[0]}`);
      } else {
        console.log(`❌ [isDoctorOnLeave] Doctor ${doctorUserId} is NOT on leave on ${appointmentDate.toISOString().split('T')[0]}`);
      }

      return !!leaveRequest;
    } catch (error) {
      console.error('❌ Lỗi kiểm tra leave của bác sĩ:', error);
      return false;
    }
  }
}

module.exports = new LeaveRequestService();
