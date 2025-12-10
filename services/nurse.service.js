const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const Patient = require('../models/patient.model');
const Customer = require('../models/customer.model');
const MedicalRecord = require('../models/medicalRecord.model');
const Doctor = require('../models/doctor.model');

class NurseService {

  /**
   * Lấy danh sách lịch hẹn của TẤT CẢ các bác sĩ
   * @param {string} nurseUserId - ID của nurse
   * @param {string} startDate - Optional: Ngày bắt đầu (YYYY-MM-DD)
   * @param {string} endDate - Optional: Ngày kết thúc (YYYY-MM-DD)
   */
  async getNurseSchedule(nurseUserId, startDate = null, endDate = null) {
    // Kiểm tra có phải Nurse không
    const nurse = await User.findById(nurseUserId);
    if (!nurse || nurse.role !== 'Nurse') {
      throw new Error('Bạn không phải là điều dưỡng');
    }

    let dateRangeStart, dateRangeEnd;

    // Nếu có startDate và endDate từ query params, dùng nó
    if (startDate && endDate) {
      dateRangeStart = new Date(startDate);
      dateRangeStart.setHours(0, 0, 0, 0);
      dateRangeEnd = new Date(endDate);
      dateRangeEnd.setHours(23, 59, 59, 999);
    } else {
      // Mặc định: Tính toán ngày bắt đầu tuần (Thứ 2) - 2 tuần
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const startOfWeek = new Date(today.setDate(diff));

      dateRangeStart = startOfWeek;
      dateRangeEnd = new Date(startOfWeek);
      dateRangeEnd.setDate(dateRangeEnd.getDate() + 14);
    }

    // Lấy tất cả appointments trong date range - dựa trên ngày khám (timeslot.startTime), không phải createdAt
    // Tìm tất cả timeslots trong khoảng thời gian này trước
    const Timeslot = require('../models/timeslot.model');
    const timeslotsInRange = await Timeslot.find({
      startTime: {
        $gte: dateRangeStart,
        $lte: dateRangeEnd
      }
    }).select('_id').lean();

    const timeslotIds = timeslotsInRange.map(ts => ts._id);

    // Lấy appointments có timeslotId trong danh sách trên
    const appointments = await Appointment.find({
      timeslotId: { $in: timeslotIds },
      status: { $in: ['Approved', 'CheckedIn', 'InProgress', 'Completed', 'Finalized'] }
    })
      .populate({
        path: 'doctorUserId',
        select: 'fullName'
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
      .sort({ 'timeslotId.startTime': 1 }) // Sort ascending: ngày cũ nhất lên đầu, ngày mới nhất xuống dưới
      .lean();

    // Lấy thông tin status từ MedicalRecord cho mỗi appointment (để check xem đã được doctor duyệt chưa)
    const appointmentIds = appointments.map(apt => apt._id);
    const medicalRecords = await MedicalRecord.find({
      appointmentId: { $in: appointmentIds }
    }).select('appointmentId status').lean();

    // Tạo map để tra cứu nhanh
    // status = "Finalized" nghĩa là đã được doctor duyệt
    const medicalRecordStatusMap = {};
    medicalRecords.forEach(record => {
      medicalRecordStatusMap[record.appointmentId.toString()] = record.status === 'Finalized';
    });

    // ⭐ Thêm doctor status vào mỗi appointment - kiểm tra leave request theo ngày của appointment
    const LeaveRequest = require('../models/leaveRequest.model');
    
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
    
    // ⭐ Lấy tất cả approved leave requests để kiểm tra theo ngày
    const approvedLeaves = await LeaveRequest.find({
      status: 'Approved',
      userId: { $in: doctorUserIds }
    }).select('userId startDate endDate').lean();

    // Format response thành array dạng bảng
    return appointments.map(appointment => {
      const timeslot = appointment.timeslotId;
      const patient = appointment.customerId || appointment.patientUserId;
      
      // ⭐ Lấy doctorUserId và doctorStatus - kiểm tra leave theo ngày appointment
      let doctorUserId = null;
      let doctorStatus = null;
      if (appointment.doctorUserId && appointment.doctorUserId._id) {
        doctorUserId = appointment.doctorUserId._id.toString();
        const globalStatus = doctorStatusMap.get(doctorUserId) || null;
        
        // ⭐ Kiểm tra xem appointment có nằm trong khoảng thời gian nghỉ phép không
        let isOnLeaveForThisDate = false;
        if (timeslot && timeslot.startTime) {
          const appointmentDate = new Date(timeslot.startTime);
          appointmentDate.setUTCHours(0, 0, 0, 0);
          
          // Kiểm tra trong danh sách approved leaves
          for (const leave of approvedLeaves) {
            if (leave.userId && leave.userId.toString() === doctorUserId) {
              const leaveStart = new Date(leave.startDate);
              const leaveEnd = new Date(leave.endDate);
              leaveStart.setUTCHours(0, 0, 0, 0);
              leaveEnd.setUTCHours(23, 59, 59, 999);
              
              // Nếu appointment nằm trong khoảng nghỉ phép
              if (appointmentDate >= leaveStart && appointmentDate <= leaveEnd) {
                isOnLeaveForThisDate = true;
                break;
              }
            }
          }
        }
        
        // ⭐ Chỉ set doctorStatus = 'On Leave' nếu appointment thực sự nằm trong khoảng nghỉ phép
        // Không dùng status global vì nó có thể áp dụng cho tất cả appointments
        if (isOnLeaveForThisDate) {
          doctorStatus = 'On Leave';
        } else {
          // Nếu không có leave cho ngày này, dùng status global (Available, Busy, Inactive)
          doctorStatus = globalStatus;
        }
      }

      return {
        appointmentId: appointment._id,
        patientId: patient?._id,
        doctorName: appointment.doctorUserId?.fullName || 'N/A',
        doctorUserId: doctorUserId, // ⭐ Thêm doctorUserId
        doctorStatus: doctorStatus, // ⭐ Thêm doctorStatus
        serviceName: appointment.serviceId?.serviceName || 'N/A',
        // ⭐ Hiển thị tất cả services nếu có additionalServiceIds (cho follow-up với nhiều services)
        additionalServiceNames: appointment.additionalServiceIds && Array.isArray(appointment.additionalServiceIds) && appointment.type === 'FollowUp'
          ? appointment.additionalServiceIds.map(s => s?.serviceName || '').filter(Boolean)
          : [],
        patientName: patient?.fullName || 'N/A',
        appointmentDate: timeslot?.startTime ? new Date(timeslot.startTime).toISOString().split('T')[0] : 'N/A',
        startTime: timeslot?.startTime ? new Date(timeslot.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A',
        endTime: timeslot?.endTime ? new Date(timeslot.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A',
        type: appointment.type,
        status: appointment.status,
        mode: appointment.mode,
        doctorApproved: medicalRecordStatusMap[appointment._id.toString()] || false,
        createdAt: appointment.createdAt ? appointment.createdAt.toISOString() : null,
        updatedAt: appointment.updatedAt ? appointment.updatedAt.toISOString() : null
      };
    });
  }

  /**
   * Lấy chi tiết một lịch hẹn
   */
  async getAppointmentDetail(appointmentId) {
    const appointment = await Appointment.findById(appointmentId)
      .populate({
        path: 'doctorUserId',
        select: 'fullName'
      })
      .populate({
        path: 'patientUserId',
        select: 'fullName email'
      })
      .populate({
        path: 'customerId',
        select: 'fullName email'
      })
      .populate({
        path: 'serviceId',
        select: 'serviceName description'
      })
      .populate({
        path: 'timeslotId',
        select: 'startTime endTime'
      })
      .lean();

    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    // Lấy thông tin bệnh nhân: ưu tiên Customer nếu đặt cho người thân khác
    const patientInfo = appointment.customerId || appointment.patientUserId;
    const timeslot = appointment.timeslotId;

    return {
      appointmentId: appointment._id,
      doctorName: appointment.doctorUserId?.fullName || 'N/A',
      patientName: patientInfo?.fullName || 'N/A',
      patientEmail: patientInfo?.email || 'N/A',
      serviceName: appointment.serviceId?.serviceName || 'N/A',
      serviceDescription: appointment.serviceId?.description || '',
      type: appointment.type,
      status: appointment.status,
      mode: appointment.mode,
      appointmentDate: timeslot?.startTime ? new Date(timeslot.startTime).toISOString().split('T')[0] : 'N/A',
      startTime: timeslot?.startTime ? new Date(timeslot.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A',
      endTime: timeslot?.endTime ? new Date(timeslot.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A'
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
        fullName: customer.fullName,
        email: customer.email || 'N/A',
        phoneNumber: customer.phoneNumber || 'N/A',
        dateOfBirth: customer.dob || 'N/A',
        gender: customer.gender || 'N/A',
        address: customer.address || 'N/A',
        status: 'N/A',
        emergencyContact: 'N/A',
        lastVisitDate: 'N/A'
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
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber || 'N/A',
      dateOfBirth: user.dob ? new Date(user.dob).toISOString().split('T')[0] : 'N/A',
      gender: user.gender || 'N/A',
      address: user.address || 'N/A',
      status: user.status,
      emergencyContact: patientRecord?.emergencyContact || 'N/A',
      lastVisitDate: patientRecord?.lastVisitDate ? new Date(patientRecord.lastVisitDate).toISOString().split('T')[0] : 'N/A'
    };
  }

  /**
   * Lấy danh sách tất cả các bác sĩ (để hiển thị trong filter)
   */
  async getAllDoctors() {
    const doctors = await User.find({ role: 'Doctor' })
      .select('_id fullName')
      .sort({ fullName: 1 })
      .lean();

    return doctors.map(doctor => ({
      _id: doctor._id,
      fullName: doctor.fullName
    }));
  }
}

module.exports = new NurseService();

