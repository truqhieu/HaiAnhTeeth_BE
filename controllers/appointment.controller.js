const appointmentService = require('../services/appointment.service');
const emailService = require('../services/email.service');
const Policy = require('../models/policy.model');
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const PatientRequest = require('../models/patientRequest.model')
const availableSlotService = require('../services/availableSlot.service');
const { getActiveServicesForDoctor } = require('../services/medicalRecord.service');

// Helper function to calculate available time range for morning/afternoon shifts
function calculateAvailableTimeRange(availableSlots, shift, workingHours) {
  console.log(`🔍 Calculating ${shift} shift from ${availableSlots.length} available slots`);
  
  const slots = availableSlots.filter(slot => {
    const startTime = new Date(slot.startTime);
    // Convert UTC to Vietnam time for comparison
    const vietnamTime = new Date(startTime.getTime() + 7 * 60 * 60 * 1000);
    const hour = vietnamTime.getHours();
    
    console.log(`   Slot: ${slot.displayTime} (UTC: ${startTime.toISOString()}, VN: ${vietnamTime.toLocaleTimeString('vi-VN')})`);
    
    if (shift === 'morning') {
      return hour >= 8 && hour < 12;
    } else {
      return hour >= 14 && hour < 18;
    }
  });

  console.log(`📅 ${shift} shift: Found ${slots.length} slots`);

  if (slots.length === 0) {
    return {
      hasAvailable: false,
      startTime: null,
      endTime: null,
      message: shift === 'morning' ? 'Ca sáng đã hết chỗ' : 'Ca chiều đã hết chỗ'
    };
  }

  // Sort slots by start time
  slots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  
  // Lấy slot đầu tiên và cuối cùng
  const firstSlot = slots[0];
  const lastSlot = slots[slots.length - 1];
  
  const startTime = new Date(firstSlot.startTime);
  const endTime = new Date(lastSlot.endTime);
  
  console.log(`📅 ${shift} shift: First slot ${firstSlot.startTime} - ${firstSlot.endTime}`);
  console.log(`📅 ${shift} shift: Last slot ${lastSlot.startTime} - ${lastSlot.endTime}`);
  console.log(`📅 ${shift} shift: Final range ${startTime.toLocaleTimeString('vi-VN')} - ${endTime.toLocaleTimeString('vi-VN')}`);
  
  // Convert UTC to Vietnam time for display
  const vnStartTime = new Date(startTime.getTime() + 7 * 60 * 60 * 1000);
  const vnEndTime = new Date(endTime.getTime() + 7 * 60 * 60 * 1000);
  
  return {
    hasAvailable: true,
    startTime: vnStartTime.toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    }),
    endTime: vnEndTime.toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    }),
    message: shift === 'morning' ? 'Ca sáng có sẵn' : 'Ca chiều có sẵn'
  };
}

const createConsultationAppointment = async (req, res) => {
  try {
    const {
      phoneNumber,
      appointmentFor,
      serviceId,
      doctorUserId, 
      doctorScheduleId,
      selectedSlot,
      notes
    } = req.body;

    // fullName và email có thể không được gửi nếu appointmentFor là 'self'
    let { fullName, email } = req.body;

    console.log('🔍 DEBUG createConsultationAppointment:');
    console.log('   - req.user:', req.user);
    console.log('   - req.headers.authorization:', req.headers.authorization ? 'EXISTS' : 'MISSING');
    console.log('   - req.body:', {
      fullName,
      email,
      phoneNumber,
      appointmentFor,
      serviceId,
      doctorUserId,
      doctorScheduleId,
      selectedSlot
    });

    // Lấy thông tin user đã đăng nhập
    const userId = req.user?.userId;

    console.log('   - userId extracted:', userId);

    if (!userId) {
      console.error('❌ userId is missing!');
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để đặt lịch tư vấn'
      });
    }

    // Validation các trường bắt buộc từ form
    if (!serviceId || !doctorUserId || !doctorScheduleId || !selectedSlot) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ thông tin: dịch vụ, bác sĩ, lịch làm việc và khung giờ'
      });
    }

    // Validation selectedSlot
    if (!selectedSlot.startTime || !selectedSlot.endTime) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn khung giờ hợp lệ'
      });
    }

    // Nếu appointmentFor là 'other', cần fullName và email
    if (appointmentFor === 'other') {
      if (!fullName || !email) {
        return res.status(400).json({
          success: false,
          message: 'Khi đặt lịch cho người khác, vui lòng cung cấp họ tên và email'
        });
      }
    }

    // Nếu appointmentFor là 'self', lấy thông tin từ user đã đăng nhập
    if (appointmentFor === 'self') {
      const User = require('../models/user.model');
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
        success: false,
          message: 'Không tìm thấy thông tin người dùng'
        });
      }
      fullName = user.fullName;
      email = user.email;
    }

    console.log('   - Final fullName:', fullName);
    console.log('   - Final email:', email);

    // Gọi service để tạo appointment
    const result = await appointmentService.createConsultationAppointment({
      patientUserId: userId,
      fullName,
      email,
      phoneNumber,
      appointmentFor,
      serviceId,
      doctorUserId,
      doctorScheduleId,
      selectedSlot,
      notes
    });

    console.log('✅ Appointment created successfully:', result);

    return res.status(201).json({
      success: true,
      message: 'Đặt lịch tư vấn thành công',
      data: result
    });

  } catch (error) {
    console.error('❌ Error in createConsultationAppointment:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi server khi tạo lịch tư vấn',
      error: error.message
    });
  }
};

