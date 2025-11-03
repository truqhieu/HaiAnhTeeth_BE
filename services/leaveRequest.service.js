const LeaveRequest = require('../models/leaveRequest.model');

const STATUS = LeaveRequest.schema.path('status').enumValues;

class LeaveRequestService {

  /**
   * Tạo leave request mới
   */
  async createLeaveRequest(userId, data) {
    const { startDate, endDate, reason } = data;

    if (!startDate || !endDate || !reason) {
      throw new Error('Vui lòng nhập đầy đủ thông tin');
    }

    const normalizeDay = (d) =>{
      const time = new Date(d);
      if(isNaN(time.getTime())) return null;
      time.setHours(0,0,0,0);
      return time;
    }

    const start = normalizeDay(startDate);
    const end = normalizeDay(endDate);


    if (!start) {
      throw new Error('Ngày bắt đầu không hợp lệ');
    }

    const now = normalizeDay(Date.now());

    if (start < now) {
      throw new Error('Ngày bắt đầu phải tính từ hiện tại');
    }

    if (end < start) {
      throw new Error('Ngày kết thúc phải lớn hơn ngày bắt đầu');
    }

    const cleanReason = reason.trim();
    if (cleanReason.length === 0) {
      throw new Error("Lý do nghỉ không thể để trống");
    }
    if (cleanReason.length < 3) {
      throw new Error('Độ dài lý do nghỉ phép không hợp lệ (tối thiểu 3 ký tự)');
    }
    if (!/^[a-zA-ZÀ-ỹ0-9\s.,!?;:'"()_-]+$/.test(cleanReason)) {
      throw new Error('Lí do nghỉ không hợp lệ. Vui lòng chỉ nhập chữ, số và các ký tự . , ! ? ; : ( ) _ -');
    }

    // Kiểm tra đơn nghỉ đã được duyệt có trùng thời gian không
    const existingApprovedLeave = await LeaveRequest.findOne({
      userId: userId,
      status: 'Approved',
      $or: [
        { startDate: { $lte: end }, endDate: { $gte: start } }
      ]
    });

    if (existingApprovedLeave) {
      throw new Error('Bạn đã có đơn nghỉ được duyệt trong khoảng thời gian này');
    }

    // Format real time

    const rightNow = new Date();
    
    const startToSave = new Date(start);
    startToSave.setHours(
      rightNow.getHours(),
      rightNow.getMinutes(),
    )

    const endToSave = new Date(end);
    endToSave.setHours(23, 59, 59, 999);

    const newRequest = new LeaveRequest({
      userId,
      startDate : startToSave,
      endDate : endToSave,
      reason : cleanReason,
    });

    await newRequest.save();
    return newRequest;
  }

  /**
   * Lấy danh sách leave requests
   */
  async getAllLeaveRequests(filters = {}, userRole = null, userId = null) {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      startDate,
      endDate,
      sort = 'desc',
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (userRole && ['Doctor', 'Nurse', 'Staff'].includes(userRole)) {
      filter.userId = userId;
    }
    if (status && STATUS.includes(status)) filter.status = status;

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regax = new RegExp(safe, 'i');
      filter.$or = [
        { reason: { $regex: regax } }
      ];
    }

    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.startDate = { ...(filter.startDate || {}), $gte: start };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.startDate = { ...(filter.startDate || {}), $lte: end };
      }
    }

    const sortOrder = sort === 'asc' ? 1 : -1;

    const [total, leaveRequests] = await Promise.all([
      LeaveRequest.countDocuments(filter),
      LeaveRequest.find(filter)
        .populate({
          path: 'userId',
          select: 'fullName role'
        })
        .populate({
          path: 'approvedByManager',
          select: 'fullName'
        })
        .select('-__v')
        .sort({ startDate: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    return {
      success: true,
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
      data: leaveRequests
    };
  }

  /**
   * Xử lý leave request (approve/reject)
   */
  async handleLeaveRequest(requestId, managerId, status) {
    const handleRequest = await LeaveRequest.findByIdAndUpdate(
      requestId,
      {
        approvedByManager: managerId,
        status,
      },
      { new: true, runValidators: true }
    );

    const map = {
      Approved: 'duyệt',
      Rejected: 'từ chối'
    };

    return { request: handleRequest, message: `Đã ${map[status]} đơn nghỉ phép` };
  }
}

module.exports = new LeaveRequestService();

