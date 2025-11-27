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
  static async getDoctorWorkingHours(doctorUserId, targetDate = null) {
    try {
      // ⭐ Ưu tiên lấy workingHours từ Doctor model
      const doctorProfile = await Doctor.findOne({ doctorUserId: doctorUserId }).select('workingHours workingHoursEffectiveDate').lean();
      if (doctorProfile && doctorProfile.workingHours && doctorProfile.workingHours.morningStart) {
        if (targetDate && doctorProfile.workingHoursEffectiveDate) {
          const normalizedTarget = new Date(targetDate);
          normalizedTarget.setUTCHours(0, 0, 0, 0);

          const effectiveDate = new Date(doctorProfile.workingHoursEffectiveDate);
          effectiveDate.setUTCHours(0, 0, 0, 0);

          if (normalizedTarget < effectiveDate) {
            console.log(`⚠️  Bác sĩ ${doctorUserId} chưa bắt đầu làm việc trước ${effectiveDate.toISOString().split('T')[0]}, bỏ qua`);
            return null;
          }
        }
        console.log(`✅ Lấy workingHours từ Doctor model của bác sĩ ${doctorUserId}`);
        return doctorProfile.workingHours;
      }

      // Nếu Doctor model chưa có, tìm schedule gần nhất của bác sĩ này
      const existingSchedule = await DoctorSchedule.findOne({
        doctorUserId: doctorUserId
      }).sort({ date: -1 }); // Lấy schedule mới nhất

      if (existingSchedule && existingSchedule.workingHours) {
        console.log(`✅ Lấy workingHours từ schedule gần nhất của bác sĩ ${doctorUserId}`);
        return existingSchedule.workingHours;
      }

      // ⭐ Nếu không có workingHours → trả về null (không dùng default)
      // Bác sĩ chưa được manager tạo lịch làm việc
      console.log(`⚠️  Bác sĩ ${doctorUserId} chưa có workingHours (chưa được manager tạo lịch làm việc)`);
      return null;
    } catch (error) {
      console.error(`❌ Lỗi lấy workingHours cho bác sĩ ${doctorUserId}:`, error.message);
      return null; // ⭐ Trả về null thay vì default
    }
  }

  /**
   * ⭐ HELPER: Tạo schedule cho một bác sĩ cụ thể vào một ngày
   * @static
   */
