const DoctorSchedule = require('../models/doctorSchedule.model');
const Appointment = require('../models/appointment.model');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const ScheduleHelper = require('../utils/scheduleHelper');

class AvailableSlotService {

  /**
   * ⭐ HELPER: Update status của schedules đã hết thành "Unavailable"
   * @private
   */
  async _updateExpiredSchedules() {
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
   * ⭐ HELPER: Tự động tạo schedule cho một ngày nếu chưa có
   * Đảm bảo mỗi bác sĩ chỉ có 1 Morning và 1 Afternoon schedule
   * @private
   */
  async _ensureSchedulesForDate(searchDate) {
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
        // Sử dụng workingHours mặc định
        const workingHours = {
          morningStart: '08:00',
          morningEnd: '12:00',
          afternoonStart: '14:00',
          afternoonEnd: '18:00'
        };

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

  /**
   * Lấy các khung giờ available dựa trên:
   * - DoctorSchedule (khung giờ làm việc)
   * - Service (thời lượng dịch vụ)
   * - Appointments đã book (để loại trừ)
   * 
   * @param {Object} params
   * @param {ObjectId} params.doctorUserId - ID của User có role="Doctor"
   * @param {ObjectId} params.serviceId - ID dịch vụ
   * @param {Date} params.date - Ngày muốn đặt lịch
   * @param {Number} params.breakAfterMinutes - Thời gian nghỉ giữa các ca (mặc định 10 phút)
   */
  async getAvailableSlots({ doctorUserId, serviceId, date, patientUserId, breakAfterMinutes = 10 }) {
    
    // 1. Validate input
    if (!doctorUserId || !serviceId || !date) {
      throw new Error('Vui lòng cung cấp đầy đủ doctorUserId, serviceId và date');
    }

    // 2. Kiểm tra doctor có tồn tại không (từ bảng User với role="Doctor")
    const doctor = await User.findById(doctorUserId);
    if (!doctor) {
      throw new Error('Bác sĩ bạn chọn không tồn tại. Vui lòng chọn bác sĩ khác.');
    }

    if (doctor.role !== 'Doctor') {
      throw new Error('Bác sĩ bạn chọn không hợp lệ. Vui lòng chọn bác sĩ khác.');
    }

    if (doctor.status !== 'Active') {
      throw new Error('Bác sĩ bạn chọn hiện không khả dụng. Vui lòng chọn bác sĩ khác.');
    }

    // 3. Lấy thông tin dịch vụ
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }

    if (service.status !== 'Active') {
      throw new Error('Dịch vụ bạn chọn hiện không khả dụng. Vui lòng chọn dịch vụ khác.');
    }

    const serviceDuration = service.durationMinutes;

    // 4. Lấy DoctorSchedule của ngày đó
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    let schedules = await DoctorSchedule.find({
      doctorUserId,
      date: searchDate,
      status: 'Available'
    }).sort({ shift: 1 });

    // ⭐ THÊM: Nếu chưa có schedule cho ngày này → Tự động tạo mặc định
    if (schedules.length === 0) {
      console.log(`⚠️  Không tìm thấy DoctorSchedule cho ngày ${searchDate.toISOString().split('T')[0]}, tự động tạo...`);
      
      try {
        // Sử dụng workingHours mặc định
        const workingHours = {
          morningStart: '08:00',
          morningEnd: '12:00',
          afternoonStart: '14:00',
          afternoonEnd: '18:00'
        };

        // Tạo schedule dựa trên workingHours
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

        const defaultSchedules = [
          {
            doctorUserId,
            date: searchDate,
            shift: 'Morning',
            status: 'Available',
            maxSlots: 4,
            workingHours: workingHours
          },
          {
            doctorUserId,
            date: searchDate,
            shift: 'Afternoon',
            status: 'Available',
            maxSlots: 4,
            workingHours: workingHours
          }
        ];
        
        schedules = await DoctorSchedule.insertMany(defaultSchedules);
        console.log(`✅ Tạo mới 2 schedule mặc định cho ngày ${searchDate.toISOString().split('T')[0]}`);
      } catch (insertError) {
        console.error(`❌ Lỗi tạo schedule mặc định:`, insertError.message);
        return {
          date: searchDate,
          doctorUserId,
          serviceId,
          serviceName: service.serviceName,
          serviceDuration,
          availableSlots: [],
          message: 'Không thể tạo lịch làm việc mặc định. Vui lòng liên hệ admin.'
        };
      }
    }

    // ⭐ Lúc này schedules luôn có dữ liệu (auto-created nếu cần)
    // Không cần check schedules.length === 0 nữa

    // 5. Lấy tất cả appointments đã book của bác sĩ trong ngày đó
    const startOfDay = new Date(searchDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(searchDate);
    endOfDay.setHours(23, 59, 59, 999);

    // ⭐ FIXED: Query appointments có timeslot rảnh trong ngày (không dùng createdAt)
    const bookedAppointments = await Appointment.find({
      doctorUserId,
      status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
      timeslotId: { $exists: true }
    })
    .populate({
      path: 'timeslotId',
      select: 'startTime endTime',
      match: {
        startTime: { $gte: startOfDay, $lte: endOfDay }
      }
    })
    .populate('serviceId', 'durationMinutes')
    .sort({ 'timeslotId.startTime': 1 });

    // Filter out appointments where timeslotId couldn't match (populate returned null)
    const validAppointments = bookedAppointments.filter(apt => apt.timeslotId !== null);

    // ⭐ THÊM: Kiểm tra appointments của bệnh nhân hiện tại trong ngày (nếu đặt cho bản thân)
    let patientAppointments = [];
    if (patientUserId) {
      patientAppointments = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime',
        match: {
          startTime: { $gte: startOfDay, $lte: endOfDay }
        }
      })
      .sort({ 'timeslotId.startTime': 1 });

      patientAppointments = patientAppointments.filter(apt => apt.timeslotId !== null);

      console.log('👤 Appointments của bệnh nhân hiện tại trong ngày:', patientAppointments.length);
    }

    // ⭐ THÊM: Lấy tất cả timeslots đã được Reserved hoặc Booked trong ngày
    // Để tránh conflict ngay cả khi chưa confirm appointment
    const Timeslot = require('../models/timeslot.model');
    const reservedTimeslots = await Timeslot.find({
      doctorUserId,
      status: { $in: ['Reserved', 'Booked'] },
      startTime: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ startTime: 1 });

    // ⭐ THÊM: Lấy tất cả timeslots từ appointments của bệnh nhân hiện tại trong ngày
    // Để exclude các khung giờ bệnh nhân đã book
    let patientTimeslots = [];
    if (patientUserId) {
      const patientTimeslotIds = patientAppointments.map(apt => apt.timeslotId._id);
      if (patientTimeslotIds.length > 0) {
        patientTimeslots = await Timeslot.find({
          _id: { $in: patientTimeslotIds },
          startTime: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ startTime: 1 });
        
        console.log('👤 Patient timeslots to exclude:', patientTimeslots.length);
      }
    }

    // 6. Tạo danh sách khoảng thời gian đã bận (KHÔNG cộng break time - slot tiếp theo có thể bắt đầu ngay sau)
    const busySlots = validAppointments.map(apt => {
      if (apt.timeslotId) {
        return {
          start: new Date(apt.timeslotId.startTime),
          end: new Date(apt.timeslotId.endTime).getTime() // Không cộng break time nữa
        };
      }
      return null;
    }).filter(slot => slot !== null);

    // ⭐ THÊM: Thêm appointments của bệnh nhân vào busy slots
    const patientBusySlots = patientAppointments.map(apt => {
      if (apt.timeslotId) {
        return {
          start: new Date(apt.timeslotId.startTime),
          end: new Date(apt.timeslotId.endTime).getTime() // Không cộng break time nữa
        };
      }
      return null;
    }).filter(slot => slot !== null);
    
    busySlots.push(...patientBusySlots);

    // ⭐ THÊM: Thêm timeslots của bệnh nhân vào busy slots (để exclude khung giờ họ đã book)
    const patientTimeslotBusySlots = patientTimeslots.map(ts => ({
      start: new Date(ts.startTime),
      end: new Date(ts.endTime).getTime() // Không cộng break time nữa
    }));
    
    busySlots.push(...patientTimeslotBusySlots);

    // ⭐ THÊM: Thêm Reserved/Booked timeslots vào busySlots
    const reservedBusySlots = reservedTimeslots.map(ts => ({
      start: new Date(ts.startTime),
      end: new Date(ts.endTime).getTime() // Không cộng break time nữa
    }));
    
    busySlots.push(...reservedBusySlots);

    console.log('📅 Tính toán available slots:');
    console.log('   - Bác sĩ:', doctorUserId);
    console.log('   - Bệnh nhân:', patientUserId || 'N/A');
    console.log('   - Dịch vụ:', service.serviceName, `(${serviceDuration} phút)`);
    console.log('   - Ngày:', searchDate.toISOString().split('T')[0]);
    console.log('   - Số appointments của bác sĩ đã book:', validAppointments.length);
    console.log('   - Số appointments của bệnh nhân đã book:', patientAppointments.length);
    console.log('   - Số timeslots của bệnh nhân cần exclude:', patientTimeslots.length);
    console.log('   - Số timeslots Reserved/Booked:', reservedTimeslots.length);
    console.log('🔴 DEBUG busySlots:', busySlots.map(b => ({
      start: new Date(b.start).toISOString(),
      end: new Date(b.end).toISOString()
    })));

    // 7. Tạo danh sách slots available
    const allAvailableSlots = [];

    for (const schedule of schedules) {
      // Sử dụng workingHours từ DoctorSchedule thay vì startTime/endTime
      const workingHours = schedule.workingHours || {
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00'
      };

      // Tạo scheduleStart và scheduleEnd dựa trên workingHours
      let scheduleStart, scheduleEnd;
      
      if (schedule.shift === 'Morning') {
        scheduleStart = new Date(searchDate);
        const [startHour, startMinute] = workingHours.morningStart.split(':').map(Number);
        scheduleStart.setUTCHours(startHour - 7, startMinute, 0, 0);
        
        scheduleEnd = new Date(searchDate);
        const [endHour, endMinute] = workingHours.morningEnd.split(':').map(Number);
        scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
      } else { // Afternoon
        scheduleStart = new Date(searchDate);
        const [startHour, startMinute] = workingHours.afternoonStart.split(':').map(Number);
        scheduleStart.setUTCHours(startHour - 7, startMinute, 0, 0);
        
        scheduleEnd = new Date(searchDate);
        const [endHour, endMinute] = workingHours.afternoonEnd.split(':').map(Number);
        scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
      }

      console.log(`\n   🕐 Schedule ${schedule.shift}: ${ScheduleHelper.formatTimeSlot(scheduleStart, scheduleEnd)}`);

      // Tạo các slot có thể trong schedule này
      const slots = this._generateSlotsInRange(
        scheduleStart,
        scheduleEnd,
        serviceDuration,
        breakAfterMinutes,
        busySlots
      );

      allAvailableSlots.push(...slots);
    }

    console.log(`\n   ✅ Tổng số slots available: ${allAvailableSlots.length}`);

    return {
      date: searchDate,
      doctorUserId,
      serviceId,
      serviceName: service.serviceName,
      serviceDuration,
      breakAfterMinutes,
      availableSlots: allAvailableSlots,
      totalSlots: allAvailableSlots.length,
      // ⭐ Thêm scheduleId từ DoctorSchedule đầu tiên (có thể có multiple schedules)
      scheduleId: schedules.length > 0 ? schedules[0]._id : null
    };
  }

