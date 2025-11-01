const patientRequestService = require('../services/patientRequest.service');

const getAllPatientRequests = async (req, res) => {
  try {
    const { status, requestType, page = 1, limit = 10 } = req.query;

    const result = await patientRequestService.getAllPatientRequests({
      status, requestType, page, limit
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in getAllPatientRequests:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi lấy danh sách yêu cầu',
      error: error.message
    });
  }
};

const getPatientRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const data = await patientRequestService.getPatientRequestById(requestId);

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('❌ Error in getPatientRequestById:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi lấy chi tiết yêu cầu',
      error: error.message
    });
  }
};

const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const staffUserId = req.user?.userId;

    const data = await patientRequestService.approveRequest(requestId, staffUserId);

    return res.status(200).json({
      success: true,
      message: 'Duyệt yêu cầu thành công',
      data
    });
  } catch (error) {
    console.error('❌ Error in approveRequest:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi duyệt yêu cầu',
      error: error.message
    });
  }
};

const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const staffUserId = req.user?.userId;

    const data = await patientRequestService.rejectRequest(requestId, staffUserId, reason);

    return res.status(200).json({
      success: true,
      message: 'Từ chối yêu cầu thành công',
      data
    });
  } catch (error) {
    console.error('❌ Error in rejectRequest:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi từ chối yêu cầu',
      error: error.message
    });
  }
};

const assignDoctor = async (req,res) =>{
  try {
    const { requestId } = req.params;

    const updated = await patientRequestService.assignDoctor(requestId);

    return res.status(200).json({
      success: true,
      message: 'Đổi bác sĩ thành công',
      data: updated
    });

  } catch (error) {
    console.error('❌ Error in assignDoctor:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Có lỗi xảy ra khi đổi bác sĩ mới',
    });
  }
}


module.exports = {
  getAllPatientRequests,
  getPatientRequestById,
  approveRequest,
  rejectRequest,
  assignDoctor
};
