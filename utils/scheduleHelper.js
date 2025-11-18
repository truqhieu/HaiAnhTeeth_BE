const DoctorSchedule = require('../models/doctorSchedule.model');
const Doctor = require('../models/doctor.model');

class ScheduleHelper {

 
  static determineShift(datetime) {
    const hour = datetime.getHours();
    const minute = datetime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    // 8:00 = 480 phút, 13:00 = 780 phút
    if (timeInMinutes >= 480 && timeInMinutes < 780) {
      return 'Morning';
    } else if (timeInMinutes >= 780) {
      return 'Afternoon';
    }
    
    throw new Error('Thời gian không thuộc ca làm việc');
  }


  static generateTimeslots(params) {
    const {
      doctorScheduleId,
      doctorUserId,
      serviceId,
      scheduleStartTime,
      scheduleEndTime,
      serviceDurationMinutes,
      breakAfterMinutes = 10
    } = params;

    // Validate input
    if (!scheduleStartTime || !scheduleEndTime) {
      throw new Error('Thiếu thông tin thời gian làm việc');
    }

    if (!serviceDurationMinutes || serviceDurationMinutes <= 0) {
      throw new Error('Thời lượng dịch vụ không hợp lệ');
    }

    const timeslots = [];
    let currentStartTime = new Date(scheduleStartTime);
    const endTime = new Date(scheduleEndTime);

    console.log('🕐 Bắt đầu tính toán timeslots:');
    console.log('   - Thời gian làm việc:', this.formatTimeSlot(currentStartTime, endTime));
    console.log('   - Thời lượng dịch vụ:', serviceDurationMinutes, 'phút');
    console.log('   - Thời gian nghỉ:', breakAfterMinutes, 'phút');

    let slotCount = 0;

    // Tạo timeslots cho đến khi hết thời gian làm việc
    while (currentStartTime < endTime) {
      // Tính thời gian kết thúc của slot này (start + duration)
      const currentEndTime = new Date(currentStartTime.getTime() + serviceDurationMinutes * 60000);

      // Kiểm tra xem slot này có vượt quá thời gian làm việc không
      if (currentEndTime > endTime) {
        console.log(`   ⚠️ Slot ${slotCount + 1} vượt quá giờ làm việc, dừng tại đây`);
        break;
      }

      // Tạo timeslot
      timeslots.push({
        doctorScheduleId,
        doctorUserId,
        serviceId,
        startTime: new Date(currentStartTime),
        endTime: new Date(currentEndTime),
        breakAfterMinutes,
        status: 'Available',
        appointmentId: null
      });

      slotCount++;
      console.log(`   ✅ Slot ${slotCount}:`, this.formatTimeSlot(currentStartTime, currentEndTime));

      // Tính thời gian bắt đầu slot tiếp theo (end + break)
      currentStartTime = new Date(currentEndTime.getTime() + breakAfterMinutes * 60000);
    }

    console.log(`   📊 Tổng cộng tạo được ${slotCount} timeslots`);

    return timeslots;
  }

  static generateTimeslotsForMultipleServices(params) {
    const {
      doctorScheduleId,
      doctorUserId,
      scheduleStartTime,
      scheduleEndTime,
      services,
      breakAfterMinutes = 10
    } = params;

    const allTimeslots = [];

    services.forEach(service => {
      const timeslots = this.generateTimeslots({
        doctorScheduleId,
        doctorUserId,
        serviceId: service.serviceId,
        scheduleStartTime,
        scheduleEndTime,
        serviceDurationMinutes: service.durationMinutes,
        breakAfterMinutes
      });

      allTimeslots.push(...timeslots);
    });

    return allTimeslots;
  }

  /**
   * Lấy timeslots available cho một service cụ thể
   * @param {Array} allTimeslots - Tất cả timeslots
   * @param {ObjectId} serviceId - ID dịch vụ cần lọc
   * @returns {Array} - Timeslots của service đó
   */
  static filterTimeslotsByService(allTimeslots, serviceId) {
    return allTimeslots.filter(slot => 
      slot.serviceId.toString() === serviceId.toString() && 
      slot.status === 'Available'
    );
  }