static async ensureScheduleForDoctor(doctorUserId, searchDate) {
  try {
    // ⭐ Kiểm tra xem đã có schedule cho ngày này chưa
    const existingSchedule = await DoctorSchedule.findOne({
      doctorUserId: doctorUserId,
      date: searchDate,
      isActive: true
    });

    if (existingSchedule) {
      console.log(`✅ Bác sĩ ${doctorUserId} đã có schedule cho ngày ${searchDate.toISOString().split('T')[0]}`);
      return existingSchedule;
    }

    // ⭐ FIX: Lấy schedule mẫu từ các ngày đã có của bác sĩ này
    const templateSchedules = await DoctorSchedule.find({
      doctorUserId: doctorUserId,
      isActive: true,
      startTime: { $exists: true },
      endTime: { $exists: true }
    })
      .sort({ date: -1 }) // Lấy schedule gần nhất
      .limit(2) // Lấy 2 shift (Morning + Afternoon)
      .select('shift startTime endTime workingHours');

    console.log(`🔍 Found ${templateSchedules.length} template schedules for doctor ${doctorUserId}`);

    // ⭐ NEW: Nếu không có template schedules, fallback sang getDoctorWorkingHours
    if (templateSchedules.length === 0) {
      console.log(`⚠️ Bác sĩ ${doctorUserId} chưa có schedule nào trước đó, sử dụng workingHours từ Doctor model...`);
      
      // Lấy workingHours từ Doctor model hoặc schedule gần nhất
      const workingHours = await this.getDoctorWorkingHours(doctorUserId, searchDate);
      
      if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd || !workingHours.afternoonStart || !workingHours.afternoonEnd) {
        console.log(`⚠️ Bác sĩ ${doctorUserId} chưa có workingHours (chưa được manager tạo lịch làm việc), không thể tạo schedule mới`);
        return null;
      }

      const now = new Date();

      // Tạo startTime/endTime từ workingHours
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

      console.log(`🔍 Creating schedule for ${searchDate.toISOString().split('T')[0]} from workingHours:`, {
        morning: `${morningStart.toISOString()} - ${morningEnd.toISOString()}`,
        afternoon: `${afternoonStart.toISOString()} - ${afternoonEnd.toISOString()}`
      });

      // Check status dựa vào thời gian thực
      const morningStatus = morningEnd <= now ? 'Unavailable' : 'Available';
      const afternoonStatus = afternoonEnd <= now ? 'Unavailable' : 'Available';

      const schedulesToCreate = [
        {
          doctorUserId: doctorUserId,
          date: searchDate,
          shift: 'Morning',
          startTime: morningStart,
          endTime: morningEnd,
          status: morningStatus,
          isActive: true,
          maxSlots: 4,
          workingHours: workingHours
        },
        {
          doctorUserId: doctorUserId,
          date: searchDate,
          shift: 'Afternoon',
          startTime: afternoonStart,
          endTime: afternoonEnd,
          status: afternoonStatus,
          isActive: true,
          maxSlots: 4,
          workingHours: workingHours
        }
      ];
      
      const created = await DoctorSchedule.insertMany(schedulesToCreate, { ordered: false });
      console.log(`✅ Đã tạo schedule cho bác sĩ ${doctorUserId} vào ngày ${searchDate.toISOString().split('T')[0]} từ workingHours`);
      
      return created[0];
    }

    // ⭐ Extract time từ template schedules
    const morningTemplate = templateSchedules.find(s => s.shift === 'Morning');
    const afternoonTemplate = templateSchedules.find(s => s.shift === 'Afternoon');

    if (!morningTemplate || !afternoonTemplate) {
      console.log(`⚠️ Bác sĩ ${doctorUserId} thiếu template cho Morning hoặc Afternoon shift`);
      return null;
    }

    const now = new Date();
    
    // ⭐ FIX: Extract giờ/phút từ template startTime/endTime
    // Template startTime là UTC, cần extract hour/minute
    const morningStartUTC = new Date(morningTemplate.startTime);
    const morningEndUTC = new Date(morningTemplate.endTime);
    const afternoonStartUTC = new Date(afternoonTemplate.startTime);
    const afternoonEndUTC = new Date(afternoonTemplate.endTime);

    // ⭐ Tạo startTime/endTime mới cho searchDate với cùng giờ/phút
    const morningStart = new Date(searchDate);
    morningStart.setUTCHours(
      morningStartUTC.getUTCHours(),
      morningStartUTC.getUTCMinutes(),
      0,
      0
    );
    
    const morningEnd = new Date(searchDate);
    morningEnd.setUTCHours(
      morningEndUTC.getUTCHours(),
      morningEndUTC.getUTCMinutes(),
      0,
      0
    );
    
    const afternoonStart = new Date(searchDate);
    afternoonStart.setUTCHours(
      afternoonStartUTC.getUTCHours(),
      afternoonStartUTC.getUTCMinutes(),
      0,
      0
    );
    
    const afternoonEnd = new Date(searchDate);
    afternoonEnd.setUTCHours(
      afternoonEndUTC.getUTCHours(),
      afternoonEndUTC.getUTCMinutes(),
      0,
      0
    );

    console.log(`🔍 Creating schedule for ${searchDate.toISOString().split('T')[0]} based on template:`, {
      morning: `${morningStart.toISOString()} - ${morningEnd.toISOString()}`,
      afternoon: `${afternoonStart.toISOString()} - ${afternoonEnd.toISOString()}`
    });
    
    // Check status dựa vào thời gian thực
    const morningStatus = morningEnd <= now ? 'Unavailable' : 'Available';
    const afternoonStatus = afternoonEnd <= now ? 'Unavailable' : 'Available';

    const schedulesToCreate = [
      {
        doctorUserId: doctorUserId,
        date: searchDate,
        shift: 'Morning',
        startTime: morningStart,       // ⭐ From template
        endTime: morningEnd,           // ⭐ From template
        status: morningStatus,
        isActive: true,
        maxSlots: morningTemplate.maxSlots || 4,
        workingHours: morningTemplate.workingHours || null
      },
      {
        doctorUserId: doctorUserId,
        date: searchDate,
        shift: 'Afternoon',
        startTime: afternoonStart,     // ⭐ From template
        endTime: afternoonEnd,         // ⭐ From template
        status: afternoonStatus,
        isActive: true,
        maxSlots: afternoonTemplate.maxSlots || 4,
        workingHours: afternoonTemplate.workingHours || null
      }
    ];
    
    const created = await DoctorSchedule.insertMany(schedulesToCreate, { ordered: false });
    console.log(`✅ Đã tạo schedule cho bác sĩ ${doctorUserId} vào ngày ${searchDate.toISOString().split('T')[0]}`);
    
    return created[0];
    
  } catch (error) {
    if (error.code === 11000 || error.name === 'BulkWriteError') {
      console.log(`⚠️ Schedule đã tồn tại cho bác sĩ ${doctorUserId}`);
      const existing = await DoctorSchedule.findOne({
        doctorUserId: doctorUserId,
        date: searchDate,
        isActive: true
      });
      return existing;
    } else {
      console.error(`❌ Lỗi tạo schedule cho bác sĩ ${doctorUserId}:`, error.message);
      throw error;
    }
  }
}


    /**
   * ⭐ HELPER: Tạo schedule cho một bác sĩ cụ thể vào một ngày cho tái khám
   * @static
   */
  static async ensureScheduleForDoctorFollowUp(doctorUserId, searchDate) {
  try {
    // Chuẩn hoá ngày
    const dayStart = new Date(searchDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Kiểm tra đã có schedule trong ngày chưa
    const existingSchedule = await DoctorSchedule.findOne({
      doctorUserId: doctorUserId,
      date: { $gte: dayStart, $lte: dayEnd }
    });

    if (existingSchedule) {
      console.log(
        `✅ Bác sĩ ${doctorUserId} đã có schedule cho ngày ${dayStart
          .toISOString()
          .split('T')[0]}`
      );
      return;
    }

    // ⭐ Lấy workingHours từ schedule cũ của bác sĩ (nếu có)
    const workingHours = await this.getDoctorWorkingHours(doctorUserId, dayStart);

    if (
      !workingHours ||
      !workingHours.morningStart ||
      !workingHours.morningEnd ||
      !workingHours.afternoonStart ||
      !workingHours.afternoonEnd
    ) {
      console.log(
        `⚠️  Bác sĩ ${doctorUserId} chưa có workingHours (chưa được manager tạo lịch làm việc), không tạo schedule`
      );
      return;
    }

    const now = new Date(); // UTC

    const morningStart = new Date(dayStart);
    const [morningStartHour, morningStartMinute] = workingHours.morningStart.split(':').map(Number);
    morningStart.setUTCHours(morningStartHour - 7, morningStartMinute, 0, 0);

    const morningEnd = new Date(dayStart);
    const [morningEndHour, morningEndMinute] = workingHours.morningEnd.split(':').map(Number);
    morningEnd.setUTCHours(morningEndHour - 7, morningEndMinute, 0, 0);

    const afternoonStart = new Date(dayStart);
    const [afternoonStartHour, afternoonStartMinute] = workingHours.afternoonStart.split(':').map(Number);
    afternoonStart.setUTCHours(afternoonStartHour - 7, afternoonStartMinute, 0, 0);

    const afternoonEnd = new Date(dayStart);
    const [afternoonEndHour, afternoonEndMinute] = workingHours.afternoonEnd.split(':').map(Number);
    afternoonEnd.setUTCHours(afternoonEndHour - 7, afternoonEndMinute, 0, 0);

    const morningStatus = morningEnd <= now ? 'Unavailable' : 'Available';
    const afternoonStatus = afternoonEnd <= now ? 'Unavailable' : 'Available';

    const schedulesToCreate = [
      {
        doctorUserId: doctorUserId,
        date: dayStart, // normalize về 00:00 UTC
        shift: 'Morning',
        status: morningStatus,
        maxSlots: 4,
        workingHours: workingHours
      },
      {
        doctorUserId: doctorUserId,
        date: dayStart,
        shift: 'Afternoon',
        status: afternoonStatus,
        maxSlots: 4,
        workingHours: workingHours
      }
    ];

    await DoctorSchedule.insertMany(schedulesToCreate, { ordered: false });
    console.log(
      `✅ Đã tạo schedule cho bác sĩ ${doctorUserId} vào ngày ${dayStart
        .toISOString()
        .split('T')[0]}`
    );
  } catch (error) {
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
      console.log(`🔍 [ensureSchedulesForDate] Checking schedules for ${searchDate.toISOString().split('T')[0]}...`);
      
      // ⭐ FIX: Lấy tất cả bác sĩ ACTIVE
      const User = require('../models/user.model');
      const doctors = await User.find({
        role: 'Doctor',
        status: 'Active'
      }).select('_id fullName');

      if (doctors.length === 0) {
        console.log('⚠️  Không có bác sĩ ACTIVE nào');
        return;
      }

      console.log(`📋 Found ${doctors.length} active doctors`);

      // ⭐ FIX: Kiểm tra TỪNG bác sĩ xem đã có schedule chưa
      const schedulesToCreate = [];
      const now = new Date(); // Thời gian hiện tại (UTC thực)
      
      for (const doctor of doctors) {
        // ⭐ Kiểm tra xem bác sĩ này đã có schedule cho ngày này chưa
        const existingSchedule = await DoctorSchedule.findOne({
          doctorUserId: doctor._id,
          date: searchDate
        });

        if (existingSchedule) {
          console.log(`✅ Bác sĩ ${doctor.fullName} (${doctor._id}) đã có schedule cho ngày ${searchDate.toISOString().split('T')[0]}`);
          continue; // Bỏ qua bác sĩ đã có schedule
        }

        console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa có schedule, đang tạo...`);

        // ⭐ Lấy workingHours từ schedule cũ của bác sĩ (nếu có)
        const workingHours = await this.getDoctorWorkingHours(doctor._id, searchDate);
        
        // ⭐ Nếu bác sĩ chưa có workingHours (chưa được manager tạo lịch làm việc) → bỏ qua
        if (!workingHours || !workingHours.morningStart || !workingHours.morningEnd || !workingHours.afternoonStart || !workingHours.afternoonEnd) {
          console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa có workingHours (chưa được manager tạo lịch làm việc), bỏ qua...`);
          continue; // Bỏ qua bác sĩ chưa có workingHours
        }

        // ⭐ Sử dụng workingHours từ Doctor model hoặc schedule gần nhất
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
        console.log(`🔍 [${doctor.fullName}] Schedule Status Check:`);
        console.log(`   - Current time (UTC): ${now.toISOString()}`);
        console.log(`   - Morning end (UTC): ${morningEnd.toISOString()} = 12:00 VN`);
        console.log(`   - Morning status: ${morningStatus}`);
        console.log(`   - Afternoon end (UTC): ${afternoonEnd.toISOString()} = 18:00 VN`);
        console.log(`   - Afternoon status: ${afternoonStatus}`);
        
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
      
      if (schedulesToCreate.length === 0) {
        console.log(`✅ Tất cả bác sĩ đã có schedule cho ngày ${searchDate.toISOString().split('T')[0]}`);
        return;
      }

      // ⭐ Dùng insertMany với ordered: false để bỏ qua duplicate keys
      const result = await DoctorSchedule.insertMany(schedulesToCreate, { ordered: false });
      console.log(`✅ Tạo ${result.length} schedules mới cho ${schedulesToCreate.length / 2} bác sĩ`);
      
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
