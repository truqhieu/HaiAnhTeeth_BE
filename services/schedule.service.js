const DoctorSchedule = require('../models/doctorSchedule.model');
const Doctor = require('../models/doctor.model');

class ScheduleService {

  /**
   * Validate working hours
   */
  _validateWorkingHours(workingHours) {
    const { morningStart, morningEnd, afternoonStart, afternoonEnd } = workingHours;
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

    if (!timeRegex.test(morningStart) || !timeRegex.test(morningEnd) ||
      !timeRegex.test(afternoonStart) || !timeRegex.test(afternoonEnd)) {
      throw new Error('Thời gian phải có định dạng HH:MM (24h)');
    }

    // Validate time logic
    const morningStartTime = new Date(`2000-01-01T${morningStart}:00`);
    const morningEndTime = new Date(`2000-01-01T${morningEnd}:00`);
    const afternoonStartTime = new Date(`2000-01-01T${afternoonStart}:00`);
    const afternoonEndTime = new Date(`2000-01-01T${afternoonEnd}:00`);

    if (morningStartTime >= morningEndTime) {
      throw new Error('Thời gian bắt đầu ca sáng phải nhỏ hơn thời gian kết thúc ca sáng');
    }

    if (afternoonStartTime >= afternoonEndTime) {
      throw new Error('Thời gian bắt đầu ca chiều phải nhỏ hơn thời gian kết thúc ca chiều');
    }
  }

  /**
   * Cập nhật working hours cho một DoctorSchedule
   */
  async updateWorkingHours(scheduleId, workingHours) {
    if (!workingHours) {
      throw new Error('Vui lòng cung cấp workingHours');
    }

    this._validateWorkingHours(workingHours);

    const schedule = await DoctorSchedule.findById(scheduleId);
    if (!schedule) {
      throw new Error('Không tìm thấy lịch làm việc');
    }

    schedule.workingHours = workingHours;
    await schedule.save();

    return {
      scheduleId: schedule._id,
      doctorUserId: schedule.doctorUserId,
      date: schedule.date,
      shift: schedule.shift,
      workingHours: schedule.workingHours
    };
  }

  /**
   * Lấy working hours của một DoctorSchedule
   */
  async getWorkingHours(scheduleId) {
    const schedule = await DoctorSchedule.findById(scheduleId)
      .populate('doctorUserId', 'fullName');

    if (!schedule) {
      throw new Error('Không tìm thấy lịch làm việc');
    }

    return {
      scheduleId: schedule._id,
      doctorUserId: schedule.doctorUserId._id,
      doctorName: schedule.doctorUserId.fullName,
      date: schedule.date,
      shift: schedule.shift,
      workingHours: schedule.workingHours
    };
  }

  /**
   * Cập nhật working hours cho tất cả DoctorSchedule của một bác sĩ trong một ngày
   */
  async updateDoctorWorkingHoursForDate(doctorId, date, workingHours) {
    if (!workingHours) {
      throw new Error('Vui lòng cung cấp workingHours');
    }

    this._validateWorkingHours(workingHours);

    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    // Tìm tất cả DoctorSchedule của bác sĩ trong ngày đó
    const schedules = await DoctorSchedule.find({
      doctorUserId: doctorId,
      date: searchDate
    });

    if (schedules.length === 0) {
      throw new Error('Không tìm thấy lịch làm việc của bác sĩ trong ngày này');
    }

    // Cập nhật workingHours cho tất cả schedules
    const updatePromises = schedules.map(schedule => {
      schedule.workingHours = workingHours;
      return schedule.save();
    });

    await Promise.all(updatePromises);

    return {
      doctorId,
      date: searchDate,
      updatedSchedules: schedules.length,
      workingHours
    };
  }

