const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const Patient = require('../models/patient.model');
const MedicalRecord = require('../models/medicalRecord.model');

class DoctorService {

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

    // Nếu có startDate và endDate từ query params, dùng nó
    if (startDate && endDate) {
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

    // Lấy TẤT CẢ appointments đã duyệt của doctor
    const allAppointments = await Appointment.find({
      doctorUserId: doctorUserId,
      status: { $in: ['Approved', 'CheckedIn', 'InProgress', 'Completed', 'Finalized'] }
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
        path: 'timeslotId',
        select: 'startTime endTime'
      })
      .lean();

    // Filter theo timeslotId.startTime trong date range
    const appointments = allAppointments.filter(appointment => {
      if (!appointment.timeslotId || !appointment.timeslotId.startTime) {
        return false;
      }
      const appointmentDate = new Date(appointment.timeslotId.startTime);
      return appointmentDate >= dateRangeStart && appointmentDate <= dateRangeEnd;
    });

    console.log(`✅ Lọc được ${appointments.length}/${allAppointments.length} lịch hẹn trong 2 tuần`);

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
      const patient = appointment.patientUserId || appointment.customerId;
      const medicalRecordStatus = medicalRecordStatusMap[appointment._id.toString()] || null;

      return {
        appointmentId: appointment._id,
        serviceName: appointment.serviceId?.serviceName || 'N/A',
        patientName: patient?.fullName || 'N/A',
        appointmentDate: timeslot?.startTime ? new Date(timeslot.startTime).toISOString().split('T')[0] : 'N/A',
        startTime: timeslot?.startTime ? new Date(timeslot.startTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh'
        }) : 'N/A',
        endTime: timeslot?.endTime ? new Date(timeslot.endTime).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh'
        }) : 'N/A',
        type: appointment.type,
        status: appointment.status,
        mode: appointment.mode,
        medicalRecordStatus: medicalRecordStatus // 'Draft', 'Finalized', hoặc null (chưa có)
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

    // Lấy thông tin bệnh nhân (từ Patient hoặc Customer)
    const patientInfo = appointment.patientUserId || appointment.customerId;
    const timeslot = appointment.timeslotId;

    return {
      appointmentId: appointment._id,
      patientId: patientInfo?._id || 'N/A',
      patientName: patientInfo?.fullName || 'N/A',
      patientEmail: patientInfo?.email || 'N/A',
      serviceName: appointment.serviceId?.serviceName || 'N/A',
      serviceDescription: appointment.serviceId?.description || '',
      type: appointment.type,
      status: appointment.status,
      mode: appointment.mode,
      appointmentDate: timeslot?.startTime ? new Date(timeslot.startTime).toISOString().split('T')[0] : 'N/A',
      startTime: timeslot?.startTime ? new Date(timeslot.startTime).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
      }) : 'N/A',
      endTime: timeslot?.endTime ? new Date(timeslot.endTime).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Ho_Chi_Minh'
      }) : 'N/A'
    };
  }

  /**
   * Lấy chi tiết thông tin bệnh nhân
   */
  async getPatientDetail(patientId) {
    // Lấy thông tin từ User model (patientId là userId)
    const user = await User.findById(patientId)
      .select('fullName email phoneNumber dob gender address status')
      .lean();

    if (!user) {
      throw new Error('Không tìm thấy bệnh nhân');
    }

    // Lấy thông tin từ Patient model nếu có
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
}

module.exports = new DoctorService();

