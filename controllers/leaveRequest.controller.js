const leaveRequestService = require('../services/leaveRequest.service');

const createLeaveRequest = async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;

    const newRequest = await leaveRequestService.createLeaveRequest(req.user.userId, {
      startDate,
      endDate,
      reason
    });

    res.status(201).json({
      success: true,
      message: 'Gửi yêu cầu nghỉ thành công',
      data: newRequest,
    });
  } catch (error) {
    console.error('Lỗi khi gửi yêu cầu xin nghỉ', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi gửi yêu cầu xin nghỉ',
    });
  }
};

const getAllLeaveRequest = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      startDate,
      endDate,
      sort = 'desc',
    } = req.query;

    console.log('📥 [getAllLeaveRequest Controller] Request query:', {
      page,
      limit,
      status,
      search,
      startDate,
      endDate,
      sort,
      userRole: req.user?.role,
      userId: req.user?.userId
    });

    const result = await leaveRequestService.getAllLeaveRequests({
      page, limit, status, search, startDate, endDate, sort
    }, req.user?.role, req.user?.userId);

    console.log('📤 [getAllLeaveRequest Controller] Response to send:', {
      success: result.success,
      total: result.total,
      dataLength: result.data?.length || 0,
      dataIsArray: Array.isArray(result.data),
      hasData: !!result.data
    });

    return res.status(200).json(result);
  } catch (error) {
    console.log('Lỗi khi xem danh sách yêu cầu xin nghỉ', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xem danh sách yêu càu xin nghỉ'
    });
  }
};

const handleLeaveRequest = async (req, res) => {
  try {
    const { status } = req.body;

    const { request, message } = await leaveRequestService.handleLeaveRequest(
      req.params.id,
      req.user.userId,
      status
    );

    res.status(200).json({
      success: true,
      message,
      data: request
    });
  } catch (error) {
    console.log('Lỗi khi xử lý yêu cầu xin nghỉ', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xử lý yêu càu xin nghỉ'
    });
  }
};

module.exports = { createLeaveRequest, getAllLeaveRequest, handleLeaveRequest };
