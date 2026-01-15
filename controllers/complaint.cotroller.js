const complaintService = require('../services/complaint.service');

const createComplaint = async (req, res) => {
  try {
    const { title, description, appointmentId } = req.body;

    const newComplaint = await complaintService.createComplaint(req.user.userId, {
      title,
      description,
      appointmentId
    });

    return res.status(201).json({
      success: true,
      message: 'Gửi phản ánh thành công',
      data: newComplaint,
    });
  } catch (error) {
    console.error('Lỗi khi gửi phản ánh', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi gửi phản ánh',
    });
  }
};

const getAllComplaints = async (req, res) => {
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

    const result = await complaintService.getAllComplaints({
      page, limit, status, search, startDate, endDate, sort
    }, req.user?.role, req.user?.userId);

    return res.status(200).json(result);
  } catch (error) {
    console.log('Lỗi khi gửi phản ánh', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi gửi phản ánh'
    });
  }
};

const viewDetailComplaint = async (req, res) => {
  try {
    const detailComplaint = await complaintService.getComplaintById(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Chi tiết đơn khiếu nại',
      data: detailComplaint,
    });
  } catch (error) {
    console.log('Lỗi khi xem chi tiết đơn khiếu nại', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi xem chi tiết đơn khiếu nại'
    });
  }
};

const handleComplaint = async (req, res) => {
  try {
    const { status, responseText } = req.body;

    const { message } = await complaintService.handleComplaint(
      req.params.id,
      req.user.userId,
      { status, responseText }
    );

    res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.log('Lỗi khi xử lý đơn khiếu nại', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xử lý đơn khiếu nại'
    });
  }
};

const deleteComplaint = async (req, res) => {
  try {
    await complaintService.deleteComplaint(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Xóa đơn khiếu nại thành công'
    });
  } catch (error) {
    console.log('Lỗi khi xóa đơn khiếu nại', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xóa đơn khiếu nại'
    });
  }
};

module.exports = { createComplaint, getAllComplaints, viewDetailComplaint, handleComplaint, deleteComplaint };
