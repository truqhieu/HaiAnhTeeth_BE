const paymentService = require('../services/payment.service');
const sepayService = require('../services/sepay.service');
const Appointment = require('../models/appointment.model');

/**
 * Webhook từ Sepay khi có giao dịch mới
 * TỰ ĐỘNG xử lý thanh toán - KHÔNG CẦN MANUAL
 */
const handleSepayWebhook = async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🔔 WEBHOOK TỰ ĐỘNG - Nhận thông báo từ Sepay');
    console.log('='.repeat(70));
    console.log('📦 Webhook Data:', JSON.stringify(req.body, null, 2));
    console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));

    // QUAN TRỌNG: Luôn trả về 200 OK ngay để Sepay không retry
    // Xử lý logic trong background
    res.status(200).json({ 
      received: true, 
      message: 'Webhook received, processing...',
      timestamp: new Date().toISOString()
    });

    // Parse webhook data
    const webhookData = sepayService.parseWebhookData(req.body);
    console.log('📊 Parsed Data:', webhookData);
    console.log('💳 Tài khoản nhận:', webhookData.accountNumber, '(' + webhookData.bankAccount + ')');
    
    // Lấy appointment ID từ content
    // Content format: "APPOINTMENT {shortId}"
    const content = webhookData.content;
    
    // Check nếu content không tồn tại
    if (!content) {
      console.log('⚠️  Content trống hoặc undefined:', content);
      console.log('   → Bỏ qua giao dịch này');
      return;
    }
    
    const match = content.match(/APPOINTMENT\s+([A-Z0-9]+)/i);
    
    if (!match) {
      console.log('⚠️  Không tìm thấy appointment ID trong content:', content);
      console.log('   → Bỏ qua giao dịch này (không phải từ hệ thống)');
      return;
    }

    const shortId = match[1];
    console.log('🔍 Tìm kiếm appointment với Short ID:', shortId);

    // Tìm appointment theo short ID (8 ký tự cuối)
    const appointments = await Appointment.find({
      status: 'PendingPayment'
    }).populate('paymentId');

    console.log(`📋 Tìm thấy ${appointments.length} appointment đang chờ thanh toán`);

    const appointment = appointments.find(apt => {
      const aptShortId = apt._id.toString().slice(-8).toUpperCase();
      return aptShortId === shortId;
    });

    if (!appointment) {
      console.log('⚠️  Không tìm thấy appointment với shortId:', shortId);
      console.log('   → Có thể đã được xử lý trước đó hoặc đã hủy');
      return;
    }

    console.log('✅ Tìm thấy appointment:', appointment._id);
    console.log('   - Status hiện tại:', appointment.status);
    console.log('   - Payment ID:', appointment.paymentId._id);

    // Kiểm tra số tiền
    const expectedAmount = appointment.paymentId.amount;
    const receivedAmount = webhookData.amount;
    
    console.log('💰 Kiểm tra số tiền:');
    console.log('   - Số tiền cần thanh toán:', expectedAmount.toLocaleString(), 'VND');
    console.log('   - Số tiền đã nhận:', receivedAmount.toLocaleString(), 'VND');
    
    if (receivedAmount < expectedAmount) {
      console.log('❌ Số tiền không đủ! Cần thêm:', (expectedAmount - receivedAmount).toLocaleString(), 'VND');
      return;
    }

    // ✨ TỰ ĐỘNG CONFIRM PAYMENT - KHÔNG CẦN MANUAL!
    console.log('🚀 Đang tự động xác nhận thanh toán...');
    
    const result = await paymentService.confirmPayment(appointment.paymentId._id, webhookData);

    const processingTime = Date.now() - startTime;
    
    console.log('\n' + '🎉'.repeat(35));
    console.log('✅ THANH TOÁN TỰ ĐỘNG THÀNH CÔNG!');
    console.log('='.repeat(70));
    console.log('📄 Appointment ID:', appointment._id);
    console.log('💳 Payment ID:', appointment.paymentId._id);
    console.log('💰 Số tiền:', receivedAmount.toLocaleString(), 'VND');
    console.log('📊 Status mới:', result.appointment?.status || 'Pending');
    console.log('⏱️  Thời gian xử lý:', processingTime, 'ms');
    console.log('🔔 Lịch hẹn đã được hiển thị cho STAFF');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n' + '❌'.repeat(35));
    console.error('LỖI XỬ LÝ WEBHOOK:', error);
    console.error('Stack:', error.stack);
    console.error('='.repeat(70) + '\n');
    
    // Log để admin có thể manual check nếu cần
    console.error('⚠️  CẦN KIỂM TRA THỦ CÔNG:');
    console.error('   - Webhook data:', JSON.stringify(req.body, null, 2));
    console.error('   - Error:', error.message);
  }
};

