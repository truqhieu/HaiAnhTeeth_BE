const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const Service = require('../models/service.model');
const User = require('../models/user.model');
const Customer = require('../models/customer.model');
const DoctorSchedule = require('../models/doctorSchedule.model');
const Doctor = require('../models/doctor.model');
const EmailService = require('../config/emailConfig')
const { calculateServicePrice } = require('../utils/promotionHelper');
const emailService = require('./email.service');
const notificationService = require('../services/notification.service');
const leaveRequestService = require('./leaveRequest.service');
const MedicalRecord = require('../models/medicalRecord.model');
const PromotionService = require('../models/promotionService.model')
const Promotion = require('../models/promotion.model');
const PdfPrinter = require('pdfmake')
const path = require('path')
const VisitTicket = require('../models/visitTicket.model')

const fonts = {
  Roboto: {
    normal: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),   
    bold: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),         
    italics: path.join(__dirname, '../fonts/Roboto-Italic.ttf'),
    bolditalics: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf')
  }
};

const printer = new PdfPrinter(fonts)

class AppointmentService {

  async createConsultationAppointment(appointmentData) {
    const {
      patientUserId,
      doctorUserId,
      serviceId,
      doctorScheduleId,
      selectedSlot, // { startTime, endTime } từ available slots
      notes,
      fullName,
      email,
      phoneNumber,
      appointmentFor
    } = appointmentData;

    // Validate required fields
    if (!patientUserId || !doctorUserId || !serviceId || !doctorScheduleId || !selectedSlot) {
      throw new Error('Vui lòng nhập đầy đủ thông tin để đặt lịch tư vấn.');
    }

    if (!selectedSlot.startTime || !selectedSlot.endTime) {
      throw new Error('Thông tin khung giờ không hợp lệ. Vui lòng chọn lại thời gian.');
    }

    // Kiểm tra patient có tồn tại không và lấy thông tin email
    const patient = await User.findById(patientUserId);
    if (!patient) {
      throw new Error('Tài khoản của bạn không hợp lệ. Vui lòng đăng nhập lại.');
    }

    // Kiểm tra service có tồn tại không
    const service = await Service.findById(serviceId);
    if (!service) {
      throw new Error('Dịch vụ bạn chọn không tồn tại. Vui lòng chọn dịch vụ khác.');
    }

    if (service.status !== 'Active') {
      throw new Error('Dịch vụ này hiện không khả dụng');
    }

    // ⭐ Tính promotion cho service này
    const promotionData = await calculateServicePrice(serviceId, service.price);
    const finalPrice = promotionData.finalPrice;
    const originalPrice = promotionData.originalPrice;
    
    console.log('💰 Thông tin giá dịch vụ:');
    console.log('   - Giá gốc:', originalPrice, 'VND');
    console.log('   - Giá sau giảm:', finalPrice, 'VND');
    if (promotionData.hasPromotion) {
      console.log('   - Có promotion:', promotionData.promotionInfo.title);
      console.log('   - Giảm:', promotionData.discountAmount, 'VND');
    }

    // Kiểm tra nếu service yêu cầu thanh toán trước (Consultation)
    if (service.isPrepaid && service.category === 'Consultation') {
      console.log('⚠️ Service này yêu cầu thanh toán trước:', service.serviceName);
      console.log('💰 Số tiền cần thanh toán:', finalPrice, 'VND');
    }

    // Xác định mode dựa vào category của service
    let appointmentMode;
    if (service.category === 'Consultation') {
      appointmentMode = 'Online'; // Tư vấn online
    } else if (service.category === 'Examination') {
      appointmentMode = 'Offline'; // Khám offline
    } else {
      appointmentMode = 'Online'; // Mặc định online
    }

    // Xác định customerId dựa vào appointmentFor
    // appointmentFor: 'self' | 'other'
    let customerId = null;
    
    // Log thông tin để kiểm tra
    console.log('📋 Thông tin đặt lịch:');
    console.log('- Service:', service.serviceName);
    console.log('- Category:', service.category);
    console.log('- isPrepaid:', service.isPrepaid);
    console.log('- Mode được set:', appointmentMode);
    console.log('- Họ tên từ form:', fullName);
    console.log('- SĐT từ form:', phoneNumber);
    console.log('- Email từ user đăng nhập:', patient.email);
    console.log('- Đặt cho:', appointmentFor || 'self');

    // ⭐ THÊM: Validate customer conflict khi đặt cho người khác
    if (appointmentFor === 'other' && fullName && email) {
      console.log(`🔍 Checking customer conflict for: ${fullName} <${email}>`);
      
      // Normalize name và email (lowercase, remove extra spaces/diacritics)
      const normalizeString = (str) => {
        return str
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ') // Normalize spaces
          .normalize('NFD') // Remove diacritics
          .replace(/[\u0300-\u036f]/g, '');
      };

      const normalizedFullName = normalizeString(fullName);
      const normalizedEmail = normalizeString(email);
      
      console.log(`   - Normalized: ${normalizedFullName} <${normalizedEmail}>`);
      
      // Tìm customer với matching fullName + email
      const Customer = require('../models/customer.model');
      const existingCustomer = await Customer.findOne({
        fullName: new RegExp(`^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      });
      
      if (existingCustomer) {
        console.log(` Tìm thấy existing customer: ${existingCustomer._id}`);
        
        // Kiểm tra xem customer này đã có appointment vào khung giờ này chưa
        const conflictAppointment = await Appointment.findOne({
          customerId: existingCustomer._id,
          status: { $in: ['Pending', 'Approved', 'CheckedIn', 'Completed'] },
          'timeslotId': {
            $elemMatch: {
              startTime: new Date(selectedSlot.startTime),
              endTime: new Date(selectedSlot.endTime)
            }
          }
        }).populate('timeslotId');

        // Nếu không tìm được qua $elemMatch, thử cách khác
        if (!conflictAppointment) {
          const conflictAppt = await Appointment.findOne({
            customerId: existingCustomer._id,
            status: { $in: ['Pending', 'Approved', 'CheckedIn', 'Completed'] }
          }).populate('timeslotId');

          if (conflictAppt && conflictAppt.timeslotId) {
            const appointmentStartTime = new Date(conflictAppt.timeslotId.startTime);
            const appointmentEndTime = new Date(conflictAppt.timeslotId.endTime);
            const slotStartTime = new Date(selectedSlot.startTime);
            const slotEndTime = new Date(selectedSlot.endTime);
            
            // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã booked
            // Conflict nếu: slotStartTime < appointmentEndTime && slotEndTime > appointmentStartTime
            if (slotStartTime < appointmentEndTime && slotEndTime > appointmentStartTime) {
              console.log(`❌ Customer ${fullName} đã có lịch khám vào khung giờ này`);
              throw new Error(`${fullName} đã có lịch khám vào khung giờ này rồi. Vui lòng chọn khung giờ khác!`);
            }
          }
        } else {
          console.log(` Customer ${fullName} đã có lịch khám vào khung giờ này`);
          throw new Error(`${fullName} đã có lịch khám vào khung giờ này rồi. Vui lòng chọn khung giờ khác!`);
        }
      }
    }

    // ⭐ THÊM: CHECK TIMESLOT TRƯỚC KHI TẠO ❌
    // Để tránh race condition: 2 request cùng lúc
    const slotStartTime = new Date(selectedSlot.startTime);
    const slotEndTime = new Date(selectedSlot.endTime);

    // ⭐ THÊM: Check conflict khi đặt cho bản thân - không được đặt 2 bác sĩ khác nhau cùng giờ
    if (appointmentFor === 'self' || !appointmentFor) {
      console.log(`🔍 Checking patient self-conflict for patientUserId: ${patientUserId}`);
      
      // Lấy tất cả appointments của bệnh nhân này (BẤT KỲ bác sĩ nào) vào cùng thời gian
      const patientConflictAppointments = await Appointment.find({
        patientUserId: patientUserId,
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        timeslotId: { $exists: true }
      }).populate({
        path: 'timeslotId',
        select: 'startTime endTime doctorUserId'
      });

      // Kiểm tra xem có appointment nào của bệnh nhân trùng thời gian không
      const hasConflict = patientConflictAppointments.some(apt => {
        if (!apt.timeslotId) return false;
        
        const aptStartTime = new Date(apt.timeslotId.startTime);
        const aptEndTime = new Date(apt.timeslotId.endTime);
        
        // Conflict nếu: slotStartTime < aptEndTime && slotEndTime > aptStartTime
        // (không cộng buffer time - slot tiếp theo có thể bắt đầu ngay sau)
        const isConflict = slotStartTime < aptEndTime && slotEndTime > aptStartTime;
        
        if (isConflict) {
          console.log(`❌ Patient ${patientUserId} đã có lịch khám vào khung giờ này:`);
          console.log(`   - Appointment ID: ${apt._id}`);
          console.log(`   - Doctor ID: ${apt.doctorUserId} (current: ${doctorUserId})`);
          console.log(`   - Time: ${aptStartTime.toISOString()} - ${aptEndTime.toISOString()}`);
          console.log(`   - New slot: ${slotStartTime.toISOString()} - ${slotEndTime.toISOString()}`);
        }
        
        return isConflict;
      });

      if (hasConflict) {
        throw new Error('Bạn đã có lịch khám vào khung giờ này với bác sĩ khác. Vui lòng chọn thời gian khác hoặc hủy lịch cũ trước!');
      }

      console.log(`✅ Patient ${patientUserId} không có conflict với appointments của chính họ`);
    }
    
    // Không cộng buffer time nữa - slot tiếp theo có thể bắt đầu ngay sau slot đã booked
    
    // ⭐ Không cho đặt thời gian ở quá khứ
    const nowUtc = new Date();
    if (slotStartTime.getTime() < nowUtc.getTime()) {
      throw new Error('Không thể đặt thời gian ở quá khứ');
    }
    
    // Kiểm tra conflict với timeslots đã có (KHÔNG cộng buffer time)
    const conflictingTimeslots = await Timeslot.find({
      doctorUserId: doctorUserId,
      startTime: { $lt: slotEndTime },
      endTime: { $gt: slotStartTime },
      status: { $in: ['Reserved', 'Booked'] }
    });

    if (conflictingTimeslots.length > 0) {
      console.log('❌ Khung giờ bị conflict với timeslots đã có:', conflictingTimeslots.length);
      conflictingTimeslots.forEach(ts => {
        console.log(`   - Timeslot ${ts._id}: ${ts.startTime} - ${ts.endTime} (${ts.status})`);
      });
      throw new Error(`Khung giờ này đã có người đặt hoặc đang chờ thanh toán. Vui lòng chọn thời gian khác.`);
    }

    // Validate selectedSlot duration phải khớp với service duration
    const slotDurationMinutes = (slotEndTime - slotStartTime) / 60000;

    if (slotDurationMinutes !== service.durationMinutes) {
      throw new Error(
        `Khung giờ không hợp lệ. Dịch vụ "${service.serviceName}" cần ${service.durationMinutes} phút, ` +
        `nhưng thời gian bạn chọn là ${slotDurationMinutes} phút. Vui lòng chọn lại.`
      );
    }

    // Kiểm tra doctor schedule
    const schedule = await DoctorSchedule.findById(doctorScheduleId);
    if (!schedule) {
      throw new Error('Lịch làm việc của bác sĩ không tồn tại. Vui lòng tải lại trang hoặc chọn bác sĩ khác.');
    }

    // Kiểm tra doctor có tồn tại không (từ bảng User với role="Doctor")
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

    // ⭐ THÊM: Kiểm tra user đã có lịch hẹn trùng giờ với bác sĩ hiện tại chưa
    // Cho phép đặt trùng giờ với bác sĩ khác
    const slotStart = new Date(selectedSlot.startTime);
    const slotEnd = new Date(selectedSlot.endTime);
    
    // Lấy appointments của user với bác sĩ hiện tại trong cùng ngày
    const sameDayAppointments = await Appointment.find({
      patientUserId,
      doctorUserId,
      status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
      timeslotId: { $exists: true }
    })
    .populate({
      path: 'timeslotId',
      select: 'startTime endTime'
    });

    // Filter appointments có overlap thời gian (KHÔNG cộng buffer time - cho phép đặt liên tiếp)
    for (const apt of sameDayAppointments) {
      if (!apt.timeslotId) continue;

      const aptStart = new Date(apt.timeslotId.startTime);
      const aptEnd = new Date(apt.timeslotId.endTime);
      
      // Check overlap: (start1 < end2) AND (end1 > start2) - không cộng buffer time
      // Cho phép đặt liên tiếp: 08:20-08:50 và 08:50-09:20
      const hasTimeOverlap = (slotStart < aptEnd && slotEnd > aptStart);
      
      if (hasTimeOverlap) {
        const aptDateVN = aptStart.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const aptStartVN = aptStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
        const aptEndVN = aptEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
        
        throw new Error(
          `Bạn đã có lịch hẹn với bác sĩ này vào ${aptDateVN} từ ${aptStartVN} - ${aptEndVN}. ` +
          `Vui lòng chọn bác sĩ khác hoặc thời gian khác.`
        );
      }
    }

    // Nếu đặt cho người khác, tạo Customer
    if (appointmentFor === 'other') {
      if (!fullName || !email || !phoneNumber) {
        throw new Error('Vui lòng nhập đầy đủ họ tên, email và số điện thoại của người được đặt lịch (customer)');
      }

      // ⭐ Validate: Check xem user đã đặt cho customer này vào cùng thời gian chưa
      // Normalize function để so sánh không phân biệt hoa thường, dấu cách
      const normalizeString = (str) => {
        if (!str) return '';
        return str.toLowerCase().trim().replace(/\s+/g, ' ');
      };

      const normalizedFullName = normalizeString(fullName);
      const normalizedEmail = normalizeString(email);

      // Lấy tất cả appointments của user vào cùng thời gian
      const slotStart = new Date(selectedSlot.startTime);
      const slotEnd = new Date(selectedSlot.endTime);

      const overlappingAppointments = await Appointment.find({
        patientUserId,
        appointmentFor: 'other',
        status: { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn'] },
        customerId: { $exists: true },
        timeslotId: { $exists: true }
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime'
      })
      .populate({
        path: 'customerId',
        select: 'fullName email'
      });

      // Filter appointments có overlap thời gian (KHÔNG cộng buffer time - cho phép đặt liên tiếp)
      for (const apt of overlappingAppointments) {
        if (!apt.timeslotId || !apt.customerId) continue;

        const aptStart = new Date(apt.timeslotId.startTime);
        const aptEnd = new Date(apt.timeslotId.endTime);

        // Check overlap: (start1 < end2) AND (end1 > start2) - không cộng buffer time
        // Cho phép đặt liên tiếp cho cùng một customer
        const hasTimeOverlap = (slotStart < aptEnd && slotEnd > aptStart);

        if (hasTimeOverlap) {
          // Có trùng thời gian → check xem có trùng customer không
          const existingFullName = normalizeString(apt.customerId.fullName);
          const existingEmail = normalizeString(apt.customerId.email);

          if (existingFullName === normalizedFullName && existingEmail === normalizedEmail) {
            const aptStartDisplay = `${String(aptStart.getUTCHours()).padStart(2, '0')}:${String(aptStart.getUTCMinutes()).padStart(2, '0')}`;
            const aptEndDisplay = `${String(aptEnd.getUTCHours()).padStart(2, '0')}:${String(aptEnd.getUTCMinutes()).padStart(2, '0')}`;
            
            throw new Error(
              `Bạn đã đặt lịch cho "${fullName}" vào ${aptStartDisplay} - ${aptEndDisplay}. ` +
              `Vui lòng chọn thời gian khác.`
            );
          }
        }
      }

      // Tạo Customer mới
      const newCustomer = await Customer.create({
        patientUserId: patientUserId, 
        fullName: fullName,
        email: email, 
        phoneNumber: phoneNumber,
        hasAccount: false,
        linkedUserId: null
      });

      customerId = newCustomer._id;
      console.log('✅ Đã tạo Customer cho người được đặt lịch:');
      console.log('   - Customer ID:', newCustomer._id);
      console.log('   - Họ tên:', fullName);
      console.log('   - Email:', email);
      console.log('   - SĐT:', phoneNumber);
    }

    // Tạo Timeslot mới từ slot được chọn
    const newTimeslot = await Timeslot.create({
      doctorScheduleId: schedule._id,
      doctorUserId,
      serviceId,
      startTime: new Date(selectedSlot.startTime),
      endTime: new Date(selectedSlot.endTime),
      breakAfterMinutes: 0, // ⭐ Đặt = 0 vì đã bỏ logic nghỉ 10 phút - cho phép đặt liên tiếp
      // ⭐ FIXED: Nếu dịch vụ cần thanh toán trước, slot là "Reserved" (chưa xác nhận)
      // Khi thanh toán xong mới thành "Booked"
      status: service.isPrepaid ? 'Reserved' : 'Booked',
      appointmentId: null // Sẽ update sau khi tạo appointment
    });

    console.log('✅ Đã tạo Timeslot:', newTimeslot._id);

    // Xác định type dựa vào category
    let appointmentType;
    if (service.category === 'Consultation') {
      appointmentType = 'Consultation';
    } else if (service.category === 'Examination') {
      appointmentType = 'Examination';
    } else {
      appointmentType = 'Consultation'; // Mặc định
    }

    // Xác định status và expireAt dựa vào isPrepaid
    let appointmentStatus = 'Pending';
    let paymentHoldExpiresAt = null;
    
    if (service.isPrepaid) {
      // Nếu cần thanh toán trước, set status PendingPayment và expire sau 3 phút (cho demo)
      appointmentStatus = 'PendingPayment';
      paymentHoldExpiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 phút (demo)
      console.log('💳 Appointment cần thanh toán trước, giữ slot đến:', paymentHoldExpiresAt);
    }

    // Tạo appointment mới
    console.log('✅ Tạo appointment với data:', {
      patientUserId,
      customerId,
      doctorUserId,
      serviceId,
      status: appointmentStatus,
      type: appointmentType,
      mode: appointmentMode
    });

    const newAppointment = await Appointment.create({
      patientUserId, // Người đặt lịch (booker)
      customerId, // null nếu đặt cho bản thân, có giá trị nếu đặt cho người khác
      doctorUserId,
      serviceId,
      timeslotId: newTimeslot._id,
      status: appointmentStatus, // 'PendingPayment' nếu isPrepaid, 'Pending' nếu không
      type: appointmentType, // Dựa vào service.category
      mode: appointmentMode, // Consultation=Online, Examination=Offline
      notes: notes || null,
      bookedByUserId: patientUserId,
      paymentHoldExpiresAt: paymentHoldExpiresAt,
      appointmentFor: appointmentFor || 'self', // ⭐ THÊM: Lưu appointmentFor
      // ⭐ THÊM: Lưu promotion info
      promotionId: promotionData.promotionInfo?.promotionId || null,
      originalPrice: originalPrice,
      finalPrice: finalPrice,
      discountAmount: promotionData.discountAmount
    });

    // ⭐ Cập nhật số điện thoại vào hồ sơ cá nhân khi đặt cho bản thân
    try {
      if ((appointmentFor === 'self' || !appointmentFor) && phoneNumber) {
        const currentPhone = patient.phoneNumber;
        if (!currentPhone || String(currentPhone) !== String(phoneNumber)) {
          await User.findByIdAndUpdate(patientUserId, { phoneNumber: phoneNumber });
          console.log('✅ Đã cập nhật phoneNumber cho user:', patientUserId, phoneNumber);
        }
      }
    } catch (phoneErr) {
      console.warn('⚠️ Không thể cập nhật phoneNumber cho user:', phoneErr?.message);
    }
    console.log('✅ Appointment đã được tạo:', {
      id: newAppointment._id,
      patientUserId: newAppointment.patientUserId,
      customerId: newAppointment.customerId,
      appointmentFor: newAppointment.appointmentFor,
      status: newAppointment.status
    });

    // Update timeslot với appointmentId
    // ⭐ FIXED: Update status thành "Reserved" nếu cần thanh toán
    await Timeslot.findByIdAndUpdate(newTimeslot._id, {
      appointmentId: newAppointment._id,
      status: service.isPrepaid ? 'Reserved' : 'Booked'
    });

    // Nếu cần thanh toán trước, tạo Payment record và QR code
    let paymentRecord = null;
    let qrData = null;
    
    if (service.isPrepaid) {
      const paymentService = require('./payment.service');
      
      // Xác định tên khách hàng để hiển thị trên QR
      let customerName = patient.fullName; // Mặc định là người đặt lịch
      if (customerId) {
        // Nếu đặt cho người khác, dùng tên customer
        const customer = await Customer.findById(customerId);
        if (customer) {
          customerName = customer.fullName;
        }
      }
      
      const paymentResult = await paymentService.createPayment({
        appointmentId: newAppointment._id,
        patientUserId: patientUserId,
        amount: finalPrice, // ⭐ Sửa: Dùng finalPrice thay vì service.price
        holdExpiresAt: paymentHoldExpiresAt,
        customerName: customerName // Tên sẽ hiển thị trên QR
      });

      paymentRecord = paymentResult.payment;
      qrData = paymentResult.qrData;

      // Update appointment với paymentId
      await Appointment.findByIdAndUpdate(newAppointment._id, {
        paymentId: paymentRecord._id
      });

      console.log('✅ Đã tạo Payment record:', paymentRecord._id);
      console.log('💰 Số tiền cần thanh toán:', finalPrice, 'VND');
      console.log('📱 QR Code:', qrData.qrUrl);
    }

    // Populate thông tin đầy đủ
    const populatedAppointment = await Appointment.findById(newAppointment._id)
      .populate('patientUserId', 'fullName email')
      .populate('doctorUserId', 'fullName email')
      .populate('serviceId', 'serviceName price durationMinutes category isPrepaid')
      .populate('timeslotId', 'startTime endTime')
      .populate('customerId', 'fullName email phoneNumber')
      .populate('paymentId');

    console.log('✅ Appointment đã tạo với mode:', populatedAppointment.mode);
    console.log('✅ Status:', populatedAppointment.status);

    //Thông báo cho lễ tân 
    const listStaff = await User.find({role : "Staff"})
    try {
     await Promise.all(
    listStaff.map(s =>
      notificationService.createNotification({
        userId: s._id,
        createdByUserId: patientUserId,
        title: 'Lịch khám mới đã được đặt',
        message: `Đã có bệnh nhân đặt lịch khám mới`,
        relatedAppointmentId: newAppointment._id,
        link: null,
      })
    )
  );
} catch (notifError) {
  console.warn('⚠️ Lỗi gửi notification cho staff:', notifError.message);
}


    // Chuẩn hóa response cho FE: trả requirePayment và thông tin QR nếu cần
    const responsePayload = {
      appointmentId: String(populatedAppointment._id),
      service: populatedAppointment.serviceId?.serviceName,
      doctor: populatedAppointment.doctorUserId?.fullName,
      startTime: populatedAppointment.timeslotId?.startTime,
      endTime: populatedAppointment.timeslotId?.endTime,
      status: populatedAppointment.status,
      type: populatedAppointment.type,
      mode: populatedAppointment.mode,
      requirePayment: !!service.isPrepaid
    };

    if (service.isPrepaid && paymentRecord) {
      responsePayload.payment = {
        paymentId: String(paymentRecord._id),
        amount: service.price,
        method: paymentRecord.method,
        status: paymentRecord.status,
        expiresAt: paymentRecord.holdExpiresAt,
        QRurl: paymentRecord.QRurl || (qrData ? qrData.qrUrl : null)
      };
    }

    return responsePayload;
  }

  /**
   * Tạo lịch hẹn khám trực tiếp (walk-in) bởi Staff/Manager
   * - Bỏ qua thanh toán trước (nếu có), luôn đặt Timeslot 'Booked' và Appointment 'Approved'
   * - Mode luôn 'Offline'
   * - Luôn coi là đặt cho 'other' với thông tin khách vãng lai (fullName, email, phoneNumber)
   */
  async createWalkInAppointment(appointmentData) {
    const {
      staffUserId,
      doctorUserId,
      serviceId,
      doctorScheduleId,
      selectedSlot, // { startTime, endTime }
      notes,
      fullName,
      email,
      phoneNumber
    } = appointmentData;

    // Validate cơ bản
    if (!staffUserId) throw new Error('Thiếu thông tin người tạo (staffUserId)');
    if (!doctorUserId || !serviceId || !doctorScheduleId || !selectedSlot) {
      throw new Error('Vui lòng cung cấp đủ: dịch vụ, bác sĩ, lịch làm việc và khung giờ');
    }
    if (!selectedSlot.startTime || !selectedSlot.endTime) {
      throw new Error('Khung giờ không hợp lệ');
    }
    if (!fullName || !email || !phoneNumber) {
      throw new Error('Vui lòng nhập đầy đủ họ tên, email và số điện thoại của bệnh nhân');
    }

    // Kiểm tra service
    const service = await Service.findById(serviceId);
    if (!service) throw new Error('Dịch vụ không tồn tại');
    if (service.status !== 'Active') throw new Error('Dịch vụ hiện không khả dụng');

    // Mode luôn Offline (walk-in)
    const appointmentMode = 'Offline';
    // Type dựa vào category (mặc định Examination nếu không rõ)
    const appointmentType = service.category === 'Consultation' ? 'Consultation' : 'Examination';

    // Validate doctor schedule
    const schedule = await DoctorSchedule.findById(doctorScheduleId);
    if (!schedule) throw new Error('Lịch làm việc của bác sĩ không tồn tại');

    // Validate doctor
    const doctor = await User.findById(doctorUserId);
    if (!doctor || doctor.role !== 'Doctor') throw new Error('Bác sĩ không hợp lệ');
    if (doctor.status !== 'Active') throw new Error('Bác sĩ hiện không khả dụng');

    // Validate not in the past
    const slotStartTime = new Date(selectedSlot.startTime);
    const slotEndTime = new Date(selectedSlot.endTime);
    if (slotStartTime.getTime() < Date.now()) {
      throw new Error('Không thể đặt thời gian ở quá khứ');
    }

    // Check conflict timeslot (KHÔNG cộng buffer)
    const conflictingTimeslots = await Timeslot.find({
      doctorUserId,
      startTime: { $lt: slotEndTime },
      endTime: { $gt: slotStartTime },
      status: { $in: ['Reserved', 'Booked'] }
    });
    if (conflictingTimeslots.length > 0) {
      throw new Error('Khung giờ đã được đặt. Vui lòng chọn thời gian khác.');
    }

    // Validate duration khớp service
    const slotDurationMinutes = (slotEndTime - slotStartTime) / 60000;
    if (slotDurationMinutes !== service.durationMinutes) {
      throw new Error(`Khung giờ không hợp lệ. Dịch vụ cần ${service.durationMinutes} phút, bạn chọn ${slotDurationMinutes} phút.`);
    }

    // Tạo Customer (khách vãng lai) gắn với staff (bookedBy)
    const newCustomer = await Customer.create({
      patientUserId: staffUserId,
      fullName,
      email,
      phoneNumber,
      hasAccount: false,
      linkedUserId: null
    });

    // Tạo Timeslot (trực tiếp → Booked luôn)
    const newTimeslot = await Timeslot.create({
      doctorScheduleId: schedule._id,
      doctorUserId,
      serviceId,
      startTime: slotStartTime,
      endTime: slotEndTime,
      breakAfterMinutes: 0,
      status: 'Booked',
      appointmentId: null
    });

    // Giá với promotion (nếu có) chỉ để lưu price info, không cần payment hold
    const promotionData = await calculateServicePrice(serviceId, service.price);
    const finalPrice = promotionData.finalPrice;
    const originalPrice = promotionData.originalPrice;

    // Tạo appointment: trạng thái Approved (bệnh nhân đã đến quầy), mode Offline
    const newAppointment = await Appointment.create({
      patientUserId: staffUserId,       // Người tạo (staff)
      customerId: newCustomer._id,      // Bệnh nhân vãng lai
      doctorUserId,
      serviceId,
      timeslotId: newTimeslot._id,
      status: 'Approved',
      type: appointmentType,
      mode: appointmentMode,
      notes: notes || null,
      bookedByUserId: staffUserId,
      appointmentFor: 'other',
      promotionId: promotionData.promotionInfo?.promotionId || null,
      originalPrice,
      finalPrice,
      discountAmount: promotionData.discountAmount
    });

    // Link timeslot -> appointment
    await Timeslot.findByIdAndUpdate(newTimeslot._id, {
      appointmentId: newAppointment._id,
      status: 'Booked'
    });

    // Populate trả về
    const populated = await Appointment.findById(newAppointment._id)
      .populate('doctorUserId', 'fullName email')
      .populate('serviceId', 'serviceName price durationMinutes category')
      .populate('timeslotId', 'startTime endTime')
      .populate('customerId', 'fullName email phoneNumber')
      .populate('patientUserId', 'fullName email');

    return {
      success: true,
      message: 'Tạo lịch hẹn trực tiếp thành công',
      data: {
        appointmentId: String(populated._id),
        status: populated.status,
        type: populated.type,
        mode: populated.mode,
        doctor: populated.doctorUserId?.fullName,
        service: populated.serviceId?.serviceName,
        startTime: populated.timeslotId?.startTime,
        endTime: populated.timeslotId?.endTime,
        patientName: populated.customerId?.fullName,
        requirePayment: false
      }
    };
  }

  async reviewAppointment(appointmentId, staffUserId, action, cancelReason = null) {
    try {
      // Kiểm tra appointment tồn tại
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Không tìm thấy lịch hẹn');
      }

      // Kiểm tra action hợp lệ
      if (!['approve', 'cancel'].includes(action)) {
        throw new Error('Action phải là "approve" hoặc "cancel"');
      }

      // Kiểm tra appointment status có thể review không
      if (!['Pending', 'Approved'].includes(appointment.status)) {
        throw new Error(`Không thể xử lý lịch hẹn ở trạng thái ${appointment.status}`);
      }

      // Nếu là PendingPayment, không được phép xử lý
      if (appointment.status === 'PendingPayment') {
        throw new Error('Lịch hẹn đang chờ thanh toán. Vui lòng chờ khách hàng thanh toán hoặc hủy yêu cầu này.');
      }

      // Lấy đầy đủ thông tin
      const populatedAppointment = await Appointment.findById(appointmentId)
        .populate('patientUserId', 'fullName email')
        .populate('customerId', 'fullName email phoneNumber')
        .populate('doctorUserId', 'fullName email')
        .populate('serviceId', 'serviceName price durationMinutes category')
        .populate('timeslotId', 'startTime endTime');

      // Xác định người nhận email
      let emailRecipient, recipientName;
      if (populatedAppointment.customerId) {
        emailRecipient = populatedAppointment.customerId.email;
        recipientName = populatedAppointment.customerId.fullName;
      } else {
        emailRecipient = populatedAppointment.patientUserId.email;
        recipientName = populatedAppointment.patientUserId.fullName;
      }

      // Các biến dùng chung
      let updatedAppointment;
      let emailData;
      const emailService = require('./email.service');

      // ========== APPROVE ACTION ==========
      if (action === 'approve') {
        console.log('✅ Duyệt lịch hẹn...');

        // ⭐ Nếu là Consultation (Online), tạo Google Meet link
        let meetLink = null;
        if (populatedAppointment.mode === 'Online' && populatedAppointment.type === 'Consultation') {
          console.log('📞 Tạo Google Meet link cho tư vấn online...');
          
          const googleMeetService = require('./googleMeetService');
          
          try {
            meetLink = await googleMeetService.generateMeetLink({
              appointmentId: appointmentId,
              doctorName: populatedAppointment.doctorUserId.fullName,
              patientName: recipientName,
              startTime: populatedAppointment.timeslotId.startTime,
              endTime: populatedAppointment.timeslotId.endTime,
              serviceName: populatedAppointment.serviceId.serviceName
            });
            console.log('✅ Google Meet link đã tạo:', meetLink);
          } catch (meetError) {
            console.error('❌ Lỗi tạo Google Meet link:', meetError.message);
            // Vẫn tiếp tục, fallback link được xử lý trong service
          }
        }

        // Update status sang Approved
        updatedAppointment = await Appointment.findByIdAndUpdate(
          appointmentId,
          {
            status: 'Approved',
            approvedByUserId: staffUserId,
            linkMeetUrl: meetLink
          },
          { new: true }
        )
          .populate('patientUserId', 'fullName email')
          .populate('customerId', 'fullName email phoneNumber')
          .populate('doctorUserId', 'fullName email')
          .populate('serviceId', 'serviceName price durationMinutes category')
          .populate('timeslotId', 'startTime endTime');

        console.log('✅ Appointment updated:', updatedAppointment._id);

        // Prepare email
        emailData = {
          fullName: recipientName,
          serviceName: updatedAppointment.serviceId.serviceName,
          doctorName: updatedAppointment.doctorUserId.fullName,
          startTime: updatedAppointment.timeslotId.startTime,
          endTime: updatedAppointment.timeslotId.endTime,
          type: updatedAppointment.type,
          mode: updatedAppointment.mode,
          meetLink: updatedAppointment.linkMeetUrl
        };

        // ⭐ GỬI EMAIL ASYNC (NON-BLOCKING) - Không chờ xong mới trả response
        (async () => {
          try {
            console.log('📧 Bắt đầu gửi email xác nhận duyệt...');
            await emailService.sendAppointmentApprovedEmail(emailRecipient, emailData);
            console.log(`✅ Email xác nhận duyệt đã gửi thành công đến: ${emailRecipient}`);
          } catch (emailError) {
            console.error('❌ Lỗi gửi email xác nhận duyệt:', emailError.message);
            console.error('📧 Email recipient:', emailRecipient);
            console.error('📧 Error details:', emailError);
          }
        })();

        // ⭐ GỬI NOTIFICATION CHO BỆNH NHÂN
        try {
          const patientUserId = updatedAppointment.patientUserId?._id || updatedAppointment.patientUserId;
          if (patientUserId) {
            const appointmentDate = new Date(updatedAppointment.timeslotId.startTime);
            const dateStr = appointmentDate.toLocaleDateString('vi-VN');
            const timeStr = appointmentDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            
            await notificationService.createNotification({
              userId: patientUserId,
              createdByUserId: staffUserId,
              title: 'Lịch khám của bạn đã được duyệt',
              message: `Lịch khám ${updatedAppointment.serviceId?.serviceName || ''} với bác sĩ ${updatedAppointment.doctorUserId?.fullName || ''} vào ${dateStr} lúc ${timeStr} đã được duyệt.${updatedAppointment.linkMeetUrl ? ' Kiểm tra link Google Meet trong chi tiết lịch hẹn.' : ''}`,
              relatedAppointmentId: appointmentId,
              link: `/patient/appointments`,
            });
            console.log('✅ Đã tạo notification cho bệnh nhân về việc duyệt lịch');
          }
        } catch (notifError) {
          console.warn('⚠️ Lỗi gửi notification bệnh nhân:', notifError.message);
        }

        // ⭐ TRẢ RESPONSE NGAY (response không chờ email)
        return {
          success: true,
          message: 'Lịch hẹn đã được duyệt. Email xác nhận sẽ được gửi trong vài giây',
          data: updatedAppointment
        };
      }

      // ========== CANCEL ACTION ==========
      if (action === 'cancel') {
        console.log('❌ Hủy lịch hẹn...');

        // Xóa timeslot
        if (populatedAppointment.timeslotId) {
          await Timeslot.findByIdAndUpdate(populatedAppointment.timeslotId._id, {
            status: 'Available',
            appointmentId: null
          });
          console.log('✅ Timeslot đã được release');
        }

        // Update status sang Cancelled
        updatedAppointment = await Appointment.findByIdAndUpdate(
          appointmentId,
          {
            status: 'Cancelled',
            approvedByUserId: staffUserId,
            cancelReason: cancelReason || 'Lịch hẹn đã bị hủy',
            cancelledAt: new Date()
          },
          { new: true }
        )
          .populate('patientUserId', 'fullName email')
          .populate('customerId', 'fullName email phoneNumber')
          .populate('doctorUserId', 'fullName email')
          .populate('serviceId', 'serviceName price durationMinutes category')
          .populate('timeslotId', 'startTime endTime');

        console.log('✅ Appointment cancelled:', updatedAppointment._id);

        // Prepare email với đầy đủ thông tin
        emailData = {
          fullName: recipientName,
          serviceName: updatedAppointment.serviceId?.serviceName || 'N/A',
          doctorName: updatedAppointment.doctorUserId?.fullName || 'N/A',
          startTime: updatedAppointment.timeslotId?.startTime || updatedAppointment.startTime,
          endTime: updatedAppointment.timeslotId?.endTime || updatedAppointment.endTime,
          type: updatedAppointment.type || 'Consultation',
          mode: updatedAppointment.mode || 'Online',
          cancelReason: cancelReason || 'Lịch hẹn đã bị hủy',
          appointmentId: updatedAppointment._id?.toString() || appointmentId,
          patientPhone: updatedAppointment.patientUserId?.phoneNumber || updatedAppointment.customerId?.phoneNumber || 'N/A',
          patientEmail: emailRecipient,
          servicePrice: updatedAppointment.serviceId?.price || 0,
          serviceDuration: updatedAppointment.serviceId?.durationMinutes || 30,
          cancelledAt: new Date().toISOString()
        };

        // ⭐ GỬI EMAIL ASYNC (NON-BLOCKING) - Không chờ xong mới trả response
        (async () => {
          try {
            console.log('📧 Bắt đầu gửi email thông báo hủy lịch...');
            await emailService.sendAppointmentCancelledEmail(emailRecipient, emailData);
            console.log(`✅ Email thông báo hủy lịch đã gửi thành công đến: ${emailRecipient}`);
          } catch (emailError) {
            console.error('❌ Lỗi gửi email thông báo hủy:', emailError.message);
            console.error('📧 Email recipient:', emailRecipient);
            console.error('📧 Error details:', emailError);
          }
        })();

        // ⭐ GỬI NOTIFICATION CHO BỆNH NHÂN
        try {
          const patientUserId = updatedAppointment.patientUserId?._id || updatedAppointment.patientUserId;
          if (patientUserId) {
            await notificationService.createNotification({
              userId: patientUserId,
              createdByUserId: staffUserId,
              title: 'Lịch khám của bạn đã bị hủy',
              message: `Lịch khám ${updatedAppointment.serviceId?.serviceName || 'của bạn'} với bác sĩ ${updatedAppointment.doctorUserId?.fullName || ''} đã bị hủy. ${cancelReason ? `Lý do: ${cancelReason}` : ''}`,
              relatedAppointmentId: appointmentId,
              link: `/patient/appointments`,
            });
            console.log('✅ Đã tạo notification cho bệnh nhân về việc hủy lịch');
          }
        } catch (notifError) {
          console.warn('⚠️ Lỗi gửi notification bệnh nhân:', notifError.message);
        }

        // ⭐ TRẢ RESPONSE NGAY (response không chờ email)
        return {
          success: true,
          message: 'Lịch hẹn đã bị hủy. Email thông báo sẽ được gửi trong vài giây',
          data: updatedAppointment
        };
      }

    } catch (error) {
      console.error('❌ Lỗi xử lý lịch hẹn:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách lịch hẹn chờ duyệt (Pending)
   * Dùng cho staff review - HIỂN THỊ TẤT CẢ (không giới hạn thời gian)
   * ⚠️ CHỈ hiển thị lịch "Pending" - không hiển thị "PendingPayment"
   * (PendingPayment đang chờ thanh toán, chưa cần Staff duyệt)
   */
  async getPendingAppointments(filters = {}) {
    try {
      const query = {
        status: 'Pending' // ⭐ CHỈ lấy Pending, KHÔNG lấy PendingPayment
      };

      // ⭐ Có thể filter theo doctor (nếu cần)
      if (filters.doctorUserId) {
        query.doctorUserId = filters.doctorUserId;
      }

      // ⚠️ BỎ FILTER THEO THỜI GIAN - Staff cần xem TẤT CẢ lịch pending
      // Staff cần duyệt/từ chối tất cả các yêu cầu bệnh nhân gửi đến,
      // không quan tâm ngày gửi là bao giờ

      const appointments = await Appointment.find(query)
        .populate('patientUserId', 'fullName email phoneNumber')
        .populate('customerId', 'fullName email phoneNumber')
        .populate('doctorUserId', 'fullName email')
        .populate('serviceId', 'serviceName price durationMinutes category')
        .populate('timeslotId', 'startTime endTime')
        .sort({ createdAt: -1 }); // Sắp xếp mới nhất trước

      console.log(`📋 Staff - Lấy ${appointments.length} lịch hẹn "Pending" (TẤT CẢ thời gian, không bao gồm PendingPayment)`);

      return {
        success: true,
        data: appointments,
        count: appointments.length
      };
    } catch (error) {
      console.error('❌ Lỗi lấy danh sách lịch hẹn:', error);
      throw error;
    }
  }

  /**
   * Helper: Check và update expired appointments realtime
   * @private
   */
  async _checkAndUpdateExpiredAppointments(appointments) {
    const now = new Date();
    let updatedCount = 0;

    for (const appointment of appointments) {
      // Chỉ check appointments đang "Pending"
      if (appointment.status !== 'Pending') continue;
      
      if (!appointment.timeslotId || !appointment.timeslotId.startTime) continue;

      // Lấy ngày khám từ timeslot
      const appointmentDate = new Date(appointment.timeslotId.startTime);
      
      // Tạo cutoff time: 18:00 UTC của ngày hẹn
      const cutoffTime = new Date(appointmentDate);
      cutoffTime.setUTCHours(18, 0, 0, 0);

      // Kiểm tra: Nếu hiện tại đã qua 18:00 của ngày hẹn
      if (now >= cutoffTime) {
        appointment.status = 'Expired';
        await appointment.save();
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`⏰ [getAllAppointments] Đã expire ${updatedCount} appointment(s)`);
    }
  }

  /**
   * Lấy danh sách tất cả appointments (có filter)
   */
  async getAllAppointments(filters = {}) {
    try {
      const query = {};

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.doctorUserId) {
        query.doctorUserId = filters.doctorUserId;
      }

      if (filters.patientUserId) {
        query.patientUserId = filters.patientUserId;
      }

      if (filters.mode) {
        query.mode = filters.mode;
      }

      if (filters.type) {
        query.type = filters.type;
      }

      const appointments = await Appointment.find(query)
        .populate('patientUserId', 'fullName email')
        .populate('customerId', 'fullName email')
        .populate('doctorUserId', 'fullName email')
        .populate('replacedDoctorUserId', 'fullName email')
        .populate('serviceId', 'serviceName price')
        .populate('timeslotId', 'startTime endTime')
        .sort({ createdAt: -1 });

      // ⭐ Check và update expired appointments realtime (deprecated - use AppointmentMonitorService instead)
      // await this._checkAndUpdateExpiredAppointments(appointments);

      // Lấy lại data sau khi update (nếu có thay đổi)
      const updatedAppointments = await Appointment.find(query)
        .populate('patientUserId', 'fullName email')
        .populate('customerId', 'fullName email')
        .populate('doctorUserId', '_id fullName email') // ⭐ Thêm _id để frontend có thể extract
        .populate('replacedDoctorUserId', '_id fullName email') // ⭐ Thêm _id để frontend có thể extract
        .populate('serviceId', 'serviceName price')
        .populate('timeslotId', 'startTime endTime')
        .sort({ createdAt: -1 })
        .lean();

      // ⭐ Thêm doctor status vào mỗi appointment để FE biết doctor có "On Leave" không
      const Doctor = require('../models/doctor.model');
      
      // Lấy tất cả doctorUserIds từ appointments
      const doctorUserIds = updatedAppointments
        .filter(apt => apt.doctorUserId && apt.doctorUserId._id)
        .map(apt => apt.doctorUserId._id);
      
      // Fetch tất cả doctors cùng lúc (tránh N+1 queries)
      const doctors = await Doctor.find({
        doctorUserId: { $in: doctorUserIds }
      }).select('doctorUserId status').lean();
      
      // Tạo map để lookup nhanh
      const doctorStatusMap = new Map();
      doctors.forEach(doctor => {
        doctorStatusMap.set(doctor.doctorUserId.toString(), doctor.status);
      });
      
      // Thêm doctorStatus vào mỗi appointment
      const appointmentsWithDoctorStatus = updatedAppointments.map((apt) => {
        if (apt.doctorUserId && apt.doctorUserId._id) {
          const doctorStatus = doctorStatusMap.get(apt.doctorUserId._id.toString());
          if (doctorStatus) {
            apt.doctorStatus = doctorStatus;
          }
        }
        return apt;
      });

      // ⭐ KHÔNG filter appointments ở đây - để staff view vẫn thấy tất cả
      // Frontend sẽ check và hiển thị "Not Available" ở cột bác sĩ khi có leave
      // Doctor view sẽ filter riêng trong getDoctorAppointmentsSchedule

      return {
        success: true,
        data: appointmentsWithDoctorStatus,
        count: appointmentsWithDoctorStatus.length
      };
    } catch (error) {
      console.error('❌ Lỗi lấy danh sách lịch hẹn:', error);
      throw error;
    }
  }

  /**
   * Lấy tất cả ca khám của một người dùng
   */
  async getUserAppointments(userId, options = {}) {
    try {
      // Build query
      const query = {};

      // ⭐ Bao phủ cả 2 trường hợp:
      // 1) Ca do chính user đặt → match theo patientUserId
      // 2) Ca Walk-in do staff tạo trước khi user đăng ký, nhưng email trùng → match theo customerId có cùng email
      const User = require('../models/user.model');
      const Customer = require('../models/customer.model');

      const user = await User.findById(userId).select('email').lean();
      const userEmail = user?.email || null;

      let emailCustomerIds = [];
      if (userEmail) {
        const customers = await Customer.find({ email: userEmail })
          .select('_id')
          .lean();
        emailCustomerIds = customers.map(c => c._id);
      }

      if (emailCustomerIds.length > 0) {
        query.$or = [
          { patientUserId: userId },
          { customerId: { $in: emailCustomerIds } },
        ];
      } else {
        query.patientUserId = userId;
      }

      console.log('🔍 [getUserAppointments] Query với userId:', userId);

      // Lọc theo status cụ thể nếu có
      if (options.status) {
        query.status = options.status;
      } else {
        // Mặc định: Lấy tất cả các ca khám ĐÃ HOÀN TẤT ĐẶT LỊCH
        // (bao gồm cả đặt lịch khám không cần thanh toán trước và tư vấn đã thanh toán)
        // NGOẠI TRỪ "PendingPayment" (đang chờ thanh toán cho tư vấn online)
        if (options.includePendingPayment) {
          // Lấy tất cả bao gồm cả PendingPayment
          query.status = { $in: ['PendingPayment', 'Pending', 'Approved', 'CheckedIn', 'InProgress', 'Completed', 'Cancelled', 'Expired'] };
        } else {
          // Mặc định: Chỉ lấy các ca đã hoàn tất đặt lịch (đã thanh toán nếu cần)
          query.status = { $in: ['Pending', 'Approved', 'CheckedIn', 'InProgress', 'Completed', 'Cancelled', 'Expired'] };
        }
      }

      console.log('🔍 [getUserAppointments] Final query:', JSON.stringify(query));

      const appointments = await Appointment.find(query)
        .populate('patientUserId', 'fullName email phoneNumber')
        .populate('doctorUserId', '_id fullName email specialization')
        .populate('serviceId', 'serviceName price category durationMinutes')
        .populate('timeslotId', 'startTime endTime')
        .populate('customerId', 'fullName email phoneNumber')
        .populate('paymentId') // ⭐ Populate tất cả fields của paymentId để có _id
        .populate('replacedDoctorUserId', '_id fullName email') // ⭐ Populate replaced doctor
        .sort({ createdAt: -1 })
        .lean(); // Sắp xếp theo thời gian tạo mới nhất

      // ⭐ Thêm doctor status vào mỗi appointment để FE biết doctor có "On Leave" không
      const Doctor = require('../models/doctor.model');
      
      // Lấy tất cả doctorUserIds từ appointments
      const doctorUserIds = appointments
        .filter(apt => apt.doctorUserId && apt.doctorUserId._id)
        .map(apt => apt.doctorUserId._id);
      
      // Fetch tất cả doctors cùng lúc (tránh N+1 queries)
      const doctors = await Doctor.find({
        doctorUserId: { $in: doctorUserIds }
      }).select('doctorUserId status').lean();
      
      // Tạo map để lookup nhanh
      const doctorStatusMap = new Map();
      doctors.forEach(doctor => {
        doctorStatusMap.set(doctor.doctorUserId.toString(), doctor.status);
      });
      
      // Thêm doctorStatus vào mỗi appointment
      const appointmentsWithDoctorStatus = appointments.map((apt) => {
        if (apt.doctorUserId && apt.doctorUserId._id) {
          const doctorStatus = doctorStatusMap.get(apt.doctorUserId._id.toString());
          if (doctorStatus) {
            apt.doctorStatus = doctorStatus;
          }
        }
        return apt;
      });

      console.log('✅ [getUserAppointments] Tìm thấy:', appointmentsWithDoctorStatus.length, 'appointments');
      console.log('📋 [getUserAppointments] Appointments:', appointmentsWithDoctorStatus.map(apt => ({
        id: apt._id,
        status: apt.status,
        appointmentFor: apt.appointmentFor,
        patientUserId: apt.patientUserId?._id,
        customerId: apt.customerId?._id,
        customerName: apt.customerId?.fullName,
        serviceName: apt.serviceId?.serviceName
      })));

      // Trả về đúng format mà frontend expect
      return appointmentsWithDoctorStatus.map(apt => ({
        _id: apt._id.toString(),
        status: apt.status,
        type: apt.type,
        mode: apt.mode,
        appointmentFor: apt.appointmentFor || 'self',
        patientUserId: apt.patientUserId ? {
          fullName: apt.patientUserId.fullName,
          email: apt.patientUserId.email,
          phoneNumber: apt.patientUserId.phoneNumber
        } : null,
        doctorUserId: apt.doctorUserId ? {
  _id: apt.doctorUserId._id?.toString() || apt.doctorUserId._id,
  fullName: apt.doctorUserId.fullName,
  email: apt.doctorUserId.email,
  specialization: apt.doctorUserId.specialization
} : null,
        serviceId: apt.serviceId ? {
          serviceName: apt.serviceId.serviceName,
          price: apt.serviceId.price,
          category: apt.serviceId.category,
          durationMinutes: apt.serviceId.durationMinutes
        } : null,
        timeslotId: apt.timeslotId ? {
          startTime: apt.timeslotId.startTime,
          endTime: apt.timeslotId.endTime
        } : null,
        customerId: apt.customerId ? {
          fullName: apt.customerId.fullName,
          email: apt.customerId.email,
          phoneNumber: apt.customerId.phoneNumber
        } : null,
        paymentId: apt.paymentId ? {
          _id: apt.paymentId._id?.toString() || apt.paymentId._id || null,
          status: apt.paymentId.status,
          amount: apt.paymentId.amount,
          method: apt.paymentId.method
        } : null,
        notes: apt.notes || '',
        linkMeetUrl: apt.linkMeetUrl || null,
        checkedInAt: apt.checkedInAt || null,
        createdAt: apt.createdAt,
        updatedAt: apt.updatedAt,
replacedDoctorUserId: apt.replacedDoctorUserId ? {
  _id: apt.replacedDoctorUserId._id?.toString() || apt.replacedDoctorUserId._id,
  fullName: apt.replacedDoctorUserId.fullName,
  email: apt.replacedDoctorUserId.email,
  specialization: apt.replacedDoctorUserId.specialization
} : null,
        confirmDeadline: apt.confirmDeadline || null,
        doctorStatus: apt.doctorStatus || null // ⭐ Thêm doctorStatus
      }));
    } catch (error) {
      console.error('❌ Lỗi lấy ca khám của user:', error);
      throw error;
    }
  }

  /**
   * Cập nhật trạng thái ca khám
   * - Staff: Approved → CheckedIn (check-in bệnh nhân)
   */
  async updateAppointmentStatus(appointmentId, newStatus, userId) {
    try {
      console.log(`🔄 Cập nhật trạng thái ca khám ${appointmentId} → ${newStatus}`);

      // Tìm appointment
      const appointment = await Appointment.findById(appointmentId)
        .populate('doctorUserId', '_id')
        .populate('replacedDoctorUserId', '_id')
        .populate('timeslotId', 'startTime');
      if (!appointment) {
        throw new Error('Không tìm thấy lịch hẹn');
      }

      // ⚠️ Kiểm tra logic chuyển trạng thái
      const currentStatus = appointment.status;

      // ✅ Allowed transitions:
      // Approved → CheckedIn (Staff/Nurse check-in bệnh nhân đã đến)
      // CheckedIn → InProgress (Nurse bắt đầu ca khám)
      // InProgress → Completed (kết thúc ca)
      // Approved/CheckedIn/InProgress → Cancelled (hủy)

      if (newStatus === 'CheckedIn') {
        // Cho phép check-in từ Approved hoặc từ No-Show
        if (!['Approved', 'No-Show'].includes(currentStatus)) {
          throw new Error(`Không thể check-in. Ca khám phải ở trạng thái "Approved" hoặc "No-Show" (hiện tại: ${currentStatus})`);
        }

        // ⭐ Kiểm tra: Chỉ cho phép check-in khi đã đến ngày của ca khám
        if (appointment.timeslotId && appointment.timeslotId.startTime) {
          const appointmentDate = new Date(appointment.timeslotId.startTime);
          const appointmentDay = new Date(appointmentDate);
          appointmentDay.setHours(0, 0, 0, 0);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Nếu chưa đến ngày của ca khám, không cho phép check-in
          if (today.getTime() < appointmentDay.getTime()) {
            throw new Error('Không thể check-in sớm. Chỉ có thể check-in khi đã đến ngày của ca khám.');
          }
        }

        // Lưu thời gian check-in (hoặc cập nhật nếu đang chuyển lại từ No-Show)
        if (!appointment.checkedInAt) {
          appointment.checkedInAt = new Date();
          appointment.checkInByUserId = userId;
        }
      }

      if (newStatus === 'InProgress') {
        if (currentStatus !== 'CheckedIn') {
          throw new Error(`Không thể chuyển sang đang trong ca. Ca phải ở trạng thái "CheckedIn" (hiện tại: ${currentStatus})`);
        }

        // ⭐ KIỂM TRA: Nếu bác sĩ đang On Leave, không cho phép chuyển sang InProgress
        // Chỉ cho phép khi đã có bác sĩ thay thế và đã được confirm
        
        // Lấy doctorUserId hiện tại (bác sĩ đang được gán trong appointment)
        const currentDoctorId = appointment.doctorUserId?._id || appointment.doctorUserId;
        
        if (currentDoctorId) {
          const currentDoctor = await Doctor.findOne({ doctorUserId: currentDoctorId }).select('status');
          
          // Nếu bác sĩ hiện tại đang On Leave
          if (currentDoctor && currentDoctor.status === 'On Leave') {
            // Kiểm tra xem đã có bác sĩ thay thế chưa
            const replacedDoctorId = appointment.replacedDoctorUserId?._id || appointment.replacedDoctorUserId;
            
            if (!replacedDoctorId) {
              // Chưa có bác sĩ thay thế → không cho phép
              throw new Error('Không thể bắt đầu ca khám. Bác sĩ hiện tại đang vắng mặt. Vui lòng gán bác sĩ mới trước khi bắt đầu ca khám.');
            }
            
            // Đã có bác sĩ thay thế, kiểm tra xem đã được confirm chưa
            // Nếu doctorUserId = replacedDoctorUserId → đã confirm
            if (currentDoctorId.toString() === replacedDoctorId.toString()) {
              // Đã confirm, kiểm tra bác sĩ mới có On Leave không
              const newDoctor = await Doctor.findOne({ doctorUserId: replacedDoctorId }).select('status');
              if (newDoctor && newDoctor.status === 'On Leave') {
                throw new Error('Không thể bắt đầu ca khám. Bác sĩ thay thế đang vắng mặt. Vui lòng gán bác sĩ khác.');
              }
            } else {
              // Chưa confirm (doctorUserId vẫn là bác sĩ cũ, replacedDoctorUserId là bác sĩ mới chờ confirm)
              throw new Error('Không thể bắt đầu ca khám. Bác sĩ thay thế chưa được xác nhận. Vui lòng đợi bệnh nhân xác nhận hoặc gán bác sĩ khác.');
            }
          }
        }

        appointment.inProgressAt = new Date();
        appointment.inProgressByUserId = userId;
      }

      if (newStatus === 'Completed') {
        if (!['CheckedIn', 'InProgress'].includes(currentStatus)) {
          throw new Error(`Không thể hoàn thành. Ca khám phải ở trạng thái "CheckedIn" hoặc "InProgress" (hiện tại: ${currentStatus})`);
        }
      }

      if (newStatus === 'Cancelled') {
        const allowedStatuses = ['Approved', 'CheckedIn', 'InProgress'];
        if (!allowedStatuses.includes(currentStatus)) {
          throw new Error(`Không thể hủy. Ca khám chỉ có thể hủy khi ở trạng thái Approved, CheckedIn hoặc InProgress (hiện tại: ${currentStatus})`);
        }
      }

      // Cập nhật trạng thái
      appointment.status = newStatus;
      appointment.updatedAt = new Date();

      // Lưu thông tin người thực hiện (Staff/Nurse)
      if (!appointment.updatedBy) {
        appointment.updatedBy = userId;
      }

      await appointment.save();

      // Nếu hủy thì mở lại timeslot để có thể đặt lại
      if (newStatus === 'Cancelled' && appointment.timeslotId) {
        try {
          await Timeslot.findByIdAndUpdate(appointment.timeslotId, {
            status: 'Available',
            appointmentId: null
          });
          console.log('🔓 Timeslot released due to status update → Cancelled');
        } catch (e) {
          console.error('⚠️ Không thể release timeslot khi cập nhật trạng thái:', e);
        }
      }

      console.log(`✅ Cập nhật trạng thái thành công: ${currentStatus} → ${newStatus}`);

      return {
        success: true,
        message: `Cập nhật trạng thái ca khám thành công: ${currentStatus} → ${newStatus}`,
        data: {
          appointmentId: appointment._id,
          oldStatus: currentStatus,
          newStatus: newStatus,
          updatedAt: appointment.updatedAt
        }
      };

    } catch (error) {
      console.error('❌ Lỗi cập nhật trạng thái ca khám:', error);
      throw error;
    }
  }

  /**
   * Hủy appointment
   */
  async cancelAppointment({ appointmentId, userId, cancelReason, bankInfo = null }) {
    try {
      console.log(`🔄 Hủy appointment ${appointmentId}`);
      console.log(`   - Type: ${typeof appointmentId}`);
      console.log(`   - Value: ${appointmentId}`);

      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Không tìm thấy lịch hẹn');
      }

      // Kiểm tra trạng thái có thể hủy được không
      const cancellableStatuses = ['Pending', 'Approved', 'PendingPayment'];
      if (!cancellableStatuses.includes(appointment.status)) {
        throw new Error('Lịch hẹn này không thể hủy được');
      }

      // Cập nhật thông tin hủy
      appointment.status = 'Cancelled';
      appointment.cancelReason = cancelReason || 'Người dùng hủy lịch hẹn';
      appointment.cancelledAt = new Date();
      appointment.updatedAt = new Date();
      
        // Lưu thông tin ngân hàng nếu có
        if (bankInfo) {
          appointment.bankInfo = {
            accountHolderName: bankInfo.accountHolderName || null,
            accountNumber: bankInfo.accountNumber || null,
            bankName: bankInfo.bankName || null
          };
        }

      await appointment.save();

      // ⭐ Nếu appointment đang ở trạng thái PendingPayment, cập nhật payment status thành Cancelled
      if (appointment.paymentId) {
        try {
          const Payment = require('../models/payment.model');
          const payment = await Payment.findById(appointment.paymentId);
          if (payment && payment.status === 'Pending') {
            payment.status = 'Cancelled';
            await payment.save();
            console.log(`✅ Payment ${payment._id} đã được cập nhật thành Cancelled do hủy appointment`);
          }
        } catch (e) {
          console.error('⚠️ Không thể cập nhật payment status khi hủy appointment:', e);
        }
      }

      // ⭐ Release the reserved/booked timeslot so others can book it again
      if (appointment.timeslotId) {
        try {
          const timeslot = await Timeslot.findById(appointment.timeslotId);
          if (timeslot) {
            timeslot.status = 'Available';
            timeslot.appointmentId = null;
            await timeslot.save();
            console.log(`🔓 Timeslot ${timeslot._id} released back to Available`);
          }
        } catch (e) {
          console.error('⚠️ Không thể cập nhật trạng thái timeslot khi hủy lịch:', e);
        }
      }

      console.log(`✅ Hủy appointment thành công: ${appointmentId}`);

      return {
        success: true,
        message: 'Hủy lịch hẹn thành công',
        data: {
          appointmentId: appointment._id,
          status: appointment.status,
          cancelledAt: appointment.cancelledAt,
          cancelReason: appointment.cancelReason
        }
      };

    } catch (error) {
      console.error('❌ Lỗi hủy appointment:', error);
      throw error;
    }
  }

  // Lấy appointment by ID với đầy đủ thông tin
  async getAppointmentById(appointmentId) {
    try {
      const appointment = await Appointment.findById(appointmentId)
        .populate('serviceId', 'serviceName price')
        .populate('doctorUserId', 'fullName email phoneNumber')
        .populate('patientUserId', 'fullName email phoneNumber')
        .populate('timeslotId', 'startTime endTime')
        .populate('paymentId', 'amount method status')
        .lean();

      if (!appointment) {
        return null;
      }

      // Format dữ liệu để trả về
      return {
        _id: appointment._id,
        type: appointment.type,
        mode: appointment.mode,
        status: appointment.status,
        notes: appointment.notes,
        linkMeetUrl: appointment.linkMeetUrl,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
        cancelledAt: appointment.cancelledAt,
        cancelReason: appointment.cancelReason,
        bankInfo: appointment.bankInfo,
        service: {
          _id: appointment.serviceId?._id,
          serviceName: appointment.serviceId?.serviceName,
          price: appointment.serviceId?.price
        },
        doctor: {
          _id: appointment.doctorUserId?._id,
          fullName: appointment.doctorUserId?.fullName,
          email: appointment.doctorUserId?.email,
          phoneNumber: appointment.doctorUserId?.phoneNumber
        },
        patient: {
          _id: appointment.patientUserId?._id,
          fullName: appointment.patientUserId?.fullName,
          email: appointment.patientUserId?.email,
          phoneNumber: appointment.patientUserId?.phoneNumber
        },
        timeslot: {
          _id: appointment.timeslotId?._id,
          startTime: appointment.timeslotId?.startTime,
          endTime: appointment.timeslotId?.endTime
        },
        payment: appointment.paymentId ? {
          _id: appointment.paymentId._id,
          amount: appointment.paymentId.amount,
          method: appointment.paymentId.method,
          status: appointment.paymentId.status
        } : null
      };
    } catch (error) {
      console.error('❌ Lỗi lấy appointment by ID:', error);
      throw error;
    }
  }

  // Lấy chi tiết lịch hẹn
  async getAppointmentDetails(appointmentId) {
    try {
      console.log(`🔍 Lấy chi tiết lịch hẹn: ${appointmentId}`);
      
      const appointment = await Appointment.findById(appointmentId)
        .populate('patientUserId', 'fullName email phone')
        .populate('customerId', 'fullName email phoneNumber')
        .populate('doctorUserId', 'fullName email phone')
        .populate('serviceId', 'serviceName price durationMinutes category')
        .populate('timeslotId', 'startTime endTime')
        .populate('paymentId', 'amount method status expiresAt QRurl')
        .populate('bankInfo', 'accountHolderName accountNumber bankName')
        .lean();

      if (!appointment) {
        throw new Error('Không tìm thấy lịch hẹn');
      }

      // Format dữ liệu trả về
      const formattedAppointment = {
        _id: appointment._id,
        status: appointment.status,
        type: appointment.type,
        mode: appointment.mode,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        notes: appointment.notes,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
        checkedInAt: appointment.checkedInAt,
        completedAt: appointment.completedAt,
        cancelledAt: appointment.cancelledAt,
        cancelReason: appointment.cancelReason,
        patient: appointment.patientUserId ? {
          fullName: appointment.patientUserId.fullName,
          email: appointment.patientUserId.email,
          phone: appointment.patientUserId.phone
        } : null,
        customer: appointment.customerId ? {
          fullName: appointment.customerId.fullName,
          email: appointment.customerId.email,
          phone: appointment.customerId.phoneNumber
        } : null,
        doctor: appointment.doctorUserId ? {
          fullName: appointment.doctorUserId.fullName,
          email: appointment.doctorUserId.email,
          phone: appointment.doctorUserId.phone
        } : null,
        service: appointment.serviceId ? {
          serviceName: appointment.serviceId.serviceName,
          price: appointment.serviceId.price,
          durationMinutes: appointment.serviceId.durationMinutes,
          category: appointment.serviceId.category
        } : null,
        timeslot: appointment.timeslotId ? {
          startTime: appointment.timeslotId.startTime,
          endTime: appointment.timeslotId.endTime
        } : null,
        payment: appointment.paymentId ? {
          amount: appointment.paymentId.amount,
          method: appointment.paymentId.method,
          status: appointment.paymentId.status,
          expiresAt: appointment.paymentId.expiresAt,
          QRurl: appointment.paymentId.QRurl
        } : null,
        bankInfo: appointment.bankInfo ? {
          accountHolderName: appointment.bankInfo.accountHolderName,
          accountNumber: appointment.bankInfo.accountNumber,
          bankName: appointment.bankInfo.bankName
        } : null
      };

      console.log(`✅ Lấy chi tiết lịch hẹn thành công: ${appointmentId}`);
      return formattedAppointment;

    } catch (error) {
      console.error(`❌ Lỗi lấy chi tiết lịch hẹn ${appointmentId}:`, error);
      throw error;
    }
  }


  
  async assignDoctorToAppointment(appointmentId, newDoctorId, userId) {
    try {
      const appointment = await Appointment.findById(appointmentId)
        .populate('patientUserId', 'fullName email')
        .populate('doctorUserId', 'fullName')
        .populate('serviceId', 'serviceName')
        .populate('timeslotId', 'startTime endTime date');

      if (!appointment) {
        throw new Error('Lịch khám không tồn tại');
      }

      // ✅ Cho phép gán bác sĩ khi appointment ở status: Pending, Approved, CheckedIn
      // (Khi bác sĩ On Leave, staff có thể gán bác sĩ mới cho appointment đã được check-in)
      const allowedStatuses = ['Pending', 'Approved', 'CheckedIn'];
      if (!allowedStatuses.includes(appointment.status)) {
        throw new Error(`Trạng thái lịch khám (${appointment.status}) không khả dụng để gán bác sĩ. Chỉ cho phép với lịch ở trạng thái: ${allowedStatuses.join(', ')}`);
      }

      const newDoctor = await User.findById(newDoctorId).select('fullName');
      if (!newDoctor) {
        throw new Error('Bác sĩ không tồn tại');
      }

      const oldDoctorName = appointment.replacedDoctorUserId?.fullName 
                         || appointment.doctorUserId?.fullName 
                         || null;

      const updated = await Appointment.findByIdAndUpdate(
        appointmentId,
        { 
          replacedDoctorUserId: newDoctorId,
          confirmDeadline: new Date(Date.now() + 24*60*60*1000),
        },
        { new: true }
      ).populate('replacedDoctorUserId', 'fullName');

      // ✅ Gửi email
      const emailData = {
        patientName: appointment.patientUserId.fullName,
        serviceName: appointment.serviceId.serviceName,
        oldDoctorName: oldDoctorName,
        newDoctorName: newDoctor.fullName,
        appointmentDate: appointment.timeslotId.date,
        appointmentStart: appointment.timeslotId.startTime,
        appointmentEnd: appointment.timeslotId.endTime,
        clinicName: 'Phòng khám Hải Anh'
      };

      try {
        await emailService.sendDoctorAssignedEmail(appointment.patientUserId.email, emailData);
      } catch (emailError) {
        console.warn('⚠️ Lỗi gửi email:', emailError.message);
      }

      // ✅ Gửi notification cho bệnh nhân 
      try {
        await notificationService.createNotification({
          userId: appointment.patientUserId._id,
          createdByUserId: userId,
          title: 'Bác sĩ của bạn đã được thay đổi',
          message: `Bác sĩ ${oldDoctorName} đã được thay thế bằng bác sĩ ${newDoctor.fullName}. Vui lòng xác nhận trong vòng 24 giờ.`,
          relatedAppointmentId: appointmentId,
          link: null,
        });
      } catch (notifError) {
        console.warn('⚠️ Lỗi gửi notification bệnh nhân:', notifError.message);
      }

      return updated;

    } catch (error) {
      console.error('❌ Lỗi gán bác sĩ:', error.message);
      throw error;
    }
  }


async confirmChangeDoctor(appointmentId, userId , options = { auto: false }) {
  try {
    // 1. Tìm appointment
    const appointment = await Appointment.findById(appointmentId)
      .populate('patientUserId', 'fullName email phoneNumber')
      .populate('doctorUserId', 'fullName email')
      .populate('serviceId', 'serviceName price durationMinutes category')
      .populate('timeslotId', 'startTime endTime');

    if (!appointment) throw new Error('Lịch khám không tồn tại');

    if (!appointment.replacedDoctorUserId) {
      throw new Error('Không có yêu cầu đổi bác sĩ');
    }

     // ✅ Gửi notification cho bác sĩ mới
      try {
        await notificationService.createNotification({
          userId: appointment.replacedDoctorUserId,
          createdByUserId: userId,
          title: 'Bạn được gán lịch khám mới',
          message: `Bạn được chỉ định thay thế để khám khám bệnh cho bệnh nhân ${appointment.patientUserId.fullName} vào ngày ${new Date(appointment.timeslotId.startTime).toLocaleDateString('vi-VN')}.`,
          relatedAppointmentId: appointmentId,
          link:  null,
        });
      } catch (notifError) {
        console.warn('⚠️ Lỗi gửi notification bác sĩ:', notifError.message);
      }

    // 2. Tìm lịch làm việc bác sĩ mới
    const schedule = await DoctorSchedule.findOne({
      doctorUserId: appointment.replacedDoctorUserId,
    });

    // ✅ THÊM: Kiểm tra schedule có tồn tại không
    if (!schedule) {
      throw new Error(
        `Bác sĩ mới không có lịch làm việc vào thời gian ${appointment.timeslotId.startTime}`
      );
    }

    // 3. Hủy timeslot cũ
    const oldTimeSlot = await Timeslot.findById(appointment.timeslotId);
    if (!oldTimeSlot) {
      throw new Error('Không tìm thấy timeslot cũ');
    }
    if (oldTimeSlot) {
      await Timeslot.findByIdAndDelete(oldTimeSlot._id);
    }

    // 4. Tạo timeslot mới
    const newTimeslot = new Timeslot({
      doctorScheduleId: schedule._id, // ✅ Lúc này schedule chắc chắn tồn tại
      doctorUserId: appointment.replacedDoctorUserId,
      serviceId: appointment.serviceId,
      startTime: oldTimeSlot.startTime,
      endTime: oldTimeSlot.endTime,
      breakAfterMinutes: 10,
      status: 'Booked',
      appointmentId: appointmentId,
    });
    await newTimeslot.save();

    // 5. Cập nhật appointment
    await Appointment.findByIdAndUpdate(appointmentId, {
      doctorUserId: appointment.replacedDoctorUserId,
      timeslotId: newTimeslot._id,
      replacedDoctorUserId: null,
      confirmDeadline: null, // xóa confirmDeadline sau khi auto confirm
    });

    // 6. Gửi email (nếu cần)
    if (options.auto) {
      console.log(`⏰ Appointment ${appointmentId} đã được auto-confirm bác sĩ mới do quá hạn 24h.`);
      // TODO: gửi email thông báo auto-confirm
    } else {
      console.log(`✅ Patient đã xác nhận đổi bác sĩ thành công: ${appointmentId}`);
      // TODO: gửi email patient confirm như bình thường
    }

    // 7. Lấy dữ liệu đầy đủ sau khi cập nhật
    const updatedAppointment = await Appointment.findById(appointmentId)
      .populate('patientUserId', 'fullName email phoneNumber')
      .populate('doctorUserId', 'fullName email')
      .populate('serviceId', 'serviceName price durationMinutes category')
      .populate('timeslotId', 'startTime endTime');

    return updatedAppointment;
  } catch (error) {
    console.error('❌ Lỗi confirmChangeDoctor:', error.message);
    throw error;
  }
}


async cancelChangeDoctor(appointmentId) {
    try {
      //Kiểm tra lịch khám có tồn tại không
      const appointment = await Appointment.findById(appointmentId);
      if(!appointment){
        throw new Error('Lịch khám không tồn tại')
      }  
      
      if(!appointment.replacedDoctorUserId){
        throw new Error('Lịch khám đã bị hủy')
      }

      //Cập nhật lịch khám của bệnh nhân
      const update = await Appointment.findByIdAndUpdate(
        appointmentId,
        {replacedDoctorUserId : null},
        {new : true},
      )
      console.log('❌Từ chối đổi bác sĩ mới thành công')
    } catch (error) {
    console.error('❌ Lỗi từ chối đổi bác sĩ mới', error);
    throw error;     
    }
  }


async getVisitTicketPDF(appointmentId, res) {
  try {
    // === Lấy thông tin appointment ===
    const appointment = await Appointment
      .findById(appointmentId)
      .populate('doctorUserId', 'fullName')
      .populate('patientUserId', 'fullName dob gender address phoneNumber')
      .populate('serviceId', 'serviceName price')
      .populate('customerId', 'fullName phone');

    if (!appointment) throw new Error('Không tìm thấy ca khám');
    if (appointment.status !== 'Completed') throw new Error('Ca khám chưa hoàn thành');

    //Lấy thông tin người khác 
    const customerIn4 = await Customer.findById(appointment.customerId);

    // === Lấy hồ sơ khám ===
    const record = await MedicalRecord
      .findOne({ appointmentId })
      .populate('nurseId', 'fullName')
      .populate('additionalServiceIds', '_id serviceName price category')
      .populate('prescriptions', 'medicine dosage duration');

    if (!record) throw new Error('Chưa có hồ sơ khám');

    let visitTicketData = await VisitTicket.findOne({ appointmentId: appointmentId });

    // === LẦN ĐẦU: Tạo VisitTicket ===
    if (!visitTicketData) {
      const services = [];
      const originalPrices = {};

      // Dịch vụ
      if (record.additionalServiceIds?.length) {
        record.additionalServiceIds.forEach(s => {
          services.push({
            name: s.serviceName,
            doctor: appointment.doctorUserId?.fullName?.split(' ').pop() || '—',
            price: s.price,
            serviceId: s._id
          });
          originalPrices[s._id.toString()] = s.price;
        });
      }

      // === Áp dụng khuyến mãi cho từng dịch vụ ===
      for (let i = 0; i < services.length; i++) {
        const promotionService = await PromotionService.findOne({
          serviceId: services[i].serviceId
        }).select('promotionId');

        if (promotionService) {
          const promotion = await Promotion.findById(promotionService.promotionId);
          if (promotion) {
            services[i].price = promotion.discountType === 'Percent'
              ? services[i].price * (1 - promotion.discountValue / 100)
              : services[i].price - promotion.discountValue;
            services[i].price = Math.max(0, services[i].price);
          }
        }
      }

      // Danh sách các service được lưu vào phiếu khám
      const serviceList = record.additionalServiceIds.map(r => {
        const discountedService = services.find(s => s.serviceId.toString() === r._id.toString());
        const originalPrice = originalPrices[r._id.toString()];
        const discountAmount = originalPrice - (discountedService ? discountedService.price : originalPrice);

        return {
          serviceId : r._id,
          serviceName: r.serviceName,
          category : r.category,
          price: originalPrice,
          discount: discountAmount,
          total: discountedService ? discountedService.price : originalPrice
        };
      });

      // Danh sách thuốc được đưa vào phiếu khám
      const prescriptionList = (record.prescriptions || []).map(a => ({
        medicine: a.medicine || '',
        dosage: a.dosage || '',
        duration: a.duration || ''
      }));

      // Tổng tiền
      const totalPrice = serviceList.reduce((sum, s) => sum + s.total, 0);


      // Tạo bản ghi cho phiếu khám bệnh
      const newVisitTicket = new VisitTicket({
        appointmentId: appointmentId,
        patientName: appointment.patientUserId.fullName,
        patientGender: appointment.patientUserId.gender,
        patientAge: record.patientAge,
        phoneNumber: appointment.patientUserId.phoneNumber,
        address: appointment.patientUserId.address,
        doctor: appointment.doctorUserId.fullName || '-',
        date: appointment.updatedAt,
        service: serviceList,
        totalAmount: totalPrice,
        diagnosis: record.diagnosis,
        prescriptions: prescriptionList,
      });

      await newVisitTicket.save();
      visitTicketData = newVisitTicket;
    }

    // ✅ KIỂM TRA SAFETY: visitTicketData phải tồn tại
    if (!visitTicketData) {
      throw new Error('Không thể tạo hoặc tìm VisitTicket');
    }

    // === Tạo body bảng dịch vụ ===
    const serviceTableBody = [
      [
        { text: 'STT', style: 'tableHeader' },
        { text: 'Dịch vụ', style: 'tableHeader' },
        { text: 'Bác sĩ', style: 'tableHeader' },
        { text: 'Đơn giá', style: 'tableHeader', alignment: 'right' },
        { text: 'Giảm giá', style: 'tableHeader', alignment: 'right' },
        { text: 'Thành tiền', style: 'tableHeader', alignment: 'right' }
      ]
    ];

    // Thêm các dòng dịch vụ
    visitTicketData.service.forEach((service, index) => {
      serviceTableBody.push([
        { text: (index + 1).toString(), alignment: 'center' },
        { text: service.serviceName },
        { text: appointment.doctorUserId?.fullName || '—' },
        { text: formatPrice(service.price), alignment: 'right' },
        { text: formatPrice(service.discount), alignment: 'right' },
        { text: formatPrice(service.total), alignment: 'right', bold: true }
      ]);
    });

    function formatPrice(price) {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
    }

    // === Tạo content toa thuốc ===
    const prescriptionContent = visitTicketData.prescriptions?.length > 0
      ? visitTicketData.prescriptions.map(p => [
          { text: `- Thuốc : ${p.medicine} sử dụng ${p.dosage} ${p.duration}` },
        ]).flat()
      : [{ text: 'Không có toa thuốc', italics: true, color: '#888' }];

    const docDefinition = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [25, 40, 25, 50],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.3
      },

      // === HEADER: TÊN PHÒNG KHÁM + LIÊN HỆ ===
      header: {
        margin: [25, 15, 25, 0],
        columns: [
          {
            text: 'NHA KHOA HẢI ANH',
            style: 'clinicName',
            alignment: 'left'
          },
          {
            text: 'Hotline: 0945650166\nWebsite: haianhclinic.vn',
            fontSize: 8,
            alignment: 'right',
            color: '#555'
          }
        ]
      },

      content: [
        // === TIÊU ĐỀ ===
        {
          text: 'PHIẾU KHÁM BỆNH',
          style: 'header',
          alignment: 'center',
          margin: [0, 10, 0, 12]
        },

        // === MÃ + NGÀY ===
        {
          columns: [
            { text: `Ngày khám: ${new Date(visitTicketData.date).toLocaleDateString('vi-VN')}`, width: '40%', alignment: 'left' }
          ],
          fontSize: 9,
          color: '#555',
          margin: [0, 0, 0, 12]
        },

        // === THÔNG TIN BỆNH NHÂN ===
        { text: 'THÔNG TIN BỆNH NHÂN', style: 'subheader' },
        {
          style: 'infoTable',
          table: {
            widths: ['27%', '71%'],
            body: [
              ['Họ tên', customerIn4 ? customerIn4.fullName : '-'],
              ['Giới tính', '-'],
              ['Tuổi','-'],
              ['Điện thoại', customerIn4 ? customerIn4.phoneNumber : '—'],
              ['Địa chỉ', '—']
            ]
          },
          layout: 'lightHorizontalLines'
        },

        '\n',

        // === BẢNG DỊCH VỤ + GIÁ ===
        {
          table: {
            headerRows: 1,
            widths: ['5%', '23%', '12%', '19%', '19%', '20%'],
            body: serviceTableBody
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#aaa',
            vLineColor: () => '#aaa'
          }
        },

        // === TỔNG TIỀN ===
        {
          columns: [
            {},
            {
              width: '50%',
              table: {
                widths: ['50%', '45%'],
                body: [
                  [{ text: 'Tổng tiền : ', bold: true }, { text: formatPrice(visitTicketData.totalAmount || 0), alignment: 'right', bold: true }]
                ]
              },
              layout: 'noBorders',
              margin: [0, 8, 0, 0]
            }
          ]
        },

        '\n',

        // === KẾT LUẬN ===
        { text: 'KẾT LUẬN', style: 'subheader', margin: [0, 0, 0, 4] },
        { text: visitTicketData.diagnosis || '—', margin: [0, 0, 0, 10] },

        // === TOA THUỐC ===
        { text: 'TOA THUỐC', style: 'subheader', margin: [0, 0, 0, 4] },
        {
          stack: prescriptionContent,
          margin: [0, 0, 0, 10]
        },

        // === CHỮ KÝ ===
        {
          columns: [
            {
              width: '40%',
              stack: [
                { text: 'KHÁCH HÀNG', alignment: 'center', bold: true, margin: [0, 20, 0, 5] },
                { text: '(Ký và ghi rõ họ tên)', alignment: 'center', fontSize: 8, italics: true },
                '\n\n\n',
              ]
            },
            {
              width: '60%',
              stack: [
                { text: `BÁC SĨ ${visitTicketData.doctor}`, alignment: 'center', bold: true, margin: [0, 20, 0, 5] },
                { text: '(Ký và ghi rõ họ tên)', alignment: 'center', fontSize: 8, italics: true },
                '\n\n\n',
              ]
            }
          ]
        }
      ],

      styles: {
        clinicName: {
          fontSize: 13,
          bold: true,
          color: '#d32f2f'
        },
        header: { fontSize: 18, bold: true, color: '#1a5eaa' },
        subheader: { fontSize: 11, bold: true, color: '#333', margin: [0, 8, 0, 4] },
        tableHeader: { bold: true, fontSize: 9, fillColor: '#f0f0f0', color: '#333' }
      }
    };

    const docDefinition1 = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [25, 40, 25, 50],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        lineHeight: 1.3
      },

      // === HEADER: TÊN PHÒNG KHÁM + LIÊN HỆ ===
      header: {
        margin: [25, 15, 25, 0],
        columns: [
          {
            text: 'NHA KHOA HẢI ANH',
            style: 'clinicName',
            alignment: 'left'
          },
          {
            text: 'Hotline: 0945650166\nWebsite: haianhclinic.vn',
            fontSize: 8,
            alignment: 'right',
            color: '#555'
          }
        ]
      },

      content: [
        // === TIÊU ĐỀ ===
        {
          text: 'PHIẾU KHÁM BỆNH',
          style: 'header',
          alignment: 'center',
          margin: [0, 10, 0, 12]
        },

        // === MÃ + NGÀY ===
        {
          columns: [
            { text: `Ngày khám: ${new Date(visitTicketData.date).toLocaleDateString('vi-VN')}`, width: '40%', alignment: 'left' }
          ],
          fontSize: 9,
          color: '#555',
          margin: [0, 0, 0, 12]
        },

        // === THÔNG TIN BỆNH NHÂN ===
        { text: 'THÔNG TIN BỆNH NHÂN', style: 'subheader' },
        {
          style: 'infoTable',
          table: {
            widths: ['27%', '71%'],
            body: [
              ['Họ tên', visitTicketData.patientName || '-'],
              ['Giới tính', visitTicketData.patientGender === 'Male' ? 'Nam' : 'Nữ'],
              ['Tuổi', `${visitTicketData.patientAge} tuổi` || '—'],
              ['Điện thoại', visitTicketData.phoneNumber || '—'],
              ['Địa chỉ', visitTicketData.address || '—']
            ]
          },
          layout: 'lightHorizontalLines'
        },

        '\n',

        // === BẢNG DỊCH VỤ + GIÁ ===
        {
          table: {
            headerRows: 1,
            widths: ['5%', '23%', '12%', '19%', '19%', '20%'],
            body: serviceTableBody
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#aaa',
            vLineColor: () => '#aaa'
          }
        },

        // === TỔNG TIỀN ===
        {
          columns: [
            {},
            {
              width: '50%',
              table: {
                widths: ['50%', '45%'],
                body: [
                  [{ text: 'Tổng tiền : ', bold: true }, { text: formatPrice(visitTicketData.totalAmount || 0), alignment: 'right', bold: true }]
                ]
              },
              layout: 'noBorders',
              margin: [0, 8, 0, 0]
            }
          ]
        },

        '\n',

        // === KẾT LUẬN ===
        { text: 'KẾT LUẬN', style: 'subheader', margin: [0, 0, 0, 4] },
        { text: visitTicketData.diagnosis || '—', margin: [0, 0, 0, 10] },

        // === TOA THUỐC ===
        { text: 'TOA THUỐC', style: 'subheader', margin: [0, 0, 0, 4] },
        {
          stack: prescriptionContent,
          margin: [0, 0, 0, 10]
        },

        // === CHỮ KÝ ===
        {
          columns: [
            {
              width: '40%',
              stack: [
                { text: 'KHÁCH HÀNG', alignment: 'center', bold: true, margin: [0, 20, 0, 5] },
                { text: '(Ký và ghi rõ họ tên)', alignment: 'center', fontSize: 8, italics: true },
                '\n\n\n',
              ]
            },
            {
              width: '60%',
              stack: [
                { text: `BÁC SĨ ${visitTicketData.doctor}`, alignment: 'center', bold: true, margin: [0, 20, 0, 5] },
                { text: '(Ký và ghi rõ họ tên)', alignment: 'center', fontSize: 8, italics: true },
                '\n\n\n',
              ]
            }
          ]
        }
      ],

      styles: {
        clinicName: {
          fontSize: 13,
          bold: true,
          color: '#d32f2f'
        },
        header: { fontSize: 18, bold: true, color: '#1a5eaa' },
        subheader: { fontSize: 11, bold: true, color: '#333', margin: [0, 8, 0, 4] },
        tableHeader: { bold: true, fontSize: 9, fillColor: '#f0f0f0', color: '#333' }
      }
    };

    
  
    const pdfDoc = customerIn4 ? printer.createPdfKitDocument(docDefinition) : printer.createPdfKitDocument(docDefinition1);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=visit-ticket.pdf');

    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (error) {
    console.error('❌ Lỗi PDF:', error);
    res.status(400).json({ message: error.message });
  }
}



async managerDashboard(startDate, endDate) {
  try {
    let start, end;
    if (!startDate || !endDate) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    start = new Date(year, month, 1, 0, 0, 0, 0);
    end = new Date(year, month + 1, 0, 23, 59, 59, 999); 
} else {
  start = new Date(startDate);
  end = new Date(endDate);
}

    const filter = {
      createdAt: { $gte: start, $lte: end }
    };

    // --- Thống kê ca khám tại quầy (VisitTicket) ---
    const totalVisitTickets = await VisitTicket.countDocuments(filter);

    // Tổng doanh thu từ VisitTicket
    const visitTickets = await VisitTicket.find(filter).populate("service.serviceId", "category price");

    let revenueByCategory = {
      Examination: 0,
      Consultation: 0
    };

    visitTickets.forEach(vt => {
      vt.service.forEach(s => {
        const category = s.category || (s.serviceId ? s.serviceId.category : null);
        const price = s.total || (s.serviceId ? s.serviceId.price : 0);
        if (category && revenueByCategory.hasOwnProperty(category)) {
          revenueByCategory[category] += price;
        }
      });
    });

    const totalRevenue = revenueByCategory.Examination + revenueByCategory.Consultation;

    // --- Thống kê Appointment loại Consultation ---
    const consultationAppointments = await Appointment.countDocuments({
      ...filter,
      status: "Completed",
      type : "Consultation"
    });

    //Các ca khám và tư vấn đã hoàn thành
    const totalAppointment = consultationAppointments + totalVisitTickets

    // --- Thống kê bệnh nhân ---
    const totalPatients = await User.countDocuments({ role: "Patient" });
    const newPatients = await User.countDocuments({
      role: "Patient",
      createdAt: filter.createdAt
    });

    return {
      filterRange: {
        startDate: start,
        endDate: end
      },
      appointments: {
        examination : totalVisitTickets,
        consultation : consultationAppointments,
        total: totalAppointment
      },
      revenue: {
        ...revenueByCategory,
        total: totalRevenue
      },
      patients: {
        total: totalPatients,
        newPatients
      }
    };
  } catch (error) {
    console.error("❌ Lỗi dashboard:", error);
    throw new Error(error.message);
  }
}

async getMonthlyRevenue(startDate, endDate) {
  try {

    const now = new Date();
    const year = now.getFullYear(); // Lấy năm hiện tại

    if (!startDate || !endDate) {
      startDate = new Date(year, 0, 1);  // Bắt đầu từ ngày 01 tháng 01
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);  // Kết thúc ngày 31 tháng 12, 23:59:59
    } else {
      // Chuyển đổi startDate, endDate từ query string thành Date
      startDate = new Date(startDate);
      endDate = new Date(endDate);
    }

    // Khởi tạo mảng chứa doanh thu mỗi tháng, mặc định là 0
    let monthlyRevenue = Array(12).fill(0);

    // Lọc theo khoảng thời gian startDate và endDate
    const filter = {
      createdAt: { $gte: startDate, $lte: endDate }
    };

    // Lấy doanh thu từ VisitTicket
    const visitTickets = await VisitTicket.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate, // Từ startDate
            $lte: endDate    // Đến endDate
          }
        }
      },
      {
        $unwind: "$service"
      },
      {
        $group: {
          _id: { $month: "$createdAt" }, // Nhóm theo tháng
          totalRevenue: { $sum: { $ifNull: ["$service.total", 0] } }
        }
      },
      {
        $sort: { _id: 1 } // Sắp xếp theo tháng
      }
    ]);

    // Lấy doanh thu từ Appointment
    const appointments = await Appointment.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDate, // Từ startDate
            $lte: endDate    // Đến endDate
          },
          status: "Completed", // Chỉ tính các ca đã hoàn thành
          type: "Consultation" // Loại là tư vấn
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalRevenue: { $sum: "$price" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Cập nhật doanh thu vào mảng theo tháng
    visitTickets.forEach(ticket => {
      monthlyRevenue[ticket._id - 1] += ticket.totalRevenue; // Lưu doanh thu của VisitTicket vào tháng tương ứng
    });

    appointments.forEach(appointment => {
      monthlyRevenue[appointment._id - 1] += appointment.totalRevenue; // Lưu doanh thu của Appointment vào tháng tương ứng
    });

    // Trả về kết quả
    return {
      year: year,
      revenue: monthlyRevenue
    }

  } catch (error) {
    console.error("❌ Lỗi khi tính toán doanh thu theo tháng:", error);
    res.status(500).json({ message: "Đã có lỗi xảy ra khi tính toán doanh thu." });
  }
}



}

module.exports = new AppointmentService();
