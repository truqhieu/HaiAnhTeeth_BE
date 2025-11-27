const aiBookingService = require('../services/aiBooking.service');
const aiBookingLangchainService = require('../services/aiBookingLangchain.service');

// Toggle to use LangChain service (set to true to use new implementation)
const USE_LANGCHAIN = process.env.USE_LANGCHAIN === 'true' || true;

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
    
    const { prompt, appointmentFor, conversationHistory, conversationContext, isNewConversation } = req.body;
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
    console.log('🤖 [AI Booking] Conversation history:', conversationHistory ? `${conversationHistory.length} messages` : 'None');
    console.log('🤖 [AI Booking] Is new conversation:', isNewConversation || false);
    console.log('🤖 [AI Booking] Using LangChain:', USE_LANGCHAIN);

    // Chọn service để sử dụng (LangChain hoặc original)
    const service = USE_LANGCHAIN ? aiBookingLangchainService : aiBookingService;
    
    // Gọi AI service để tạo appointment
    const result = await service.createAppointmentFromAI(
      prompt.trim(),
      patientUserId,
      appointmentFor || 'self',
      conversationHistory || [], // Pass conversation history
      conversationContext || {},
      isNewConversation || false // Pass isNewConversation flag
    );

    // Check if appointment was successfully created
    if (result.success && result.appointment) {
      console.log('✅ [AI Booking] Appointment created successfully');
      const appointmentData = result.appointment;
      
      // ⭐ BỔ SUNG: Prepare response data (giữ nguyên cấu trúc hiện tại)
      const responseData = {
        appointmentId: appointmentData.appointmentId || appointmentData._id,
        appointment: appointmentData,
        followUpQuestion: result.followUpQuestion || result.response,
        parsedData: result.parsedData || {}
      };
      
      // ⭐ BỔ SUNG: Thêm payment info nếu có (không ảnh hưởng logic cũ)
      if (result.requirePayment && result.payment) {
        responseData.requirePayment = true;
        responseData.payment = {
          paymentId: result.payment.paymentId,
          amount: result.payment.amount,
          QRurl: result.payment.QRurl,
          expiresAt: result.payment.expiresAt,
          method: result.payment.method,
          status: result.payment.status
        };
        console.log('💳 [AI Booking] Payment info added to response:', {
          paymentId: result.payment.paymentId,
          amount: result.payment.amount,
          hasQR: !!result.payment.QRurl
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Đặt lịch thành công!',
        data: responseData
      });
    }

    // ⭐ QUAN TRỌNG: Kiểm tra nếu result.success = true (informational query, off-topic response, etc.)
    // Đây không phải là lỗi, chỉ là response thông tin
    if (result.success && !result.appointment) {
      console.log('✅ [AI Booking] Success response (informational/off-topic)');
      const followUpQuestion = result.response || result.followUpQuestion || 'Đã xử lý yêu cầu của bạn.';
      return res.status(200).json({
        success: true, // ⭐ Trả về success: true cho informational/off-topic responses
        needsMoreInfo: result.needsMoreInfo || false,
        data: {
          needsMoreInfo: result.needsMoreInfo || false,
          followUpQuestion: followUpQuestion,
          conversationHistory: result.conversationHistory || [],
          parsedData: result.parsedData || {}
        },
        message: followUpQuestion
      });
    }

    // Check if AI needs more information (multi-turn conversation)
    if (result.needsMoreInfo) {
      console.log('🤖 [AI Booking] Needs more info.');
      console.log('📊 [AI Booking] Result object:', JSON.stringify(result, null, 2));
      const followUpQuestion = result.message || result.followUpQuestion || result.response || 'Cần thêm thông tin để đặt lịch';
      console.log('📤 [AI Booking] Sending message:', followUpQuestion);
      return res.status(200).json({
        success: false,
        needsMoreInfo: true,
        data: {
          needsMoreInfo: true,
          followUpQuestion: followUpQuestion,
          conversationHistory: result.conversationHistory || [],
          parsedData: result.parsedData || {}
        },
        message: followUpQuestion
      });
    }

    // Default response (should not reach here, but just in case)
    const followUpQuestion = result.followUpQuestion || result.response || 'Đang xử lý yêu cầu của bạn...';
    return res.status(200).json({
      success: false,
      data: {
        followUpQuestion: followUpQuestion,
        conversationHistory: result.conversationHistory || [],
        parsedData: result.parsedData || {}
      },
      message: followUpQuestion
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

