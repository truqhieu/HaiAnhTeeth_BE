const LeaveRequest = require('../models/leaveRequest.model');
const Appointment = require('../models/appointment.model');
const DoctorSchedule = require('../models/doctorSchedule.model');
const Doctor = require('../models/doctor.model');
const User = require('../models/user.model');
const notificationService = require('./notification.service');

const STATUS = LeaveRequest.schema.path('status').enumValues;

class LeaveRequestService {

  /**
   * Tạo leave request mới
   */
  async createLeaveRequest(userId, data) {
    const { startDate, endDate, reason } = data;

    if (!startDate || !endDate || !reason) {
      throw new Error('Vui lòng nhập đầy đủ thông tin');
    }

    const normalizeDay = (d) =>{
      const time = new Date(d);
      if(isNaN(time.getTime())) return null;
      time.setHours(0,0,0,0);
      return time;
    }

    const start = normalizeDay(startDate);
    const end = normalizeDay(endDate);


    if (!start) {
      throw new Error('Ngày bắt đầu không hợp lệ');
    }

    const now = normalizeDay(Date.now());

    if (start < now) {
      throw new Error('Ngày bắt đầu phải tính từ hiện tại');
    }

    if (end < start) {
      throw new Error('Ngày kết thúc phải lớn hơn ngày bắt đầu');
    }

    const cleanReason = reason.trim();
    if (cleanReason.length === 0) {
      throw new Error("Lý do nghỉ không thể để trống");
    }
    if (cleanReason.length < 3) {
      throw new Error('Độ dài lý do nghỉ phép không hợp lệ (tối thiểu 3 ký tự)');
    }
    if (!/^[a-zA-ZÀ-ỹ0-9\s.,!?;:'"()_-]+$/.test(cleanReason)) {
      throw new Error('Lí do nghỉ không hợp lệ. Vui lòng chỉ nhập chữ, số và các ký tự . , ! ? ; : ( ) _ -');
    }

    // Kiểm tra đơn nghỉ đã được duyệt có trùng thời gian không
    const existingApprovedLeave = await LeaveRequest.findOne({
      userId: userId,
      status: 'Approved',
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    });

    if (existingApprovedLeave) {
      throw new Error('Bạn đã có đơn nghỉ được duyệt trong khoảng thời gian này');
    }

    // Format real time

    const rightNow = new Date();
    
    const startToSave = new Date(start);
    startToSave.setHours(
      rightNow.getHours(),
      rightNow.getMinutes(),
    )

    const endToSave = new Date(end);
    endToSave.setHours(23, 59, 59, 999);

    const newRequest = new LeaveRequest({
      userId,
      startDate : startToSave,
      endDate : endToSave,
      reason : cleanReason,
    });

    await newRequest.save();
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
    if (userRole && ['Doctor', 'Nurse', 'Staff'].includes(userRole)) {
      filter.userId = userId;
    }
    if (status && STATUS.includes(status)) filter.status = status;

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regax = new RegExp(safe, 'i');
      filter.$or = [
        { reason: { $regex: regax } }
      ];
    }

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
          select: '_id fullName role' // ⭐ Thêm _id để frontend có thể extract
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
   * @param {string} doctorUserId - ID của bác sĩ
   * @param {Date} startDate - Ngày bắt đầu nghỉ
   * @param {Date} endDate - Ngày kết thúc nghỉ
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

    console.log(`🔄 [_restoreDoctorSchedule] Restoring schedules for doctor ${doctorUserId.toString()} after leave ended (${leaveStart.toLocaleDateString('vi-VN')} - ${leaveEnd.toLocaleDateString('vi-VN')})`);

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
      )
        .then(result => {
          if (result.modifiedCount > 0) {
            console.log(`✅ [_restoreDoctorSchedule] Restored ${result.modifiedCount} schedules for ${shift} shift (${leaveStart.toLocaleDateString('vi-VN')} - ${leaveEnd.toLocaleDateString('vi-VN')})`);
          }
          return result;
        })
        .catch(err => {
          console.error(`❌ Lỗi restore schedule ca ${shift}:`, err.message);
          return null;
        });

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

