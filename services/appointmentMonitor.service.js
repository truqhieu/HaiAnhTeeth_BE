const Appointment = require('../models/appointment.model');
const DoctorSchedule = require('../models/doctorSchedule.model');

/**
 * Service để monitor và auto-expire các appointment
 * - Chạy định kỳ để check và update status appointments dựa trên end of day (23:59:59):
 *   + Pending, Approved → sau end of day → Cancelled
 *   + CheckedIn → sau end of day → No-Show
 *   + InProgress → sau end of day → Completed
 */
class AppointmentMonitorService {
  
  // ⭐ REMOVED: _getScheduleEndTime method no longer needed
  // Now using end-of-day (23:59:59) instead of working hours

  /**
   * Auto-update status appointments dựa trên end of day (23:59:59)
   * - Pending, Approved → sau end of day → Cancelled
   * - CheckedIn → sau end of day → No-Show
   * - InProgress → sau end of day → Completed
   */
  async expireAppointments() {
    try {
      // ⭐ GIẢM LOG: Chỉ log khi có appointments cần check
      // Lấy thời gian hiện tại (UTC)
      const now = new Date();
      
      // Tìm tất cả appointments cần check (Pending, Approved, CheckedIn, InProgress)
      const appointments = await Appointment.find({
        status: { $in: ['Pending', 'Approved', 'CheckedIn', 'InProgress'] }
      })
        .populate('timeslotId', 'startTime endTime')
        .populate('doctorUserId', '_id');

      if (!appointments || appointments.length === 0) {
        // ⭐ Không log khi không có gì để check (giảm spam log)
        return;
      }

      console.log(`\n🔍 [AppointmentMonitor] Checking ${appointments.length} appointment(s)...`);

      let expiredCount = 0;
      let noShowCount = 0;
      let completedCount = 0;

      for (const appointment of appointments) {
        if (!appointment.timeslotId || !appointment.timeslotId.startTime || !appointment.doctorUserId) {
          continue;
        }

        try {
          // Lấy ngày khám từ timeslot
          const appointmentDate = new Date(appointment.timeslotId.startTime);
          const appointmentDateOnly = new Date(appointmentDate);
          appointmentDateOnly.setUTCHours(0, 0, 0, 0);

          // Tìm DoctorSchedule của bác sĩ trong ngày đó
          const startOfDay = new Date(appointmentDateOnly);
          const endOfDay = new Date(appointmentDateOnly);
          endOfDay.setUTCHours(23, 59, 59, 999);

          const schedules = await DoctorSchedule.find({
            doctorUserId: appointment.doctorUserId._id || appointment.doctorUserId,
            date: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          });

          if (!schedules || schedules.length === 0) {
            // ⭐ FIX: Không tìm thấy schedule - kiểm tra xem appointment có thuộc ngày hôm nay hoặc quá khứ không
            // Lấy ngày hôm nay theo timezone VN (UTC+7)
            const todayVN = new Date();
            const todayVNStr = todayVN.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
            const appointmentDateStr = appointmentDateOnly.toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Chỉ xử lý nếu appointment là ngày hôm nay hoặc quá khứ
            if (appointmentDateStr <= todayVNStr) {
              // ⭐ CHANGE: Dùng end of day (23:59:59) thay vì 18:00
              const defaultEndTime = new Date(appointmentDateOnly);
              defaultEndTime.setUTCHours(23, 59, 59, 999); // End of day UTC
              
              if (now >= defaultEndTime) {
                const oldStatus = appointment.status;
                const updated = await this._updateAppointmentStatus(appointment, now, defaultEndTime);
                if (updated) {
                  if (oldStatus === 'Pending' || oldStatus === 'Approved') {
                    expiredCount++;
                  } else if (oldStatus === 'CheckedIn') {
                    noShowCount++;
                  } else if (oldStatus === 'InProgress') {
                    completedCount++;
                  }
                }
              }
            } else {
              // Appointment là ngày tương lai và không có schedule - bỏ qua (schedule có thể chưa được tạo)
              console.log(`   ⚠️  Appointment ${appointment._id} là ngày tương lai (${appointmentDateStr}) và chưa có schedule - bỏ qua`);
            }
            continue;
          }

          // ⭐ CHANGE: Dùng end of day (23:59:59) thay vì working hours
          const appointmentEndOfDay = new Date(appointmentDateOnly);
          appointmentEndOfDay.setUTCHours(23, 59, 59, 999); // End of day UTC

          // Kiểm tra: Nếu hiện tại đã qua end of day
          if (now >= appointmentEndOfDay) {
            const oldStatus = appointment.status;
            const updated = await this._updateAppointmentStatus(appointment, now, appointmentEndOfDay);
            
            if (updated) {
              if (oldStatus === 'Pending' || oldStatus === 'Approved') {
                expiredCount++;
              } else if (oldStatus === 'CheckedIn') {
                noShowCount++;
              } else if (oldStatus === 'InProgress') {
                completedCount++;
              }
            }
          }
        } catch (err) {
          console.error(`   ❌ Lỗi xử lý appointment ${appointment._id}:`, err.message);
          continue;
        }
      }

      if (expiredCount > 0 || noShowCount > 0 || completedCount > 0) {
        console.log(`   ✅ Đã update: ${expiredCount} Expired, ${noShowCount} No-Show, ${completedCount} Completed`);
      } else {
        console.log('   ✅ Không có appointment nào cần update');
      }

    } catch (error) {
      console.error('❌ [AppointmentMonitor] Lỗi khi check appointments:', error);
    }
  }

  
  async _updateAppointmentStatus(appointment, now, scheduleEndTime = null) {
    const oldStatus = appointment.status;
    let newStatus = null;
    let updateData = {};

    if (appointment.status === 'Pending' || appointment.status === 'Approved') {
      // ⭐ Change: Pending/Approved -> Cancelled (instead of Expired)
      newStatus = 'Cancelled';
      updateData = {
        status: newStatus,
        cancelReason: 'Quá hạn (Hệ thống tự động hủy)',
        cancelledAt: now
      };
    } else if (appointment.status === 'CheckedIn') {
      newStatus = 'No-Show';
      updateData = { status: newStatus };
    } else if (appointment.status === 'InProgress') {
      newStatus = 'Completed';
      updateData = { status: newStatus };
    }

    if (newStatus) {
      console.log(`   ✅ UPDATE: Appointment ${appointment._id}`);
      console.log(`      - Old Status: ${oldStatus}`);
      console.log(`      - New Status: ${newStatus}`);
      if (scheduleEndTime) {
        console.log(`      - Schedule EndTime: ${scheduleEndTime.toISOString()}`);
      }
      console.log(`      - Hiện tại: ${now.toISOString()}`);

      // Apply updates
      Object.assign(appointment, updateData);
      await appointment.save();
      
      // If cancelled, we might want to release the timeslot?
      // But since it's "expired" (past time), releasing the timeslot doesn't really matter for booking purposes
      // as it's in the past. However, for data consistency, we can update it if needed.
      // For now, just updating appointment status is enough as per requirement.
      
      return true;
    }
    
    return false;
  }

  /**
   * Khởi động monitoring (chạy định kỳ)
   * @param {number} intervalMinutes - Số phút giữa mỗi lần check (mặc định 60 phút = 1 giờ)
   */
  startMonitoring(intervalMinutes = 60) {
    console.log(`🚀 [AppointmentMonitor] Bắt đầu auto-check appointments (mỗi ${intervalMinutes} phút)`);

    const intervalMs = intervalMinutes * 60 * 1000;

    // Check appointments mỗi X phút
    setInterval(() => {
      this.expireAppointments();
    }, intervalMs);

    // Chạy ngay lần đầu tiên
    console.log('🔍 [AppointmentMonitor] Chạy check đầu tiên...');
    this.expireAppointments();
  }
}

module.exports = new AppointmentMonitorService();