  /**
   * ⭐ Lấy danh sách bác sĩ chưa có workingHours (chưa được manager tạo lịch làm việc)
   */
  async getDoctorsWithoutWorkingHours() {
    const doctors = await Doctor.find()
      .populate({
        path: 'doctorUserId',
        select: 'fullName email status role'
      })
      .lean();

    // ⭐ Chỉ trả về bác sĩ Active chưa có workingHours
    return doctors
      .filter(doc => {
        // Filter bác sĩ Active
        if (!doc.doctorUserId || doc.doctorUserId.role !== 'Doctor' || doc.doctorUserId.status !== 'Active') {
          return false;
        }
        
        // ⭐ Chỉ trả về bác sĩ chưa có workingHours (chưa được manager tạo)
        const hasWorkingHours = doc.workingHours && 
          doc.workingHours.morningStart && 
          doc.workingHours.morningEnd && 
          doc.workingHours.afternoonStart && 
          doc.workingHours.afternoonEnd;
        
        return !hasWorkingHours; // Trả về bác sĩ chưa có workingHours
      })
      .map(doc => ({
        _id: doc.doctorUserId._id,
        fullName: doc.doctorUserId.fullName,
        email: doc.doctorUserId.email
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * Lấy danh sách tất cả bác sĩ với working hours (chỉ lấy bác sĩ Active)
   */
  async getDoctorsWithWorkingHours() {
    const doctors = await Doctor.find()
      .populate({
        path: 'doctorUserId',
        select: 'fullName email status role'
      })
      .lean();

    // ⭐ Chỉ trả về bác sĩ đã có workingHours (đã được manager tạo lịch làm việc)
    return doctors
      .filter(doc => {
        // Filter bác sĩ Active
        if (!doc.doctorUserId || doc.doctorUserId.role !== 'Doctor' || doc.doctorUserId.status !== 'Active') {
          return false;
        }
        
        // ⭐ Chỉ trả về bác sĩ đã có workingHours (đã được manager tạo)
        const hasWorkingHours = doc.workingHours && 
          doc.workingHours.morningStart && 
          doc.workingHours.morningEnd && 
          doc.workingHours.afternoonStart && 
          doc.workingHours.afternoonEnd;
        
        return hasWorkingHours;
      })
      .map(doc => ({
        _id: doc.doctorUserId._id,
        fullName: doc.doctorUserId.fullName,
        email: doc.doctorUserId.email,
        workingHours: doc.workingHours, // ⭐ Chỉ trả về nếu đã có workingHours
        workingHoursUpdatedAt: doc.workingHoursUpdatedAt || null
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * ⭐ Tạo lịch làm việc mới cho bác sĩ (tự động tạo cả ca sáng và ca chiều)
   * @param {string} doctorId - ID của bác sĩ
   * @param {string} date - Ngày (YYYY-MM-DD)
   * @param {object} workingHours - { morningStart, morningEnd, afternoonStart, afternoonEnd }
   * @param {string} roomId - ID phòng khám (optional)
   */
  async createSchedule(doctorId, date, workingHours, roomId = null) {
    if (!doctorId || !date || !workingHours) {
      throw new Error('Vui lòng cung cấp đầy đủ doctorId, date và workingHours');
    }

    this._validateWorkingHours(workingHours);

    // Chuẩn bị ngày
    const scheduleDate = new Date(date);
    scheduleDate.setUTCHours(12, 0, 0, 0); // Set giữa ngày để tránh timezone issues

    // Kiểm tra xem đã có schedule chưa
    const existingSchedules = await DoctorSchedule.find({
      doctorUserId: doctorId,
      date: scheduleDate
    });

    if (existingSchedules.length > 0) {
      throw new Error('Bác sĩ đã có lịch làm việc cho ngày này');
    }

    const now = new Date();
    
    // Tính toán thời gian cho Morning và Afternoon
    const morningStart = new Date(scheduleDate);
    const [morningStartHour, morningStartMinute] = workingHours.morningStart.split(':').map(Number);
    morningStart.setUTCHours(morningStartHour - 7, morningStartMinute, 0, 0);
    
    const morningEnd = new Date(scheduleDate);
    const [morningEndHour, morningEndMinute] = workingHours.morningEnd.split(':').map(Number);
    morningEnd.setUTCHours(morningEndHour - 7, morningEndMinute, 0, 0);
    
    const afternoonStart = new Date(scheduleDate);
    const [afternoonStartHour, afternoonStartMinute] = workingHours.afternoonStart.split(':').map(Number);
    afternoonStart.setUTCHours(afternoonStartHour - 7, afternoonStartMinute, 0, 0);
    
    const afternoonEnd = new Date(scheduleDate);
    const [afternoonEndHour, afternoonEndMinute] = workingHours.afternoonEnd.split(':').map(Number);
    afternoonEnd.setUTCHours(afternoonEndHour - 7, afternoonEndMinute, 0, 0);
    
    // Check status dựa vào thời gian thực
    const morningStatus = morningEnd <= now ? 'Unavailable' : 'Available';
    const afternoonStatus = afternoonEnd <= now ? 'Unavailable' : 'Available';

    // ⭐ Tạo cả ca sáng và ca chiều
    const schedulesToCreate = [
      {
        doctorUserId: doctorId,
        date: scheduleDate,
        shift: 'Morning',
        status: morningStatus,
        maxSlots: 4, // Default maxSlots
        roomId: roomId || null,
        workingHours: workingHours
      },
      {
        doctorUserId: doctorId,
        date: scheduleDate,
        shift: 'Afternoon',
        status: afternoonStatus,
        maxSlots: 4, // Default maxSlots
        roomId: roomId || null,
        workingHours: workingHours
      }
    ];

    const createdSchedules = await DoctorSchedule.insertMany(schedulesToCreate);

    // ⭐ Cập nhật workingHours và ngày hiệu lực vào Doctor model
    const doctorProfile = await Doctor.findOne({ doctorUserId: doctorId });
    if (doctorProfile) {
      let shouldSave = false;

      if (!doctorProfile.workingHours || !doctorProfile.workingHours.morningStart) {
        doctorProfile.workingHours = workingHours;
        doctorProfile.workingHoursUpdatedAt = new Date();
        shouldSave = true;
      }

      if (!doctorProfile.workingHoursEffectiveDate || scheduleDate < doctorProfile.workingHoursEffectiveDate) {
        doctorProfile.workingHoursEffectiveDate = scheduleDate;
        shouldSave = true;
      }

      if (shouldSave) {
        await doctorProfile.save();
      }
    }

    return {
      status: true,
      message: 'Tạo lịch làm việc thành công',
      data: createdSchedules[0] // Trả về schedule đầu tiên (Morning) để tương thích với interface
    };
  }

  /**
   * Cập nhật working hours cho tất cả DoctorSchedule của một bác sĩ
   * Nếu bác sĩ chưa có schedule, vẫn cho phép update (schedules sẽ được tạo khi đặt lịch)
   * Lưu workingHours vào User model để áp dụng từ ngày hôm sau
   */
  async updateDoctorWorkingHours(doctorId, workingHours) {
    if (!workingHours) {
      throw new Error('Vui lòng cung cấp workingHours');
    }

    this._validateWorkingHours(workingHours);

    const updateTime = new Date();

    const doctorProfile = await Doctor.findOneAndUpdate(
      { doctorUserId: doctorId },
      {
        workingHours: workingHours,
        workingHoursUpdatedAt: updateTime
      },
      { new: true }
    );

    if (!doctorProfile) {
      throw new Error('Không tìm thấy hồ sơ bác sĩ để cập nhật giờ làm việc');
    }

    // Tìm tất cả DoctorSchedule của bác sĩ
    const schedules = await DoctorSchedule.find({
      doctorUserId: doctorId
    });

    let updatedSchedules = 0;

    if (schedules.length > 0) {
      // Cập nhật workingHours cho tất cả schedules hiện có
      const updatePromises = schedules.map(schedule => {
        schedule.workingHours = workingHours;
        return schedule.save();
      });

      await Promise.all(updatePromises);
      updatedSchedules = schedules.length;
    }

    return {
      doctorId,
      updatedSchedules: updatedSchedules,
      workingHours,
      workingHoursUpdatedAt: updateTime,
      message: updatedSchedules > 0 
        ? `Đã cập nhật ${updatedSchedules} lịch làm việc. Lịch làm việc mới sẽ có hiệu lực từ ngày mai.` 
        : 'Bác sĩ chưa có lịch làm việc. Lịch làm việc mới sẽ sử dụng giờ làm việc này khi được tạo và có hiệu lực từ ngày mai.'
    };
  }
}

module.exports = new ScheduleService();