    console.log(`🔍 [_updateDoctorSchedule] Updating schedule for doctor:`, {
      doctorUserId: doctorUserId.toString(),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      startDateStr: start.toLocaleDateString('vi-VN'),
      endDateStr: end.toLocaleDateString('vi-VN')
    });

    // Loop qua từng ngày trong khoảng thời gian
    const currentDate = new Date(start);
    const lastDate = new Date(end);
    const updatePromises = [];
    let totalUpdated = 0;

    while (currentDate <= lastDate) {
      // Normalize date để so sánh chính xác (chỉ lấy ngày, bỏ giờ)
      const dateToMatch = new Date(currentDate);
      dateToMatch.setHours(0, 0, 0, 0);
      const dateToMatchEnd = new Date(currentDate);
      dateToMatchEnd.setHours(23, 59, 59, 999);

      // Kiểm tra xem có schedules nào tồn tại không
      const existingSchedules = await DoctorSchedule.find({
        doctorUserId: doctorUserId,
        date: {
          $gte: dateToMatch,
          $lte: dateToMatchEnd
        }
      });

      console.log(`🔍 [_updateDoctorSchedule] Found ${existingSchedules.length} existing schedules for ${dateToMatch.toLocaleDateString('vi-VN')}`);

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
        )
          .then(result => {
            console.log(`📊 [_updateDoctorSchedule] Update result for ${dateToMatch.toLocaleDateString('vi-VN')} - ${shift}:`, {
              matchedCount: result.matchedCount,
              modifiedCount: result.modifiedCount,
              acknowledged: result.acknowledged
            });
            if (result.modifiedCount > 0) {
              console.log(`✅ [_updateDoctorSchedule] Updated ${result.modifiedCount} schedules for ${dateToMatch.toLocaleDateString('vi-VN')} - ${shift}`);
              totalUpdated += result.modifiedCount;
            } else if (result.matchedCount === 0) {
              console.log(`⚠️ [_updateDoctorSchedule] No schedules found for ${dateToMatch.toLocaleDateString('vi-VN')} - ${shift} (may need to create schedules first)`);
            } else {
              console.log(`ℹ️ [_updateDoctorSchedule] Schedules already updated for ${dateToMatch.toLocaleDateString('vi-VN')} - ${shift}`);
            }
            return result;
          })
          .catch(err => {
            console.error(`❌ Lỗi cập nhật schedule ${dateToMatch.toLocaleDateString('vi-VN')} ca ${shift}:`, err.message);
            return null;
          });