  /**
   * Validate thời gian có trong ca làm việc không
   * @param {Date} datetime 
   * @returns {boolean}
   */
  static isValidWorkingTime(datetime) {
    try {
      this.determineShift(datetime);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Format thời gian hiển thị theo giờ Việt Nam
   * @param {Date} startTime 
   * @param {Date} endTime 
   * @returns {string} - "08:00 - 09:00"
   */
  static formatTimeSlot(startTime, endTime) {
    const formatTime = (date) => {
      // Format theo timezone Việt Nam (UTC+7)
      const options = {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      
      const formatted = new Date(date).toLocaleString('vi-VN', options);
      // formatted = "HH:mm" hoặc "H:mm"
      return formatted;
    };

    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  }

  /**
   * Tính tổng số slot có thể tạo trong một khoảng thời gian
   * @param {Date} startTime 
   * @param {Date} endTime 
   * @param {Number} slotDurationMinutes - Thời lượng 1 slot
   * @param {Number} breakMinutes - Thời gian nghỉ
   * @returns {Number}
   */
  static calculateMaxSlots(startTime, endTime, slotDurationMinutes, breakMinutes = 10) {
    const totalMinutes = (endTime - startTime) / 60000;
    const slotWithBreak = slotDurationMinutes + breakMinutes;
    return Math.floor(totalMinutes / slotWithBreak);
  }

  /**
   * Generate simple time slots (chỉ startTime/endTime) cho một khoảng thời gian
   * Dùng cho generateAvailableSlotsByDate
   */
  static generateTimeSlots(params) {
    const {
      scheduleStart,
      scheduleEnd,
      serviceDuration,
      breakAfterMinutes = 10
    } = params;

    // Validate input
    if (!scheduleStart || !scheduleEnd) {
      throw new Error('Thiếu thông tin thời gian làm việc');
    }

    if (!serviceDuration || serviceDuration <= 0) {
      throw new Error('Thời lượng dịch vụ không hợp lệ');
    }

    const slots = [];
    let currentStartTime = new Date(scheduleStart);
    const endTime = new Date(scheduleEnd);

    // Tạo slots cho đến khi hết thời gian làm việc
    while (currentStartTime < endTime) {
      // Tính thời gian kết thúc của slot này (start + duration)
      const currentEndTime = new Date(currentStartTime.getTime() + serviceDuration * 60000);

      // Kiểm tra xem slot này có vượt quá thời gian làm việc không
      if (currentEndTime > endTime) {
        break;
      }

      // Tạo slot đơn giản (chỉ có thời gian)
      slots.push({
        startTime: new Date(currentStartTime),
        endTime: new Date(currentEndTime)
      });

      // Tính thời gian bắt đầu slot tiếp theo (end + break)
      currentStartTime = new Date(currentEndTime.getTime() + breakAfterMinutes * 60000);
    }

    return slots;
  }

  /**
   * ⭐ HELPER: Update status của schedules đã hết thành "Unavailable"
   * @static
   */
  static async updateExpiredSchedules() {
    try {
      const now = new Date();
      
      // Tìm tất cả schedules có status 'Available'
      const availableSchedules = await DoctorSchedule.find({
        status: 'Available'
      });

      const expiredSchedules = [];
      
      for (const schedule of availableSchedules) {
        // Sử dụng workingHours để tính endTime
        const workingHours = schedule.workingHours || {
          morningStart: '08:00',
          morningEnd: '12:00',
          afternoonStart: '14:00',
          afternoonEnd: '18:00'
        };

        let scheduleEnd;
        if (schedule.shift === 'Morning') {
          scheduleEnd = new Date(schedule.date);
          const [endHour, endMinute] = workingHours.morningEnd.split(':').map(Number);
          scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
        } else { // Afternoon
          scheduleEnd = new Date(schedule.date);
          const [endHour, endMinute] = workingHours.afternoonEnd.split(':').map(Number);
          scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
        }

        if (scheduleEnd <= now) {
          expiredSchedules.push(schedule._id);
        }
      }

      if (expiredSchedules.length > 0) {
        // Update tất cả schedules đã hết thành 'Unavailable'
        const result = await DoctorSchedule.updateMany(
          {
            _id: { $in: expiredSchedules },
            status: 'Available'
          },
          {
            $set: { status: 'Unavailable' }
          }
        );

        console.log(`⏰ Updated ${result.modifiedCount} expired schedules to 'Unavailable'`);
      }
    } catch (error) {
      console.error(`❌ Lỗi update expired schedules: ${error.message}`);
    }
  }

  /**
   * ⭐ HELPER: Lấy workingHours từ Doctor hoặc DoctorSchedule của bác sĩ
   * Ưu tiên lấy từ hồ sơ Doctor, sau đó đến schedule gần nhất, nếu không có thì dùng default
   * @static
   */
  static async getDoctorWorkingHours(doctorUserId) {
    const defaultWorkingHours = {
      morningStart: '08:00',
      morningEnd: '12:00',
      afternoonStart: '14:00',
      afternoonEnd: '18:00'
    };

    try {
      const doctorProfile = await Doctor.findOne({ doctorUserId })
        .select('workingHours')
        .lean();

      if (doctorProfile?.workingHours?.morningStart) {
        console.log(`✅ Lấy workingHours từ hồ sơ bác sĩ ${doctorUserId}`);
        return doctorProfile.workingHours;
      }

      // Tìm schedule gần nhất của bác sĩ này (bất kỳ ngày nào)
      const existingSchedule = await DoctorSchedule.findOne({
        doctorUserId: doctorUserId
      }).sort({ date: -1 }); // Lấy schedule mới nhất

      if (existingSchedule && existingSchedule.workingHours) {
        console.log(`✅ Lấy workingHours từ schedule của bác sĩ ${doctorUserId}`);
        return existingSchedule.workingHours;
      }

      console.log(`⚠️  Bác sĩ ${doctorUserId} chưa có workingHours, dùng mặc định`);
      return defaultWorkingHours;
    } catch (error) {
      console.error(`❌ Lỗi lấy workingHours cho bác sĩ ${doctorUserId}:`, error.message);
      return defaultWorkingHours;
    }
  }

  /**
   * ⭐ HELPER: Tạo schedule cho một bác sĩ cụ thể vào một ngày
   * @static
   */
  static async ensureScheduleForDoctor(doctorUserId, searchDate) {
    try {
      // Kiểm tra xem bác sĩ này đã có schedule cho ngày này chưa
      const existingSchedule = await DoctorSchedule.findOne({
        doctorUserId: doctorUserId,
        date: searchDate
      });

      if (existingSchedule) {
        console.log(`✅ Bác sĩ ${doctorUserId} đã có schedule cho ngày ${searchDate.toISOString().split('T')[0]}`);
        return;
      }

      // ⭐ Lấy workingHours từ schedule cũ của bác sĩ (nếu có), không thì dùng default
      const workingHours = await this.getDoctorWorkingHours(doctorUserId);

      const now = new Date(); // Thời gian hiện tại (UTC thực)
      
      // Tính toán thời gian cho Morning và Afternoon
      const morningStart = new Date(searchDate);
      const [morningStartHour, morningStartMinute] = workingHours.morningStart.split(':').map(Number);
      morningStart.setUTCHours(morningStartHour - 7, morningStartMinute, 0, 0);
      
      const morningEnd = new Date(searchDate);
      const [morningEndHour, morningEndMinute] = workingHours.morningEnd.split(':').map(Number);
      morningEnd.setUTCHours(morningEndHour - 7, morningEndMinute, 0, 0);
      
      const afternoonStart = new Date(searchDate);
      const [afternoonStartHour, afternoonStartMinute] = workingHours.afternoonStart.split(':').map(Number);
      afternoonStart.setUTCHours(afternoonStartHour - 7, afternoonStartMinute, 0, 0);
      
      const afternoonEnd = new Date(searchDate);
      const [afternoonEndHour, afternoonEndMinute] = workingHours.afternoonEnd.split(':').map(Number);
      afternoonEnd.setUTCHours(afternoonEndHour - 7, afternoonEndMinute, 0, 0);
      
      // Check status dựa vào thời gian thực
      const morningStatus = morningEnd <= now ? 'Unavailable' : 'Available';
      const afternoonStatus = afternoonEnd <= now ? 'Unavailable' : 'Available';

      const schedulesToCreate = [
        {
          doctorUserId: doctorUserId,
          date: searchDate,
          shift: 'Morning',
          status: morningStatus,
          maxSlots: 4,
          workingHours: workingHours
        },
        {
          doctorUserId: doctorUserId,
          date: searchDate,
          shift: 'Afternoon',
          status: afternoonStatus,
          maxSlots: 4,
          workingHours: workingHours
        }
      ];
      
      await DoctorSchedule.insertMany(schedulesToCreate, { ordered: false });
      console.log(`✅ Đã tạo schedule cho bác sĩ ${doctorUserId} vào ngày ${searchDate.toISOString().split('T')[0]}`);
      
    } catch (error) {
      // Nếu lỗi là duplicate key, bỏ qua
      if (error.code === 11000 || error.name === 'BulkWriteError') {
        console.log(`⚠️  Schedule đã tồn tại cho bác sĩ ${doctorUserId}`);
      } else {
        console.error(`❌ Lỗi tạo schedule cho bác sĩ ${doctorUserId}:`, error.message);
      }
    }
  }

  /**
   * ⭐ HELPER: Tự động tạo schedule cho một ngày nếu chưa có
   * Đảm bảo mỗi bác sĩ chỉ có 1 Morning và 1 Afternoon schedule
   * @static
   */
  static async ensureSchedulesForDate(searchDate) {
    try {
      // Kiểm tra xem ngày này đã có schedule nào chưa
      const existingSchedulesCount = await DoctorSchedule.countDocuments({
        date: searchDate,
        status: 'Available'
      });

      if (existingSchedulesCount > 0) {
        console.log(`✅ Ngày ${searchDate.toISOString().split('T')[0]} đã có ${existingSchedulesCount} schedules`);
        return;
      }

      console.log(`⚠️  Ngày ${searchDate.toISOString().split('T')[0]} chưa có schedule, tự động tạo...`);
      
      // Lấy tất cả bác sĩ ACTIVE
      const doctors = await User.find({
        role: 'Doctor',
        status: 'Active'
      }).select('_id');

      if (doctors.length === 0) {
        console.log('⚠️  Không có bác sĩ ACTIVE nào');
        return;
      }

      // Tạo schedule cho TẤT CẢ bác sĩ - mỗi bác sĩ 1 Morning + 1 Afternoon
      const schedulesToCreate = [];
      const now = new Date(); // Thời gian hiện tại (UTC thực)
      
      for (const doctor of doctors) {
        // ⭐ Lấy workingHours từ schedule cũ của bác sĩ (nếu có), không thì dùng default
        const workingHours = await this.getDoctorWorkingHours(doctor._id);

        // ⭐ Sử dụng workingHours thay vì hardcode
        const morningStart = new Date(searchDate);
        const [morningStartHour, morningStartMinute] = workingHours.morningStart.split(':').map(Number);
        morningStart.setUTCHours(morningStartHour - 7, morningStartMinute, 0, 0); // Convert VN time to UTC
        
        const morningEnd = new Date(searchDate);
        const [morningEndHour, morningEndMinute] = workingHours.morningEnd.split(':').map(Number);
        morningEnd.setUTCHours(morningEndHour - 7, morningEndMinute, 0, 0); // Convert VN time to UTC
        
        const afternoonStart = new Date(searchDate);
        const [afternoonStartHour, afternoonStartMinute] = workingHours.afternoonStart.split(':').map(Number);
        afternoonStart.setUTCHours(afternoonStartHour - 7, afternoonStartMinute, 0, 0); // Convert VN time to UTC
        
        const afternoonEnd = new Date(searchDate);
        const [afternoonEndHour, afternoonEndMinute] = workingHours.afternoonEnd.split(':').map(Number);
        afternoonEnd.setUTCHours(afternoonEndHour - 7, afternoonEndMinute, 0, 0); // Convert VN time to UTC
        
        // ⭐ Check status dựa vào thời gian thực (so sánh UTC với UTC)
        const morningStatus = morningEnd <= now ? 'Unavailable' : 'Available';
        const afternoonStatus = afternoonEnd <= now ? 'Unavailable' : 'Available';
        
        // Debug logging
        console.log(`🔍 [${doctor._id}] Schedule Status Check:`);
        console.log(`   - Current time (UTC): ${now.toISOString()}`);
        console.log(`   - Morning end (UTC): ${morningEnd.toISOString()} = 12:00 VN`);
        console.log(`   - Morning status: ${morningStatus} (${morningEnd.toISOString()} <= ${now.toISOString()})`);
        console.log(`   - Afternoon end (UTC): ${afternoonEnd.toISOString()} = 18:00 VN`);
        console.log(`   - Afternoon status: ${afternoonStatus} (${afternoonEnd.toISOString()} <= ${now.toISOString()})`);
        
        schedulesToCreate.push(
          {
            doctorUserId: doctor._id,
            date: searchDate,
            shift: 'Morning',
            status: morningStatus,
            maxSlots: 4,
            workingHours: workingHours
          },
          {
            doctorUserId: doctor._id,
            date: searchDate,
            shift: 'Afternoon',
            status: afternoonStatus,
            maxSlots: 4,
            workingHours: workingHours
          }
        );
      }
      
      // ⭐ Dùng insertMany với ordered: false để bỏ qua duplicate keys
      const result = await DoctorSchedule.insertMany(schedulesToCreate, { ordered: false });
      console.log(`✅ Tạo ${result.length} schedules mới cho ${doctors.length} bác sĩ`);
      
    } catch (error) {
      // ⭐ Nếu lỗi là duplicate key (code 11000), bỏ qua vì đã có schedule rồi
      if (error.code === 11000 || error.name === 'BulkWriteError') {
        console.log(`⚠️  Một số schedules đã tồn tại (bỏ qua duplicate)`);
      } else {
        console.error(`❌ Lỗi tạo schedules: ${error.message}`);
      }
    }
  }
}

module.exports = ScheduleHelper;