const reviewAppointment = async (req, res) => {
  try {
    const { appointmentId, action, cancelReason } = req.body;

    if (!appointmentId || !action) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID lịch hẹn và hành động'
      });
    }

    if (!['approve', 'cancel'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Hành động không hợp lệ. Chỉ chấp nhận: approve, cancel'
      });
    }

    if (action === 'cancel' && !cancelReason) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp lý do hủy lịch'
      });
    }

    const result = await appointmentService.reviewAppointment(
      appointmentId,
      req.user.id, // staffUserId
      action,
      cancelReason
    );

    return res.status(200).json({
      success: true,
      message: action === 'approve' ? 'Duyệt lịch hẹn thành công' : 'Hủy lịch hẹn thành công',
      data: result
    });

  } catch (error) {
    console.error('❌ Error in reviewAppointment:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi xử lý lịch hẹn',
      error: error.message
    });
  }
};

const getPendingAppointments = async (req, res) => {
  try {
    const appointments = await appointmentService.getPendingAppointments();
    
    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách lịch hẹn chờ duyệt thành công',
      data: appointments
    });

  } catch (error) {
    console.error('❌ Error in getPendingAppointments:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi lấy danh sách lịch hẹn chờ duyệt',
      error: error.message
    });
  }
};

const getAllAppointments = async (req, res) => {
  try {
    const { status, startDate, endDate, doctorId, serviceId, page = 1, limit = 10 } = req.query;
    
    const appointments = await appointmentService.getAllAppointments({
      status,
      startDate,
      endDate,
      doctorId,
      serviceId,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    console.log('📋 getAllAppointments response:', {
      success: appointments.success,
      dataType: Array.isArray(appointments.data) ? 'array' : typeof appointments.data,
      dataLength: appointments.data?.length || 0
    });
    
    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách tất cả lịch hẹn thành công',
      data: appointments.data || appointments
    });

  } catch (error) {
    console.error('❌ Error in getAllAppointments:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi lấy danh sách lịch hẹn',
      error: error.message
    });
  }
};

const getMyAppointments = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { includePendingPayment, status } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để xem lịch hẹn'
      });
    }

    const appointments = await appointmentService.getUserAppointments(
      userId,
      {
        includePendingPayment: includePendingPayment === 'true',
        status,
      }
    );
    
    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách lịch hẹn của bạn thành công',
      data: appointments
    });

  } catch (error) {
    console.error('❌ Error in getMyAppointments:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi lấy danh sách lịch hẹn của bạn',
      error: error.message
    });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;

    if (!appointmentId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID lịch hẹn và trạng thái mới'
      });
    }

    if (!['CheckedIn', 'InProgress', 'Completed', 'Cancelled', 'No-Show'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ. Chỉ chấp nhận: CheckedIn, InProgress, Completed, Cancelled, No-Show'
      });
    }

    const result = await appointmentService.updateAppointmentStatus(
      appointmentId,
      status,
      req.user.id // userId
    );

    return res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái lịch hẹn thành công',
      data: result
    });

  } catch (error) {
    console.error('❌ Error in updateAppointmentStatus:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi cập nhật trạng thái lịch hẹn',
      error: error.message
    });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { cancelReason } = req.body;
    const userId = req.user?.userId;

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID lịch hẹn'
      });
    }

    // Validate appointmentId format
    if (typeof appointmentId !== 'string' || appointmentId.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'ID lịch hẹn không hợp lệ'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để hủy lịch hẹn'
      });
    }

    const result = await appointmentService.cancelAppointment({
      appointmentId,
      userId,
      cancelReason
    });

    return res.status(200).json({
        success: true,
      message: 'Hủy lịch hẹn thành công',
        data: result
      });

  } catch (error) {
    console.error('❌ Error in cancelAppointment:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi hủy lịch hẹn',
      error: error.message
    });
  }
};

const confirmCancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { confirmed, cancelReason, bankInfo } = req.body;
    const userId = req.user?.userId;

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID lịch hẹn'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để xác nhận hủy lịch hẹn'
      });
    }

    if (confirmed === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng xác nhận có muốn hủy lịch hẹn không'
      });
    }

    const result = await appointmentService.confirmCancelAppointment({
      appointmentId,
      userId,
      confirmed,
      cancelReason,
      bankInfo
    });

    return res.status(200).json({
        success: true,
      message: confirmed ? 'Xác nhận hủy lịch hẹn thành công' : 'Đã hủy thao tác hủy lịch hẹn',
        data: result
      });

  } catch (error) {
    console.error('❌ Error in confirmCancelAppointment:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi xác nhận hủy lịch hẹn',
      error: error.message
    });
  }
};

const getAppointmentDetails = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID lịch hẹn'
      });
    }

    const appointment = await appointmentService.getAppointmentDetails(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Lấy chi tiết lịch hẹn thành công',
      data: appointment
    });

  } catch (error) {
    console.error('❌ Error in getAppointmentDetails:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi lấy chi tiết lịch hẹn',
      error: error.message
    });
  }
};