        updatePromises.push(updatePromise);
      }

      // Tăng ngày lên 1
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await Promise.all(updatePromises);
    console.log(`✅ [_updateDoctorSchedule] Đã đánh dấu ${totalUpdated} schedules thành Unavailable từ ${start.toLocaleDateString('vi-VN')} đến ${end.toLocaleDateString('vi-VN')}`);
  }

  /**
   * Xử lý leave request (approve/reject)
   * Khi approve: Tìm appointments bị ảnh hưởng, tạo notifications cho staff, đánh dấu bác sĩ unavailable
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

    // Xử lý khi reject - restore status nếu không còn leave active
    if (status === 'Rejected' && handleRequest.userId) {
      try {
        const doctorUserId = handleRequest.userId._id || handleRequest.userId;
        
        // Check xem có còn leave active nào không
        const activeLeaves = await LeaveRequest.countDocuments({
          userId: doctorUserId,
          status: 'Approved',
          endDate: { $gte: new Date() } // Chỉ count leaves chưa hết hạn
        });

        if (activeLeaves === 0) {
          // Không còn leave active, restore về Available
          await Doctor.updateOne(
            { doctorUserId: doctorUserId },
            { $set: { status: 'Available' } }
          );
          console.log(`✅ Đã restore status của bác sĩ về 'Available' sau khi reject leave request`);
        }
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

        // 1. Tìm appointments bị ảnh hưởng
        // ⭐ Chỉ hiển thị vắng mặt cho các ca đang chờ duyệt, đã approved, hoặc đã check-in
        // KHÔNG hiển thị cho các ca đã hoàn thành (Completed) hoặc đang tiến hành (InProgress)
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
        console.log(`📋 Tìm thấy ${validAppointments.length} appointments bị ảnh hưởng cho bác sĩ ${doctorName}`);

        // 2. Tạo notifications cho staff
        if (validAppointments.length > 0) {
          await this._notifyStaffAboutAffectedAppointments(validAppointments, doctorName, startDate, endDate, managerId, requestId);
        }

        // 3. Đánh dấu DoctorSchedule thành Unavailable
        await this._updateDoctorSchedule(doctorUserId, startDate, endDate);

        // 4. Update Doctor status thành 'On Leave'
        await Doctor.updateOne(
          { doctorUserId: doctorUserId },
          { $set: { status: 'On Leave' } }
        );
        console.log(`✅ Đã cập nhật status của bác sĩ ${doctorName} thành 'On Leave'`);

      } catch (error) {
        console.error('❌ Lỗi xử lý khi approve leave request:', error);
        // Không throw error để không làm gián đoạn việc approve
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
   * Nên được gọi định kỳ (cron job) hoặc khi có request
   */
  async restoreExpiredLeaveSchedules() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Tìm tất cả leave requests đã hết hạn (endDate < today) và đã được approve
      const expiredLeaves = await LeaveRequest.find({
        status: 'Approved',
        endDate: { $lt: today }
      })
        .populate('userId', '_id')
        .lean();

      console.log(`🔄 [restoreExpiredLeaveSchedules] Found ${expiredLeaves.length} expired leave requests`);

      // Track doctors để check xem có còn leave active không
      const doctorIds = new Set();

      for (const leave of expiredLeaves) {
        if (!leave.userId || !leave.userId._id) continue;

        const doctorUserId = leave.userId._id;
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        
        // Restore schedules cho doctor này trong khoảng thời gian leave
        await this._restoreDoctorSchedule(doctorUserId, leaveStart, leaveEnd);
        doctorIds.add(doctorUserId.toString());
      }

      // Check và restore Doctor status về 'Available' nếu không còn leave active
      for (const doctorId of doctorIds) {
        const activeLeaves = await LeaveRequest.countDocuments({
          userId: doctorId,
          status: 'Approved',
          endDate: { $gte: today } // Chỉ count leaves chưa hết hạn
        });

        if (activeLeaves === 0) {
          // Không còn leave active, restore về Available
          await Doctor.updateOne(
            { doctorUserId: doctorId },
            { $set: { status: 'Available' } }
          );
          console.log(`✅ Đã restore status của bác sĩ ${doctorId} về 'Available'`);
        }
      }

      console.log(`✅ [restoreExpiredLeaveSchedules] Completed restoring schedules for ${expiredLeaves.length} expired leaves`);
    } catch (error) {
      console.error('❌ [restoreExpiredLeaveSchedules] Error:', error);
    }
  }

  /**
   * Kiểm tra xem bác sĩ có lịch nghỉ được duyệt trong khoảng thời gian appointment không
   * @param {string} doctorUserId - ID của bác sĩ
   * @param {Date} appointmentStartTime - Thời gian bắt đầu appointment
   * @returns {Promise<boolean>} - true nếu có leave, false nếu không có
   */
  async isDoctorOnLeave(doctorUserId, appointmentStartTime) {
    try {
      if (!doctorUserId || !appointmentStartTime) {
        return false;
      }

      const appointmentDate = new Date(appointmentStartTime);
      // Chỉ lấy phần ngày, bỏ phần giờ
      appointmentDate.setHours(0, 0, 0, 0);

      // Tìm leave request được approve có startDate và endDate bao phủ appointmentDate
      const leaveRequest = await LeaveRequest.findOne({
        userId: doctorUserId,
        status: 'Approved',
        startDate: { $lte: appointmentDate },
        endDate: { $gte: appointmentDate }
      });

      return !!leaveRequest;
    } catch (error) {
      console.error('❌ Lỗi kiểm tra leave của bác sĩ:', error);
      return false;
    }
  }
}

module.exports = new LeaveRequestService();