  /**
   * Tạo danh sách slots trong một khoảng thời gian, loại trừ busy slots
   * @private
   */
  _generateSlotsInRange(startTime, endTime, duration, breakTime, busySlots) {
    const slots = [];
    let currentStart = new Date(startTime);
    const end = new Date(endTime);

    while (currentStart < end) {
      // Tính end time của slot này
      const currentEnd = new Date(currentStart.getTime() + duration * 60000);

      // Kiểm tra slot có vượt quá thời gian làm việc không
      if (currentEnd > end) {
        break;
      }

      // Kiểm tra slot có trùng với busy slots không
      const isConflict = busySlots.some(busy => {
        return (
          (currentStart >= busy.start && currentStart < busy.end) ||
          (currentEnd > busy.start && currentEnd <= busy.end) ||
          (currentStart <= busy.start && currentEnd >= busy.end)
        );
      });

      if (!isConflict) {
        slots.push({
          startTime: currentStart.toISOString(),
          endTime: currentEnd.toISOString(),
          displayTime: ScheduleHelper.formatTimeSlot(currentStart, currentEnd)
        });
      }

      // Tính thời gian bắt đầu slot tiếp theo (không cộng break time - slot tiếp theo có thể bắt đầu ngay sau)
      currentStart = new Date(currentEnd);
    }

    return slots;
  }

  /**
   * Lấy tất cả bác sĩ ACTIVE có khung giờ rảnh vào ngày và dịch vụ cụ thể
 */
  async getAvailableDoctors({ serviceId, date, breakAfterMinutes = 10 }) {
    // 1. Validate input
    if (!serviceId || !date) {
      throw new Error('Vui lòng cung cấp đầy đủ serviceId và date');
    }

    // 2. Lấy thông tin dịch vụ
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }

    if (service.status !== 'Active') {
      throw new Error('Dịch vụ bạn chọn hiện không khả dụng. Vui lòng chọn dịch vụ khác.');
    }

    const serviceDuration = service.durationMinutes;

