const doctorService = require('../services/doctor.service');

const getPatientAppointmentsForDoctor = async (req, res) => {
  try {
    const doctorUserId = req.user.userId;
    const { patientId } = req.params;

    const data = await doctorService.getPatientAppointmentsForDoctor(doctorUserId, patientId);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('❌ getPatientAppointmentsForDoctor error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

const getDoctorAppointmentsSchedule = async (req, res) => {
  try {
    const doctorUserId = req.user.userId;
    const { startDate, endDate } = req.query; // Lấy date range từ query params (optional)

    const data = await doctorService.getDoctorAppointmentsSchedule(doctorUserId, startDate, endDate);

    return res.status(200).json({
      success: true,
      message: 'Lấy lịch khám thành công',
      data
    });
  } catch (error) {
    console.error('❌ getDoctorAppointmentsSchedule error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
  }
};

const getAppointmentDetail = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const doctorUserId = req.user.userId;

    const data = await doctorService.getAppointmentDetail(appointmentId, doctorUserId);

    return res.status(200).json({
      success: true,
      message: 'Lấy chi tiết lịch hẹn thành công',
      data
    });
  } catch (error) {
    console.error('Error in getAppointmentDetail:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy chi tiết lịch hẹn',
      error: error.message
    });
  }
};

const getPatientDetail = async (req, res) => {
  try {
    const { patientId } = req.params;

    const data = await doctorService.getPatientDetail(patientId);

    return res.status(200).json({
      success: true,
      message: 'Lấy chi tiết thông tin bệnh nhân thành công',
      data
    });
  } catch (error) {
    console.error('Error in getPatientDetail:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thông tin bệnh nhân',
      error: error.message
    });
  }
};

module.exports = {
  getDoctorAppointmentsSchedule,
  getAppointmentDetail,
  getPatientDetail,
  getPatientAppointmentsForDoctor,
};
