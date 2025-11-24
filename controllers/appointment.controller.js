const appointmentService = require('../services/appointment.service');
const emailService = require('../services/email.service');
const Policy = require('../models/policy.model');
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const PatientRequest = require('../models/patientRequest.model')
const availableSlotService = require('../services/availableSlot.service');
const { getActiveServicesForDoctor } = require('../services/medicalRecord.service');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const leaveRequestService = require('../services/leaveRequest.service');
const DoctorSchedule = require('../models/doctorSchedule.model');
const ScheduleHelper = require('../utils/scheduleHelper');

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
      notes,
      reservedTimeslotId
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
      notes,
      reservedTimeslotId
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

// ⭐ Staff tạo lịch hẹn khám trực tiếp (walk-in)
const createWalkInAppointment = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      serviceId,
      doctorUserId,
      doctorScheduleId,
      selectedSlot,
      notes
    } = req.body;

    // Yêu cầu đăng nhập (Staff/Manager)
    const staffUserId = req.user?.userId;
    if (!staffUserId) {
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    }

    // Validate
    if (!fullName || !email || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên, email, số điện thoại' });
    }
    if (!serviceId || !doctorUserId || !doctorScheduleId || !selectedSlot?.startTime || !selectedSlot?.endTime) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin dịch vụ/bác sĩ/lịch làm việc/khung giờ' });
    }

    const result = await appointmentService.createWalkInAppointment({
      staffUserId,
      fullName,
      email,
      phoneNumber,
      serviceId,
      doctorUserId,
      doctorScheduleId,
      selectedSlot,
      notes
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('❌ Error in createWalkInAppointment:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Lỗi khi tạo lịch hẹn trực tiếp',
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

const markAppointmentNoTreatment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const actorUserId = req.user?.userId;
    const actorRole = req.user?.role || 'Doctor';

    if (!actorUserId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập'
      });
    }

    const result = await appointmentService.markAppointmentNoTreatment(appointmentId, actorUserId, actorRole);

    return res.status(200).json({
      success: true,
      message: 'Đã đánh dấu ca khám là "Không cần khám"',
      data: result
    });
  } catch (error) {
    console.error('❌ Error in markAppointmentNoTreatment:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Không thể xử lý yêu cầu',
      error: error.message
    });
  }
};

const reserveTimeslot = async (req, res) => {
  try {
    const patientUserId = req.user?.userId;

    if (!patientUserId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để giữ chỗ.'
      });
    }

    const {
      doctorUserId,
      serviceId,
      doctorScheduleId,
      date,
      startTime,
      appointmentFor
    } = req.body;

    const result = await appointmentService.reserveTimeslot({
      patientUserId,
      doctorUserId,
      serviceId,
      doctorScheduleId,
      date,
      startTime,
      appointmentFor
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in reserveTimeslot:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Không thể giữ chỗ. Vui lòng thử lại.'
    });
  }
};

