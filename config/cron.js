const cron = require('node-cron');
const Promotion = require('../models/promotion.model');
const PromotionService = require('../models/promotionService.model')
const Appointment = require('../models/appointment.model');
const appointmentService = require('../services/appointment.service');
const leaveRequestService = require('../services/leaveRequest.service');
const LeaveRequest = require('../models/leaveRequest.model');

function getTodayVN() {
    const now = new Date();
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vnTime.toISOString().slice(0, 10);
}



// ===== ✅ CRON PROMOTION - EXPIRED THEO NGÀY VN =====
cron.schedule('* * * * *', async () => {
    try {
        const todayVN = getTodayVN();
        console.log('⏰ [CRON PROMO] todayVN =', todayVN);

        // 1️⃣ EXPIRED
        const expired = await Promotion.updateMany(
            {
                status: { $ne: 'Expired' },
                $expr: {
                    $lt: [
                        { $dateToString: { format: "%Y-%m-%d", date: "$endDate" } },
                        todayVN
                    ]
                }
            },
            { $set: { status: 'Expired' } }
        );

        // 2️⃣ ACTIVE
        const active = await Promotion.updateMany(
            {
                status: { $ne: 'Active' },
                $expr: {
                    $and: [
                        {
                            $lte: [
                                { $dateToString: { format: "%Y-%m-%d", date: "$startDate" } },
                                todayVN
                            ]
                        },
                        {
                            $gte: [
                                { $dateToString: { format: "%Y-%m-%d", date: "$endDate" } },
                                todayVN
                            ]
                        }
                    ]
                }
            },
            { $set: { status: 'Active' } }
        );

        // 3️⃣ UPCOMING
        const upcoming = await Promotion.updateMany(
            {
                status: { $ne: 'Upcoming' },
                $expr: {
                    $gt: [
                        { $dateToString: { format: "%Y-%m-%d", date: "$startDate" } },
                        todayVN
                    ]
                }
            },
            { $set: { status: 'Upcoming' } }
        );

        if (expired.modifiedCount > 0)
            console.log(`✅ ${expired.modifiedCount} → Expired`);
        if (active.modifiedCount > 0)
            console.log(`✅ ${active.modifiedCount} → Active`);
        if (upcoming.modifiedCount > 0)
            console.log(`✅ ${upcoming.modifiedCount} → Upcoming`);

    } catch (err) {
        console.error('❌ [CRON PROMOTION] error:', err.message);
    }
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


// ===== ✅ CRON LEAVE REQUEST - PENDING → EXPIRED THEO NGÀY VN =====
cron.schedule('* * * * *', async () => {
    try {
        const todayVN = getTodayVN();
        console.log('⏰ [CRON LEAVE] todayVN =', todayVN);

        const expiredLeave = await LeaveRequest.updateMany(
            {
                status: 'Pending',
                $expr: {
                    $lt: [
                        { $dateToString: { format: "%Y-%m-%d", date: "$endDate" } },
                        todayVN
                    ]
                }
            },
            { $set: { status: 'Expired' } }
        );

        console.log('🔍 [CRON LEAVE] expiredLeave =', expiredLeave);

        if (expiredLeave.modifiedCount > 0) {
            console.log(`✅ [CRON] ${expiredLeave.modifiedCount} leave request → Expired`);
        }

    } catch (err) {
        console.error('❌ [CRON LEAVE] error:', err.message);
    }
});