/**
 * Manual check payment status (cho user check)
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    console.log('🔍 CHECK PAYMENT STATUS:', paymentId);

    // Lấy payment info
    const payment = await paymentService.getPaymentInfo(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment không tồn tại'
      });
    }

    console.log('💳 Payment status:', payment.status);

    // ⚠️ Nếu payment đã expired hoặc cancelled, return expired
    if (payment.status === 'Expired' || payment.status === 'Cancelled') {
      const message = payment.status === 'Cancelled' 
        ? 'Thanh toán đã bị hủy' 
        : 'Thanh toán đã hết hạn';
      
      // ⭐ Lấy appointment với promotion info (ngay cả khi expired)
      const appointment = await Appointment.findById(payment.appointmentId)
        .select('status promotionId originalPrice finalPrice discountAmount')
        .populate('promotionId', 'title discountType discountValue')
        .lean();
      
      return res.status(200).json({
        success: true,
        message: message,
        data: {
          payment,
          appointment, // ⭐ Trả về appointment với promotion info
          confirmed: false,
          expired: true // ⭐ Flag để FE biết đã hết hạn hoặc bị hủy
        }
      });
    }

    // ⭐ Lấy appointment với promotion info (cho cả pending và completed)
    const appointment = await Appointment.findById(payment.appointmentId)
      .select('status promotionId originalPrice finalPrice discountAmount')
      .populate('promotionId', 'title discountType discountValue')
      .lean();
    
    // ✅ Nếu payment đã completed, return confirmed
    if (payment.status === 'Completed') {
      return res.status(200).json({
        success: true,
        message: 'Thanh toán thành công',
        data: {
          payment,
          appointment,
          confirmed: true,
          expired: false
        }
      });
    }

    // ⏳ Chưa có giao dịch hoặc đang pending
    res.status(200).json({
      success: true,
      message: 'Chưa nhận được thanh toán hoặc đang xử lý',
      data: {
        payment,
        appointment, // ⭐ Trả về appointment với promotion info
        confirmed: false,
        expired: false
      }
    });

  } catch (error) {
    console.error('❌ Lỗi check payment:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi kiểm tra thanh toán',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Lấy thông tin thanh toán
 */
const getPaymentInfo = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await paymentService.getPaymentInfo(paymentId);

    res.status(200).json({
      success: true,
      data: { payment }
    });

  } catch (error) {
    console.error('❌ Lỗi lấy payment info:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy thông tin thanh toán',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Manual confirm payment (cho admin)
 */
const manualConfirmPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Check if user is admin/staff
    if (!['Admin', 'Staff', 'Manager'].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền thực hiện thao tác này'
      });
    }

    const result = await paymentService.confirmPayment(paymentId, {
      manualConfirm: true,
      confirmedBy: req.user.userId
    });

    res.status(200).json({
      success: true,
      message: 'Đã xác nhận thanh toán thủ công',
      data: result
    });

  } catch (error) {
    console.error('❌ Lỗi confirm payment:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi xác nhận thanh toán',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Test webhook endpoint - để manually verify webhook hoạt động
 */
const testWebhook = async (req, res) => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST WEBHOOK - Kiểm tra webhook handler hoạt động');
    console.log('='.repeat(70));

    // Lấy appointment pending payment đầu tiên
    const appointments = await Appointment.find({
      status: 'PendingPayment'
    })
      .populate('paymentId')
      .sort({ createdAt: -1 })
      .limit(1);

    if (appointments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có appointment nào đang chờ thanh toán'
      });
    }

    const appointment = appointments[0];
    const payment = appointment.paymentId;

    console.log('📄 Test Appointment:', appointment._id);
    console.log('💳 Payment ID:', payment._id);
    console.log('💰 Amount:', payment.amount);

    // Tạo mock webhook data từ Sepay
    const mockWebhookData = {
      id: Date.now(),
      gateway_transaction_id: 'TEST_' + Date.now(),
      account_number: '3950450728',
      amount_in: payment.amount,
      transaction_content: `APPOINTMENT ${appointment._id.toString().slice(-8).toUpperCase()}`,
      transaction_date: new Date().toISOString(),
      reference_number: 'TEST_REF_' + Date.now(),
      bank_account: 'BIDV'
    };

    console.log('📦 Mock Webhook Data:', JSON.stringify(mockWebhookData, null, 2));

    // Call webhook handler
    const mockRes = {
      statusCode: 200,
      jsonData: null,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        this.jsonData = data;
        return this;
      }
    };

    const mockReq = {
      body: mockWebhookData,
      headers: {}
    };

    await handleSepayWebhook(mockReq, mockRes);

    // Check result
    const updatedAppointment = await Appointment.findById(appointment._id);

    res.status(200).json({
      success: true,
      message: '✅ Test webhook thành công',
      data: {
        appointmentId: appointment._id,
        previousStatus: appointment.status,
        newStatus: updatedAppointment.status,
        paymentStatus: updatedAppointment.paymentId?.status,
        testData: mockWebhookData
      }
    });

  } catch (error) {
    console.error('❌ Lỗi test webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi test webhook',
      error: error.message
    });
  }
};

module.exports = {
  handleSepayWebhook,
  checkPaymentStatus,
  getPaymentInfo,
  manualConfirmPayment,
  testWebhook
};