const releaseReservedTimeslot = async (req, res) => {
  try {
    const patientUserId = req.user?.userId;

    if (!patientUserId) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập.'
      });
    }

    const { timeslotId } = req.body;
    if (!timeslotId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin timeslotId.'
      });
    }

    const result = await appointmentService.releaseReservedTimeslot({
      patientUserId,
      timeslotId
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in releaseReservedTimeslot:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Không thể hủy giữ chỗ.'
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

    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);

    const scheduleRangeResult = await availableSlotService.getDoctorScheduleRange({
      doctorUserId: appointment.doctorUserId._id,
      serviceId: appointment.serviceId._id,
      date: searchDate,
      patientUserId: appointment.patientUserId || null,
      appointmentFor: appointment.appointmentFor || 'self'
    });

    const scheduleRanges = scheduleRangeResult?.scheduleRanges || [];
    const flattenedGaps = scheduleRanges.flatMap(range => range.availableGaps || []);

    const responseData = {
      date,
      serviceName: appointment.serviceId.serviceName,
      serviceDuration: appointment.serviceId.durationMinutes,
      serviceId: appointment.serviceId._id.toString(), // ⭐ THÊM: Trả về serviceId
      doctorName: appointment.doctorUserId.fullName,
      doctorUserId: appointment.doctorUserId._id.toString(), // ⭐ THÊM: Trả về doctorUserId
      doctorScheduleId: scheduleRangeResult?.doctorScheduleId || null,
      scheduleRanges,
      availableGaps: flattenedGaps,
      hasDoctorSchedule: !!(scheduleRanges && scheduleRanges.length > 0),
      message:
        scheduleRangeResult?.message ||
        (scheduleRanges.length > 0
          ? 'Bạn có thể chọn bất kỳ thời gian nào trong các khoảng khả dụng bên dưới.'
          : 'Bác sĩ không có thời gian phù hợp trong ngày này. Vui lòng chọn ngày khác.'),
    };

    return res.status(200).json({
      success: true,
      data: responseData,
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
    const { newStartTime, newEndTime, reason, reservedTimeslotId } = req.body;
    const userId = req.user?.userId;

    console.log('🔍 DEBUG requestReschedule:');
    console.log('   - appointmentId:', appointmentId);
    console.log('   - userId:', userId);
    console.log('   - newStartTime:', newStartTime);
    console.log('   - newEndTime:', newEndTime);
    console.log('   - reservedTimeslotId:', reservedTimeslotId);

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

    let reservedTimeslot = null;

    // ⭐ Nếu có reservedTimeslotId, sử dụng timeslot đã reserved từ trước
    if (reservedTimeslotId) {
      reservedTimeslot = await Timeslot.findById(reservedTimeslotId);
      
      if (!reservedTimeslot) {
        return res.status(400).json({
          success: false,
          message: 'Không tìm thấy khung giờ đã giữ chỗ. Vui lòng thử lại.'
        });
      }

      // Kiểm tra xem timeslot có thuộc về user này không
      if (reservedTimeslot.reservedByUserId && reservedTimeslot.reservedByUserId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Khung giờ này không thuộc về bạn. Vui lòng thử lại.'
        });
      }

      // Kiểm tra xem timeslot có còn valid không (chưa hết hạn)
      if (reservedTimeslot.status === 'Reserved' && reservedTimeslot.reservedUntil && reservedTimeslot.reservedUntil <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Khung giờ đã giữ chỗ đã hết hạn. Vui lòng chọn lại thời gian.'
        });
      }

      // Kiểm tra xem timeslot có khớp với thời gian yêu cầu không
      const slotStart = new Date(reservedTimeslot.startTime);
      const slotEnd = new Date(reservedTimeslot.endTime);
      
      if (slotStart.getTime() !== newStart.getTime() || slotEnd.getTime() !== newEnd.getTime()) {
        return res.status(400).json({
          success: false,
          message: 'Thời gian yêu cầu không khớp với khung giờ đã giữ chỗ. Vui lòng thử lại.'
        });
      }

      // Kiểm tra xem timeslot có thuộc về bác sĩ và dịch vụ đúng không
      if (reservedTimeslot.doctorUserId.toString() !== appointment.doctorUserId._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Khung giờ đã giữ chỗ không thuộc về bác sĩ này.'
        });
      }

      if (reservedTimeslot.serviceId.toString() !== appointment.serviceId._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Khung giờ đã giữ chỗ không thuộc về dịch vụ này.'
        });
      }

      // ⭐ FIX: Validate với schedule ranges để đảm bảo thời gian nằm trong working hours
      // Extract date từ newStart để validate
      const rescheduleDate = new Date(newStart);
      rescheduleDate.setUTCHours(0, 0, 0, 0);
      
      try {
        const scheduleRangeResult = await availableSlotService.getDoctorScheduleRange({
          doctorUserId: appointment.doctorUserId._id.toString(),
          serviceId: appointment.serviceId._id.toString(),
          date: rescheduleDate
        });

        if (!scheduleRangeResult.scheduleRanges || scheduleRangeResult.scheduleRanges.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Bác sĩ không có lịch làm việc vào ngày này. Vui lòng chọn ngày khác.'
          });
        }

        // Kiểm tra xem startTime và endTime có nằm trong schedule ranges không
        const scheduleRanges = scheduleRangeResult.scheduleRanges;
        const startTimeInRange = scheduleRanges.some(range => {
          const rangeStart = new Date(range.startTime);
          const rangeEnd = new Date(range.endTime);
          return newStart >= rangeStart && newStart < rangeEnd;
        });

        const isInValidRange = scheduleRanges.some(range => {
          const rangeStart = new Date(range.startTime);
          const rangeEnd = new Date(range.endTime);
          return newStart >= rangeStart && newEnd <= rangeEnd;
        });

        if (!startTimeInRange) {
          const rangesText = scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`).join(', ');
          return res.status(400).json({
            success: false,
            message: `Thời gian bạn chọn không nằm trong lịch làm việc của bác sĩ. Bác sĩ rảnh: ${rangesText}. Vui lòng chọn thời gian khác.`
          });
        }

        if (!isInValidRange) {
          // Tìm range chứa startTime để lấy thông tin
          const containingRange = scheduleRanges.find(range => {
            const rangeStart = new Date(range.startTime);
            const rangeEnd = new Date(range.endTime);
            return newStart >= rangeStart && newStart < rangeEnd;
          });

          if (containingRange) {
            // Convert endTime sang VN time để hiển thị
            const endTimeVN = new Date(newEnd);
            const endHourVN = (endTimeVN.getUTCHours() + 7) % 24;
            const endMinuteVN = endTimeVN.getUTCMinutes();
            const endTimeDisplay = `${String(endHourVN).padStart(2, '0')}:${String(endMinuteVN).padStart(2, '0')}`;

            // Convert range end sang VN time
            const rangeEndVN = new Date(containingRange.endTime);
            const rangeEndHourVN = (rangeEndVN.getUTCHours() + 7) % 24;
            const rangeEndMinuteVN = rangeEndVN.getUTCMinutes();
            const rangeEndDisplay = `${String(rangeEndHourVN).padStart(2, '0')}:${String(rangeEndMinuteVN).padStart(2, '0')}`;

            return res.status(400).json({
              success: false,
              message: `Thời gian bạn chọn không đủ để thực hiện dịch vụ. Dịch vụ sẽ kết thúc lúc ${endTimeDisplay}, nhưng bác sĩ chỉ làm việc đến ${rangeEndDisplay} trong ${containingRange.shiftDisplay.toLowerCase()}. Vui lòng chọn thời gian sớm hơn.`
            });
          } else {
            const rangesText = scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`).join(', ');
            return res.status(400).json({
              success: false,
              message: `Thời gian bạn chọn không đủ để thực hiện dịch vụ. Bác sĩ rảnh: ${rangesText}. Vui lòng chọn thời gian khác.`
            });
          }
        }
      } catch (validationError) {
        console.error('❌ Error validating schedule ranges:', validationError);
        // Nếu có lỗi khi validate, vẫn cho phép tiếp tục (vì đã có reserved slot)
        // Nhưng log để debug
      }

      console.log('✅ Using existing reserved timeslot:', reservedTimeslot._id);
    } else {
      // ⭐ Nếu không có reservedTimeslotId, kiểm tra xem có bị trùng với lịch hẹn khác không
    const existingAppointments = await Appointment.find({
      doctorUserId: appointment.doctorUserId._id,
      _id: { $ne: appointmentId },
      status: { $in: ['Pending', 'Approved', 'CheckedIn'] }
    }).populate('timeslotId');

      // Kiểm tra timeslot đã bị reserved chưa (trừ timeslot của chính user này)
    const existingTimeslot = await Timeslot.findOne({
      doctorUserId: appointment.doctorUserId._id,
      startTime: newStart,
      endTime: newEnd,
        status: { $in: ['Reserved', 'Booked'] },
        $or: [
          { reservedByUserId: { $ne: userId } },
          { reservedByUserId: null }
        ]
    });

    if (existingTimeslot) {
      return res.status(400).json({
        success: false,
          message: 'Khung giờ này đã được đặt hoặc đang được người khác giữ chỗ'
      });
    }

    // Kiểm tra conflict với appointments đã có (KHÔNG cộng buffer time - cho phép đặt liên tiếp)
    const hasConflict = existingAppointments.some(apt => {
      if (!apt.timeslotId) return false;
      const aptStart = new Date(apt.timeslotId.startTime);
      const aptEnd = new Date(apt.timeslotId.endTime);
      
      // Conflict nếu: newStart < aptEnd && newEnd > aptStart (không cộng buffer time)
      return (newStart < aptEnd && newEnd > aptStart);
    });

    if (hasConflict) {
      return res.status(400).json({
        success: false,
        message: 'Thời gian yêu cầu bị trùng với lịch hẹn khác'
      });
    }

    // Tạo timeslot với status "Reserved" để tránh xung đột
      reservedTimeslot = await Timeslot.create({
      doctorUserId: appointment.doctorUserId._id,
      serviceId: appointment.serviceId._id,
      startTime: newStart,
      endTime: newEnd,
        status: 'Reserved',
        reservedByUserId: userId
    });

      console.log('✅ Created new reserved timeslot:', reservedTimeslot._id);
    }

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

    // Kiểm tra conflict với appointments của bác sĩ mới (KHÔNG cộng buffer time - cho phép đặt liên tiếp)
    const hasConflict = conflictingAppointments.some(apt => {
      if (!apt.timeslotId) return false;
      const aptStart = new Date(apt.timeslotId.startTime);
      const aptEnd = new Date(apt.timeslotId.endTime);
      
      // Conflict nếu: currentStartTime < aptEnd && currentEndTime > aptStart (không cộng buffer time)
      return (currentStartTime < aptEnd && currentEndTime > aptStart);
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
      .populate('doctorUserId', '_id fullName');

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

    // Lấy tất cả bác sĩ ACTIVE (trừ bác sĩ hiện tại)
    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active',
      _id: { $ne: appointment.doctorUserId._id }
    }).select('_id fullName email');

    // Lấy danh sách Doctor model để filter bỏ bác sĩ "Inactive" và chưa có workingHours
    const doctorStatuses = await Doctor.find({
      doctorUserId: { $in: doctors.map(d => d._id) }
    }).select('doctorUserId status workingHours workingHoursEffectiveDate');

    // Tạo Map để lookup nhanh
    const doctorStatusMap = new Map();
    const doctorWorkingHoursMap = new Map();
    const doctorWorkingHoursEffectiveMap = new Map();
    doctorStatuses.forEach(doc => {
      doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
      doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
      doctorWorkingHoursEffectiveMap.set(doc.doctorUserId.toString(), doc.workingHoursEffectiveDate);
    });

    const normalizedRequestDate = new Date(startDateTime);
    normalizedRequestDate.setUTCHours(0, 0, 0, 0);

    // Filter bỏ các bác sĩ: Inactive, chưa có workingHours, hoặc chưa bắt đầu làm việc
    const availableDoctorsUser = doctors.filter(doctor => {
      const doctorStatus = doctorStatusMap.get(doctor._id.toString());
      const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());
      
      // Kiểm tra xem bác sĩ đã có workingHours chưa
      const hasWorkingHours = workingHours && 
        workingHours.morningStart && 
        workingHours.morningEnd && 
        workingHours.afternoonStart && 
        workingHours.afternoonEnd;
      
      if (!hasWorkingHours) {
        console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa có workingHours, skip...`);
        return false;
      }

      // Kiểm tra effective date
      const effectiveDateRaw = doctorWorkingHoursEffectiveMap.get(doctor._id.toString());
      if (effectiveDateRaw) {
        const effectiveDate = new Date(effectiveDateRaw);
        effectiveDate.setUTCHours(0, 0, 0, 0);
        if (normalizedRequestDate < effectiveDate) {
          console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa bắt đầu làm việc cho đến ${effectiveDate.toISOString().split('T')[0]}, skip...`);
          return false;
        }
      }
      
      // Nếu không có trong Doctor model → coi như Available (cho backward compatibility)
      if (!doctorStatus) return true;
      // Chỉ lấy bác sĩ có status "Available", "Busy", hoặc "On Leave"
      return doctorStatus === 'Available' || doctorStatus === 'Busy' || doctorStatus === 'On Leave';
    });

    console.log(`🔍 Found ${doctors.length} active doctors`);
    console.log(`🔍 After filtering: ${availableDoctorsUser.length} doctors`);

    const availableDoctors = [];
    const searchDate = new Date(startDateTime);
    searchDate.setUTCHours(0, 0, 0, 0);

    for (const doctor of availableDoctorsUser) {
      // Kiểm tra xem bác sĩ có leave request approved trong ngày này không
      const checkLeaveDate = new Date(searchDate);
      checkLeaveDate.setUTCHours(12, 0, 0, 0);
      const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, checkLeaveDate);
      
      if (isOnLeave) {
        console.log(`   ⚠️  SKIP: Doctor ${doctor.fullName} is on leave on ${searchDate.toISOString().split('T')[0]}`);
        continue;
      }
      
      // Kiểm tra xem bác sĩ có schedule available cho ngày này không
      const doctorSchedule = await DoctorSchedule.findOne({
        doctorUserId: doctor._id,
        date: searchDate,
        status: 'Available'
      });

      if (!doctorSchedule) {
        console.log(`   ❌ Doctor ${doctor.fullName} has no Available schedule for this date`);
        continue;
      }

      // Kiểm tra xem bác sĩ có conflicts trong khoảng thời gian này không
      const conflictingTimeslots = await Timeslot.find({
        doctorUserId: doctor._id,
        startTime: { $lt: endDateTime },
        endTime: { $gt: startDateTime },
        status: { $in: ['Reserved', 'Booked'] }
      });

      if (conflictingTimeslots.length > 0) {
        console.log(`   ❌ Doctor ${doctor.fullName} has ${conflictingTimeslots.length} conflicting timeslots`);
        continue;
      }

      // Kiểm tra xem bác sĩ có appointments trong khoảng thời gian này không
      const conflictingAppointments = await Appointment.find({
        doctorUserId: doctor._id,
        'timeslotId.startTime': { $lt: endDateTime },
        'timeslotId.endTime': { $gt: startDateTime },
        status: { $in: ['Approved', 'CheckedIn', 'Completed'] }
      });

      if (conflictingAppointments.length > 0) {
        console.log(`   ❌ Doctor ${doctor.fullName} has ${conflictingAppointments.length} conflicting appointments`);
        continue;
      }

      // Kiểm tra working hours
      const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());

      const startHour = startDateTime.getUTCHours() + 7; // Convert to VN time
      const startMin = startDateTime.getUTCMinutes();
      const endHour = endDateTime.getUTCHours() + 7;
      const endMin = endDateTime.getUTCMinutes();

      // Parse working hours
      const [morningStartHour, morningStartMin] = workingHours.morningStart.split(':').map(Number);
      const [morningEndHour, morningEndMin] = workingHours.morningEnd.split(':').map(Number);
      const [afternoonStartHour, afternoonStartMin] = workingHours.afternoonStart.split(':').map(Number);
      const [afternoonEndHour, afternoonEndMin] = workingHours.afternoonEnd.split(':').map(Number);

      // Convert to minutes for accurate comparison
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;
      const morningStartTotalMin = morningStartHour * 60 + morningStartMin;
      const morningEndTotalMin = morningEndHour * 60 + morningEndMin;
      const afternoonStartTotalMin = afternoonStartHour * 60 + afternoonStartMin;
      const afternoonEndTotalMin = afternoonEndHour * 60 + afternoonEndMin;

      const isInMorningShift = startTotalMin >= morningStartTotalMin && endTotalMin <= morningEndTotalMin;
      const isInAfternoonShift = startTotalMin >= afternoonStartTotalMin && endTotalMin <= afternoonEndTotalMin;

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
    const userId = req.user.userId;


    const data = await appointmentService.assignDoctorToAppointment(
      appointmentId,
      newDoctorId,
      userId
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
    const userId = req.user.userId;

    // Patient confirm thủ công → auto = false
    const data = await appointmentService.confirmChangeDoctor(appointmentId, userId,{ auto: false });

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
      message: 'Từ chối đổi bác sĩ mới thành công',
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

  const getVisitTicket = async(req,res) =>{
      try {
          const {appointmentId} = req.params
          await appointmentService.getVisitTicketPDF(appointmentId,res);
      } catch (error) {
      console.error('❌ getVisitTicket error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Lỗi máy chủ',
        error: error.message
      });
      }
  }

  const managerDashboard = async(req,res) =>{
    try {
      const {startDate, endDate} = req.query
      const result = await appointmentService.managerDashboard(startDate, endDate);
      return res.status(200).json({
      success: true,
      message: 'Doanh thu',
      result
    }); 
    } catch (error) {
    console.error('❌ Error in managerDashboard:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });           
    }
  }

  const getMonthlyRevenue = async(req,res) =>{
    try {
      const {startDate, endDate} = req.query
      const result = await appointmentService.getMonthlyRevenue(startDate, endDate);
      
      const now = new Date();
      const year = now.getFullYear(); 
      return res.status(200).json({
      success: true,
      message: `Doanh thu từng tháng trong năm ${year}`,
      result
    });      
    } catch (error) {
    console.error('❌ Error in getMonthlyRevenue:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });                
    }
  }


// ⭐ Lấy danh sách người thân đã đặt lịch của user
const getMyRelatives = async (req, res) => {
  try {
    const patientUserId = req.user?.userId;
    
    if (!patientUserId) {
      return res.status(401).json({
        success: false,
        message: 'Bạn cần đăng nhập để xem danh sách người thân'
      });
    }

    const Customer = require('../models/customer.model');
    
    // Lấy tất cả customers mà user này đã đặt lịch (appointmentFor = 'other')
    const customers = await Customer.find({
      patientUserId: patientUserId
    })
    .select('fullName email phoneNumber')
    .sort({ createdAt: -1 }) // Mới nhất trước
    .lean();

    // Loại bỏ duplicate dựa trên fullName + email
    const uniqueCustomers = [];
    const seen = new Set();
    
    for (const customer of customers) {
      if (customer.fullName && customer.email) {
        const key = `${customer.fullName.toLowerCase().trim()}_${customer.email.toLowerCase().trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCustomers.push({
            _id: customer._id,
            fullName: customer.fullName,
            email: customer.email,
            phoneNumber: customer.phoneNumber || null
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      data: uniqueCustomers,
      message: 'Lấy danh sách người thân thành công'
    });

  } catch (error) {
    console.error('❌ Error in getMyRelatives:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hệ thống. Vui lòng thử lại sau.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getServiceRevenueReport = async(req,res) =>{

  try {
    const {startDate, endDate} = req.query
    const result = await appointmentService.getServiceRevenueReport(startDate, endDate);
    return res.status(200).json({
      success: true,
      message: 'Lấy báo cáo doanh thu dịch vụ thành công',
      result
    });
  } catch (error) {
    console.error('❌ Error in getServiceRevenueReport:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
}

const getRevenueServicePDF = async (req, res) => {
  try {
    const { startDate, endDate } = req.query; // có thể để trống để dùng default trong service

    await appointmentService.getRevenueServicePDF(startDate, endDate, res);

  } catch (error) {
    console.error('❌ Error in getRevenueServicePDF:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

module.exports = {
  createConsultationAppointment,
  createWalkInAppointment,
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
  getVisitTicket,
  managerDashboard,
  getMonthlyRevenue,
  getMyRelatives,
  markAppointmentNoTreatment,
  reserveTimeslot,
  releaseReservedTimeslot,
  getServiceRevenueReport,
  getRevenueServicePDF
};
