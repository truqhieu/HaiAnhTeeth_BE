
const DoctorSchedule = require('../models/doctorSchedule.model');
const Appointment = require('../models/appointment.model');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');
const ScheduleHelper = require('../utils/scheduleHelper');
const leaveRequestService = require('./leaveRequest.service');
const LeaveRequest = require('../models/leaveRequest.model');

const PAST_TIME_ALLOWANCE_MS = 60 * 1000; // Allow 1-minute drift between UI display and actual time

const WORKING_HOUR_FIELDS = [
  'morningStart',
  'morningEnd',
  'afternoonStart',
  'afternoonEnd'
];

const hasCompleteWorkingHours = (workingHours) => {
  if (!workingHours) return false;
  return WORKING_HOUR_FIELDS.every(field => {
    const value = workingHours[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
};

class AvailableSlotService {

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

    // ⭐ THÊM: Kiểm tra Doctor status (On Leave/Inactive)
    const doctorStatus = await Doctor.findOne({ doctorUserId: doctorUserId }).select('status');
    if (doctorStatus && (doctorStatus.status === 'On Leave' || doctorStatus.status === 'Inactive')) {
      throw new Error('Bác sĩ bạn chọn hiện đang nghỉ phép hoặc không khả dụng. Vui lòng chọn bác sĩ khác.');
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
    searchDate.setUTCHours(0, 0, 0, 0);

    let schedules = await DoctorSchedule.find({
      doctorUserId,
      date: searchDate,
      status: 'Available'
    }).sort({ shift: 1 });

    // ⭐ THÊM: Nếu chưa có schedule cho ngày này → Tự động tạo bằng helper
    if (schedules.length === 0) {
      console.log(`⚠️  Không tìm thấy DoctorSchedule cho ngày ${searchDate.toISOString().split('T')[0]}, tự động tạo...`);
      
      try {
        // Sử dụng helper để tạo schedule
        await ScheduleHelper.ensureScheduleForDoctor(doctorUserId, searchDate);
        
        // Tìm lại schedules sau khi tạo
        schedules = await DoctorSchedule.find({
          doctorUserId: doctorUserId,
          date: searchDate,
          status: 'Available'
        });
        
        if (schedules.length === 0) {
          throw new Error('Không thể tạo schedule mặc định');
        }
        
        console.log(`✅ Đã tạo schedule cho bác sĩ ${doctorUserId} vào ngày ${searchDate.toISOString().split('T')[0]}`);
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
    startOfDay.setUTCHours(0, 0, 0, 0);
    
    const endOfDay = new Date(searchDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    // ⭐ FIXED: Query appointments có timeslot rảnh trong ngày (không dùng createdAt)
    // ⭐ Loại trừ appointments của chính bệnh nhân này - cho phép họ đặt nhiều slots liên tiếp
    const bookedAppointments = await Appointment.find({
      doctorUserId,
      status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
      timeslotId: { $exists: true },
      // ⭐ THÊM: Loại trừ appointments của chính bệnh nhân này
      ...(patientUserId ? { patientUserId: { $ne: patientUserId } } : {})
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
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
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
    const allReservedTimeslots = await Timeslot.find({
      doctorUserId,
      status: { $in: ['Reserved', 'Booked'] },
      startTime: { $gte: startOfDay, $lte: endOfDay }
    }).populate('appointmentId', 'timeslotId').sort({ startTime: 1 });

    // ⭐ FIX: Chỉ lấy timeslots có appointmentId VÀ appointment đó vẫn còn reference đến timeslot này
    // (Tránh lấy timeslot cũ sau khi reschedule)
    const reservedTimeslots = allReservedTimeslots.filter(timeslot => {
      // Nếu timeslot không có appointmentId, vẫn tính (có thể là Reserved chưa có appointment)
      if (!timeslot.appointmentId) {
        return true;
      }
      
      // Nếu timeslot có appointmentId, kiểm tra appointment có còn reference đến timeslot này không
      const appointment = timeslot.appointmentId;
      if (!appointment || !appointment.timeslotId) {
        // Appointment không còn reference đến timeslot này → timeslot đã được giải phóng
        return false;
      }
      
      // Kiểm tra appointment.timeslotId có matching với timeslot._id không
      const appointmentTimeslotId = appointment.timeslotId.toString();
      const timeslotId = timeslot._id.toString();
      
      return appointmentTimeslotId === timeslotId;
    });

    console.log(`🔍 [getAvailableSlots] Filtered to ${reservedTimeslots.length} valid timeslots (after excluding orphaned slots from ${allReservedTimeslots.length} total)`);

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

    // 6. Tạo danh sách khoảng thời gian đã bận (giống getDoctorScheduleRange)
    // ⭐ FIX: Sử dụng logic giống getDoctorScheduleRange để đảm bảo consistency
    
    // Lấy booked slots từ appointments
    const bookedSlotsFromAppointments = validAppointments
      .filter(apt => apt.timeslotId !== null)
      .map(apt => ({
        start: new Date(apt.timeslotId.startTime),
        end: new Date(apt.timeslotId.endTime)
      }));

    // Lấy booked slots từ timeslots (Reserved/Booked)
    const bookedSlotsFromTimeslots = reservedTimeslots.map(timeslot => ({
      start: new Date(timeslot.startTime),
      end: new Date(timeslot.endTime)
    }));

    // Gộp tất cả booked slots và merge các slots có overlap (giống getDoctorScheduleRange)
    const allBookedSlots = [...bookedSlotsFromAppointments, ...bookedSlotsFromTimeslots];
    
    // ⭐ FIX: Merge các slots có overlap thay vì chỉ push vào array
    allBookedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    const mergedBookedSlots = [];
    for (const slot of allBookedSlots) {
      if (mergedBookedSlots.length === 0) {
        mergedBookedSlots.push({ ...slot });
        continue;
      }
      
      const lastSlot = mergedBookedSlots[mergedBookedSlots.length - 1];
      
      // ⭐ Check overlap: slot.start < lastSlot.end && slot.end > lastSlot.start
      if (slot.start.getTime() < lastSlot.end.getTime() && slot.end.getTime() > lastSlot.start.getTime()) {
        // Có overlap → merge: mở rộng lastSlot để bao phủ cả slot mới
        lastSlot.end = new Date(Math.max(lastSlot.end.getTime(), slot.end.getTime()));
        lastSlot.start = new Date(Math.min(lastSlot.start.getTime(), slot.start.getTime()));
      } else {
        // Không overlap → thêm slot mới
        mergedBookedSlots.push({ ...slot });
      }
    }
    
    const busySlots = mergedBookedSlots;

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
      start: b.start.toISOString(),
      end: b.end.toISOString()
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

      // Kiểm tra slot có trùng với busy slots không (giống getDoctorScheduleRange)
      const isConflict = busySlots.some(busy => {
        // Conflict nếu: slotStart < busy.end && slotEnd > busy.start
        return currentStart.getTime() < busy.end.getTime() && currentEnd.getTime() > busy.start.getTime();
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

    // 3. Chuẩn bị ngày tìm kiếm
    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);

    // 4. Lấy tất cả bác sĩ ACTIVE
    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active'
    }).select('_id fullName email phoneNumber');

    // ⭐ THÊM: Lấy danh sách Doctor model để filter bỏ bác sĩ "Inactive" và chưa có workingHours
    const doctorStatuses = await Doctor.find({
      doctorUserId: { $in: doctors.map(d => d._id) }
    }).select('doctorUserId status workingHours workingHoursEffectiveDate');

    // Tạo Map để lookup nhanh
    const doctorStatusMap = new Map();
    const doctorWorkingHoursMap = new Map();
    const doctorWorkingHoursEffectiveMap = new Map();
    doctorStatuses.forEach(doc => {
      doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
      doctorWorkingHoursMap.set(doc.doctorUserId.toString(), doc.workingHours);
      doctorWorkingHoursEffectiveMap.set(doc.doctorUserId.toString(), doc.workingHoursEffectiveDate);
    });

    // Filter bỏ các bác sĩ:
    // 1. Có status "Inactive"
    // 2. Chưa có workingHours (chưa được manager tạo lịch làm việc)
    const availableDoctorsUser = doctors.filter(doctor => {
      const doctorStatus = doctorStatusMap.get(doctor._id.toString());
      const workingHours = doctorWorkingHoursMap.get(doctor._id.toString());
      
      // ⭐ Kiểm tra xem bác sĩ đã có workingHours chưa
      const hasWorkingHours = workingHours && 
        workingHours.morningStart && 
        workingHours.morningEnd && 
        workingHours.afternoonStart && 
        workingHours.afternoonEnd;
      
      if (!hasWorkingHours) {
        console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa có workingHours, skip...`);
        return false; // Bỏ qua bác sĩ chưa có workingHours
      }

      const effectiveDateRaw = doctorWorkingHoursEffectiveMap.get(doctor._id.toString());
      if (effectiveDateRaw) {
        const effectiveDate = new Date(effectiveDateRaw);
        effectiveDate.setUTCHours(0, 0, 0, 0);
        if (searchDate < effectiveDate) {
          console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa bắt đầu làm việc cho đến ${effectiveDate.toISOString().split('T')[0]}, skip...`);
          return false;
        }
      }
      
      // Nếu không có trong Doctor model → coi như Available (cho backward compatibility)
      if (!doctorStatus) return true;
      // Chỉ lấy bác sĩ có status "Available", "Busy", hoặc "On Leave" (sẽ check leave theo ngày cụ thể)
      return doctorStatus === 'Available' || doctorStatus === 'Busy' || doctorStatus === 'On Leave';
    });

    console.log('🔍 Doctor Status Filter:');
    console.log(`   - Tổng bác sĩ ACTIVE: ${doctors.length}`);
    console.log(`   - Sau khi filter (loại bỏ Inactive và chưa có workingHours): ${availableDoctorsUser.length}`);

    console.log('🔍 Search date:', searchDate.toISOString());
    console.log('📅 Searching for doctors with schedule on:', searchDate.toISOString().split('T')[0]);

    // ⭐ Tự động tạo schedule nếu chưa có (dùng helper method chung)
    await ScheduleHelper.ensureSchedulesForDate(searchDate);

    // 5. Duyệt qua từng bác sĩ để lấy danh sách có schedule vào ngày đó
    const availableDoctors = [];

    for (const doctor of availableDoctorsUser) {
      try {
        console.log(`\n🔍 Checking doctor: ${doctor.fullName} (${doctor._id})`);
        
        // ⭐ THÊM: Kiểm tra xem bác sĩ có leave request approved trong ngày này không
        // Tạo một Date object với giờ 12:00 để kiểm tra nghỉ phép (isDoctorOnLeave cần startTime)
        const checkLeaveDate = new Date(searchDate);
        checkLeaveDate.setUTCHours(12, 0, 0, 0);
        const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, checkLeaveDate);
        
        console.log(`   - On leave: ${isOnLeave}`);
        
        if (isOnLeave) {
          console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) đang nghỉ phép vào ngày ${searchDate.toISOString().split('T')[0]}, skip...`);
          continue; // Bác sĩ đang nghỉ phép vào ngày này
        }

        // ⭐ THÊM: Đảm bảo bác sĩ này có schedule cho ngày này (tạo nếu chưa có)
        let schedules = await DoctorSchedule.find({
          doctorUserId: doctor._id,
          date: searchDate,
          status: 'Available'
        });
        
        console.log(`   - Available schedules found: ${schedules.length}`);

        // ⭐ Nếu không có schedule Available → kiểm tra xem có schedule nào không (có thể là Unavailable)
        if (!schedules || schedules.length === 0) {
          const anySchedule = await DoctorSchedule.findOne({
            doctorUserId: doctor._id,
            date: searchDate
          });
          
          console.log(`   - Any schedule found: ${anySchedule ? 'Yes (status: ' + anySchedule.status + ')' : 'No'}`);

          // Nếu hoàn toàn không có schedule → tạo schedule cho bác sĩ này
          if (!anySchedule) {
            console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) chưa có schedule, tự động tạo...`);
            const createdSchedule = await ScheduleHelper.ensureScheduleForDoctor(doctor._id, searchDate);
            console.log(`   - Schedule created: ${createdSchedule ? 'Yes' : 'No (failed)'}`);
            
            // Tìm lại schedule sau khi tạo
            schedules = await DoctorSchedule.find({
              doctorUserId: doctor._id,
              date: searchDate,
              status: 'Available'
            });
            console.log(`   - Available schedules after creation: ${schedules.length}`);
          } else if (anySchedule.status === 'Unavailable') {
            // ⭐ FIX: Có schedule Unavailable nhưng bác sĩ KHÔNG on leave
            // → Có thể là schedule cũ từ leave request đã hết hạn
            // → Update status thành Available
            console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) có schedule Unavailable nhưng không on leave, updating to Available...`);
            await DoctorSchedule.updateMany(
              {
                doctorUserId: doctor._id,
                date: searchDate,
                status: 'Unavailable'
              },
              {
                $set: { status: 'Available' }
              }
            );
            
            // Tìm lại schedule sau khi update
            schedules = await DoctorSchedule.find({
              doctorUserId: doctor._id,
              date: searchDate,
              status: 'Available'
            });
            console.log(`   - Available schedules after update: ${schedules.length}`);
          } else {
            // Có schedule với status khác (không phải Available hay Unavailable)
            console.log(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) có schedule với status: ${anySchedule.status}`);
          }
        }

        // ⭐ Nếu vẫn không có schedule Available → skip
        if (!schedules || schedules.length === 0) {
          console.warn(`⚠️  Bác sĩ ${doctor.fullName} (${doctor._id}) không có schedule Available cho ngày này, skip...`);
          continue;
        }

        // Bác sĩ này có schedule vào ngày đó → thêm vào danh sách
        // (FE sẽ chọn bác sĩ, sau đó lấy schedule range của bác sĩ đó)
        console.log(`✅ Adding doctor ${doctor.fullName} to available list`);
        availableDoctors.push({
          doctorId: doctor._id,
          doctorName: doctor.fullName,
          email: doctor.email,
          phoneNumber: doctor.phoneNumber,
          available: true,
          totalSchedules: schedules.length
        });

      } catch (error) {
        console.warn(`⚠️  Lỗi kiểm tra bác sĩ ${doctor.fullName} (${doctor._id}):`, error.message);
        console.error(error);
      }
    }

    console.log('✅ Tìm kiếm bác sĩ có khung giờ rảnh:');
    console.log(`   - Ngày: ${searchDate.toISOString().split('T')[0]}`);
    console.log(`   - Dịch vụ: ${service.serviceName}`);
    console.log(`   - Tổng bác sĩ ACTIVE: ${doctors.length}`);
    console.log(`   - Bác sĩ sau khi filter (loại bỏ On Leave/Inactive): ${availableDoctorsUser.length}`);
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
  async getAvailableDoctorsForTimeSlot({ serviceId, date, startTime, endTime, patientUserId, appointmentFor, customerFullName = null, customerEmail = null }) {
    // 0. Update expired schedules trước
    await ScheduleHelper.updateExpiredSchedules();

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

    let userAppointedDoctorIds = [];
    if (patientUserId) {
      console.log(`🔍 [${appointmentFor || 'self'}] Lấy danh sách bác sĩ mà user ${patientUserId} đã đặt vào khung giờ này`);
      const slotStartTime = new Date(startTime);
      const slotEndTime = new Date(endTime);

      const userAppointmentsInSlot = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId appointmentFor',
        match: {
          startTime: { $gte: slotStartTime, $lt: slotEndTime },
          endTime: { $gt: slotStartTime, $lte: slotEndTime }
        }
      });

      const validAppointments = userAppointmentsInSlot.filter(apt => apt.timeslotId);
      const hasSelfAppointment = validAppointments.some(apt => apt.appointmentFor === 'self');

      if (appointmentFor === 'self' && hasSelfAppointment) {
        console.log(`⚠️  Bệnh nhân ${patientUserId} đã có appointment cho bản thân vào khung giờ này`);
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

      userAppointedDoctorIds = validAppointments
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
    if (appointmentFor === 'other') {
      console.log('   - Booking for: other');
      console.log('   - customerFullName:', customerFullName || 'N/A');
      console.log('   - customerEmail:', customerEmail || 'N/A');
    }

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

    // ⭐ Khi đặt cho người thân cụ thể, kiểm tra xem người đó đã có lịch trùng giờ với bác sĩ bất kỳ chưa
    if (appointmentFor === 'other' && customerFullName && customerEmail) {
      const Customer = require('../models/customer.model');
      const customer = await Customer.findOne({
        fullName: new RegExp(`^${customerFullName}$`, 'i'),
        email: new RegExp(`^${customerEmail}$`, 'i')
      }).lean();

      if (!customer) {
        console.log(`⚠️  Không tìm thấy customer "${customerFullName}" <${customerEmail}> khi kiểm tra trùng giờ`);
      } else {
        const customerAppointments = await Appointment.find({
          customerId: customer._id,
          status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
          timeslotId: { $exists: true }
        }).populate({
          path: 'timeslotId',
          select: 'startTime endTime doctorUserId'
        });

        const overlappingAppointment = customerAppointments.find(apt => {
          if (!apt.timeslotId) return false;
          const aptStart = new Date(apt.timeslotId.startTime);
          const aptEnd = new Date(apt.timeslotId.endTime);
          return slotStartTime < aptEnd && slotEndTime > aptStart;
        });

        if (overlappingAppointment) {
          let conflictDoctorName = 'bác sĩ khác';
          if (overlappingAppointment.timeslotId?.doctorUserId) {
            const conflictDoctor = await User.findById(overlappingAppointment.timeslotId.doctorUserId)
              .select('fullName')
              .lean();
            if (conflictDoctor?.fullName) {
              conflictDoctorName = conflictDoctor.fullName;
            }
          }

          const formatVNTime = (dateObj) => {
            return new Date(dateObj).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: 'Asia/Ho_Chi_Minh'
            });
          };

          const conflictStartDisplay = formatVNTime(overlappingAppointment.timeslotId.startTime);
          const conflictEndDisplay = formatVNTime(overlappingAppointment.timeslotId.endTime);

          return {
            date: new Date(date),
            serviceId,
            serviceName: service.serviceName,
            requestedTime: {
              startTime: new Date(startTime),
              endTime: new Date(endTime),
              displayTime: `${formatVNTime(slotStartTime)} - ${formatVNTime(slotEndTime)}`
            },
            availableDoctors: [],
            totalDoctors: 0,
            message: `Người thân ${customerFullName} đã có lịch với ${conflictDoctorName} từ ${conflictStartDisplay} - ${conflictEndDisplay}. Vui lòng chọn khung giờ khác.`
          };
        }
      }
    }

    // 3. Lấy tất cả bác sĩ ACTIVE
    const doctors = await User.find({
      role: 'Doctor',
      status: 'Active'
    }).select('_id fullName email phoneNumber');

    // ⭐ THÊM: Lấy danh sách Doctor model để filter bỏ bác sĩ "Inactive"
    const doctorStatuses = await Doctor.find({
      doctorUserId: { $in: doctors.map(d => d._id) }
    }).select('doctorUserId status');

    // Tạo Map để lookup nhanh
    const doctorStatusMap = new Map();
    doctorStatuses.forEach(doc => {
      doctorStatusMap.set(doc.doctorUserId.toString(), doc.status);
    });

    // Filter bỏ các bác sĩ có status "Inactive" (KHÔNG filter "On Leave" ở đây, sẽ check theo ngày cụ thể)
    const availableDoctorsUser = doctors.filter(doctor => {
      const doctorStatus = doctorStatusMap.get(doctor._id.toString());
      // Nếu không có trong Doctor model → coi như Available (cho backward compatibility)
      if (!doctorStatus) return true;
      // Chỉ lấy bác sĩ có status "Available", "Busy", hoặc "On Leave" (sẽ check leave theo ngày cụ thể)
      return doctorStatus === 'Available' || doctorStatus === 'Busy' || doctorStatus === 'On Leave';
    });

    console.log('🔍 Doctor Status Filter (getAvailableDoctorsForTimeSlot):');
    console.log(`   - Tổng bác sĩ ACTIVE: ${doctors.length}`);
    console.log(`   - Sau khi filter (loại bỏ Inactive): ${availableDoctorsUser.length}`);

    if (availableDoctorsUser.length === 0) {
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
        message: 'Không có bác sĩ nào khả dụng'
      };
    }

    // 4. Chuẩn bị ngày tìm kiếm
    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);

    // ⭐ slotStartTime và slotEndTime đã được khai báo ở trên (dòng 375-376)
    // Không cần khai báo lại

    // 5. Duyệt qua từng bác sĩ để kiểm tra khung giờ này có rảnh không
    const availableDoctors = [];
    const Timeslot = require('../models/timeslot.model');

    for (const doctor of availableDoctorsUser) {
      try {
        // ⭐ THÊM: Kiểm tra xem bác sĩ có leave request approved trong ngày này không
        // Tạo một Date object với giờ 12:00 để kiểm tra nghỉ phép (isDoctorOnLeave cần startTime)
        const checkLeaveDate = new Date(searchDate);
        checkLeaveDate.setUTCHours(12, 0, 0, 0);
        const isOnLeave = await leaveRequestService.isDoctorOnLeave(doctor._id, checkLeaveDate);
        
        if (isOnLeave) {
          console.log(`\n👨‍⚕️ Checking doctor: ${doctor.fullName} (${doctor._id})`);
          console.log(`   ⚠️  SKIP: Bác sĩ đang nghỉ phép vào ngày ${searchDate.toISOString().split('T')[0]}`);
          continue; // Bác sĩ đang nghỉ phép vào ngày này
        }

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
        
        if (userAppointedDoctorIds.includes(doctor._id.toString())) {
          console.log(`   ⭐ EXCLUDE: User đã đặt với bác sĩ này vào khung giờ này (appointmentFor=${appointmentFor})`);
          continue;
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
    appointmentFor = 'self',
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
    searchDate.setUTCHours(0, 0, 0, 0);

    console.log('🔍 Search date:', searchDate.toISOString());
    console.log('📅 Searching for doctors with schedule on:', searchDate.toISOString().split('T')[0]);

    // ⭐ Update expired schedules trước
    await ScheduleHelper.updateExpiredSchedules();

    // ⭐ Tự động tạo schedule nếu chưa có (dùng helper method chung)
    await ScheduleHelper.ensureSchedulesForDate(searchDate);

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
    // ⭐ THÊM: Loại trừ cả appointments có status 'InProgress' (đang trong ca khám)
    const appointments = await Appointment.find({
      doctorUserId: { $in: doctors.map(d => d._id) },
      status: { $in: ['Pending', 'Approved', 'CheckedIn', 'InProgress'] }
    }).populate('timeslotId', 'startTime endTime doctorUserId');

    // 6.5. ⭐ Nếu có patientUserId, lấy appointments của user này để exclude
    // Chia thành appointments đặt cho self và cho người khác
    let userSelfBookedSlots = [];
    let userOtherBookedSlots = [];
    if (patientUserId) {
      const patientAppointments = await Appointment.find({
        patientUserId: patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
        timeslotId: { $exists: true }
      }).populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId',
        match: {
          startTime: { 
            $gte: new Date(searchDate.getTime()),
            $lt: new Date(searchDate.getTime() + 24 * 60 * 60 * 1000)
          }
        }
      });

      const userAppointmentsWithSlots = patientAppointments
        .filter(apt => apt.timeslotId)
        .map(apt => ({
          start: new Date(apt.timeslotId.startTime),
          end: new Date(apt.timeslotId.endTime),
          doctorId: apt.timeslotId.doctorUserId ? apt.timeslotId.doctorUserId.toString() : null,
          appointmentFor: apt.appointmentFor || 'self'
        }));

      userSelfBookedSlots = userAppointmentsWithSlots.filter(slot => slot.appointmentFor === 'self');
      userOtherBookedSlots = userAppointmentsWithSlots.filter(slot => slot.appointmentFor === 'other');

      console.log(`👤 User ${patientUserId} đã đặt ${userAppointmentsWithSlots.length} slots trong ngày ${searchDate.toISOString().split('T')[0]} (self: ${userSelfBookedSlots.length}, other: ${userOtherBookedSlots.length})`);
      userAppointmentsWithSlots.forEach((slot, idx) => {
        console.log(`   - Slot ${idx + 1}: ${slot.start.toISOString()} - ${slot.end.toISOString()} (Doctor: ${slot.doctorId || 'N/A'}, appointmentFor: ${slot.appointmentFor})`);
      });
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
          status: { $in: ['Pending', 'Approved', 'CheckedIn', 'InProgress', 'Completed'] }
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

      // ⭐ LOGIC EXCLUDE:
      // - appointmentFor === 'self': Exclude TẤT CẢ slots user đã đặt (appointmentFor=self) và slots với cùng bác sĩ nếu trước đó đặt cho người khác
      // - appointmentFor === 'other': Chỉ exclude slots user đã đặt với CÙNG bác sĩ (nếu có patientUserId được truyền)
      if (patientUserId && (userSelfBookedSlots.length > 0 || userOtherBookedSlots.length > 0)) {
        const currentDoctorId = doctorId.toString();
        let slotsToExclude = [];

        if (appointmentFor === 'self') {
          const sameDoctorOtherSlots = userOtherBookedSlots.filter(slot => slot.doctorId === currentDoctorId);
          slotsToExclude = [...userSelfBookedSlots, ...sameDoctorOtherSlots];
          console.log(`\n🔴 [Doctor ${doctor.fullName}] EXCLUDING USER BOOKED SLOTS (self: ${userSelfBookedSlots.length}, other doctor matches: ${sameDoctorOtherSlots.length})`);
        } else if (appointmentFor === 'other') {
          slotsToExclude = userOtherBookedSlots.filter(slot => slot.doctorId === currentDoctorId);
          console.log(`\n🔴 [Doctor ${doctor.fullName}] EXCLUDING USER BOOKED SLOTS (CHỈ bác sĩ ${currentDoctorId} - appointmentFor=other):`);
          console.log(`   - Total user slots: ${userOtherBookedSlots.length}, Excluding: ${slotsToExclude.length}`);
        }

        if (slotsToExclude.length > 0) {
          console.log(`   - patientUserId: ${patientUserId}`);
          console.log(`   - slotsToExclude count: ${slotsToExclude.length}`);
          slotsToExclude.forEach((booked, idx) => {
            console.log(`   - Booked slot ${idx}: ${booked.start.toISOString()} - ${booked.end.toISOString()} (Doctor: ${booked.doctorId || 'N/A'})`);
          });

          console.log(`   - availableSlots BEFORE exclude: ${availableSlots.length}`);
          const slotsBeforeFilter = availableSlots.length;
          availableSlots = availableSlots.filter(slot => {
            const slotStart = new Date(slot.startTime);
            const slotEnd = new Date(slot.endTime);
            const isBooked = slotsToExclude.some(booked => (slotStart < booked.end && slotEnd > booked.start));

            if (isBooked) {
              console.log(`     ❌ EXCLUDED: ${slot.startTime} - ${slot.endTime} (bệnh nhân đã có lịch với bác sĩ ${appointmentFor === 'self' ? 'bất kỳ' : currentDoctorId} vào thời gian này)`);
            }

            return !isBooked;
          });

          console.log(`   - availableSlots AFTER exclude: ${availableSlots.length} (removed ${slotsBeforeFilter - availableSlots.length})`);
        } else {
          console.log(`\n🟢 [Doctor ${doctor.fullName}] NOT EXCLUDING USER SLOTS (no matching slots to exclude)`);
        }
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
async getDoctorScheduleRange({ 
    doctorUserId, 
    serviceId, 
    date, 
    patientUserId = null, 
    appointmentFor = 'self',
    customerFullName = null,
    customerEmail = null
  }) {
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
    searchDate.setUTCHours(0, 0, 0, 0);

    // ⭐ Auto-refresh schedules giống patient booking
    await ScheduleHelper.updateExpiredSchedules();
    await ScheduleHelper.ensureSchedulesForDate(searchDate);

    const doctorProfile = await Doctor.findOne({ doctorUserId })
      .select('workingHours workingHoursUpdatedAt status')
      .lean();
    const doctorHasWorkingHours = hasCompleteWorkingHours(doctorProfile?.workingHours);

    let schedules = await DoctorSchedule.find({
      doctorUserId,
      date: searchDate,
      status: 'Available'
    }).sort({ shift: 1 });

    if (schedules.length === 0 && doctorHasWorkingHours) {
      console.log(`⚠️ [getDoctorScheduleRange] No schedules for ${doctor.fullName} (${doctorUserId}) on ${searchDate.toISOString().split('T')[0]}. Auto-creating from workingHours...`);
      await ScheduleHelper.ensureScheduleForDoctor(doctorUserId, searchDate);
      schedules = await DoctorSchedule.find({
        doctorUserId,
        date: searchDate,
        status: 'Available'
      }).sort({ shift: 1 });
    }

    if (schedules.length === 0) {
      return {
        doctorId: doctorUserId,
        doctorName: doctor.fullName,
        date: searchDate,
        scheduleRanges: [], // ⭐ FIX: Trả về scheduleRanges (số nhiều) thay vì scheduleRange (số ít) để consistent
        message: 'Bác sĩ bạn chọn không có lịch làm việc vào ngày này. Vui lòng chọn bác sĩ khác hoặc ngày khác.'
      };
    }

    // 4. Lấy danh sách appointments đã book của doctor vào ngày này
    // ⭐ THÊM: Loại trừ cả appointments có status 'InProgress' (đang trong ca khám)
    const bookedAppointments = await Appointment.find({
      doctorUserId,
      status: { $in: ['Pending', 'Approved', 'CheckedIn', 'PendingPayment', 'InProgress'] },
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
    }).populate('appointmentId', 'timeslotId');

    // ⭐ GIẢM LOG: Comment lại để giảm spam log
    // console.log(`🔍 [getDoctorScheduleRange] Found ${allTimeslots.length} timeslots (Reserved/Booked) for doctor ${doctorUserId} on ${searchDate.toISOString().split('T')[0]}`);

    const nowForReservation = new Date();
    const activeTimeslots = [];

    for (const slot of allTimeslots) {
      if (slot.status === 'Reserved') {
        if (!slot.reservedUntil || slot.reservedUntil <= nowForReservation) {
          // Reservation expired -> release slot
          await Timeslot.updateOne(
            { _id: slot._id },
            {
              $set: {
                status: 'Available',
                reservedUntil: null,
                reservedByUserId: null,
                appointmentId: null,
              },
            },
          );
          continue;
        }
      }
      activeTimeslots.push(slot);
    }

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

    // ⭐ FIX: Chỉ lấy timeslots có appointmentId VÀ appointment đó vẫn còn reference đến timeslot này
    // (Tránh lấy timeslot cũ sau khi reschedule - đã được set về 'Available' nhưng có thể có delay)
    const validTimeslots = activeTimeslots.filter(timeslot => {
      // Nếu timeslot không có appointmentId, vẫn tính (có thể là Reserved chưa có appointment)
      if (!timeslot.appointmentId) {
        return true;
      }
      
      // Nếu timeslot có appointmentId, kiểm tra appointment có còn reference đến timeslot này không
      const appointment = timeslot.appointmentId;
      if (!appointment || !appointment.timeslotId) {
        // Appointment không còn reference đến timeslot này → timeslot đã được giải phóng
        return false;
      }
      
      // Kiểm tra appointment.timeslotId có matching với timeslot._id không
      const appointmentTimeslotId = appointment.timeslotId.toString();
      const timeslotId = timeslot._id.toString();
      
      return appointmentTimeslotId === timeslotId;
    });

    // ⭐ GIẢM LOG: Comment lại để giảm spam log
    // console.log(`🔍 [getDoctorScheduleRange] Filtered to ${validTimeslots.length} valid timeslots (after excluding orphaned slots)`);

    // Thêm timeslots từ bảng Timeslot
    const bookedSlotsFromTimeslots = validTimeslots.map(timeslot => ({
      start: new Date(timeslot.startTime),
      end: new Date(timeslot.endTime),
      breakAfter: 10 // Default buffer time
    }));

    // Gộp tất cả booked slots và merge các slots có overlap
    const allBookedSlots = [...bookedSlotsFromAppointments, ...bookedSlotsFromTimeslots];
    
    // ⭐ FIX: Merge các slots có overlap thay vì chỉ loại bỏ exact duplicates
    // Sắp xếp theo start time trước
    allBookedSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    const mergedBookedSlots = [];
    for (const slot of allBookedSlots) {
      if (mergedBookedSlots.length === 0) {
        mergedBookedSlots.push({ ...slot });
        continue;
      }
      
      const lastSlot = mergedBookedSlots[mergedBookedSlots.length - 1];
      
      // ⭐ Check overlap: slot.start < lastSlot.end && slot.end > lastSlot.start
      if (slot.start.getTime() < lastSlot.end.getTime() && slot.end.getTime() > lastSlot.start.getTime()) {
        // Có overlap → merge: mở rộng lastSlot để bao phủ cả slot mới
        lastSlot.end = new Date(Math.max(lastSlot.end.getTime(), slot.end.getTime()));
        lastSlot.start = new Date(Math.min(lastSlot.start.getTime(), slot.start.getTime()));
      } else {
        // Không overlap → thêm slot mới
        mergedBookedSlots.push({ ...slot });
      }
    }

    const uniqueBookedSlots = mergedBookedSlots;

    // ⭐ THÊM: Lấy appointments của user trong cùng ngày
    let userBookedSlots = [];
    let userSelfBookedSlots = [];
    let userOtherBookedSlots = [];
    if (patientUserId) {
      const userAppointments = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId appointmentFor'
      })
      .populate({
        path: 'customerId',
        select: 'fullName email'
      });

      // Filter appointments vào ngày đang xét
      const userAppointmentsOnDate = userAppointments.filter(apt => {
        if (!apt.timeslotId) return false;
        const slotDate = new Date(apt.timeslotId.startTime);
        return slotDate.toISOString().split('T')[0] === searchDate.toISOString().split('T')[0];
      });

      const userAppointmentsWithType = userAppointmentsOnDate.map(apt => ({
        start: new Date(apt.timeslotId.startTime),
        end: new Date(apt.timeslotId.endTime),
        doctorId: apt.timeslotId.doctorUserId ? apt.timeslotId.doctorUserId.toString() : null,
        appointmentFor: apt.appointmentFor || 'self',
        customerFullName: apt.customerId?.fullName || null,
        customerEmail: apt.customerId?.email || null
      }));

      userSelfBookedSlots = userAppointmentsWithType.filter(slot => slot.appointmentFor === 'self');
      userOtherBookedSlots = userAppointmentsWithType.filter(slot => slot.appointmentFor === 'other');

      console.log(`🔍 [getDoctorScheduleRange] User ${patientUserId} appointments on ${searchDate.toISOString().split('T')[0]} (self: ${userSelfBookedSlots.length}, other: ${userOtherBookedSlots.length})`);
      userAppointmentsWithType.forEach((slot, idx) => {
        console.log(`   - Slot ${idx + 1}: ${slot.start.toISOString()} - ${slot.end.toISOString()} (Doctor: ${slot.doctorId || 'N/A'}, appointmentFor: ${slot.appointmentFor}, customer: ${slot.customerFullName || 'N/A'})`);
      });

      const currentDoctorId = doctorUserId.toString();
      
      // ⭐ LOGIC MỚI: Exclude slots dựa trên appointmentFor và customer
      if (appointmentFor === 'self') {
        // Khi đặt cho BẢN THÂN:
        // - Exclude tất cả slots của bản thân (với BẤT KỲ bác sĩ nào)
        // - Exclude slots của người thân với CÙNG bác sĩ hiện tại
        const sameDoctorOtherSlots = userOtherBookedSlots.filter(slot => slot.doctorId === currentDoctorId);
        userBookedSlots = [...userSelfBookedSlots, ...sameDoctorOtherSlots];
        console.log(`   → Exclude: ${userSelfBookedSlots.length} self slots + ${sameDoctorOtherSlots.length} other slots (same doctor)`);
        
      } else if (appointmentFor === 'other') {
        // ⭐ FIX MỚI: Khi đặt cho NGƯỜI THÂN:
        // Case 1: Nếu có thông tin customer (fullName + email) → đang đặt cho CÙNG người thân
        //         → Exclude TẤT CẢ slots của người thân này (với BẤT KỲ bác sĩ nào)
        //         → Vì cùng người thân không thể đặt 2 bác sĩ khác nhau cùng giờ
        // Case 2: Nếu KHÔNG có thông tin customer → đang chọn người thân mới
        //         → Chỉ exclude slots với CÙNG bác sĩ hiện tại (của bản thân + tất cả người thân)
        
        if (customerFullName && customerEmail) {
          // Case 1: Đang đặt cho CÙNG người thân (có fullName + email)
          const normalizeString = (str) => {
            if (!str) return '';
            return str.toLowerCase().trim().replace(/\s+/g, ' ');
          };
          
          const normalizedInputName = normalizeString(customerFullName);
          const normalizedInputEmail = normalizeString(customerEmail);
          
          // Exclude TẤT CẢ slots của người thân này (BẤT KỲ bác sĩ nào)
          const sameCustomerSlots = userOtherBookedSlots.filter(slot => {
            if (!slot.customerFullName || !slot.customerEmail) return false;
            const normalizedSlotName = normalizeString(slot.customerFullName);
            const normalizedSlotEmail = normalizeString(slot.customerEmail);
            return normalizedSlotName === normalizedInputName && normalizedSlotEmail === normalizedInputEmail;
          });
          
          // Exclude slots của bản thân với CÙNG bác sĩ hiện tại
          const sameDoctorSelfSlots = userSelfBookedSlots.filter(slot => slot.doctorId === currentDoctorId);
          
          // Exclude slots của NGƯỜI THÂN KHÁC với CÙNG bác sĩ hiện tại
          const sameDoctorOtherCustomerSlots = userOtherBookedSlots.filter(slot => {
            if (!slot.customerFullName || !slot.customerEmail) return slot.doctorId === currentDoctorId;
            const normalizedSlotName = normalizeString(slot.customerFullName);
            const normalizedSlotEmail = normalizeString(slot.customerEmail);
            const isSameCustomer = normalizedSlotName === normalizedInputName && normalizedSlotEmail === normalizedInputEmail;
            return !isSameCustomer && slot.doctorId === currentDoctorId;
          });
          
          userBookedSlots = [...sameCustomerSlots, ...sameDoctorSelfSlots, ...sameDoctorOtherCustomerSlots];
          console.log(`   → Exclude for customer "${customerFullName}": ${sameCustomerSlots.length} same customer slots (any doctor) + ${sameDoctorSelfSlots.length} self slots (same doctor) + ${sameDoctorOtherCustomerSlots.length} other customer slots (same doctor)`);
          
        } else {
          // Case 2: Đang chọn người thân mới (KHÔNG có fullName + email)
          // Chỉ exclude slots với CÙNG bác sĩ hiện tại
          const sameDoctorSelfSlots = userSelfBookedSlots.filter(slot => slot.doctorId === currentDoctorId);
          const sameDoctorOtherSlots = userOtherBookedSlots.filter(slot => slot.doctorId === currentDoctorId);
          userBookedSlots = [...sameDoctorSelfSlots, ...sameDoctorOtherSlots];
          console.log(`   → Exclude (no customer info): ${sameDoctorSelfSlots.length} self slots + ${sameDoctorOtherSlots.length} other slots (same doctor ${currentDoctorId})`);
        }
      }
    }

    // Gộp tất cả booked slots (doctor + user) và merge các slots có overlap
    const allBookedSlotsFinal = [...uniqueBookedSlots, ...userBookedSlots];
    
    // ⭐ FIX: Merge các slots có overlap thay vì chỉ loại bỏ exact duplicates
    // Sắp xếp theo start time trước
    allBookedSlotsFinal.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    const finalMergedBookedSlots = [];
    for (const slot of allBookedSlotsFinal) {
      if (finalMergedBookedSlots.length === 0) {
        finalMergedBookedSlots.push({ ...slot });
        continue;
      }
      
      const lastSlot = finalMergedBookedSlots[finalMergedBookedSlots.length - 1];
      
      // ⭐ Check overlap: slot.start < lastSlot.end && slot.end > lastSlot.start
      if (slot.start.getTime() < lastSlot.end.getTime() && slot.end.getTime() > lastSlot.start.getTime()) {
        // Có overlap → merge: mở rộng lastSlot để bao phủ cả slot mới
        lastSlot.end = new Date(Math.max(lastSlot.end.getTime(), slot.end.getTime()));
        lastSlot.start = new Date(Math.min(lastSlot.start.getTime(), slot.start.getTime()));
      } else {
        // Không overlap → thêm slot mới
        finalMergedBookedSlots.push({ ...slot });
      }
    }
    
    const finalUniqueBookedSlots = finalMergedBookedSlots;

    const bookedSlots = finalUniqueBookedSlots.sort((a, b) => a.start - b.start);

    // ⭐ GIẢM LOG: Comment lại để giảm spam log
    // console.log(`🔍 [getDoctorScheduleRange] Total unique booked slots (doctor + user): ${bookedSlots.length}`);
    // bookedSlots.forEach((slot, idx) => {
    //   const vnStart = new Date(slot.start.getTime() + 7 * 60 * 60 * 1000);
    //   const vnEnd = new Date(slot.end.getTime() + 7 * 60 * 60 * 1000);
    //   console.log(`   - Slot ${idx + 1}: ${vnStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${vnEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}`);
    // });

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
    
    // Helper function: Kiểm tra xem shift đã qua thời gian làm việc chưa (chỉ cho ngày hôm nay)
    const isShiftPassed = (shiftStart, shiftEnd) => {
      if (!isToday) return false; // Chỉ check cho ngày hôm nay
      return now.getTime() > shiftEnd.getTime();
    };
    
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

    // ⭐ Logic: Lấy workingHours dựa trên thời gian cập nhật
    // - Nếu cập nhật vào ngày 15/11, thì từ ngày 16/11 trở đi mới áp dụng workingHours mới
    // - Nếu searchDate <= workingHoursUpdatedAt (tính theo ngày), dùng workingHours cũ từ schedule
    // - Nếu searchDate > workingHoursUpdatedAt (tính theo ngày), dùng workingHours mới từ User model
    
    const defaultWorkingHours = {
      morningStart: '08:00',
      morningEnd: '12:00',
      afternoonStart: '14:00',
      afternoonEnd: '18:00'
    };
    
    // Lấy workingHours từ User model (nếu có)
    const userWorkingHours = doctorProfile?.workingHours;
    const workingHoursUpdatedAt = doctorProfile?.workingHoursUpdatedAt;
    
    // So sánh ngày (không tính giờ)
    let useNewWorkingHours = false;
    if (workingHoursUpdatedAt) {
      const updateDate = new Date(workingHoursUpdatedAt);
      updateDate.setUTCHours(0, 0, 0, 0);
      const searchDateOnly = new Date(searchDate);
      searchDateOnly.setUTCHours(0, 0, 0, 0);
      
      // Nếu searchDate > updateDate (tức là từ ngày hôm sau), dùng workingHours mới
      useNewWorkingHours = searchDateOnly > updateDate;
    }
    
    let workingHours = defaultWorkingHours;
    
    if (useNewWorkingHours && userWorkingHours && userWorkingHours.morningStart) {
      // Dùng workingHours mới từ User model (áp dụng từ ngày hôm sau)
      workingHours = userWorkingHours;
      // ⭐ GIẢM LOG: Comment lại để giảm spam log
      // console.log(`📅 [getDoctorScheduleRange] Using NEW workingHours from User model (updated at ${workingHoursUpdatedAt?.toISOString()}) for date ${searchDate.toISOString().split('T')[0]}`);
    } else {
      // Dùng workingHours cũ từ schedule
      if (morningSchedules.length > 0 && morningSchedules[0].workingHours) {
        workingHours = morningSchedules[0].workingHours;
      } else if (afternoonSchedules.length > 0 && afternoonSchedules[0].workingHours) {
        workingHours = afternoonSchedules[0].workingHours;
      }
      // ⭐ GIẢM LOG: Comment lại để giảm spam log
      // console.log(`📅 [getDoctorScheduleRange] Using OLD workingHours from schedule for date ${searchDate.toISOString().split('T')[0]}`);
    }

    const scheduleRanges = [];
    
    // ⭐ LUÔN trả về buổi sáng (nếu có schedule thì tính gaps, nếu không thì trả về "Đã hết chỗ")
    const morningStart = new Date(searchDate);
    const [morningStartHour, morningStartMinute] = workingHours.morningStart.split(':').map(Number);
    morningStart.setUTCHours(morningStartHour - 7, morningStartMinute, 0, 0);
    
    const morningEnd = new Date(searchDate);
    const [morningEndHour, morningEndMinute] = workingHours.morningEnd.split(':').map(Number);
    morningEnd.setUTCHours(morningEndHour - 7, morningEndMinute, 0, 0);
    
    const morningShiftPassed = isShiftPassed(morningStart, morningEnd);

    if (morningSchedules.length > 0) {
    if (morningShiftPassed) {
      scheduleRanges.push({
        shift: 'Morning',
        shiftDisplay: 'Buổi sáng',
        startTime: morningStart.toISOString(),
        endTime: morningEnd.toISOString(),
        availableGaps: [],
        displayRange: 'Đã qua thời gian làm việc'
      });
    } else {
      const rawGaps = calculateAvailableGaps(morningStart, morningEnd, bookedSlots);
      const availableGaps = filterRealTimeGaps(rawGaps);

      let displayMessage = '';
      if (availableGaps.length === 0) {
        displayMessage = 'Đã hết chỗ';
      } else {
        displayMessage = availableGaps
          .map((gap) => `${formatTime(gap.start)}-${formatTime(gap.end)}`)
          .join(', ');
      }

      scheduleRanges.push({
        shift: 'Morning',
        shiftDisplay: 'Buổi sáng',
        startTime: morningStart.toISOString(),
        endTime: morningEnd.toISOString(),
        availableGaps: availableGaps.map((gap) => ({
          start: gap.start.toISOString(),
          end: gap.end.toISOString(),
          display: `${formatTime(gap.start)}-${formatTime(gap.end)}`
        })),
        displayRange: displayMessage
      });
      }
    } else {
      scheduleRanges.push({
        shift: 'Morning',
        shiftDisplay: 'Buổi sáng',
        startTime: morningStart.toISOString(),
        endTime: morningEnd.toISOString(),
        availableGaps: [],
        displayRange: morningShiftPassed ? 'Đã qua thời gian làm việc' : 'Đã hết chỗ'
      });
    }
    
    // ⭐ LUÔN trả về buổi chiều (nếu có schedule thì tính gaps, nếu không thì trả về "Đã hết chỗ")
    const afternoonStart = new Date(searchDate);
    const [afternoonStartHour, afternoonStartMinute] = workingHours.afternoonStart.split(':').map(Number);
    afternoonStart.setUTCHours(afternoonStartHour - 7, afternoonStartMinute, 0, 0);
    
    const afternoonEnd = new Date(searchDate);
    const [afternoonEndHour, afternoonEndMinute] = workingHours.afternoonEnd.split(':').map(Number);
    afternoonEnd.setUTCHours(afternoonEndHour - 7, afternoonEndMinute, 0, 0);
    
    const afternoonShiftPassed = isShiftPassed(afternoonStart, afternoonEnd);

    if (afternoonSchedules.length > 0) {
    if (afternoonShiftPassed) {
      scheduleRanges.push({
        shift: 'Afternoon',
        shiftDisplay: 'Buổi chiều',
        startTime: afternoonStart.toISOString(),
        endTime: afternoonEnd.toISOString(),
        availableGaps: [],
        displayRange: 'Đã qua thời gian làm việc'
      });
    } else {
      const rawGaps = calculateAvailableGaps(afternoonStart, afternoonEnd, bookedSlots);
      const availableGaps = filterRealTimeGaps(rawGaps);

      let displayMessage = '';
      if (availableGaps.length === 0) {
        displayMessage = 'Đã hết chỗ';
      } else {
        displayMessage = availableGaps
          .map((gap) => `${formatTime(gap.start)}-${formatTime(gap.end)}`)
          .join(', ');
      }

      scheduleRanges.push({
        shift: 'Afternoon',
        shiftDisplay: 'Buổi chiều',
        startTime: afternoonStart.toISOString(),
        endTime: afternoonEnd.toISOString(),
        availableGaps: availableGaps.map((gap) => ({
          start: gap.start.toISOString(),
          end: gap.end.toISOString(),
          display: `${formatTime(gap.start)}-${formatTime(gap.end)}`
        })),
        displayRange: displayMessage
      });
      }
    } else {
      scheduleRanges.push({
        shift: 'Afternoon',
        shiftDisplay: 'Buổi chiều',
        startTime: afternoonStart.toISOString(),
        endTime: afternoonEnd.toISOString(),
        availableGaps: [],
        displayRange: afternoonShiftPassed ? 'Đã qua thời gian làm việc' : 'Đã hết chỗ'
      });
    }
    // ⭐ THÊM: Lấy reserved slots của user (nếu có) để FE có thể hiển thị
    let userReservedSlots = [];
    if (patientUserId) {
      const userReservedTimeslots = await Timeslot.find({
        doctorUserId,
        reservedByUserId: patientUserId,
        status: 'Reserved',
        startTime: { 
          $gte: new Date(searchDate.getTime()),
          $lt: new Date(searchDate.getTime() + 24 * 60 * 60 * 1000)
        }
      }).sort({ startTime: 1 });

      // Filter expired reservations
      const now = new Date();
      userReservedSlots = userReservedTimeslots
        .filter(slot => slot.reservedUntil && slot.reservedUntil > now)
        .map(slot => ({
          startTime: slot.startTime.toISOString(),
          endTime: slot.endTime.toISOString(),
          timeslotId: slot._id.toString()
        }));

    }

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
      message: message, // ⭐ Trả về message nếu không có gaps khả dụng
      userReservedSlots: userReservedSlots // ⭐ Trả về reserved slots của user để FE hiển thị
    };
  }

  /**
   * Lấy khoảng thời gian khả dụng dành riêng cho luồng bác sĩ tạo lịch tái khám.
   * Ưu tiên kiểm tra trạng thái nghỉ phép trước khi tính toán lịch.
   */
  async getDoctorScheduleRangeForFollowUp({ doctorUserId, serviceId, date, patientUserId = null, appointmentFor = 'self' }) {
    const checkLeaveDate = new Date(date);
    checkLeaveDate.setUTCHours(12, 0, 0, 0);

    const approvedLeave = await LeaveRequest.findOne({
      userId: doctorUserId,
      status: 'Approved',
      startDate: { $lte: checkLeaveDate },
      endDate: { $gte: checkLeaveDate }
    }).select('startDate endDate');

    if (approvedLeave) {
      const doctor = await User.findById(doctorUserId).select('fullName');
      const leaveStart = new Date(approvedLeave.startDate);
      const leaveEnd = new Date(approvedLeave.endDate);

      const formatDate = (d) => d.toLocaleDateString('vi-VN');
      const message = `Bác sĩ đang nghỉ phép từ ${formatDate(leaveStart)} đến ${formatDate(leaveEnd)}. Vui lòng chọn ngày khác.`;

      return {
        doctorId: doctorUserId,
        doctorName: doctor?.fullName || 'Bác sĩ',
        date: checkLeaveDate,
        serviceName: null,
        serviceDuration: null,
        doctorScheduleId: null,
        scheduleRanges: [],
        totalSchedules: 0,
        message,
        userReservedSlots: []
      };
    }

    return this.getDoctorScheduleRange({ doctorUserId, serviceId, date, patientUserId, appointmentFor });
  }

  /**
   * ⭐ NEW: Validate appointment time
   * Check: thời gian nhập có nằm trong doctor schedule không và có doctor khả dụng không
   */
  async validateAppointmentTime({ doctorUserId, serviceId, date, startTime, patientUserId = null, appointmentFor = 'self', customerFullName, customerEmail }) {
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

    // ⭐ 3.1. Không cho đặt thời gian ở quá khứ - CHECK TRƯỚC TẤT CẢ CÁC VALIDATION KHÁC
    // ⭐ FIX: Chỉ check quá khứ nếu date là ngày hiện tại, không check nếu date là ngày trong tương lai
    // Nếu thời gian ở quá khứ, return ngay, không check conflict hay validation khác
    const nowUtc = new Date();
    const nowUtcRounded = new Date(nowUtc);
    nowUtcRounded.setSeconds(0, 0); // Cho phép đặt đúng phút hiện tại
    
    // ⭐ FIX: Extract date từ date parameter để so sánh với ngày hiện tại
    const searchDateForPastCheck = new Date(date);
    searchDateForPastCheck.setUTCHours(0, 0, 0, 0);
    const todayUtc = new Date(nowUtc);
    todayUtc.setUTCHours(0, 0, 0, 0);
    
    // ⭐ Chỉ check quá khứ nếu date là ngày hiện tại (cho phép đặt ngày trong tương lai)
    const isToday = searchDateForPastCheck.getTime() === todayUtc.getTime();
    
    if (isToday && startTimeObj.getTime() < (nowUtcRounded.getTime() - PAST_TIME_ALLOWANCE_MS)) {
      throw new Error('Không thể đặt thời gian ở quá khứ');
    }

    // ⭐ 3.5. Check conflict cho bệnh nhân - CHỈ CHECK SAU KHI ĐÃ PASS validation quá khứ
    // Logic phụ thuộc vào appointmentFor và thông tin customer
    // ⭐ FIX: Extract date từ date parameter để chỉ check appointments trong cùng ngày
    const searchDateForPatientCheck = new Date(date);
    searchDateForPatientCheck.setUTCHours(0, 0, 0, 0);
    const searchDateEndForPatientCheck = new Date(searchDateForPatientCheck);
    searchDateEndForPatientCheck.setUTCHours(23, 59, 59, 999);
    
    if (patientUserId) {
      // ⭐ FIX: Chỉ lấy appointments của user trong cùng ngày với date được truyền vào (tránh check với ngày khác)
      // ⭐ THÊM: Loại trừ cả appointments có status 'InProgress' (đang trong ca khám)
      const existingAppointments = await Appointment.find({
        patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress'] },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId',
        match: {
          // ⭐ FIX: Chỉ lấy appointments trong cùng ngày với date được truyền vào (UTC date)
          startTime: { 
            $gte: searchDateForPatientCheck,
            $lte: searchDateEndForPatientCheck
          }
        }
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
          // ⭐ Convert UTC sang giờ VN (UTC+7) để hiển thị
          const aptStartVN = (aptStart.getUTCHours() + 7) % 24;
          const aptEndVN = (aptEnd.getUTCHours() + 7) % 24;
          const aptStartDisplay = `${String(aptStartVN).padStart(2, '0')}:${String(aptStart.getUTCMinutes()).padStart(2, '0')}`;
          const aptEndDisplay = `${String(aptEndVN).padStart(2, '0')}:${String(aptEnd.getUTCMinutes()).padStart(2, '0')}`;

          // Case 1: User đã có appointment cho BẢN THÂN vào giờ này
          // ⭐ CHỈ kiểm tra conflict nếu CÙNG bác sĩ (cho phép đặt cùng giờ với bác sĩ khác)
          if (apt.appointmentFor === 'self') {
            // Kiểm tra xem có cùng bác sĩ không
            if (apt.timeslotId.doctorUserId && apt.timeslotId.doctorUserId.toString() === doctorUserId) {
              throw new Error(
                `Bạn đã có lịch khám cho bản thân với bác sĩ này vào ${aptStartDisplay} - ${aptEndDisplay}. ` +
                `Vui lòng chọn thời gian khác.`
              );
            }
            // ⭐ Nếu khác bác sĩ → cho phép (không throw error)
          }

          // Case 2: User đã đặt cho NGƯỜI THÂN vào giờ này
          if (apt.appointmentFor === 'other' && apt.customerId) {
            const normalizeString = (str) => str ? str.trim().toLowerCase() : '';
            
            // Check nếu là CÙNG một người thân (dựa trên EMAIL only)
            let isSameCustomer = false;
            
            // Validate Email Format (nếu có input)
            if (customerEmail) {
               const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
               if (!emailRegex.test(customerEmail)) {
                  // Email không hợp lệ -> coi như không match
                  isSameCustomer = false;
               } else if (apt.customerId.email) {
                  const inputEmail = normalizeString(customerEmail);
                  const aptEmail = normalizeString(apt.customerId.email);
                  isSameCustomer = (inputEmail === aptEmail);
               }
            }

            if (isSameCustomer) {
              // Nếu là cùng một người thân → KHÔNG được đặt trùng giờ (bất kể bác sĩ nào)
              throw new Error(
                `Người thân (email: ${customerEmail}) đã có lịch khám vào ${aptStartDisplay} - ${aptEndDisplay}. ` +
                `Vui lòng chọn thời gian khác.`
              );
            } else {
              // Nếu là người thân KHÁC → Chỉ check nếu đặt CÙNG bác sĩ
              if (apt.timeslotId.doctorUserId && apt.timeslotId.doctorUserId.toString() === doctorUserId) {
                throw new Error(
                  `Bạn đã đặt lịch với bác sĩ này vào ${aptStartDisplay} - ${aptEndDisplay} cho người thân khác. ` +
                  `Vui lòng chọn bác sĩ khác hoặc thời gian khác.`
                );
              }
            }
          }
        }
      }
    }

    // 4. Validate: startTime và endTime phải nằm trong một trong các schedule ranges
    const scheduleRanges = scheduleRangeResult.scheduleRanges;
    
    // ⭐ Kiểm tra startTime có nằm trong bất kỳ range nào không
    const startTimeInRange = scheduleRanges.some(range => {
      const rangeStart = new Date(range.startTime);
      const rangeEnd = new Date(range.endTime);
      return startTimeObj >= rangeStart && startTimeObj < rangeEnd;
    });

    // ⭐ Kiểm tra cả startTime và endTime có nằm trong cùng một range không
    const isInValidRange = scheduleRanges.some(range => {
      const rangeStart = new Date(range.startTime);
      const rangeEnd = new Date(range.endTime);
      return startTimeObj >= rangeStart && endTimeObj <= rangeEnd;
    });

    console.log('🔍 [validateAppointmentTime]');
    console.log('   - startTime:', startTimeObj.toISOString());
    console.log('   - endTime:', endTimeObj.toISOString());
    console.log('   - scheduleRanges:', scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`));
    console.log('   - startTimeInRange:', startTimeInRange);
    console.log('   - isInValidRange:', isInValidRange);

    if (!startTimeInRange) {
      // ⭐ Case 1: Start time không nằm trong working hours
      const rangesText = scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`).join(', ');
      throw new Error(
        `Thời gian bạn chọn không nằm trong lịch làm việc của bác sĩ. Bác sĩ rảnh: ${rangesText}. Vui lòng chọn thời gian khác.`
      );
    }

    if (!isInValidRange) {
      // ⭐ Case 2: Start time nằm trong working hours nhưng không đủ thời gian (end time vượt quá)
      // Tìm range chứa startTime để lấy thông tin
      const containingRange = scheduleRanges.find(range => {
        const rangeStart = new Date(range.startTime);
        const rangeEnd = new Date(range.endTime);
        return startTimeObj >= rangeStart && startTimeObj < rangeEnd;
      });

      if (containingRange) {
        // Convert endTime sang VN time để hiển thị
        const endTimeVN = new Date(endTimeObj);
        const endHourVN = (endTimeVN.getUTCHours() + 7) % 24;
        const endMinuteVN = endTimeVN.getUTCMinutes();
        const endTimeDisplay = `${String(endHourVN).padStart(2, '0')}:${String(endMinuteVN).padStart(2, '0')}`;

        // Convert range end sang VN time
        const rangeEndVN = new Date(containingRange.endTime);
        const rangeEndHourVN = (rangeEndVN.getUTCHours() + 7) % 24;
        const rangeEndMinuteVN = rangeEndVN.getUTCMinutes();
        const rangeEndDisplay = `${String(rangeEndHourVN).padStart(2, '0')}:${String(rangeEndMinuteVN).padStart(2, '0')}`;

        throw new Error(
          `Thời gian bạn chọn không đủ để thực hiện dịch vụ. Dịch vụ sẽ kết thúc lúc ${endTimeDisplay}, nhưng bác sĩ chỉ làm việc đến ${rangeEndDisplay} trong ${containingRange.shiftDisplay.toLowerCase()}. Vui lòng chọn thời gian sớm hơn.`
        );
      } else {
        // Fallback: Nếu không tìm thấy range (không nên xảy ra)
        const rangesText = scheduleRanges.map(r => `${r.shiftDisplay}: ${r.displayRange}`).join(', ');
        throw new Error(
          `Thời gian bạn chọn không đủ để thực hiện dịch vụ. Bác sĩ rảnh: ${rangesText}. Vui lòng chọn thời gian khác.`
        );
      }
    }

    // 5. Check xem doctor có bị booked trong khoảng thời gian này không
    // ⭐ FIX: Extract date từ date parameter (đã là Date object từ controller)
    const searchDate = new Date(date);
    searchDate.setUTCHours(0, 0, 0, 0);
    const searchDateEnd = new Date(searchDate);
    searchDateEnd.setUTCHours(23, 59, 59, 999);

    // ⭐ Loại trừ appointments của chính bệnh nhân này khi check conflict
    // Cho phép bệnh nhân đặt nhiều slots liên tiếp cho chính họ
    // ⭐ THÊM: Loại trừ cả appointments có status 'InProgress' (đang trong ca khám)
    // ⭐ FIX: Chỉ check appointments trong cùng ngày với date được truyền vào (tránh check với ngày khác)
    const bookedAppointments = await Appointment.find({
      doctorUserId,
      status: { $in: ['Pending', 'Approved', 'CheckedIn', 'InProgress'] },
      timeslotId: { $exists: true },
      // ⭐ THÊM: Loại trừ appointments của chính bệnh nhân này
      ...(patientUserId ? { patientUserId: { $ne: patientUserId } } : {})
    }).populate({
      path: 'timeslotId',
      select: 'startTime endTime',
      match: {
        // ⭐ FIX: Chỉ lấy appointments trong cùng ngày với date được truyền vào (UTC date)
        startTime: { 
          $gte: searchDate,
          $lte: searchDateEnd
        }
      }
    });

    const validAppointments = bookedAppointments.filter(apt => apt.timeslotId !== null);

    // Check conflict (chỉ với appointments của người khác, không bao gồm của chính bệnh nhân này)
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
    // ⭐ FIX: Chỉ check timeslots trong cùng ngày với date được truyền vào (tránh check với ngày khác)
    const Timeslot = require('../models/timeslot.model');
    
    const conflictingTimeslotsRaw = await Timeslot.find({
      doctorUserId: doctorUserId,
      startTime: { $lt: endTimeObj, $gte: searchDate }, // ⭐ Thêm filter theo ngày
      endTime: { $gt: startTimeObj },
      status: { $in: ['Reserved', 'Booked'] }
    });
    
    const nowForSlot = new Date();
    const conflictingTimeslots = [];

    for (const slot of conflictingTimeslotsRaw) {
      if (slot.status === 'Reserved' && slot.reservedUntil && slot.reservedUntil <= nowForSlot) {
        await Timeslot.updateOne(
          { _id: slot._id },
          {
            $set: {
              status: 'Available',
              reservedUntil: null,
              reservedByUserId: null,
              appointmentId: null
            }
          }
        );
        continue;
      }

      // ⭐ Loại trừ reservation của chính user đang đặt (nếu có patientUserId)
      // Cho phép user release slot cũ và đặt slot mới ngay lập tức
      if (slot.status === 'Reserved' && patientUserId && slot.reservedByUserId && 
          slot.reservedByUserId.toString() === patientUserId.toString()) {
        // Đây là reservation của chính user này → bỏ qua, không tính là conflict
        continue;
      }

      // ⭐ FIX: Check overlap thực sự (không chỉ tiếp giáp)
      // Logic overlap: startTimeObj < slot.endTime && endTimeObj > slot.startTime
      // Ví dụ: 7:30-8:15 và 8:15-8:45 KHÔNG overlap (chỉ tiếp giáp) → không conflict
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);
      
      // Overlap chỉ khi: startTimeObj < slotEnd && endTimeObj > slotStart
      // Nếu startTimeObj === slotEnd hoặc endTimeObj === slotStart → không overlap (chỉ tiếp giáp)
      if (startTimeObj.getTime() < slotEnd.getTime() && endTimeObj.getTime() > slotStart.getTime()) {
        conflictingTimeslots.push(slot);
      }
    }

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