    // 3. Lấy tất cả bác sĩ ACTIVE
    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active'
    }).select('_id fullName email phoneNumber');

    // 4. Chuẩn bị ngày tìm kiếm
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    console.log('🔍 Search date:', searchDate.toISOString());
    console.log('📅 Searching for doctors with schedule on:', searchDate.toISOString().split('T')[0]);

    // ⭐ Tự động tạo schedule nếu chưa có (dùng helper method chung)
    await this._ensureSchedulesForDate(searchDate);

    // 5. Duyệt qua từng bác sĩ để lấy danh sách có schedule vào ngày đó
    const availableDoctors = [];

    for (const doctor of doctors) {
      try {
        // Kiểm tra xem bác sĩ có schedule vào ngày đó không (có thể có nhiều shifts)
        const schedules = await DoctorSchedule.find({
          doctorUserId: doctor._id,
          date: searchDate,
          status: 'Available'
        });

        // ⭐ Nếu vẫn không có schedule (rare case) → skip
        if (!schedules || schedules.length === 0) {
          console.warn(`⚠️  Bác sĩ ${doctor._id} không có schedule cho ngày này, skip...`);
          continue;
        }

        // Bác sĩ này có schedule vào ngày đó → thêm vào danh sách
        // (FE sẽ chọn bác sĩ, sau đó lấy schedule range của bác sĩ đó)
        availableDoctors.push({
          doctorId: doctor._id,
          doctorName: doctor.fullName,
          email: doctor.email,
          phoneNumber: doctor.phoneNumber,
          available: true,
          totalSchedules: schedules.length
        });

      } catch (error) {
        console.warn(`⚠️  Lỗi kiểm tra bác sĩ ${doctor._id}:`, error.message);
      }
    }

    console.log('✅ Tìm kiếm bác sĩ có khung giờ rảnh:');
    console.log(`   - Ngày: ${searchDate.toISOString().split('T')[0]}`);
    console.log(`   - Dịch vụ: ${service.serviceName}`);
    console.log(`   - Tổng bác sĩ ACTIVE: ${doctors.length}`);
    console.log(`   - Bác sĩ có khung giờ rảnh: ${availableDoctors.length}`);

    return {
      date: searchDate,
      serviceId,
      serviceName: service.serviceName,
      serviceDuration,
      breakAfterMinutes,
      availableDoctors: availableDoctors,
      totalDoctors: availableDoctors.length,
      totalDoctorsActive: doctors.length
    };
  }

  /**
   * Lấy bác sĩ có khung giờ rảnh tại một khung giờ cụ thể
   * (Sử dụng khi FE chọn một khung giờ cụ thể thay vì xem tất cả)
   */
  async getAvailableDoctorsForTimeSlot({ serviceId, date, startTime, endTime, patientUserId, appointmentFor }) {
    // 0. Update expired schedules trước
    await this._updateExpiredSchedules();

    // 1. Validate input
    if (!serviceId || !date || !startTime || !endTime) {
      throw new Error('Vui lòng cung cấp đầy đủ serviceId, date, startTime và endTime');
    }

    // ⭐ THÊM: Check nếu slot đã hết (endTime <= now)
    const slotEnd = new Date(endTime);
    const now = new Date();
    
    if (slotEnd <= now) {
      throw new Error('Khung giờ này đã hết. Vui lòng chọn khung giờ khác.');
    }

    // 2. Lấy thông tin dịch vụ
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }

    if (service.status !== 'Active') {
      throw new Error('Dịch vụ bạn chọn hiện không khả dụng. Vui lòng chọn dịch vụ khác.');
    }

    // ⭐ THÊM: Check nếu bệnh nhân hiện tại đã có appointment vào khung giờ này
    if (patientUserId) {
      const slotStartTime = new Date(startTime);
      const slotEndTime = new Date(endTime);

      const existingPatientAppointment = await Appointment.findOne({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime',
        match: {
          startTime: { $gte: slotStartTime, $lt: slotEndTime },
          endTime: { $gt: slotStartTime, $lte: slotEndTime }
        }
      });

      if (existingPatientAppointment && existingPatientAppointment.timeslotId) {
        console.log(`⚠️  Bệnh nhân ${patientUserId} đã có appointment vào khung giờ này`);
        return {
          date: new Date(date),
          serviceId,
          serviceName: service.serviceName,
          requestedTime: {
            startTime: new Date(startTime),
            endTime: new Date(endTime)
          },
          availableDoctors: [],
          totalDoctors: 0,
          message: 'Bạn đã có appointment vào khung giờ này. Vui lòng chọn khung giờ khác.'
        };
      }
    }

    // ⭐ THÊM: Lấy danh sách bác sĩ mà user (self) đã có appointment vào khung giờ này
    // (nếu appointmentFor === 'other', sẽ exclude các bác sĩ này khỏi danh sách)
    let userAppointedDoctorIds = [];
    if (patientUserId && appointmentFor === 'other') {
      console.log(`🔍 [${appointmentFor}] Lấy danh sách bác sĩ mà user ${patientUserId} đã đặt vào khung giờ này`);
      
      const slotStartTime = new Date(startTime);
      const slotEndTime = new Date(endTime);
      
      const userAppointmentsInSlot = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId',
        match: {
          startTime: { $gte: slotStartTime, $lt: slotEndTime },
          endTime: { $gt: slotStartTime, $lte: slotEndTime }
        }
      });
      
      userAppointedDoctorIds = userAppointmentsInSlot
        .filter(apt => apt.timeslotId)
        .map(apt => apt.timeslotId.doctorUserId?.toString())
        .filter(id => id);
      
      console.log(`   - Bác sĩ user đã đặt: ${userAppointedDoctorIds.length}`, userAppointedDoctorIds);
    }

    // ⭐ THÊM: Validate duration của slot phải khớp với service
    const slotStartTime = new Date(startTime);
    const slotEndTime = new Date(endTime);
    const slotDurationMinutes = (slotEndTime - slotStartTime) / 60000;
    let serviceDurationMinutes = service.durationMinutes;

    console.log('🔍 DEBUG getAvailableDoctorsForTimeSlot:');
    console.log('   - ServiceID:', serviceId);
    console.log('   - Service Name:', service.serviceName);
    console.log('   - Date:', date);
    console.log('   - Start Time Input:', startTime);
    console.log('   - End Time Input:', endTime);
    console.log('   - Slot Start:', slotStartTime.toISOString());
    console.log('   - Slot End:', slotEndTime.toISOString());
    console.log('   - Slot Duration (Minutes):', slotDurationMinutes);
    console.log('   - Service Duration (Minutes - raw):', serviceDurationMinutes);

    // ⭐ THÊM: Validate service duration - nếu không hợp lý, dùng duration tính từ slot
    if (!serviceDurationMinutes || serviceDurationMinutes <= 5 || serviceDurationMinutes > 480) {
      console.warn(`⚠️  Service duration ${serviceDurationMinutes} không hợp lệ, sử dụng slot duration ${slotDurationMinutes}`);
      serviceDurationMinutes = slotDurationMinutes;
    }

    console.log('   - Service Duration (Minutes - final):', serviceDurationMinutes);
    console.log('   - Duration Match:', slotDurationMinutes === serviceDurationMinutes);

    if (slotDurationMinutes !== serviceDurationMinutes) {
      throw new Error(
        `Thời lượng khung giờ không khớp với dịch vụ. ` +
        `Dịch vụ "${service.serviceName}" yêu cầu ${serviceDurationMinutes} phút, ` +
        `nhưng bạn đã chọn ${slotDurationMinutes} phút.`
      );
    }

    // 3. Lấy tất cả bác sĩ ACTIVE
    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active'
    }).select('_id fullName email phoneNumber');

    if (doctors.length === 0) {
      return {
        date: new Date(date),
        serviceId,
        serviceName: service.serviceName,
        requestedTime: {
          startTime: new Date(startTime),
          endTime: new Date(endTime)
        },
        availableDoctors: [],
        totalDoctors: 0,
        message: 'Không có bác sĩ nào hoạt động'
      };
    }

    // 4. Chuẩn bị ngày tìm kiếm
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    // ⭐ slotStartTime và slotEndTime đã được khai báo ở trên (dòng 375-376)
    // Không cần khai báo lại

    // 5. Duyệt qua từng bác sĩ để kiểm tra khung giờ này có rảnh không
    const availableDoctors = [];
    const Timeslot = require('../models/timeslot.model');

    for (const doctor of doctors) {
      try {
        // Kiểm tra xem bác sĩ có schedule vào ngày đó không
        let schedule = await DoctorSchedule.findOne({
          doctorUserId: doctor._id,
          date: searchDate,
          status: 'Available'
        });

        console.log(`\n👨‍⚕️ Checking doctor: ${doctor.fullName} (${doctor._id})`);
        console.log(`   Schedule found: ${schedule ? 'YES' : 'NO'}`);

        // ⭐ THÊM: Nếu không có schedule → Tự động tạo
        if (!schedule) {
          console.log(`⚠️  Bác sĩ ${doctor._id} không có schedule cho ngày ${searchDate.toISOString().split('T')[0]}, tự động tạo...`);
          
          try {
            // Sử dụng workingHours mặc định
            const workingHours = {
              morningStart: '08:00',
              morningEnd: '12:00',
              afternoonStart: '14:00',
              afternoonEnd: '18:00'
            };

            // Tạo schedule dựa trên workingHours
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

            const defaultSchedules = [
              {
                doctorUserId: doctor._id,
                date: searchDate,
                shift: 'Morning',
                status: 'Available',
                maxSlots: 4,
                workingHours: workingHours
              },
              {
                doctorUserId: doctor._id,
                date: searchDate,
                shift: 'Afternoon',
                status: 'Available',
                maxSlots: 4,
                workingHours: workingHours
              }
            ];
            
            const created = await DoctorSchedule.insertMany(defaultSchedules);
            console.log(`✅ Tạo mới 2 schedule mặc định`);
            
            // Lấy schedule Morning (shift đầu tiên)
            schedule = created[0];
          } catch (createError) {
            console.error(`❌ Lỗi tạo schedule: ${createError.message}`);
            continue;
          }
        }

        // Sử dụng workingHours từ DoctorSchedule thay vì startTime/endTime
        const workingHours = schedule.workingHours || {
          morningStart: '08:00',
          morningEnd: '12:00',
          afternoonStart: '14:00',
          afternoonEnd: '18:00'
        };

        // Tạo scheduleStart và scheduleEnd dựa trên workingHours
        let scheduleStart, scheduleEnd;
        
        if (schedule.shift === 'Morning') {
          scheduleStart = new Date(searchDate);
          const [startHour, startMinute] = workingHours.morningStart.split(':').map(Number);
          scheduleStart.setUTCHours(startHour - 7, startMinute, 0, 0);
          
          scheduleEnd = new Date(searchDate);
          const [endHour, endMinute] = workingHours.morningEnd.split(':').map(Number);
          scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
        } else { // Afternoon
          scheduleStart = new Date(searchDate);
          const [startHour, startMinute] = workingHours.afternoonStart.split(':').map(Number);
          scheduleStart.setUTCHours(startHour - 7, startMinute, 0, 0);
          
          scheduleEnd = new Date(searchDate);
          const [endHour, endMinute] = workingHours.afternoonEnd.split(':').map(Number);
          scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
        }

        console.log(`   Schedule: ${scheduleStart.toISOString()} - ${scheduleEnd.toISOString()}`);
        console.log(`   Slot: ${slotStartTime.toISOString()} - ${slotEndTime.toISOString()}`);
        console.log(`   Slot in schedule: ${slotStartTime >= scheduleStart && slotEndTime <= scheduleEnd}`);

        if (slotStartTime < scheduleStart || slotEndTime > scheduleEnd) {
          console.log(`   ❌ SKIP: Slot nằm ngoài schedule`);
          continue; // Khung giờ này nằm ngoài schedule
        }

        // Kiểm tra khung giờ có bị đặt trước không (kiểm tra Reserved hoặc Booked timeslots)
        const conflictingTimeslot = await Timeslot.findOne({
          doctorUserId: doctor._id,
          status: { $in: ['Reserved', 'Booked'] },
          // Kiểm tra có overlap: timeslot.startTime < slotEndTime AND timeslot.endTime > slotStartTime
          startTime: { $lt: slotEndTime },
          endTime: { $gt: slotStartTime }
        });

        if (conflictingTimeslot) {
          console.log(`   ❌ SKIP: Slot has conflict`);
          continue; // Khung giờ này đã bị đặt
        }

        // Bác sĩ này có khung giờ này rảnh
        console.log(`   ✅ AVAILABLE`);
        
        // ⭐ THÊM: Nếu appointmentFor === 'other', check xem bác sĩ này có trong danh sách user đã đặt không
        if (appointmentFor === 'other' && userAppointedDoctorIds.length > 0) {
          if (userAppointedDoctorIds.includes(doctor._id.toString())) {
            console.log(`   ⭐ EXCLUDE: User đã đặt với bác sĩ này vào khung giờ này`);
            continue; // Loại bỏ bác sĩ này
          }
        }
        
        availableDoctors.push({
          doctorId: doctor._id,
          doctorScheduleId: schedule._id, // ← Schedule của ngày đó
          doctorName: doctor.fullName,
          email: doctor.email,
          phoneNumber: doctor.phoneNumber,
          available: true
        });

      } catch (error) {
        console.warn(`⚠️  Lỗi kiểm tra bác sĩ ${doctor._id}:`, error.message);
      }
    }

    console.log('✅ Tìm kiếm bác sĩ rảnh cho khung giờ cụ thể:');
    console.log(`   - Ngày: ${searchDate.toISOString().split('T')[0]}`);
    console.log(`   - Khung giờ: ${slotStartTime.toISOString()} - ${slotEndTime.toISOString()}`);
    console.log(`   - Bác sĩ có khung giờ rảnh: ${availableDoctors.length}`);

    return {
      date: searchDate,
      serviceId,
      serviceName: service.serviceName,
      requestedTime: {
        startTime: slotStartTime,
        endTime: slotEndTime,
        displayTime: ScheduleHelper.formatTimeSlot(slotStartTime, slotEndTime)
      },
      availableDoctors: availableDoctors,
      totalDoctors: availableDoctors.length
    };
  }

  /**
   * ⭐ NEW: Generate danh sách khung giờ trống cho một ngày (không cần chọn bác sĩ)
   */
  async generateAvailableSlotsByDate({ 
    serviceId, 
    date, 
    breakAfterMinutes = 10, 
    patientUserId = null,
    customerFullName = null,
    customerEmail = null
  }) {
    // 1. Validate input
    if (!serviceId || !date) {
      throw new Error('Vui lòng cung cấp đầy đủ serviceId và date');
    }

    // ⭐ DEBUG: Log input parameters
    console.log('🔍 [generateAvailableSlotsByDate] INPUT PARAMS:');
    console.log('   - patientUserId:', patientUserId || 'NULL (WILL NOT EXCLUDE USER SLOTS)');
    console.log('   - customerFullName:', customerFullName || 'NULL');
    console.log('   - customerEmail:', customerEmail || 'NULL');
    console.log('   - breakAfterMinutes:', breakAfterMinutes);

    // 2. Lấy thông tin dịch vụ
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }

    if (service.status !== 'Active') {
      throw new Error('Dịch vụ bạn chọn hiện không khả dụng. Vui lòng chọn dịch vụ khác.');
    }

    const serviceDuration = service.durationMinutes;
    
    console.log('🔍 Service info for generateAvailableSlotsByDate:');
    console.log('   - Service ID:', serviceId);
    console.log('   - Service Name:', service.serviceName);
    console.log('   - Duration Minutes:', serviceDuration);
    console.log('   - Service object:', JSON.stringify({
      name: service.serviceName,
      durationMinutes: service.durationMinutes,
      category: service.category,
      status: service.status
    }, null, 2));

    // ⭐ THÊM: Validate service duration - nếu không hợp lý, dùng 30 phút mặc định
    const finalServiceDuration = (serviceDuration && serviceDuration > 5 && serviceDuration <= 480) 
      ? serviceDuration 
      : 30;
    
    if (finalServiceDuration !== serviceDuration) {
      console.warn(`⚠️  Service duration ${serviceDuration} không hợp lệ, sử dụng mặc định 30 phút`);
    }

    // 3. Chuẩn bị ngày tìm kiếm
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    console.log('🔍 Search date:', searchDate.toISOString());
    console.log('📅 Searching for doctors with schedule on:', searchDate.toISOString().split('T')[0]);

    // ⭐ Update expired schedules trước
    await this._updateExpiredSchedules();

    // ⭐ Tự động tạo schedule nếu chưa có (dùng helper method chung)
    await this._ensureSchedulesForDate(searchDate);

    // 4. Lấy tất cả bác sĩ đang active
    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active'
    }).select('_id fullName specialization');

    console.log(`📋 Tìm thấy ${doctors.length} bác sĩ active`);

    if (doctors.length === 0) {
      return {
        date: searchDate,
        slots: []
      };
    }

    // 5. Lấy schedules của tất cả bác sĩ trong ngày
    const schedules = await DoctorSchedule.find({
      doctorUserId: { $in: doctors.map(d => d._id) },
      date: searchDate,
      status: 'Available'
    });

    console.log(`📋 Tìm thấy ${schedules.length} schedules`);

    if (schedules.length === 0) {
      return {
        date: searchDate,
        slots: []
      };
    }

    // 6. Lấy tất cả appointments đã book trong ngày này
    const appointments = await Appointment.find({
      doctorUserId: { $in: doctors.map(d => d._id) },
      status: { $in: ['Pending', 'Approved', 'CheckedIn'] }
    }).populate('timeslotId', 'startTime endTime doctorUserId');

    // 6.5. ⭐ Nếu có patientUserId, lấy thêm các appointments của user này để exclude
    let patientBookedSlots = [];
    if (patientUserId) {
      const patientAppointments = await Appointment.find({
        patientUserId: patientUserId,
        status: { $in: ['Pending', 'Approved', 'CheckedIn', 'Completed'] }
      }).populate('timeslotId', 'startTime endTime');

      patientBookedSlots = patientAppointments
        .filter(apt => apt.timeslotId)
        .map(apt => ({
          start: new Date(apt.timeslotId.startTime),
          end: new Date(apt.timeslotId.endTime)
        }));

      console.log(`👤 User ${patientUserId} đã đặt ${patientBookedSlots.length} slots`);
    }

    // 6.6. ⭐ THÊM: Nếu đặt cho người khác, lấy appointments của người khác này để exclude
    let customerBookedSlots = [];
    if (customerFullName && customerEmail) {
      console.log(`👤 Tìm appointments của customer: ${customerFullName} <${customerEmail}>`);
      
      const Customer = require('../models/customer.model');
      
      // Tìm customer có fullName + email match (case-insensitive)
      const customer = await Customer.findOne({
        fullName: new RegExp(`^${customerFullName}$`, 'i'),
        email: new RegExp(`^${customerEmail}$`, 'i')
      });

      if (customer) {
        console.log(`✅ Tìm thấy customer: ${customer._id}`);
        
        const customerAppointments = await Appointment.find({
          customerId: customer._id,
          status: { $in: ['Pending', 'Approved', 'CheckedIn', 'Completed'] }
        }).populate('timeslotId', 'startTime endTime');

        customerBookedSlots = customerAppointments
          .filter(apt => apt.timeslotId)
          .map(apt => ({
            start: new Date(apt.timeslotId.startTime),
            end: new Date(apt.timeslotId.endTime)
          }));

        console.log(`👤 Customer ${customerFullName} đã đặt ${customerBookedSlots.length} slots`);
      } else {
        console.log(`⚠️ Không tìm thấy customer: ${customerFullName} <${customerEmail}>`);
      }
    }

    // 7. Tạo map của booked timeslots theo doctorId
    const bookedSlotsByDoctor = {};
    for (const apt of appointments) {
      if (apt.timeslotId) {
        const docId = apt.timeslotId.doctorUserId.toString();
        if (!bookedSlotsByDoctor[docId]) {
          bookedSlotsByDoctor[docId] = [];
        }
        bookedSlotsByDoctor[docId].push({
          start: new Date(apt.timeslotId.startTime),
          end: new Date(apt.timeslotId.endTime)
        });
      }
    }

    // ⭐ THÊM: Lấy tất cả timeslots đã reserved hoặc booked (không chỉ từ appointments)
    const Timeslot = require('../models/timeslot.model');
    const allTimeslots = await Timeslot.find({
      doctorUserId: { $in: doctors.map(d => d._id) },
      startTime: { 
        $gte: new Date(searchDate.getTime()),
        $lt: new Date(searchDate.getTime() + 24 * 60 * 60 * 1000)
      },
      status: { $in: ['Reserved', 'Booked'] }
    });

    console.log(`🔍 Found ${allTimeslots.length} timeslots (Reserved/Booked) for this date`);

    // Thêm timeslots vào bookedSlotsByDoctor
    for (const timeslot of allTimeslots) {
      const docId = timeslot.doctorUserId.toString();
      if (!bookedSlotsByDoctor[docId]) {
        bookedSlotsByDoctor[docId] = [];
      }
      bookedSlotsByDoctor[docId].push({
        start: new Date(timeslot.startTime),
        end: new Date(timeslot.endTime)
      });
    }

    // Debug: Log booked slots for each doctor
    for (const doctorId in bookedSlotsByDoctor) {
      const doctor = doctors.find(d => d._id.toString() === doctorId);
      console.log(`🔍 Doctor ${doctor?.fullName}: ${bookedSlotsByDoctor[doctorId].length} booked slots`);
      bookedSlotsByDoctor[doctorId].forEach((slot, idx) => {
        const vnStart = new Date(slot.start.getTime() + 7 * 60 * 60 * 1000);
        const vnEnd = new Date(slot.end.getTime() + 7 * 60 * 60 * 1000);
        console.log(`   - Slot ${idx + 1}: ${vnStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${vnEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
      });
    }

    // 8. Generate slots cho từng bác sĩ
    const allSlots = [];
    const now = new Date();

    for (const schedule of schedules) {
      const doctorId = schedule.doctorUserId.toString();
      const doctor = doctors.find(d => d._id.toString() === doctorId);

      if (!doctor) continue;

      // Sử dụng workingHours từ DoctorSchedule thay vì startTime/endTime
      const workingHours = schedule.workingHours || {
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00'
      };

      // Tạo scheduleStart và scheduleEnd dựa trên workingHours
      let scheduleStart, scheduleEnd;
      
      if (schedule.shift === 'Morning') {
        scheduleStart = new Date(searchDate);
        const [startHour, startMinute] = workingHours.morningStart.split(':').map(Number);
        scheduleStart.setUTCHours(startHour - 7, startMinute, 0, 0);
        
        scheduleEnd = new Date(searchDate);
        const [endHour, endMinute] = workingHours.morningEnd.split(':').map(Number);
        scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
      } else { // Afternoon
        scheduleStart = new Date(searchDate);
        const [startHour, startMinute] = workingHours.afternoonStart.split(':').map(Number);
        scheduleStart.setUTCHours(startHour - 7, startMinute, 0, 0);
        
        scheduleEnd = new Date(searchDate);
        const [endHour, endMinute] = workingHours.afternoonEnd.split(':').map(Number);
        scheduleEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
      }
      
      // ⭐ Query đã filter status='Available' rồi, nên schedules ở đây đều còn hiệu lực
      
      const slots = ScheduleHelper.generateTimeSlots({
        scheduleStart,
        scheduleEnd,
        serviceDuration: finalServiceDuration,
        breakAfterMinutes
      });

      // Lọc bỏ các slots đã được book (bởi bất kỳ ai) - KHÔNG cộng break time
      const bookedSlots = bookedSlotsByDoctor[doctorId] || [];
      let availableSlots = slots.filter(slot => {
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);
        
        // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã book
        // Kiểm tra xem slot có bị trung với booked slot nào không
        return !bookedSlots.some(booked => {
          // Conflict nếu: slotStart < booked.end && slotEnd > booked.start
          return (slotStart < booked.end && slotEnd > booked.start);
        });
      });

      // ⭐ Exclude slots mà user hiện tại đã đặt với bác sĩ này
      if (patientUserId && patientBookedSlots.length > 0) {
        console.log(`\n🔴 [Doctor ${doctor.fullName}] EXCLUDING USER BOOKED SLOTS (appointmentFor=${appointmentFor}, only this doctor):`);
        console.log(`   - patientUserId: ${patientUserId}`);
        console.log(`   - patientBookedSlots count: ${patientBookedSlots.length}`);
        patientBookedSlots.forEach((booked, idx) => {
          console.log(`   - Booked slot ${idx}: ${booked.start.toISOString()} - ${booked.end.toISOString()}`);
        });
        
        console.log(`   - availableSlots BEFORE exclude: ${availableSlots.length}`);
        availableSlots.forEach((slot, idx) => {
          console.log(`     [${idx}] ${slot.startTime} - ${slot.endTime}`);
        });
        
        const slotsBeforeFilter = availableSlots.length;
        availableSlots = availableSlots.filter(slot => {
          const slotStart = new Date(slot.startTime);
          const slotEnd = new Date(slot.endTime);
          
          // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã book
          // Kiểm tra xem slot có trùng với slots user đã đặt không
          const isBooked = patientBookedSlots.some(booked => {
            return (slotStart < booked.end && slotEnd > booked.start);
          });
          
          if (isBooked) {
            console.log(`     ❌ EXCLUDED: ${slot.startTime} - ${slot.endTime} (conflicts with user booked slot)`);
          }
          
          return !isBooked;
        });
        
        console.log(`   - availableSlots AFTER exclude: ${availableSlots.length} (removed ${slotsBeforeFilter - availableSlots.length})`);
      } else if (patientUserId && patientBookedSlots.length === 0) {
        console.log(`\n✅ [Doctor ${doctor.fullName}] NO USER BOOKED SLOTS TO EXCLUDE (user has no appointments with this doctor)`);
      } else if (!patientUserId) {
        console.log(`\n🟢 [Doctor ${doctor.fullName}] NOT EXCLUDING USER SLOTS (no patientUserId)`);
      }
      
      // ⭐ Exclude slots của customer (nếu đặt cho người khác và customer đã có appointment)
      // để tránh conflict double booking cho cùng 1 người
      if (customerBookedSlots.length > 0) {
        console.log(`\n🔴 [Doctor ${doctor.fullName}] EXCLUDING CUSTOMER BOOKED SLOTS:`);
        console.log(`   - customerBookedSlots count: ${customerBookedSlots.length}`);
        customerBookedSlots.forEach((booked, idx) => {
          console.log(`   - Booked slot ${idx}: ${booked.start.toISOString()} - ${booked.end.toISOString()}`);
        });
        
        console.log(`   - availableSlots BEFORE exclude: ${availableSlots.length}`);
        availableSlots.forEach((slot, idx) => {
          console.log(`     [${idx}] ${slot.startTime} - ${slot.endTime}`);
        });
        
        const slotsBeforeFilter = availableSlots.length;
        availableSlots = availableSlots.filter(slot => {
          const slotStart = new Date(slot.startTime);
          const slotEnd = new Date(slot.endTime);
          
          // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã book
          const isBooked = customerBookedSlots.some(booked => {
            return (slotStart < booked.end && slotEnd > booked.start);
          });
          
          if (isBooked) {
            console.log(`❌ EXCLUDED: ${slot.startTime} - ${slot.endTime} (conflicts with customer booked slot)`);
          }
          
          return !isBooked;
        });
        
        console.log(`   - availableSlots AFTER exclude: ${availableSlots.length} (removed ${slotsBeforeFilter - availableSlots.length})`);
      } else {
        console.log(`\n🟢 [Doctor ${doctor.fullName}] NO CUSTOMER BOOKED SLOTS (no customer info or customer not found)`);
      }

      // ⭐ THÊM: Filter slots đã hết (endTime <= now)
      // Giữ lại các slots đang diễn ra hoặc chưa bắt đầu (endTime > now)
      const slotsBeforeFilter = availableSlots.length;
      availableSlots = availableSlots.filter(slot => {
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);
        // Chỉ giữ các slot có endTime > hiện tại (slot đang diễn ra hoặc chưa bắt đầu)
        const isValid = slotEnd > now;
        if (!isValid) {
          console.log(`   ❌ Filter out: ${slotStart.toISOString()} - ${slotEnd.toISOString()} (already ended)`);
        }
        return isValid;
      });
      
      const removedCount = slotsBeforeFilter - availableSlots.length;
      if (removedCount > 0) {
        console.log(`\n⏰ [Doctor ${doctor.fullName}] FILTERED PAST SLOTS:`);
        console.log(`   - Removed ${removedCount} slots that already ended`);
        console.log(`   - Remaining: ${availableSlots.length} slots`);
      }

      // Thêm thông tin doctor và format displayTime theo giờ Việt Nam
      availableSlots.forEach(slot => {
        // Format thời gian hiển thị theo timezone Việt Nam
        const start = new Date(slot.startTime);
        const end = new Date(slot.endTime);
        
        const formatVNTime = (date) => {
          return date.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh'
          });
        };
        
        const displayTime = `${formatVNTime(start)} - ${formatVNTime(end)}`;
        
        allSlots.push({
          startTime: slot.startTime,
          endTime: slot.endTime,
          displayTime: displayTime, // Format sẵn theo giờ VN
          doctor: {
            doctorUserId: doctor._id,
            fullName: doctor.fullName,
            specialization: doctor.specialization
          },
          doctorScheduleId: schedule._id
        });
      });
      
      console.log(`\n✅ [Doctor ${doctor.fullName}] Final available slots: ${availableSlots.length}`);
    }

    // 9. Sort theo thời gian
    allSlots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    console.log(`✅ Tổng cộng ${allSlots.length} slots khả dụng`);

    return {
      date: searchDate,
      slots: allSlots,
      totalSlots: allSlots.length
    };
  }

  /**
   * ⭐ NEW: Lấy khoảng thời gian khả dụng của một bác sĩ cụ thể vào 1 ngày
   */
  async getDoctorScheduleRange({ doctorUserId, serviceId, date, patientUserId = null, appointmentFor = 'self' }) {
    // 1. Validate doctor
    const doctor = await User.findById(doctorUserId);
    if (!doctor) {
      throw new Error('Bác sĩ bạn chọn không tồn tại. Vui lòng chọn bác sĩ khác.');
    }
    if (doctor.role !== 'Doctor') {
      throw new Error('Bác sĩ bạn chọn không hợp lệ. Vui lòng chọn bác sĩ khác.');
    }
    if (doctor.status !== 'Active') {
      throw new Error('Bác sĩ bạn chọn hiện không khả dụng. Vui lòng chọn bác sĩ khác.');
    }

    // 2. Validate service
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }
    if (service.status !== 'Active') {
      throw new Error('Dịch vụ bạn chọn hiện không khả dụng. Vui lòng chọn dịch vụ khác.');
    }

    // 3. Lấy doctor schedule (DoctorSchedule) của ngày đó
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    const schedules = await DoctorSchedule.find({
      doctorUserId,
      date: searchDate,
      status: 'Available'
    }).sort({ shift: 1 });

    if (schedules.length === 0) {
      return {
        doctorId: doctorUserId,
        doctorName: doctor.fullName,
        date: searchDate,
        scheduleRange: null,
        message: 'Bác sĩ bạn chọn không có lịch làm việc vào ngày này. Vui lòng chọn bác sĩ khác hoặc ngày khác.'
      };
    }

    // 4. Lấy danh sách appointments đã book của doctor vào ngày này
    const bookedAppointments = await Appointment.find({
      doctorUserId,
      status: { $in: ['Pending', 'Approved', 'CheckedIn', 'PendingPayment'] },
      timeslotId: { $exists: true }
    }).populate({
      path: 'timeslotId',
      select: 'startTime endTime breakAfterMinutes'
    });

    // ⭐ THÊM: Lấy tất cả timeslots đã reserved hoặc booked (không chỉ từ appointments)
    const Timeslot = require('../models/timeslot.model');
    const allTimeslots = await Timeslot.find({
      doctorUserId,
      startTime: { 
        $gte: new Date(searchDate.getTime()),
        $lt: new Date(searchDate.getTime() + 24 * 60 * 60 * 1000)
      },
      status: { $in: ['Reserved', 'Booked'] }
    });

    console.log(`🔍 [getDoctorScheduleRange] Found ${allTimeslots.length} timeslots (Reserved/Booked) for doctor ${doctorUserId} on ${searchDate.toISOString().split('T')[0]}`);

    // Filter appointments vào ngày đang xét
    const bookedSlotsFromAppointments = bookedAppointments
      .filter(apt => {
        if (!apt.timeslotId) return false;
        const slotDate = new Date(apt.timeslotId.startTime);
        return slotDate.toISOString().split('T')[0] === searchDate.toISOString().split('T')[0];
      })
      .map(apt => ({
        start: new Date(apt.timeslotId.startTime),
        end: new Date(apt.timeslotId.endTime),
        breakAfter: apt.timeslotId.breakAfterMinutes || 10
      }));

    // Thêm timeslots từ bảng Timeslot
    const bookedSlotsFromTimeslots = allTimeslots.map(timeslot => ({
      start: new Date(timeslot.startTime),
      end: new Date(timeslot.endTime),
      breakAfter: 10 // Default buffer time
    }));

    // Gộp tất cả booked slots và loại bỏ trùng lặp
    const allBookedSlots = [...bookedSlotsFromAppointments, ...bookedSlotsFromTimeslots];
    const uniqueBookedSlots = [];
    
    for (const slot of allBookedSlots) {
      const isDuplicate = uniqueBookedSlots.some(existing => 
        existing.start.getTime() === slot.start.getTime() && 
        existing.end.getTime() === slot.end.getTime()
      );
      if (!isDuplicate) {
        uniqueBookedSlots.push(slot);
      }
    }

    // ⭐ THÊM: Lấy appointments của user trong cùng ngày
    let userBookedSlots = [];
    if (patientUserId) {
      const userAppointments = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId'
      });

      // Filter appointments vào ngày đang xét
      const userAppointmentsOnDate = userAppointments.filter(apt => {
        if (!apt.timeslotId) return false;
        const slotDate = new Date(apt.timeslotId.startTime);
        return slotDate.toISOString().split('T')[0] === searchDate.toISOString().split('T')[0];
      });

      // Cả 'self' và 'other' đều chỉ exclude slots của bác sĩ hiện tại
      // Cho phép đặt trùng giờ cùng ngày với bác sĩ khác
      userBookedSlots = userAppointmentsOnDate
        .filter(apt => apt.timeslotId.doctorUserId && apt.timeslotId.doctorUserId.toString() === doctorUserId)
        .map(apt => ({
          start: new Date(apt.timeslotId.startTime),
          end: new Date(apt.timeslotId.endTime),
          breakAfter: 10 // Default buffer time
        }));
      
      if (appointmentFor === 'self') {
        console.log(`🔍 [getDoctorScheduleRange] User ${patientUserId} has ${userBookedSlots.length} appointments with doctor ${doctorUserId} on this date (appointmentFor=self) - EXCLUDING ONLY THIS DOCTOR`);
      } else if (appointmentFor === 'other') {
        console.log(`🔍 [getDoctorScheduleRange] User ${patientUserId} has ${userBookedSlots.length} appointments with doctor ${doctorUserId} on this date (appointmentFor=other) - EXCLUDING ONLY THIS DOCTOR`);
      }
    }

    // Gộp tất cả booked slots (doctor + user)
    const allBookedSlotsFinal = [...uniqueBookedSlots, ...userBookedSlots];
    const finalUniqueBookedSlots = [];
    
    for (const slot of allBookedSlotsFinal) {
      const isDuplicate = finalUniqueBookedSlots.some(existing => 
        existing.start.getTime() === slot.start.getTime() && 
        existing.end.getTime() === slot.end.getTime()
      );
      if (!isDuplicate) {
        finalUniqueBookedSlots.push(slot);
      }
    }

    const bookedSlots = finalUniqueBookedSlots.sort((a, b) => a.start - b.start);

    console.log(`🔍 [getDoctorScheduleRange] Total unique booked slots (doctor + user): ${bookedSlots.length}`);
    bookedSlots.forEach((slot, idx) => {
      const vnStart = new Date(slot.start.getTime() + 7 * 60 * 60 * 1000);
      const vnEnd = new Date(slot.end.getTime() + 7 * 60 * 60 * 1000);
      console.log(`   - Slot ${idx + 1}: ${vnStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${vnEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
    });

    // Helper function - Convert UTC sang giờ VN (UTC+7)
    const formatTime = (date) => {
      const d = new Date(date);
      // Lấy UTC hours và convert sang VN (+7)
      const vnHours = (d.getUTCHours() + 7) % 24;
      const hours = String(vnHours).padStart(2, '0');
      const minutes = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // Function tính available gaps cho một shift (KHÔNG cộng buffer time - slot tiếp theo có thể bắt đầu ngay sau)
    const calculateAvailableGaps = (shiftStart, shiftEnd, bookedSlots) => {
      const gaps = [];
      let currentStart = new Date(shiftStart);

      for (const slot of bookedSlots) {
        // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã booked
        const slotEnd = new Date(slot.end);

        // Nếu slot nằm ngoài shift này, skip
        if (slotEnd <= shiftStart || slot.start >= shiftEnd) continue;

        // Nếu có khoảng trống trước slot này
        if (currentStart < slot.start) {
          gaps.push({
            start: currentStart,
            end: slot.start
          });
        }

        // Di chuyển currentStart đến sau slot này (không cộng buffer time)
        currentStart = slotEnd > currentStart ? slotEnd : new Date(slotEnd);
      }

      // Nếu còn khoảng trống sau slot cuối cùng
      if (currentStart < shiftEnd) {
        gaps.push({
          start: currentStart,
          end: shiftEnd
        });
      }

      return gaps;
    };

    // ⭐ Lấy thời gian hiện tại và service duration để filter gaps real-time
    const now = new Date();
    const serviceDurationMs = service.durationMinutes * 60 * 1000; // Convert phút sang milliseconds
    
    // ⭐ Kiểm tra ngày đang xét có phải là TODAY không (so sánh theo date string)
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0]; // yyyy-mm-dd
    const searchDateStr = searchDate.toISOString().split('T')[0]; // yyyy-mm-dd
    const isToday = todayDateStr === searchDateStr;
    
    // Helper function: Filter và adjust gaps theo thời gian thực + service duration (KHÔNG cộng buffer time)
    const filterRealTimeGaps = (gaps) => {
      // Không cộng buffer time nữa - chỉ cần thời gian cho service
      const totalTimeNeeded = serviceDurationMs; // Chỉ service duration, không cộng buffer
      
      return gaps
        .map(gap => {
          const gapStart = new Date(gap.start);
          const gapEnd = new Date(gap.end);
          
          // ⭐ CHỈ filter real-time nếu là TODAY
          if (isToday) {
            // Nếu gap đã hết hoàn toàn
            if (gapEnd <= now) {
              return null;
            }
            
            // Nếu gap đang diễn ra (bắt đầu trước now, kết thúc sau now)
            if (gapStart < now && gapEnd > now) {
              gap = {
                start: now, // Bắt đầu từ thời điểm hiện tại
                end: gapEnd
              };
            }
          }
          
          // ⭐ Kiểm tra gap có đủ thời gian cho service không (áp dụng cho mọi ngày, KHÔNG cộng buffer)
          const gapDuration = new Date(gap.end).getTime() - new Date(gap.start).getTime();
          if (gapDuration < totalTimeNeeded) {
            return null; // Gap không đủ thời gian cho service
          }
          
          return gap;
        })
        .filter(gap => gap !== null);
    };
    
    // Group theo shift và tính available gaps
    const morningSchedules = schedules.filter(s => s.shift === 'Morning');
    const afternoonSchedules = schedules.filter(s => s.shift === 'Afternoon');

    const scheduleRanges = [];
    
    if (morningSchedules.length > 0) {
      // Sử dụng workingHours từ DoctorSchedule thay vì startTime/endTime
      const workingHours = morningSchedules[0].workingHours || {
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00'
      };

      const morningStart = new Date(searchDate);
      const [startHour, startMinute] = workingHours.morningStart.split(':').map(Number);
      morningStart.setUTCHours(startHour - 7, startMinute, 0, 0);
      
      const morningEnd = new Date(searchDate);
      const [endHour, endMinute] = workingHours.morningEnd.split(':').map(Number);
      morningEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
      
      const rawGaps = calculateAvailableGaps(morningStart, morningEnd, bookedSlots);
      const availableGaps = filterRealTimeGaps(rawGaps); // ⭐ Filter theo thời gian thực
      
      scheduleRanges.push({
        shift: 'Morning',
        shiftDisplay: 'Buổi sáng',
        startTime: morningStart.toISOString(),
        endTime: morningEnd.toISOString(),
        availableGaps: availableGaps.map(gap => ({
          start: gap.start.toISOString(),
          end: gap.end.toISOString(),
          display: `${formatTime(gap.start)}-${formatTime(gap.end)}`
        })),
        displayRange: availableGaps.map(gap => `${formatTime(gap.start)}-${formatTime(gap.end)}`).join(', ') || 'Đã hết chỗ'
      });
    }
    
    if (afternoonSchedules.length > 0) {
      // Sử dụng workingHours từ DoctorSchedule thay vì startTime/endTime
      const workingHours = afternoonSchedules[0].workingHours || {
        morningStart: '08:00',
        morningEnd: '12:00',
        afternoonStart: '14:00',
        afternoonEnd: '18:00'
      };

      const afternoonStart = new Date(searchDate);
      const [startHour, startMinute] = workingHours.afternoonStart.split(':').map(Number);
      afternoonStart.setUTCHours(startHour - 7, startMinute, 0, 0);
      
      const afternoonEnd = new Date(searchDate);
      const [endHour, endMinute] = workingHours.afternoonEnd.split(':').map(Number);
      afternoonEnd.setUTCHours(endHour - 7, endMinute, 0, 0);
      
      const rawGaps = calculateAvailableGaps(afternoonStart, afternoonEnd, bookedSlots);
      const availableGaps = filterRealTimeGaps(rawGaps); // ⭐ Filter theo thời gian thực
      
      scheduleRanges.push({
        shift: 'Afternoon',
        shiftDisplay: 'Buổi chiều',
        startTime: afternoonStart.toISOString(),
        endTime: afternoonEnd.toISOString(),
        availableGaps: availableGaps.map(gap => ({
          start: gap.start.toISOString(),
          end: gap.end.toISOString(),
          display: `${formatTime(gap.start)}-${formatTime(gap.end)}`
        })),
        displayRange: availableGaps.map(gap => `${formatTime(gap.start)}-${formatTime(gap.end)}`).join(', ') || 'Đã hết chỗ'
      });
    }

    console.log('📊 [getDoctorScheduleRange]');
    console.log('   - Doctor:', doctor.fullName);
    console.log('   - Date:', searchDate.toISOString().split('T')[0]);
    console.log('   - Is Today:', isToday); // ⭐ Debug
    console.log('   - Service duration:', service.durationMinutes, 'phút');
    console.log('   - Schedule ranges:', scheduleRanges);

    // ⭐ Kiểm tra xem có gap nào khả dụng không
    const hasAvailableGaps = scheduleRanges.some(range => 
      range.availableGaps && range.availableGaps.length > 0
    );

    let message = null;
    if (!hasAvailableGaps) {
      message = `Thời gian còn lại của phòng khám không đáp ứng đủ thời gian cho dịch vụ "${service.serviceName}" (${service.durationMinutes} phút). Vui lòng chọn ngày khác hoặc dịch vụ khác.`;
    }

    return {
      doctorId: doctorUserId,
      doctorName: doctor.fullName,
      date: searchDate,
      serviceName: service.serviceName,
      serviceDuration: service.durationMinutes,
      doctorScheduleId: schedules.length > 0 ? schedules[0]._id : null,
      scheduleRanges: scheduleRanges,
      totalSchedules: schedules.length,
      message: message // ⭐ Trả về message nếu không có gaps khả dụng
    };
  }

  /**
   * ⭐ NEW: Validate appointment time
   * Check: thời gian nhập có nằm trong doctor schedule không và có doctor khả dụng không
   */
  async validateAppointmentTime({ doctorUserId, serviceId, date, startTime, patientUserId = null }) {
    // 1. Lấy schedule ranges
    const scheduleRangeResult = await this.getDoctorScheduleRange({
      doctorUserId,
      serviceId,
      date
    });

    if (!scheduleRangeResult.scheduleRanges || scheduleRangeResult.scheduleRanges.length === 0) {
      throw new Error(scheduleRangeResult.message || 'Bác sĩ bạn chọn không có lịch làm việc vào ngày này. Vui lòng chọn bác sĩ khác hoặc ngày khác.');
    }

    // 2. Validate service để lấy duration
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }

    const serviceDuration = service.durationMinutes;

    // 3. Calculate end time
    const startTimeObj = new Date(startTime);
    const endTimeObj = new Date(startTimeObj.getTime() + serviceDuration * 60000);

    // 3.1. Không cho đặt thời gian ở quá khứ
    const nowUtc = new Date();
    if (startTimeObj.getTime() < nowUtc.getTime()) {
      throw new Error('Không thể đặt thời gian ở quá khứ');
    }

    // ⭐ 3.5. Check conflict cho bệnh nhân
    // Logic phụ thuộc vào appointmentFor và thông tin customer
    if (patientUserId) {
      // Lấy tất cả appointments của user trong khoảng thời gian này
      const existingAppointments = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId'
      })
      .populate({
        path: 'customerId',
        select: 'fullName email'
      });

      // Filter appointments có overlap với thời gian đang đặt
      const overlappingAppointments = existingAppointments.filter(apt => {
        if (!apt.timeslotId) return false;
        
        const aptStart = new Date(apt.timeslotId.startTime);
        const aptEnd = new Date(apt.timeslotId.endTime);
        
        // Check overlap: (start1 < end2) AND (end1 > start2)
        return (startTimeObj < aptEnd && endTimeObj > aptStart);
      });

      if (overlappingAppointments.length > 0) {
        // Có appointment trùng giờ → cần validate theo logic
        for (const apt of overlappingAppointments) {
          const aptStart = new Date(apt.timeslotId.startTime);
          const aptEnd = new Date(apt.timeslotId.endTime);
          const aptStartDisplay = `${String(aptStart.getUTCHours()).padStart(2, '0')}:${String(aptStart.getUTCMinutes()).padStart(2, '0')}`;
          const aptEndDisplay = `${String(aptEnd.getUTCHours()).padStart(2, '0')}:${String(aptEnd.getUTCMinutes()).padStart(2, '0')}`;

          // Case 1: User đã có appointment cho BẢN THÂN vào giờ này
          if (apt.appointmentFor === 'self') {
            throw new Error(
              `Bạn đã có lịch khám cho bản thân vào ${aptStartDisplay} - ${aptEndDisplay}. ` +
              `Vui lòng chọn thời gian khác.`
            );
          }

          // Case 2: User đã đặt cho NGƯỜI THÂN vào giờ này
          // → Chỉ cho phép nếu đặt cho người thân KHÁC và bác sĩ KHÁC
          if (apt.appointmentFor === 'other' && apt.customerId) {
            // Check nếu đặt cùng bác sĩ → không được
            if (apt.timeslotId.doctorUserId && apt.timeslotId.doctorUserId.toString() === doctorUserId) {
              throw new Error(
                `Bạn đã đặt lịch với bác sĩ này vào ${aptStartDisplay} - ${aptEndDisplay} cho người thân. ` +
                `Vui lòng chọn bác sĩ khác hoặc thời gian khác.`
              );
            }

            // Note: Validate customer duplicate sẽ được làm ở createAppointment
            // vì ở đây chưa có thông tin fullName/email của customer mới
          }
        }
      }
    }

    // 4. Validate: startTime và endTime phải nằm trong một trong các schedule ranges
    const scheduleRanges = scheduleRangeResult.scheduleRanges;
    
    // Kiểm tra xem thời gian có nằm trong bất kỳ range nào không
    const isInValidRange = scheduleRanges.some(range => {
      const rangeStart = new Date(range.startTime);
      const rangeEnd = new Date(range.endTime);
      return startTimeObj >= rangeStart && endTimeObj <= rangeEnd;
    });

    console.log('🔍 [validateAppointmentTime]');
    console.log('   - startTime:', startTimeObj.toISOString());
    console.log('   - endTime:', endTimeObj.toISOString());
    console.log('   - scheduleRanges:', scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`));
    console.log('   - isInValidRange:', isInValidRange);

    if (!isInValidRange) {
      const rangesText = scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`).join(', ');
      throw new Error(
        `Thời gian bạn chọn không nằm trong lịch làm việc của bác sĩ. Bác sĩ rảnh: ${rangesText}. Vui lòng chọn thời gian khác.`
      );
    }

    // 5. Check xem doctor có bị booked trong khoảng thời gian này không
    const searchDate = new Date(date);
    searchDate.setHours(0, 0, 0, 0);

    const bookedAppointments = await Appointment.find({
      doctorUserId,
      status: { $in: ['Pending', 'Approved', 'CheckedIn'] },
      timeslotId: { $exists: true }
    }).populate({
      path: 'timeslotId',
      select: 'startTime endTime',
      match: {
        startTime: { $gte: searchDate.toISOString() }
      }
    });

    const validAppointments = bookedAppointments.filter(apt => apt.timeslotId !== null);

    // Check conflict
    const hasConflict = validAppointments.some(apt => {
      const aptStart = new Date(apt.timeslotId.startTime);
      const aptEnd = new Date(apt.timeslotId.endTime);
      
      return (startTimeObj < aptEnd && endTimeObj > aptStart);
    });

    if (hasConflict) {
      throw new Error('Bác sĩ đã có lịch khám vào thời gian này. Vui lòng chọn bác sĩ khác hoặc thời gian khác.');
    }

    // ⭐ 6. Check conflict với timeslots đã Reserved/Booked (đang chờ thanh toán hoặc đã đặt)
    // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã booked
    const Timeslot = require('../models/timeslot.model');
    
    const conflictingTimeslots = await Timeslot.find({
      doctorUserId: doctorUserId,
      startTime: { $lt: endTimeObj },
      endTime: { $gt: startTimeObj },
      status: { $in: ['Reserved', 'Booked'] }
    });

    if (conflictingTimeslots.length > 0) {
      throw new Error('Khung giờ này đã có người đặt hoặc đang chờ thanh toán. Vui lòng chọn thời gian khác.');
    }

    return {
      doctorId: doctorUserId,
      doctorName: scheduleRangeResult.doctorName,
      date,
      startTime: startTimeObj.toISOString(),
      endTime: endTimeObj.toISOString(),
      serviceName: service.serviceName,
      serviceDuration,
      scheduleRanges: scheduleRangeResult.scheduleRanges,
      isAvailable: true,
      message: 'Thời gian hợp lệ, bác sĩ khả dụng'
    };
  }
}

module.exports = new AvailableSlotService();