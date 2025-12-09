const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const Patient = require('../models/patient.model');
const MedicalRecord = require('../models/medicalRecord.model');
const Customer = require('../models/customer.model');
const leaveRequestService = require('./leaveRequest.service');
const Doctor = require('../models/doctor.model');
const { cloudinary } = require('../config/cloudinary');
const fs = require('fs');
class DoctorService {

  async uploadCertificateImage(filePath) {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'doctor-certificates',
      resource_type: 'image',
      transformation: [
        { width: 800, height: 800, crop: 'limit' },
        { quality: 'auto' },
      ],
    });
    return result;
  }

  /**
   * Lấy danh sách appointments của một patient với doctor này
   */
  async getPatientAppointmentsForDoctor(doctorUserId, patientId) {
    if (!patientId) {
      throw new Error('Thiếu patientId');
    }

    const appointments = await Appointment.find({
      doctorUserId,
      $or: [
        { patientUserId: patientId },
        { customerId: patientId },
      ],
      status: { $in: ['CheckedIn', 'InProgress', 'Completed'] }
    })
      .populate({ path: 'serviceId', select: 'serviceName' })
      .populate({ path: 'timeslotId', select: 'startTime endTime' })
      .sort({ 'timeslotId.startTime': -1 })
      .lean();

    return appointments.map(a => ({
      appointmentId: a._id,
      serviceName: a.serviceId?.serviceName || 'N/A',
      status: a.status,
      startTime: a.timeslotId?.startTime || null,
      endTime: a.timeslotId?.endTime || null,
    }));
  }

  /**
   * Lấy danh sách lịch hẹn của bác sĩ
   * @param {string} doctorUserId - ID của doctor
   * @param {string} startDate - Optional: Ngày bắt đầu (YYYY-MM-DD)
   * @param {string} endDate - Optional: Ngày kết thúc (YYYY-MM-DD)
   */
  async getDoctorAppointmentsSchedule(doctorUserId, startDate = null, endDate = null) {
    // Kiểm tra bác sĩ có tồn tại không
    const doctor = await User.findById(doctorUserId);
    if (!doctor || doctor.role !== 'Doctor') {
      throw new Error('Bạn không phải là bác sĩ');
    }

    let dateRangeStart, dateRangeEnd;
    let shouldFilterByDate = true; // Flag để biết có cần filter theo date không

    // ⭐ Nếu cả startDate và endDate đều là null (không phải undefined), lấy tất cả không filter
    if (startDate === null && endDate === null) {
      shouldFilterByDate = false;
      console.log(`📅 Doctor ${doctorUserId} - Lấy TẤT CẢ lịch hẹn (không filter theo date)`);
    } else if (startDate && endDate) {
      // Nếu có startDate và endDate từ query params, dùng nó
      dateRangeStart = new Date(startDate);
      dateRangeStart.setHours(0, 0, 0, 0);
      dateRangeEnd = new Date(endDate);
      dateRangeEnd.setHours(23, 59, 59, 999);
      console.log(`📅 Doctor ${doctorUserId} - Lấy lịch từ ${startDate} đến ${endDate} (custom range)`);
    } else {
      // Mặc định: Tính toán tuần hiện tại + tuần tiếp theo (2 tuần)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const startOfWeek = new Date(today.setDate(diff));

      dateRangeStart = startOfWeek;
      dateRangeEnd = new Date(startOfWeek);
      dateRangeEnd.setDate(dateRangeEnd.getDate() + 14);
      console.log(`📅 Doctor ${doctorUserId} - Lấy lịch từ ${dateRangeStart.toISOString().split('T')[0]} đến ${dateRangeEnd.toISOString().split('T')[0]} (2 tuần mặc định)`);
    }

    // Lấy TẤT CẢ appointments đã duyệt của doctor (bao gồm cả No-Show)
    const allAppointments = await Appointment.find({
      doctorUserId: doctorUserId,
      status: { $in: ['Approved', 'CheckedIn', 'InProgress', 'Completed', 'Finalized', 'No-Show'] }
    })
      .populate({
        path: 'patientUserId',
        select: 'fullName'
      })
      .populate({
        path: 'customerId',
        select: 'fullName'
      })
      .populate({
        path: 'serviceId',
        select: 'serviceName'
      })
      .populate({
        path: 'additionalServiceIds',
        select: 'serviceName'
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime'
      })
      .lean();

    // ⭐ Filter theo timeslotId.startTime trong date range (chỉ khi cần)
    let appointments = allAppointments;
    if (shouldFilterByDate) {
      appointments = allAppointments.filter(appointment => {
        if (!appointment.timeslotId || !appointment.timeslotId.startTime) {
          return false;
        }
        const appointmentDate = new Date(appointment.timeslotId.startTime);
        return appointmentDate >= dateRangeStart && appointmentDate <= dateRangeEnd;
      });
    } else {
      // Khi không filter theo date, chỉ loại bỏ appointments không có timeslotId
      appointments = allAppointments.filter(appointment => {
        return appointment.timeslotId && appointment.timeslotId.startTime;
      });
    }

    if (shouldFilterByDate) {
      console.log(`✅ Lọc được ${appointments.length}/${allAppointments.length} lịch hẹn trong date range`);
    } else {
      console.log(`✅ Lấy tất cả ${appointments.length} lịch hẹn (không filter theo date)`);
    }

    // ⭐ Filter appointments khi doctor có leave trong thời gian appointment
    const appointmentsWithoutLeave = [];
    for (const appointment of appointments) {
      if (appointment.timeslotId?.startTime) {
        const isOnLeave = await leaveRequestService.isDoctorOnLeave(
          doctorUserId,
          appointment.timeslotId.startTime
        );
        
        // Nếu doctor có leave, không thêm vào kết quả
        if (isOnLeave) {
          continue;
        }
      }
      
      appointmentsWithoutLeave.push(appointment);
    }
    
    appointments = appointmentsWithoutLeave;
    console.log(`✅ Sau khi filter leave: ${appointments.length} lịch hẹn`);

    // Sắp xếp theo startTime ascending (ngày cũ nhất lên đầu, ngày mới nhất xuống dưới)
    appointments.sort((a, b) => {
      const timeA = a.timeslotId?.startTime ? new Date(a.timeslotId.startTime).getTime() : 0;
      const timeB = b.timeslotId?.startTime ? new Date(b.timeslotId.startTime).getTime() : 0;
      return timeA - timeB; // Ascending: ngày cũ nhất lên đầu
    });

    // Lấy thông tin medical record status cho mỗi appointment
    const appointmentIds = appointments.map(apt => apt._id);
    const medicalRecords = await MedicalRecord.find({
      appointmentId: { $in: appointmentIds }
    }).select('appointmentId status').lean();

    // Tạo map để tra cứu nhanh
    const medicalRecordStatusMap = {};
    medicalRecords.forEach(record => {
      medicalRecordStatusMap[record.appointmentId.toString()] = record.status || null;
    });

    // Format response thành array dạng bảng
    return appointments.map(appointment => {
      const timeslot = appointment.timeslotId;
      // Ưu tiên customerId (bệnh nhân vãng lai do staff tạo) rồi mới tới patientUserId
      const patient = appointment.customerId || appointment.patientUserId;
      const medicalRecordStatus = medicalRecordStatusMap[appointment._id.toString()] || null;

      return {
        appointmentId: appointment._id,
        serviceName: appointment.serviceId?.serviceName || 'Chưa có thông tin',
        // ⭐ Hiển thị tất cả services nếu có additionalServiceIds (cho follow-up với nhiều services)
        additionalServiceNames: appointment.additionalServiceIds?.map(s => s?.serviceName || '').filter(Boolean) || [],
        patientName: patient?.fullName || 'Chưa có thông tin',
        appointmentDate: timeslot?.startTime ? new Date(timeslot.startTime).toISOString().split('T')[0] : 'Chưa có thông tin',
        startTime: timeslot?.startTime ? new Date(timeslot.startTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh'
        }) : 'Chưa có thông tin',
        endTime: timeslot?.endTime ? new Date(timeslot.endTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh'
        }) : 'Chưa có thông tin',
        type: appointment.type,
        status: appointment.status,
        mode: appointment.mode,
        medicalRecordStatus: appointment.noTreatment ? null : medicalRecordStatus,
        noTreatment: !!appointment.noTreatment,
        createdAt: appointment.createdAt ? appointment.createdAt.toISOString() : null,
        updatedAt: appointment.updatedAt ? appointment.updatedAt.toISOString() : null
      };
    });
  }

  /**
   * Lấy chi tiết một lịch hẹn
   */
  async getAppointmentDetail(appointmentId, doctorUserId) {
    const appointment = await Appointment.findById(appointmentId)
      .populate({
        path: 'doctorUserId',
        select: 'fullName email specialization'
      })
      .populate({
        path: 'patientUserId',
        select: 'fullName email phoneNumber'
      })
      .populate({
        path: 'customerId',
        select: 'fullName email phoneNumber'
      })
      .populate({
        path: 'serviceId',
        select: 'serviceName price description'
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime'
      })
      .populate({
        path: 'paymentId',
        select: 'status amount method'
      })
      .lean();

    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    // Kiểm tra xem bác sĩ có phải là bác sĩ của lịch hẹn này không
    if (appointment.doctorUserId._id.toString() !== doctorUserId) {
      throw new Error('Bạn không có quyền xem lịch hẹn này');
    }

    // Lấy thông tin bệnh nhân: ưu tiên Customer nếu đặt cho người thân khác
    const patientInfo = appointment.customerId || appointment.patientUserId;
    const timeslot = appointment.timeslotId;

    return {
      appointmentId: appointment._id,
      patientId: patientInfo?._id || 'Chưa có thông tin',
      patientName: patientInfo?.fullName || 'Chưa có thông tin',
      patientEmail: patientInfo?.email || 'Chưa có thông tin',
      serviceName: appointment.serviceId?.serviceName || 'Chưa có thông tin',
      serviceDescription: appointment.serviceId?.description || '',
      type: appointment.type,
      status: appointment.status,
      mode: appointment.mode,
      appointmentDate: timeslot?.startTime ? new Date(timeslot.startTime).toISOString().split('T')[0] : 'Chưa có thông tin',
      // ⭐ Trả về ISO string để frontend có thể tạo Date object đúng
      startTime: timeslot?.startTime ? new Date(timeslot.startTime).toISOString() : null,
      // ⭐ Thêm formatted time string để hiển thị (backward compatibility)
      startTimeFormatted: timeslot?.startTime ? new Date(timeslot.startTime).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
      }) : 'Chưa có thông tin',
      // ⭐ Trả về ISO string để frontend có thể tạo Date object đúng
      endTime: timeslot?.endTime ? new Date(timeslot.endTime).toISOString() : null,
      // ⭐ Thêm formatted time string để hiển thị (backward compatibility)
      endTimeFormatted: timeslot?.endTime ? new Date(timeslot.endTime).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
      }) : 'Chưa có thông tin'
    };
  }

  /**
   * Lấy chi tiết thông tin bệnh nhân
   */
  async getPatientDetail(patientId) {
    // 1) Thử coi đây là Customer (đặt cho người thân khác)
    const customer = await Customer.findById(patientId)
      .select('fullName email phoneNumber dob gender address')
      .lean();
    if (customer) {
      return {
        patientId: customer._id,
        fullName: customer.fullName,
        email: customer.email || 'Trống',
        phoneNumber: customer.phoneNumber || 'Trống',
        dateOfBirth: customer.dob || 'Trống',
        gender: customer.gender || 'Trống',
        address: customer.address || 'Trống',
        status: 'N/A',
        emergencyContact: 'Trống'
      };
    }

    // 2) Nếu không phải Customer, coi là User (đặt cho bản thân)
    const user = await User.findById(patientId)
      .select('fullName email phoneNumber dob gender address status')
      .lean();
    if (!user) {
      throw new Error('Không tìm thấy bệnh nhân');
    }
    const patientRecord = await Patient.findOne({ patientUserId: patientId })
      .select('emergencyContact lastVisitDate')
      .lean();
    return {
      patientId: user._id,
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber || 'Trống',
      dateOfBirth: user.dob ? new Date(user.dob).toISOString().split('T')[0] : 'Trống',
      gender: user.gender || 'Trống',
      address: user.address || 'Trống',
      status: user.status,
      emergencyContact: patientRecord?.emergencyContact || 'Trống'
    };
  }

  async updateDoctorInfo(doctorUserId, data, certificateFile) {
    const doctor = await Doctor.findOne({doctorUserId: doctorUserId});
    if (!doctor) {
      throw new Error('Bác sĩ không tồn tại');
    }

    const {
      specialization,
      yearsOfExperience,
      certificate,
      summary,
    } = data;

    const ensureValidText = (value, fieldLabel) => {
      if (typeof value !== 'string') {
        throw new Error(`${fieldLabel} phải là chuỗi.`);
      }
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error(`${fieldLabel} không được để trống.`);
      }
      return trimmed;
    };

    if (typeof specialization !== 'undefined') {
      doctor.specialization = ensureValidText(specialization, 'Chuyên môn');
    }

    if (typeof yearsOfExperience !== 'undefined') {
      const parsedYears =
        typeof yearsOfExperience === 'number'
          ? yearsOfExperience
          : Number(yearsOfExperience);
      if (Number.isNaN(parsedYears) || parsedYears < 0) {
        throw new Error('Số năm kinh nghiệm không hợp lệ.');
      }
      doctor.yearsOfExperience = parsedYears;
    }

    if (certificateFile) {
      const uploadResult = await this.uploadCertificateImage(certificateFile.path);
      doctor.certificate = uploadResult.secure_url;
      if (certificateFile.path && fs.existsSync(certificateFile.path)) {
        fs.unlinkSync(certificateFile.path);
      }
    } else if (typeof certificate !== 'undefined') {
      if (certificate === null) {
        doctor.certificate = null;
      } else {
        const certificateValue = ensureValidText(certificate, 'Ảnh chứng chỉ');
        const isHttpUrl = /^https?:\/\//.test(certificateValue);
        if (!isHttpUrl) {
          throw new Error('Ảnh chứng chỉ phải là đường dẫn hình ảnh hợp lệ.');
        }
        doctor.certificate = certificateValue;
      }
    }

    if (typeof summary !== 'undefined') {
      doctor.summary = ensureValidText(summary, 'Tóm tắt kinh nghiệm');
    }

    await doctor.save();
    return doctor;
  }

  async getAllDoctorInfo() {
    const doctors = await Doctor.find()
      .select('doctorUserId specialization yearsOfExperience certificate summary')
      .populate({
        path: 'doctorUserId',
        select: 'fullName avatar'
      })
      .sort({ createdAt: -1 })
      .lean();

    return doctors.map(doc => ({
      doctorUserId: doc.doctorUserId?._id || doc.doctorUserId,
      fullName: doc.doctorUserId?.fullName || 'Chưa cập nhật',
      avatar: doc.doctorUserId?.avatar || null,
      specialization: doc.specialization || null,
      yearsOfExperience: doc.yearsOfExperience ?? null,
      certificate: doc.certificate || null,
      summary: doc.summary || null,
    }));
  }

  async getDoctorInfoDetail(doctorUserId) {
    if (!doctorUserId) {
      throw new Error('Thiếu thông tin doctorUserId');
    }

    const doctor = await Doctor.findOne({ doctorUserId })
      .select('doctorUserId specialization yearsOfExperience certificate summary')
      .populate({
        path: 'doctorUserId',
        select: 'fullName avatar'
      })
      .lean();

    if (!doctor) {
      throw new Error('Không tìm thấy bác sĩ');
    }

    return doctor;
  }
}

module.exports = new DoctorService();

