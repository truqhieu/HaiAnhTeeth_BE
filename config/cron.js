// cron/jobs.cron.js
const cron = require('node-cron');
const Promotion = require('../models/promotion.model');
const PromotionService = require('../models/promotionService.model')
const Appointment = require('../models/appointment.model');
const appointmentService = require('../services/appointment.service');
const leaveRequestService = require('../services/leaveRequest.service');

// ===== 1️⃣ Cron auto check date promotion =====
cron.schedule('0 * * * *', async () => {  // chạy mỗi giờ (vào phút 0)
    try {
        const now = new Date();
        // Expire promotion
        const expired = await Promotion.updateMany(
            { endDate: { $lt: now }, status: { $ne: 'Expired' } },
            { $set: { status: 'Expired' } }
        );


        const expiredList = await Promotion.find({ endDate: { $lt: now } });
        const expiredIds = expiredList.map(p => p._id);
        // Xóa tất cả promotionService của các promotion hết hạn
        const deleteExpiredService = await PromotionService.deleteMany({
        promotionId: { $in: expiredIds }
        });



        // Active promotion
        const active = await Promotion.updateMany(
            {
            startDate : { $lte : now },
            endDate : { $gt : now },
            status :  {$ne : 'Active' }
            },
            {$set : { status : 'Active' }}
        );

        // Upcoming
        const upcoming = await Promotion.updateMany(
            {startDate : { $gt : now }, status :  { $ne : 'Upcoming' }},
            {$set : { status : 'Upcoming' }}
        )

        // Check
        if (expired.modifiedCount > 0) console.log(`✅ Cập nhật ${expired.modifiedCount} khuyến mãi hết hạn.`);
        if (active.modifiedCount > 0) console.log(`✅ Cập nhật ${active.modifiedCount} khuyến mãi đang diễn ra.`);
        if (upcoming.modifiedCount > 0) console.log(`✅ Cập nhật ${upcoming.modifiedCount} khuyến mãi sắp tới.`);

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
