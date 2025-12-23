const nurseService = require('../services/nurse.service');

const getNurseSchedule = async (req, res) => {
  try {
    const nurseUserId = req.user.userId;
    const { startDate, endDate } = req.query; // Lấy date range từ query params (optional)

    const data = await nurseService.getNurseSchedule(nurseUserId, startDate, endDate);

    return res.status(200).json({
      success: true,
      message: 'Lấy lịch khám thành công',
      data
    });
  } catch (error) {
    console.error('Error in getNurseSchedule:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy lịch khám',
      error: error.message
    });
  }
};

const getAppointmentDetail = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    const data = await nurseService.getAppointmentDetail(appointmentId);

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

    const data = await nurseService.getPatientDetail(patientId);

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

const getAllDoctors = async (req, res) => {
  try {
    const data = await nurseService.getAllDoctors();

    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách bác sĩ thành công',
      data
    });
  } catch (error) {
    console.error('Error in getAllDoctors:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy danh sách bác sĩ',
      error: error.message
    });
  }
};

module.exports = {
  getNurseSchedule,
  getAppointmentDetail,
  getPatientDetail,
  getAllDoctors
};
