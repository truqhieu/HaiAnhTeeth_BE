const Payment = require('../models/payment.model');
const Appointment = require('../models/appointment.model');
const paymentService = require('./payment.service');

class PaymentMonitorService {
  
  /**
   * Auto-expire các payment đã hết hạn (quá 15 phút)
   */
  async expireOldPayments() {
    try {
      // Tìm các payment đã hết hạn nhưng vẫn pending
      const expiredPayments = await Payment.find({
        status: 'Pending',
        holdExpiresAt: { $lt: new Date() } // Đã hết hạn
      }).populate('appointmentId');

      if (expiredPayments.length === 0) {
        return;
      }

      console.log(`⏰ [PaymentMonitor] Tìm thấy ${expiredPayments.length} payment(s) đã hết hạn`);

      // Hủy từng payment
      for (const payment of expiredPayments) {
        try {
          console.log(`❌ [PaymentMonitor] Hủy payment ${payment._id}...`);
          
          await paymentService.cancelExpiredPayment(payment._id);

          console.log(`✅ [PaymentMonitor] Payment ${payment._id} đã bị hủy do hết hạn`);

        } catch (error) {
          console.error(`❌ [PaymentMonitor] Lỗi expire payment ${payment._id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('❌ [PaymentMonitor] Lỗi expire payments:', error.message);
    }
  }

  /**
   * Khởi động monitoring (chạy định kỳ)
   */
  startMonitoring(intervalMinutes = 1) {
    console.log(`🚀 [PaymentMonitor] Bắt đầu auto-check Sepay (mỗi ${intervalMinutes} phút)`);

    // Check pending payments mỗi X phút
    const intervalMs = intervalMinutes * 60 * 1000;

    // Chạy check expired
    this.expireInterval = setInterval(() => {
      this.expireOldPayments();
    }, intervalMs);

    // ⭐ THÊM: Sync timeslot status (để handle manual payment status changes)
    // ⭐ GIẢM TẦN SUẤT: Chỉ sync mỗi 5 phút thay vì mỗi 1 phút để giảm log
    this.syncInterval = setInterval(() => {
      const paymentService = require('./payment.service');
      paymentService.syncTimeslotStatus();
    }, 5 * 60 * 1000); // 5 phút

    // Chạy ngay lần đầu
    console.log('🔍 [PaymentMonitor] Chạy check đầu tiên...\n');
    this.expireOldPayments();
    
    // Sync ngay lần đầu
    const paymentService = require('./payment.service');
    paymentService.syncTimeslotStatus();
  }

  /**
   * Dừng monitoring (cleanup)
   */
  stopMonitoring() {
    if (this.expireInterval) {
      clearInterval(this.expireInterval);
      this.expireInterval = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

module.exports = new PaymentMonitorService();

