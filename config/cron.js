// cron/jobs.cron.js
const cron = require('node-cron');
const Promotion = require('../models/promotion.model');
const Appointment = require('../models/appointment.model');
const appointmentService = require('../services/appointment.service');
const leaveRequestService = require('../services/leaveRequest.service');

// ===== 1️⃣ Cron auto expire promotion =====
cron.schedule('*/1 * * * *', async () => {  // test mỗi phút
    try {
        const now = new Date();
        const result = await Promotion.updateMany(
            { endDate: { $lt: now }, status: { $ne: 'Expired' } },
            { $set: { status: 'Expired' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`✅ Cập nhật ${result.modifiedCount} khuyến mãi hết hạn.`);
        }
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật khuyến mãi:', error);
    }
}, {
    timezone: "Asia/Ho_Chi_Minh"
});

// ===== 2️⃣ Cron auto confirm doctor assignment =====
cron.schedule('0 * * * *', async () => {  // chạy mỗi giờ
    try {
        const now = new Date();
        const expiredAppointments = await Appointment.find({
            replacedDoctorUserId: { $ne: null },
            confirmDeadline: { $lte: now },
            status: { $in: ['Pending', 'Approved'] }
        });

        for (const appt of expiredAppointments) {
            try {
                console.log(`⏰ Auto-confirm bác sĩ cho appointment ${appt._id}`);
                await appointmentService.confirmChangeDoctor(appt._id, { auto: true });
            } catch (err) {
                console.error('❌ Lỗi auto confirm:', err.message);
            }
        }
    } catch (err) {
        console.error('❌ Lỗi cron appointment:', err.message);
    }
}, {
    timezone: "Asia/Ho_Chi_Minh"
});

// ===== 3️⃣ Cron auto restore doctor schedules sau khi hết thời gian nghỉ =====
cron.schedule('0 0 * * *', async () => {  // chạy mỗi ngày lúc 00:00
    try {
        console.log('🔄 [Cron] Bắt đầu restore schedules cho các leave requests đã hết hạn...');
        await leaveRequestService.restoreExpiredLeaveSchedules();
        console.log('✅ [Cron] Hoàn thành restore schedules');
    } catch (err) {
        console.error('❌ [Cron] Lỗi restore schedules:', err.message);
    }
}, {
    timezone: "Asia/Ho_Chi_Minh"
});
