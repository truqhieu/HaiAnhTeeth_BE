const LeaveRequest = require('../models/leaveRequest.model');
const Appointment = require('../models/appointment.model');
const DoctorSchedule = require('../models/doctorSchedule.model');
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
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.startDate = { ...(filter.startDate || {}), $gte: start };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.startDate = { ...(filter.startDate || {}), $lte: end };
      }
    }

    const sortOrder = sort === 'asc' ? 1 : -1;

    const [total, leaveRequests] = await Promise.all([
      LeaveRequest.countDocuments(filter),
      LeaveRequest.find(filter)
        .populate({
          path: 'userId',
          select: 'fullName role'
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

    // ✅ Khi approve: Tìm appointments bị ảnh hưởng, tạo notifications cho staff, đánh dấu bác sĩ unavailable
    if (status === 'Approved' && handleRequest.userId) {
      try {
        const doctorUserId = handleRequest.userId._id;
        const startDate = new Date(handleRequest.startDate);
        const endDate = new Date(handleRequest.endDate);

        // 1. Tìm tất cả appointments của bác sĩ trong khoảng thời gian nghỉ
        const affectedAppointments = await Appointment.find({
          doctorUserId: doctorUserId,
          status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
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
          .populate('serviceId', 'serviceName');

        // Filter out appointments where timeslotId couldn't match
        const validAppointments = affectedAppointments.filter(apt => apt.timeslotId !== null);

        console.log(`📋 Tìm thấy ${validAppointments.length} appointments bị ảnh hưởng cho bác sĩ ${handleRequest.userId.fullName}`);

        // 2. Lấy tất cả staff users
        const staffUsers = await User.find({ role: 'Staff', status: 'Active' }).select('_id fullName');
        console.log(`👥 Tìm thấy ${staffUsers.length} staff users`);

        // 3. Tạo notifications cho mỗi staff về từng appointment bị ảnh hưởng
        const notificationPromises = [];
        
        for (const appointment of validAppointments) {
          const patientName = appointment.customerId 
            ? appointment.customerId.fullName 
            : appointment.patientUserId?.fullName || 'Bệnh nhân';
          
          const appointmentDate = new Date(appointment.timeslotId.startTime);
          const dateStr = appointmentDate.toLocaleDateString('vi-VN');
          const timeStr = appointmentDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

          for (const staff of staffUsers) {
            notificationPromises.push(
              notificationService.createNotification({
                userId: staff._id,
                createdByUserId: managerId,
                title: 'Bác sĩ nghỉ phép - Cần gán bác sĩ thay thế',
                message: `Bác sĩ ${handleRequest.userId.fullName} nghỉ phép từ ${new Date(startDate).toLocaleDateString('vi-VN')} đến ${new Date(endDate).toLocaleDateString('vi-VN')}. Lịch hẹn với ${patientName} vào ${dateStr} lúc ${timeStr} cần được gán bác sĩ thay thế.`,
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

        // 4. Đánh dấu DoctorSchedule của bác sĩ thành "Unavailable" trong khoảng thời gian nghỉ
        // Lặp qua từng ngày trong khoảng thời gian nghỉ
        const currentDate = new Date(startDate);
        currentDate.setHours(0, 0, 0, 0);
        const lastDate = new Date(endDate);
        lastDate.setHours(0, 0, 0, 0);

        const scheduleUpdatePromises = [];
        
        while (currentDate <= lastDate) {
          // Cập nhật cả ca sáng và ca chiều
          for (const shift of ['Morning', 'Afternoon']) {
            scheduleUpdatePromises.push(
              DoctorSchedule.updateMany(
                {
                  doctorUserId: doctorUserId,
                  date: {
                    $gte: new Date(currentDate.setHours(0, 0, 0, 0)),
                    $lt: new Date(currentDate.setHours(23, 59, 59, 999))
                  },
                  shift: shift
                },
                {
                  $set: { status: 'Unavailable' }
                }
              ).catch(err => {
                console.error(`❌ Lỗi cập nhật schedule ngày ${currentDate.toLocaleDateString('vi-VN')} ca ${shift}:`, err.message);
                return null;
              })
            );
          }
          
          // Tăng ngày lên 1
          currentDate.setDate(currentDate.getDate() + 1);
        }

        await Promise.all(scheduleUpdatePromises);
        console.log(`✅ Đã đánh dấu bác sĩ ${handleRequest.userId.fullName} là Unavailable từ ${new Date(startDate).toLocaleDateString('vi-VN')} đến ${new Date(endDate).toLocaleDateString('vi-VN')}`);

      } catch (error) {
        console.error('❌ Lỗi xử lý khi approve leave request:', error);
        // Không throw error để không làm gián đoạn việc approve
      }
    }

    // ✅ Khi approve: Tìm appointments bị ảnh hưởng, tạo notifications cho staff, đánh dấu bác sĩ unavailable
    if (status === 'Approved' && handleRequest.userId) {
      try {
        const doctorUserId = handleRequest.userId._id || handleRequest.userId;
        const startDate = new Date(handleRequest.startDate);
        const endDate = new Date(handleRequest.endDate);

        // 1. Tìm tất cả appointments của bác sĩ trong khoảng thời gian nghỉ
        const affectedAppointments = await Appointment.find({
          doctorUserId: doctorUserId,
          status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
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
          .populate('serviceId', 'serviceName');

        // Filter out appointments where timeslotId couldn't match
        const validAppointments = affectedAppointments.filter(apt => apt.timeslotId !== null);

        console.log(`📋 Tìm thấy ${validAppointments.length} appointments bị ảnh hưởng cho bác sĩ`);

        // 2. Lấy tất cả staff users
        const staffUsers = await User.find({ role: 'Staff', status: 'Active' }).select('_id fullName');
        console.log(`👥 Tìm thấy ${staffUsers.length} staff users`);

        // 3. Tạo notifications cho mỗi staff về từng appointment bị ảnh hưởng
        const notificationPromises = [];
        const doctorName = handleRequest.userId.fullName || handleRequest.userId.toString();
        
        for (const appointment of validAppointments) {
          const patientName = appointment.customerId 
            ? appointment.customerId.fullName 
            : appointment.patientUserId?.fullName || 'Bệnh nhân';
          
          const appointmentDate = new Date(appointment.timeslotId.startTime);
          const dateStr = appointmentDate.toLocaleDateString('vi-VN');
          const timeStr = appointmentDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

          for (const staff of staffUsers) {
            notificationPromises.push(
              notificationService.createNotification({
                userId: staff._id,
                createdByUserId: managerId,
                title: 'Bác sĩ nghỉ phép - Cần gán bác sĩ thay thế',
                message: `Bác sĩ ${doctorName} nghỉ phép từ ${new Date(startDate).toLocaleDateString('vi-VN')} đến ${new Date(endDate).toLocaleDateString('vi-VN')}. Lịch hẹn với ${patientName} vào ${dateStr} lúc ${timeStr} cần được gán bác sĩ thay thế.`,
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

        // 4. Đánh dấu DoctorSchedule của bác sĩ thành "Unavailable" trong khoảng thời gian nghỉ
        const currentDate = new Date(startDate);
        currentDate.setHours(0, 0, 0, 0);
        const lastDate = new Date(endDate);
        lastDate.setHours(0, 0, 0, 0);

        const scheduleUpdatePromises = [];
        
        while (currentDate <= lastDate) {
          const dateStart = new Date(currentDate);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(currentDate);
          dateEnd.setHours(23, 59, 59, 999);

          // Cập nhật cả ca sáng và ca chiều
          for (const shift of ['Morning', 'Afternoon']) {
            scheduleUpdatePromises.push(
              DoctorSchedule.updateMany(
                {
                  doctorUserId: doctorUserId,
                  date: { $gte: dateStart, $lte: dateEnd },
                  shift: shift
                },
                {
                  $set: { status: 'Unavailable' }
                }
              ).catch(err => {
                console.error(`❌ Lỗi cập nhật schedule:`, err.message);
                return null;
              })
            );
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }

        await Promise.all(scheduleUpdatePromises);
        console.log(`✅ Đã đánh dấu bác sĩ là Unavailable từ ${new Date(startDate).toLocaleDateString('vi-VN')} đến ${new Date(endDate).toLocaleDateString('vi-VN')}`);

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