const markAsRefunded = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID lịch hẹn'
      });
    }

    const result = await appointmentService.markAsRefunded(appointmentId);

    return res.status(200).json({
      success: true,
      message: 'Đánh dấu đã hoàn tiền thành công',
      data: result
    });

  } catch (error) {
    console.error('❌ Error in markAsRefunded:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi đánh dấu đã hoàn tiền',
      error: error.message
    });
  }
};

// ⭐ Lấy danh sách khung giờ rảnh dùng cho đổi lịch hẹn (theo appointmentId)
const getRescheduleAvailableSlots = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { date } = req.query; // YYYY-MM-DD

    if (!date) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp ngày (YYYY-MM-DD)' });
    }

    const appointment = await Appointment.findById(appointmentId)
      .populate('serviceId', 'serviceName durationMinutes')
      .populate('doctorUserId', 'fullName');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn' });
    }

    // Kiểm tra lịch làm việc của bác sĩ trong ngày đó
    const DoctorSchedule = require('../models/doctorSchedule.model');
    const serviceDuration = appointment.serviceId.durationMinutes || 30;
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    // Tìm lịch làm việc của bác sĩ trong ngày
    const doctorSchedules = await DoctorSchedule.find({
      doctorUserId: appointment.doctorUserId._id,
      date: searchDate,
      status: 'Available'
    }).sort({ startTime: 1 });

    let workingHours;
    let hasDoctorSchedule = false;

    if (doctorSchedules.length === 0) {
      // Nếu không có doctorSchedule, sử dụng workingHours mặc định
      // Lấy workingHours từ bác sĩ hoặc sử dụng mặc định
      const Doctor = require('../models/doctor.model');
      const doctor = await Doctor.findOne({ userId: appointment.doctorUserId._id });
      
      if (doctor && doctor.workingHours) {
        workingHours = doctor.workingHours;
      } else {
        // Sử dụng workingHours mặc định nếu không có
        workingHours = {
          morningStart: '08:00',
          morningEnd: '12:00',
          afternoonStart: '14:00',
          afternoonEnd: '18:00'
        };
      }
      
      console.log('📅 No doctorSchedule found, using default workingHours:', workingHours);
    } else {
      // Sử dụng workingHours từ DoctorSchedule đầu tiên
      workingHours = doctorSchedules[0].workingHours || {
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00'
      };
      hasDoctorSchedule = true;
    }

    // ⭐ THAY ĐỔI: Trả về thông tin khoảng thời gian khả dụng thay vì tạo slots cố định
    // Người dùng có thể chọn bất kỳ thời gian nào trong khoảng này
    
    // Tạo thông tin ca sáng và chiều
    const morningRange = {
      start: workingHours.morningStart,
      end: workingHours.morningEnd,
      available: true
    };
    
    const afternoonRange = {
      start: workingHours.afternoonStart,
      end: workingHours.afternoonEnd,
      available: true
    };
    
    console.log(`📅 Morning range: ${morningRange.start} - ${morningRange.end}`);
    console.log(`📅 Afternoon range: ${afternoonRange.start} - ${afternoonRange.end}`);

    // Lấy thông tin các timeslots đã được đặt để kiểm tra conflict
    const Timeslot = require('../models/timeslot.model');
    
    // Tạo date range chính xác cho ngày được chọn
    const startOfDay = new Date(searchDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const endOfDay = new Date(searchDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    
    const existingTimeslots = await Timeslot.find({
      doctorUserId: appointment.doctorUserId._id,
      startTime: { 
        $gte: startOfDay,
        $lt: endOfDay
      },
      status: { $in: ['Reserved', 'Booked'] }
    });

    console.log(`🔴 Found ${existingTimeslots.length} existing timeslots for this doctor on ${date}`);

    const bookedSlots = existingTimeslots.map(ts => ({
      start: new Date(ts.startTime),
      end: new Date(ts.endTime)
    }));

    // Debug: Log booked slots
    bookedSlots.forEach((booked, index) => {
      const vnStart = new Date(booked.start.getTime() + 7 * 60 * 60 * 1000);
      const vnEnd = new Date(booked.end.getTime() + 7 * 60 * 60 * 1000);
      console.log(`   Booked ${index + 1}: ${vnStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${vnEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
    });

    // ⭐ SỬA LỖI: Sử dụng logic buffer time giống như availableSlot service
    const appointmentServiceDuration = appointment.serviceId.durationMinutes || 30; // Lấy thời gian dịch vụ
    const breakAfterMinutes = 10; // 10 phút buffer (giống như availableSlot service)
    
    console.log(`⏱️ Service duration: ${appointmentServiceDuration} minutes`);
    console.log(`⏱️ Break after minutes: ${breakAfterMinutes} minutes`);

    // Tạo danh sách booked slots đã cộng buffer ở cuối
    const bookedSlotsWithBuffer = bookedSlots.map(b => ({
      start: new Date(b.start),
      end: new Date(new Date(b.end).getTime() + breakAfterMinutes * 60000)
    }));

    // Hàm kiểm tra xem có thể đặt lịch tại thời điểm startTime không
    // Sử dụng logic giống như availableSlot service
    const canBookAtTime = (startTimeStr) => {
      const [startHour, startMinute] = startTimeStr.split(':').map(Number);
      const startDate = new Date(searchDate);
      startDate.setUTCHours(startHour, startMinute, 0, 0);
      
      const endDate = new Date(startDate.getTime() + appointmentServiceDuration * 60000);
      
      // Kiểm tra xem có conflict với lịch đã có không
      // Sử dụng logic giống như availableSlot service: slotStart < booked.end && slotEndWithBuffer > booked.start
      const hasConflict = bookedSlotsWithBuffer.some(booked => {
        const bookedStart = new Date(booked.start);
        const bookedEnd = new Date(booked.end);
        
        // Tính buffer time cho slot mới (giống như availableSlot service)
        const slotEndWithBuffer = new Date(endDate.getTime() + breakAfterMinutes * 60000);
        
        // Conflict nếu: startDate < bookedEnd && slotEndWithBuffer > bookedStart
        return startDate < bookedEnd && slotEndWithBuffer > bookedStart;
      });
      
      return !hasConflict;
    };

    // ⭐ SỬA LỖI: Logic điều chỉnh thời gian dựa trên lịch đã đặt
    const adjustTimeRange = (range) => {
      // Nếu không có lịch đặt, giữ nguyên thời gian mặc định
      if (bookedSlots.length === 0) {
        return {
          start: range.start,
          end: range.end,
          available: true
        };
      }
      
      // Tính điểm bắt đầu khả dụng sơ bộ = max(range.start, max(endBooked+break) trong range)
      const [startHour, startMinute] = range.start.split(':').map(Number);
      const [endHour, endMinute] = range.end.split(':').map(Number);

      const toMinutes = (h, m) => h * 60 + m;
      const fromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

      const rangeStartMins = toMinutes(startHour, startMinute);
      const rangeEndMins = toMinutes(endHour, endMinute);

      // Lấy phút của các booked end + break trong ca này
      let earliestCandidateMins = rangeStartMins;
      bookedSlotsWithBuffer.forEach(b => {
        const endDate = new Date(b.end); // b.end đã bao gồm break
        // Chuyển sang giờ Việt Nam (UTC+7) để so sánh với workingHours (định nghĩa theo VN time)
        const endVN = new Date(endDate.getTime() + 7 * 60 * 60 * 1000);
        const endH = endVN.getUTCHours();
        const endM = endVN.getUTCMinutes();
        const endMins = toMinutes(endH, endM);
        // Nếu slot này nằm trước khi kết thúc ca và kéo dãn earliest
        if (endMins > earliestCandidateMins && endMins <= rangeEndMins) {
          earliestCandidateMins = endMins;
        }
      });

      let adjustedStart = null;
      let adjustedEnd = null;

      // Quét từ earliestCandidateMins tới cuối ca để tìm phút đầu hợp lệ
      for (let minuteTotal = earliestCandidateMins; minuteTotal <= rangeEndMins; minuteTotal++) {
        const timeStr = fromMinutes(minuteTotal);
        if (canBookAtTime(timeStr)) {
          adjustedStart = timeStr;
          break;
        }
      }
      
      // Tìm thời gian kết thúc khả dụng cuối cùng
      for (let minuteTotal = rangeEndMins; minuteTotal >= rangeStartMins; minuteTotal--) {
        const timeStr = fromMinutes(minuteTotal);
        if (canBookAtTime(timeStr)) {
          adjustedEnd = timeStr;
          break;
        }
      }
      
      // Nếu không tìm thấy thời gian khả dụng nào, trả về range rỗng
      if (!adjustedStart || !adjustedEnd) {
        return {
          start: range.start,
          end: range.start,
          available: false
        };
      }
      
      return {
        start: adjustedStart,
        end: adjustedEnd,
        available: adjustedStart < adjustedEnd
      };
    };

    // Điều chỉnh ca sáng và chiều
    const adjustedMorningRange = adjustTimeRange(morningRange);
    const adjustedAfternoonRange = adjustTimeRange(afternoonRange);
    
    console.log(`📅 Original morning: ${morningRange.start} - ${morningRange.end}`);
    console.log(`📅 Adjusted morning: ${adjustedMorningRange.start} - ${adjustedMorningRange.end} (available: ${adjustedMorningRange.available})`);
    console.log(`📅 Original afternoon: ${afternoonRange.start} - ${afternoonRange.end}`);
    console.log(`📅 Adjusted afternoon: ${adjustedAfternoonRange.start} - ${adjustedAfternoonRange.end} (available: ${adjustedAfternoonRange.available})`);
    
    // Debug: Test một số thời điểm cụ thể
    console.log(`🔍 Testing specific times:`);
    console.log(`   - 08:00: ${canBookAtTime('08:00')}`);
    console.log(`   - 08:30: ${canBookAtTime('08:30')}`);
    console.log(`   - 08:40: ${canBookAtTime('08:40')}`);
    console.log(`   - 09:10: ${canBookAtTime('09:10')}`);
    console.log(`   - 09:20: ${canBookAtTime('09:20')}`);
    console.log(`   - 09:30: ${canBookAtTime('09:30')}`);

    // ⭐ THÊM: Kiểm tra thời gian hiện tại để điều chỉnh khoảng thời gian khả dụng
    const now = new Date();
    console.log(`⏰ Current time: ${now.toISOString()}`);
    
    // Nếu là hôm nay, điều chỉnh thời gian bắt đầu dựa trên thời gian hiện tại
    const todayStr = new Date().toISOString().split('T')[0];
    if (date === todayStr) {
      const currentVNTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const currentHour = currentVNTime.getHours();
      const currentMinute = currentVNTime.getMinutes();
      const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      console.log(`🕐 Current VN time: ${currentTimeStr}`);
      
      // Điều chỉnh ca sáng nếu cần
      if (adjustedMorningRange.start < currentTimeStr && adjustedMorningRange.end > currentTimeStr) {
        adjustedMorningRange.start = currentTimeStr;
        console.log(`📅 Adjusted morning start to: ${adjustedMorningRange.start}`);
      }
      
      // Điều chỉnh ca chiều nếu cần
      if (adjustedAfternoonRange.start < currentTimeStr && adjustedAfternoonRange.end > currentTimeStr) {
        adjustedAfternoonRange.start = currentTimeStr;
        console.log(`📅 Adjusted afternoon start to: ${adjustedAfternoonRange.start}`);
      }
    }

    // Cập nhật ranges với thông tin đã điều chỉnh
    Object.assign(morningRange, adjustedMorningRange);
    Object.assign(afternoonRange, adjustedAfternoonRange);

    return res.status(200).json({
      success: true,
      data: {
        date,
        serviceName: appointment.serviceId.serviceName,
        serviceDuration: appointment.serviceId.durationMinutes,
        doctorName: appointment.doctorUserId.fullName,
        // ⭐ THAY ĐỔI: Trả về thông tin khoảng thời gian thay vì slots cố định
        morningRange: morningRange,
        afternoonRange: afternoonRange,
        bookedSlots: bookedSlots.map(slot => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          // Convert to VN time for display
          displayStart: new Date(slot.start.getTime() + 7 * 60 * 60 * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }),
          displayEnd: new Date(slot.end.getTime() + 7 * 60 * 60 * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
        })),
        hasDoctorSchedule: hasDoctorSchedule,
        message: hasDoctorSchedule 
          ? 'Bạn có thể chọn bất kỳ thời gian nào trong khoảng thời gian làm việc của bác sĩ'
          : 'Bạn có thể chọn bất kỳ thời gian nào trong khoảng thời gian làm việc mặc định',
        // Giữ lại để tương thích với frontend cũ
        morningAvailable: morningRange,
        afternoonAvailable: afternoonRange
      },
    });
  } catch (error) {
    console.error('❌ Error in getRescheduleAvailableSlots:', error);
    return res.status(500).json({ success: false, message: 'Lỗi khi lấy khung giờ rảnh', error: error.message });
  }
};

// ⭐ Bệnh nhân gửi yêu cầu đổi lịch hẹn (chỉ đổi ngày/giờ)
const requestReschedule = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { newStartTime, newEndTime, reason } = req.body;
    const userId = req.user?.userId;

    console.log('🔍 DEBUG requestReschedule:');
    console.log('   - appointmentId:', appointmentId);
    console.log('   - userId:', userId);
    console.log('   - newStartTime:', newStartTime);
    console.log('   - newEndTime:', newEndTime);

    // Validation
    if (!newStartTime || !newEndTime) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp thời gian bắt đầu và kết thúc mới'
      });
    }

    const newStart = new Date(newStartTime);
    const newEnd = new Date(newEndTime);

    if (newStart >= newEnd) {
      return res.status(400).json({
        success: false,
        message: 'Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc'
      });
    }

    if (newStart <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Thời gian mới phải trong tương lai'
      });
    }

    // Tìm appointment và kiểm tra quyền sở hữu
    const appointment = await Appointment.findById(appointmentId)
      .populate('patientUserId', 'fullName email')
      .populate('doctorUserId', 'fullName email')
      .populate('serviceId', 'serviceName')
      .populate('timeslotId');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }

    // Lưu thông tin cũ trước khi cập nhật
    const oldStartTime = appointment.timeslotId ? appointment.timeslotId.startTime : null;
    const oldEndTime = appointment.timeslotId ? appointment.timeslotId.endTime : null;

    // Kiểm tra quyền sở hữu
    if (appointment.patientUserId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thay đổi lịch hẹn này'
      });
    }

    // Kiểm tra trạng thái cho phép đổi lịch
    if (!['Pending', 'Approved'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể đổi lịch khi trạng thái là Chờ duyệt hoặc Đã xác nhận'
      });
    }

    // Kiểm tra xem đã có request pending chưa
    const PatientRequest = require('../models/patientRequest.model');
    const existingRequest = await PatientRequest.findOne({
      appointmentId,
      requestType: 'Reschedule',
      status: 'Pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Đã có yêu cầu đổi lịch đang chờ xử lý'
      });
    }

    // Kiểm tra xem thời gian yêu cầu có khả dụng không
    // Không bó buộc vào DoctorSchedule; nếu ngày chưa có lịch sẽ tự tạo khi duyệt
    const Timeslot = require('../models/timeslot.model');

    // Kiểm tra xem có bị trùng với lịch hẹn khác không (bao gồm cả timeslot đã reserved)
    const existingAppointments = await Appointment.find({
      doctorUserId: appointment.doctorUserId._id,
      _id: { $ne: appointmentId },
      status: { $in: ['Pending', 'Approved', 'CheckedIn'] }
    }).populate('timeslotId');

    // Kiểm tra timeslot đã bị reserved chưa
    const existingTimeslot = await Timeslot.findOne({
      doctorUserId: appointment.doctorUserId._id,
      startTime: newStart,
      endTime: newEnd,
      status: { $in: ['Reserved', 'Booked'] }
    });

    if (existingTimeslot) {
      return res.status(400).json({
        success: false,
        message: 'Khung giờ này đã được đặt hoặc đang chờ xử lý'
      });
    }

    // ⭐ THÊM: Tính buffer time (10 phút)
    const bufferTime = 10; // 10 phút buffer
    const newEndWithBuffer = new Date(newEnd.getTime() + bufferTime * 60000);

    const hasConflict = existingAppointments.some(apt => {
      if (!apt.timeslotId) return false;
      const aptStart = new Date(apt.timeslotId.startTime);
      const aptEnd = new Date(apt.timeslotId.endTime);
      
      // Conflict nếu: newStart < aptEnd && newEndWithBuffer > aptStart
      return (newStart < aptEnd && newEndWithBuffer > aptStart);
    });

    if (hasConflict) {
      return res.status(400).json({
        success: false,
        message: 'Thời gian yêu cầu bị trùng với lịch hẹn khác'
      });
    }

    // Tạo timeslot với status "Reserved" để tránh xung đột
    const reservedTimeslot = await Timeslot.create({
      doctorUserId: appointment.doctorUserId._id,
      serviceId: appointment.serviceId._id,
      startTime: newStart,
      endTime: newEnd,
      status: 'Reserved'
    });

    // Tạo PatientRequest
    const request = new PatientRequest({
      appointmentId,
      patientUserId: userId,
      requestType: 'Reschedule',
      currentData: {
        doctorUserId: appointment.doctorUserId._id,
        timeslotId: appointment.timeslotId._id,
        startTime: appointment.timeslotId.startTime,
        endTime: appointment.timeslotId.endTime
      },
      requestedData: {
        timeslotId: reservedTimeslot._id,
        startTime: newStart,
        endTime: newEnd,
        reason: reason || 'Yêu cầu đổi lịch hẹn'
      }
    });

    await request.save();

    console.log('✅ Reschedule request created successfully');
    return res.status(201).json({
      success: true,
      message: 'Yêu cầu đổi lịch đã được gửi thành công',
      data: {
        requestId: request._id,
        appointmentId: appointment._id,
        newStartTime: newStartTime,
        newEndTime: newEndTime,
        status: 'Pending'
      }
    });

  } catch (error) {
    console.error('❌ Error in requestReschedule:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi xử lý yêu cầu đổi lịch',
      error: error.message
    });
  }
};

// ⭐ Bệnh nhân gửi yêu cầu đổi bác sĩ (chỉ đổi bác sĩ)
const requestChangeDoctor = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { newDoctorUserId, reason } = req.body;
    const userId = req.user?.userId;
    
    console.log('🔍 DEBUG requestChangeDoctor:');
    console.log('   - appointmentId:', appointmentId);
    console.log('   - userId:', userId);
    console.log('   - newDoctorUserId:', newDoctorUserId);

    // Validation
    if (!newDoctorUserId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID bác sĩ mới'
      });
    }

    // Tìm appointment và kiểm tra quyền sở hữu
    const appointment = await Appointment.findById(appointmentId)
      .populate('patientUserId', 'fullName email')
      .populate('doctorUserId', 'fullName email')
      .populate('serviceId', 'serviceName')
      .populate('timeslotId');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }

    // Lưu thông tin cũ trước khi cập nhật
    const oldDoctorName = appointment.doctorUserId.fullName;

    // Kiểm tra quyền sở hữu
    if (appointment.patientUserId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thay đổi lịch hẹn này'
      });
    }

    // Kiểm tra trạng thái cho phép đổi bác sĩ
    if (!['Pending', 'Approved'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể đổi bác sĩ khi trạng thái là Chờ duyệt hoặc Đã xác nhận'
      });
    }

    // Kiểm tra xem đã có request pending chưa
    const PatientRequest = require('../models/patientRequest.model');
    const existingRequest = await PatientRequest.findOne({
      appointmentId,
      requestType: 'ChangeDoctor',
      status: 'Pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Đã có yêu cầu đổi bác sĩ đang chờ xử lý'
      });
    }

    // Kiểm tra bác sĩ mới có tồn tại không
    const User = require('../models/user.model');
    const newDoctor = await User.findById(newDoctorUserId);
    
    if (!newDoctor || newDoctor.role !== 'Doctor') {
      return res.status(400).json({
        success: false,
        message: 'Bác sĩ không tồn tại hoặc không hợp lệ'
      });
    }

    // Kiểm tra bác sĩ mới có khác bác sĩ cũ không
    if (appointment.doctorUserId._id.toString() === newDoctorUserId) {
      return res.status(400).json({
      success: false,
        message: 'Bác sĩ mới phải khác bác sĩ hiện tại'
      });
    }

    // Kiểm tra xem bác sĩ mới có khả dụng trong khung giờ hiện tại không
    const Timeslot = require('../models/timeslot.model');
    const currentStartTime = appointment.timeslotId.startTime;
    const currentEndTime = appointment.timeslotId.endTime;

    // Kiểm tra xem bác sĩ mới có appointments trong khung giờ này không
    const conflictingAppointments = await Appointment.find({
      doctorUserId: newDoctorUserId,
      _id: { $ne: appointmentId },
      status: { $in: ['Pending', 'Approved', 'CheckedIn'] }
    }).populate('timeslotId');

    // ⭐ THÊM: Tính buffer time (10 phút)
    const bufferTime = 10; // 10 phút buffer
    const currentEndTimeWithBuffer = new Date(currentEndTime.getTime() + bufferTime * 60000);

    const hasConflict = conflictingAppointments.some(apt => {
      if (!apt.timeslotId) return false;
      const aptStart = new Date(apt.timeslotId.startTime);
      const aptEnd = new Date(apt.timeslotId.endTime);
      
      // Conflict nếu: currentStartTime < aptEnd && currentEndTimeWithBuffer > aptStart
      return (currentStartTime < aptEnd && currentEndTimeWithBuffer > aptStart);
    });

    if (hasConflict) {
      return res.status(400).json({
        success: false,
        message: 'Bác sĩ mới đã có lịch hẹn trong khung giờ này'
      });
    }

    // Kiểm tra xem bác sĩ mới có timeslot đã bị reserved chưa
    const existingTimeslot = await Timeslot.findOne({
      doctorUserId: newDoctorUserId,
      startTime: currentStartTime,
      endTime: currentEndTime,
      status: { $in: ['Reserved', 'Booked'] }
    });

    if (existingTimeslot) {
      return res.status(400).json({
        success: false,
        message: 'Bác sĩ mới đã có khung giờ này được đặt hoặc đang chờ xử lý'
      });
    }

    // Tạo timeslot với status "Reserved" cho bác sĩ mới
    const reservedTimeslot = await Timeslot.create({
      doctorUserId: newDoctorUserId,
      serviceId: appointment.serviceId._id,
      startTime: currentStartTime,
      endTime: currentEndTime,
      status: 'Reserved'
    });

    // Tạo PatientRequest
    const request = new PatientRequest({
      appointmentId,
      patientUserId: userId,
      requestType: 'ChangeDoctor',
      currentData: {
        doctorUserId: appointment.doctorUserId._id,
        timeslotId: appointment.timeslotId._id,
        startTime: appointment.timeslotId.startTime,
        endTime: appointment.timeslotId.endTime
      },
      requestedData: {
        doctorUserId: newDoctorUserId,
        timeslotId: reservedTimeslot._id,
        reason: reason || 'Yêu cầu đổi bác sĩ'
      }
    });

    await request.save();

    console.log('✅ Change doctor request created successfully');
    return res.status(201).json({
      success: true,
      message: 'Yêu cầu đổi bác sĩ đã được gửi thành công',
      data: {
        requestId: request._id,
        appointmentId: appointment._id,
        newDoctorUserId: newDoctorUserId,
        newDoctorName: newDoctor.fullName,
        status: 'Pending'
      }
    });

  } catch (error) {
    console.error('❌ Error in requestChangeDoctor:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi xử lý yêu cầu đổi bác sĩ',
      error: error.message
    });
  }
};


// ⭐ Lấy danh sách bác sĩ khả dụng cho thời gian cụ thể (dùng cho đổi bác sĩ)
const getAvailableDoctorsForTimeSlot = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { startTime, endTime } = req.query;

    console.log('🔍 DEBUG getAvailableDoctorsForTimeSlot:');
    console.log('   - appointmentId:', appointmentId);
    console.log('   - startTime:', startTime);
    console.log('   - endTime:', endTime);

    // Validation
    if (!startTime || !endTime) {
      return res.status(400).json({
      success: false,
        message: 'Vui lòng cung cấp thời gian bắt đầu và kết thúc'
      });
    }

    // Tìm appointment để lấy thông tin dịch vụ
    const appointment = await Appointment.findById(appointmentId)
      .populate('serviceId', 'serviceName durationMinutes')
      .populate('doctorUserId', 'fullName');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy lịch hẹn'
      });
    }

    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);
    const serviceDuration = appointment.serviceId.durationMinutes || 30;

    console.log(`🔍 Looking for doctors available from ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);

    // Lấy tất cả bác sĩ ACTIVE
    const User = require('../models/user.model');
    const Doctor = require('../models/doctor.model');

    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active'
    }).select('_id fullName email');

    console.log(`🔍 Found ${doctors.length} active doctors`);

    const availableDoctors = [];

    for (const doctor of doctors) {
      // Bỏ qua bác sĩ hiện tại
      if (doctor._id.toString() === appointment.doctorUserId._id.toString()) {
        continue;
      }

      // Kiểm tra xem bác sĩ có lịch làm việc trong thời gian này không
      const DoctorSchedule = require('../models/doctorSchedule.model');
      const doctorSchedule = await DoctorSchedule.findOne({
        doctorUserId: doctor._id,
        date: {
          $gte: new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate()),
          $lt: new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate() + 1)
        },
        status: 'Available'
      });

      if (!doctorSchedule) {
        console.log(`   ❌ Doctor ${doctor.fullName} has no schedule for this date`);
        continue;
      }

      // ⭐ THÊM: Tính buffer time (10 phút)
      const bufferTime = 10; // 10 phút buffer
      const endDateTimeWithBuffer = new Date(endDateTime.getTime() + bufferTime * 60000);

      // Kiểm tra xem bác sĩ có rảnh trong khoảng thời gian này không (bao gồm buffer time)
      const conflictingTimeslots = await Timeslot.find({
        doctorUserId: doctor._id,
        startTime: { $lt: endDateTimeWithBuffer },
        endTime: { $gt: startDateTime },
        status: { $in: ['Reserved', 'Booked'] }
      });

      if (conflictingTimeslots.length > 0) {
        console.log(`   ❌ Doctor ${doctor.fullName} has ${conflictingTimeslots.length} conflicting timeslots (including buffer time)`);
        continue;
      }

      // Kiểm tra xem bác sĩ có appointments trong khoảng thời gian này không (bao gồm buffer time)
      const conflictingAppointments = await Appointment.find({
        doctorUserId: doctor._id,
        'timeslotId.startTime': { $lt: endDateTimeWithBuffer },
        'timeslotId.endTime': { $gt: startDateTime },
        status: { $in: ['Approved', 'CheckedIn', 'Completed'] }
      }).populate('timeslotId');

      if (conflictingAppointments.length > 0) {
        console.log(`   ❌ Doctor ${doctor.fullName} has ${conflictingAppointments.length} conflicting appointments (including buffer time)`);
        continue;
      }

      // Kiểm tra xem có timeslot đã bị reserved chưa
      const reservedTimeslot = await Timeslot.findOne({
        doctorUserId: doctor._id,
        startTime: startDateTime,
        endTime: endDateTime,
        status: { $in: ['Reserved', 'Booked'] }
      });

      if (reservedTimeslot) {
        console.log(`   ❌ Doctor ${doctor.fullName} - time slot already reserved or booked`);
        continue;
      }

      // Kiểm tra working hours
      const workingHours = doctorSchedule.workingHours || {
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00'
      };

      const startHour = startDateTime.getUTCHours() + 7; // Convert to VN time
      const endHour = endDateTime.getUTCHours() + 7;

      const isInMorningShift = startHour >= 8 && endHour <= 12;
      const isInAfternoonShift = startHour >= 14 && endHour <= 18;

      if (!isInMorningShift && !isInAfternoonShift) {
        console.log(`   ❌ Doctor ${doctor.fullName} - time slot outside working hours`);
        continue;
      }

      availableDoctors.push({
        _id: doctor._id,
        fullName: doctor.fullName,
        email: doctor.email,
        workingHours: workingHours
      });

      console.log(`   ✅ Doctor ${doctor.fullName} is available`);
    }

    console.log(`✅ Found ${availableDoctors.length} available doctors`);

    return res.status(200).json({
      success: true,
      data: {
        appointmentId,
        currentDoctor: {
          _id: appointment.doctorUserId._id,
          fullName: appointment.doctorUserId.fullName
        },
        serviceName: appointment.serviceId.serviceName,
        serviceDuration,
        requestedStartTime: startTime,
        requestedEndTime: endTime,
        availableDoctors,
        totalAvailable: availableDoctors.length
      }
    });

  } catch (error) {
    console.error('❌ Error in getAvailableDoctorsForTimeSlot:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách bác sĩ khả dụng',
      error: error.message
    });
  }
};

