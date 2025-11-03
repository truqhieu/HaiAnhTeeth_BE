const aiBookingService = require('../services/aiBooking.service');

/**
 * POST /api/appointments/ai-create
 * Tạo appointment tự động từ user prompt
 */
const createAppointmentByAI = async (req, res) => {
  try {
    console.log('🤖 [AI Booking Controller] ===== REQUEST RECEIVED =====');
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('📋 Body:', JSON.stringify(req.body, null, 2));
    console.log('📋 User:', JSON.stringify(req.user || null, null, 2));
    console.log('📋 Origin:', req.headers.origin || 'No origin header');
    
    const { prompt, appointmentFor } = req.body;
    const patientUserId = req.user?.userId;

    if (!patientUserId) {
      console.log('❌ [AI Booking Controller] No patientUserId - User not authenticated');
      console.log('📋 Request user object:', req.user);
      console.log('📋 Auth header:', req.headers.authorization);
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để sử dụng tính năng đặt lịch tự động'
      });
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập yêu cầu đặt lịch (ví dụ: "Đặt lịch khám răng với bác sĩ Huy ngày mai lúc 9h sáng")'
      });
    }

    console.log('🤖 [AI Booking] User prompt:', prompt);
    console.log('🤖 [AI Booking] Patient ID:', patientUserId);
    console.log('🤖 [AI Booking] Appointment for:', appointmentFor || 'self');

    // Gọi AI service để tạo appointment
    const result = await aiBookingService.createAppointmentFromAI(
      prompt.trim(),
      patientUserId,
      appointmentFor || 'self'
    );

    return res.status(200).json({
      success: true,
      message: 'Đặt lịch thành công!',
      data: {
        appointmentId: result.appointment._id,
        appointment: result.appointment,
        parsedInfo: {
          serviceName: result.mappedData.serviceId ? 'Đã xác định' : null,
          doctorName: result.mappedData.doctorUserId ? 'Đã xác định' : null,
          date: result.mappedData.date,
          time: result.selectedSlot ? new Date(result.selectedSlot.startTime).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh'
          }) : null,
          confidence: result.parsedData.confidence
        }
      }
    });
  } catch (error) {
    console.error('❌ [AI Booking Controller] Error:', error);

    // Handle specific errors
    if (error.message.includes('Không tìm thấy dịch vụ') ||
        error.message.includes('Không tìm thấy slot') ||
        error.message.includes('không có slot khả dụng')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('Thiếu') || error.message.includes('không hợp lệ')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Handle OpenAI quota/billing errors
    if (error.message?.includes('quota') || error.message?.includes('billing') || error.message?.includes('Quota OpenAI')) {
      return res.status(402).json({
        success: false,
        message: error.message || 'Quota OpenAI đã hết. Vui lòng liên hệ quản trị viên.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Generic error
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi đặt lịch tự động. Vui lòng thử lại.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createAppointmentByAI
};

