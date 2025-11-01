const PatientRequest = require('../models/patientRequest.model');
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const User = require('../models/user.model');
const emailService = require('../services/email.service');

class PatientRequestService {

  /**
   * Lấy danh sách patient requests
   */
  async getAllPatientRequests(filters = {}) {
    const { status, requestType, page = 1, limit = 10 } = filters;

    const filter = {};
    if (status) filter.status = status;
    if (requestType) filter.requestType = requestType;

    // Pagination
    const skip = (page - 1) * limit;

    const requests = await PatientRequest.find(filter)
      .populate('appointmentId', 'serviceId patientUserId doctorUserId timeslotId status')
      .populate('patientUserId', 'fullName email phone')
      .populate('currentData.doctorUserId', 'fullName')
      .populate('requestedData.doctorUserId', 'fullName')
      .populate('currentData.timeslotId', 'startTime endTime')
      .populate('requestedData.timeslotId', 'startTime endTime')
      .populate('staffResponse.staffUserId', 'fullName')
      .populate({
        path: 'appointmentId',
        populate: {
          path: 'serviceId',
          select: 'serviceName'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PatientRequest.countDocuments(filter);

    return {
      requests,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    };
  }

  /**
   * Lấy chi tiết patient request
   */
  async getPatientRequestById(requestId) {
    const request = await PatientRequest.findById(requestId)
      .populate('appointmentId', 'serviceId patientUserId doctorUserId timeslotId status')
      .populate('patientUserId', 'fullName email phone')
      .populate('currentData.doctorUserId', 'fullName')
      .populate('requestedData.doctorUserId', 'fullName')
      .populate('currentData.timeslotId', 'startTime endTime')
      .populate('requestedData.timeslotId', 'startTime endTime')
      .populate('staffResponse.staffUserId', 'fullName')
      .populate({
        path: 'appointmentId',
        populate: {
          path: 'serviceId',
          select: 'serviceName'
        }
      });

    if (!request) {
      throw new Error('Không tìm thấy yêu cầu');
    }

    return request;
  }

  /**
   * Approve patient request
   */
  async approveRequest(requestId, staffUserId) {
    const request = await PatientRequest.findById(requestId);
    if (!request) {
      throw new Error('Không tìm thấy yêu cầu');
    }

    if (request.status !== 'Pending') {
      throw new Error('Yêu cầu đã được xử lý');
    }

    // Cập nhật appointment theo yêu cầu
    const appointment = await Appointment.findById(request.appointmentId);
    if (!appointment) {
      throw new Error('Không tìm thấy lịch hẹn');
    }

    // Cập nhật dữ liệu appointment
    let approvedSlot = null; // dùng để gửi email thời gian mới
    if (request.requestType === 'Reschedule') {
      // Lấy timeslot đã reserved
      const slot = await Timeslot.findById(request.requestedData.timeslotId);

      if (!slot) {
        throw new Error('Không tìm thấy timeslot đã đặt trước');
      }

      // Chuyển status từ Reserved thành Booked
      slot.status = 'Booked';
      slot.appointmentId = appointment._id;
      await slot.save();

      // Cập nhật appointment
      appointment.timeslotId = slot._id;
      appointment.rescheduleCount = (appointment.rescheduleCount || 0) + 1;
      approvedSlot = slot;
    } else if (request.requestType === 'ChangeDoctor') {
      // Lấy timeslot đã reserved cho bác sĩ mới
      const slot = await Timeslot.findById(request.requestedData.timeslotId);

      if (!slot) {
        throw new Error('Không tìm thấy timeslot đã đặt trước cho bác sĩ mới');
      }

      // Chuyển status từ Reserved thành Booked
      slot.status = 'Booked';
      slot.appointmentId = appointment._id;
      await slot.save();

      // Cập nhật appointment với bác sĩ mới và timeslot mới
      appointment.doctorUserId = request.requestedData.doctorUserId;
      appointment.timeslotId = slot._id;
      approvedSlot = slot;
    }

    await appointment.save();

    // Cập nhật request status
    request.status = 'Approved';
    request.staffResponse = {
      staffUserId,
      response: 'Approved',
      respondedAt: new Date()
    };

    await request.save();

    // Gửi email thông báo cho bệnh nhân
    try {
      const patient = await User.findById(request.patientUserId);
      const staff = await User.findById(staffUserId);

      if (patient && patient.email) {
        // Chuẩn bị thời gian hiển thị VN cho email
        let appointmentDateVN = null;
        let appointmentStartVN = null;
        let appointmentEndVN = null;
        if (approvedSlot) {
          const start = new Date(approvedSlot.startTime);
          const end = new Date(approvedSlot.endTime);
          appointmentDateVN = start.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          appointmentStartVN = start.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
          appointmentEndVN = end.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
        }
        const emailData = {
          to: patient.email,
          subject: `Yêu cầu ${request.requestType === 'Reschedule' ? 'Đổi lịch hẹn' : 'Đổi bác sĩ'} đã được duyệt`,
          template: 'requestApproved',
          data: {
            patientName: patient.fullName,
            requestType: request.requestType === 'Reschedule' ? 'Đổi lịch hẹn' : 'Đổi bác sĩ',
            staffName: staff?.fullName || 'Nhân viên',
            approvedAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            appointmentId: appointment._id.toString(),
            appointmentDateVN,
            appointmentStartVN,
            appointmentEndVN
          }
        };

        console.log('📧 Sending approval email with data:', emailData);
        await emailService.sendEmail(emailData);
        console.log(`✅ Email sent to ${patient.email} for approved request`);
      }
    } catch (emailError) {
      console.error('❌ Error sending approval email:', emailError);
      console.error('❌ Email error details:', emailError.message);
      console.error('❌ Email error stack:', emailError.stack);
      // Không throw error để không ảnh hưởng đến response chính
    }

    return request;
  }

  /**
   * Reject patient request
   */
  async rejectRequest(requestId, staffUserId, reason) {
    if (!reason) {
      throw new Error('Vui lòng cung cấp lý do từ chối');
    }

    const request = await PatientRequest.findById(requestId);
    if (!request) {
      throw new Error('Không tìm thấy yêu cầu');
    }

    if (request.status !== 'Pending') {
      throw new Error('Yêu cầu đã được xử lý');
    }

    // Nếu là yêu cầu đổi lịch hoặc đổi bác sĩ, chuyển timeslot về Available
    if ((request.requestType === 'Reschedule' || request.requestType === 'ChangeDoctor') && request.requestedData.timeslotId) {
      const slot = await Timeslot.findById(request.requestedData.timeslotId);
      if (slot && slot.status === 'Reserved') {
        slot.status = 'Available';
        slot.appointmentId = null;
        await slot.save();
      }
    }

    // Cập nhật request status
    request.status = 'Rejected';
    request.staffResponse = {
      staffUserId,
      response: 'Rejected',
      reason,
      respondedAt: new Date()
    };

    await request.save();

    // Gửi email thông báo cho bệnh nhân
    try {
      const patient = await User.findById(request.patientUserId);
      const staff = await User.findById(staffUserId);

      if (patient && patient.email) {
        const emailData = {
          to: patient.email,
          subject: `Yêu cầu ${request.requestType === 'Reschedule' ? 'Đổi lịch hẹn' : 'Đổi bác sĩ'} đã bị từ chối`,
          template: 'requestRejected',
          data: {
            patientName: patient.fullName,
            requestType: request.requestType === 'Reschedule' ? 'Đổi lịch hẹn' : 'Đổi bác sĩ',
            staffName: staff?.fullName || 'Nhân viên',
            rejectedAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
            reason: reason,
            // Nếu có thời gian yêu cầu, đính kèm để người bệnh nắm được
            requestedDateVN: request.requestedData?.startTime
              ? new Date(request.requestedData.startTime).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
              : null,
            requestedStartVN: request.requestedData?.startTime
              ? new Date(request.requestedData.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })
              : null,
            requestedEndVN: request.requestedData?.endTime
              ? new Date(request.requestedData.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' })
              : null
          }
        };

        console.log('📧 Sending rejection email with data:', emailData);
        await emailService.sendEmail(emailData);
        console.log(`✅ Email sent to ${patient.email} for rejected request`);
      }
    } catch (emailError) {
      console.error('❌ Error sending rejection email:', emailError);
      console.error('❌ Email error details:', emailError.message);
      console.error('❌ Email error stack:', emailError.stack);
      // Không throw error để không ảnh hưởng đến response chính
    }

    return request;
  }

  async assignDoctor(patientRequestId) {
    try {

      const patientRequest = await PatientRequest.findById(patientRequestId);
      if (!patientRequest) throw new Error('Yêu cầu đổi bác sĩ không tồn tại')

      await Timeslot.findByIdAndUpdate(
        patientRequest.requestedData.timeslotId,
        {status : "Booked"}
      )
      await Timeslot.findByIdAndUpdate(
        patientRequest.currentData.timeslotId,
        {status : "Cancelled"}
      )


      await Appointment.findByIdAndUpdate(
        patientRequest.appointmentId,
        {doctorUserId : patientRequest.requestedData.doctorUserId,
        timeslotId : patientRequest.requestedData.timeslotId},
      )

      patientRequest.status = "Approved";
      await patientRequest.save()
      console.log('✅ Approve change doctor success')
  
    } catch (err) {
      throw new Error(`Assign doctor change failed: ${err.message}`);
    }
  }
}

module.exports = new PatientRequestService();