const getAllDoctors = async (req, res) => {
  try {
    const User = require('../models/user.model');
    const doctors = await User.find({ role: 'Doctor' })
      .select('_id fullName')
      .sort({ fullName: 1 })
      .lean();

    const doctorsList = doctors.map(doctor => ({
      _id: doctor._id,
      fullName: doctor.fullName
    }));

    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách bác sĩ thành công',
      data: doctorsList
    });
  } catch (error) {
    console.error('❌ Error in getAllDoctors:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

// ⭐ Gán bác sĩ mới thay thế bác sĩ cũ vắng mặt
const assignDoctorToAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { newDoctorId } = req.body;


    const data = await appointmentService.assignDoctorToAppointment(
      appointmentId,
      newDoctorId
    );

    return res.status(200).json({
      success: true,
      message: 'Gán bác sĩ thành công',
      data
    });
  } catch (error) {
    console.error('❌ Error in assignDoctorToAppointment:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

// ⭐ Xác nhận đổi bác sĩ mới thay thế bác sĩ cũ
const confirmChangeDoctor = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // Patient confirm thủ công → auto = false
    const data = await appointmentService.confirmChangeDoctor(appointmentId, { auto: false });

    return res.status(200).json({
      success: true,
      message: 'Xác nhận đổi bác sĩ mới thành công',
      data
    });
  } catch (error) {
    console.error('❌ Error in confirmChangeDoctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};



// ⭐ Từ chối đổi bác sĩ mới thay thế bác sĩ cũ 
const cancelChangeDoctor = async(req,res) =>{
  try {
    const {appointmentId} = req.params;
    const data = await appointmentService.cancelChangeDoctor(appointmentId);

    return res.status(200).json({
      success: true,
      message: 'Tù chối đổi bác sĩ mới thành công',
      data
    });     
  } catch (error) {
    console.error('❌ Error in cancelChangeDoctor:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });        
  }
}


module.exports = {
  createConsultationAppointment,
  reviewAppointment,
  getPendingAppointments,
  getAllAppointments,
  getMyAppointments,
  updateAppointmentStatus,
  cancelAppointment,
  confirmCancelAppointment,
  getAppointmentDetails,
  markAsRefunded,
  requestReschedule,
  requestChangeDoctor,
  getRescheduleAvailableSlots,
  getAvailableDoctorsForTimeSlot,
  getAllDoctors,
  assignDoctorToAppointment,
  confirmChangeDoctor,
  cancelChangeDoctor,
};
