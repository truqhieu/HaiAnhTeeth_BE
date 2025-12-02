const Complaint = require('../models/complaint.model');
const Appointment = require('../models/appointment.model');

const STATUS = Complaint.schema.path('status').enumValues;

class ComplaintService {

  /**
   * Tạo complaint mới
   */
  async createComplaint(patientUserId, data) {
    const { title, description, appointmentId } = data;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Tiêu đề phản ánh không được để trống');
    }
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả phản ánh không được để trống');
    }

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (/[<>]/.test(cleanTitle)) {
      throw new Error('Tiêu đề phản ánh không hợp lệ.');
    }
    if (cleanTitle.length < 2) {
      throw new Error('Tiêu đề phản ánh không hợp lệ (ít nhất 2 ký tự).');
    }
    if (/[<>]/.test(cleanDescription)) {
      throw new Error('Mô tả phản ánh không hợp lệ');
    }
    if (cleanDescription.length < 5) {
      throw new Error('Mô tả phản ánh không hợp lệ (ít nhất 5 ký tự).');
    }

    const checkAppointment = await Appointment.findById(appointmentId);
    if (!checkAppointment) {
      throw new Error('Lịch khám không tồn tại');
    }

    if (String(checkAppointment.patientUserId) !== String(patientUserId)) {
      throw new Error('Bạn không có quyền gửi phản ánh cho lịch khám này');
    }

    const newComplaint = new Complaint({
      patientUserId,
      appointmentId: appointmentId,
      title: cleanTitle,
      description: cleanDescription,
    });

    await newComplaint.save();
    return newComplaint;
  }

  /**
   * Lấy danh sách complaints
   */
  async getAllComplaints(filters = {}, userRole = null, patientUserId = null) {
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
    if (userRole && userRole === 'Patient') filter.patientUserId = patientUserId;
    if (status && STATUS.includes(status)) filter.status = status;

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regax = new RegExp(safe, 'i');
      filter.$or = [
        { title: { $regex: regax } },
        { description: { $regex: regax } },
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

    const [total, complaints] = await Promise.all([
      Complaint.countDocuments(filter),
      Complaint.find(filter)
        .populate({
          path: 'patientUserId',
          select: 'fullName phone'
        })
        .populate({
          path: 'appointmentId',
          select: 'checkInAt'
        })
        .populate({
          path: 'resolvedByManagerId',
          select: 'fullName'
        })
        .select('-__v')
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    return {
      status: true,
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
      data: complaints
    };
  }

  /**
   * Lấy chi tiết complaint
   */
  async getComplaintById(id) {
    const detailComplaint = await Complaint.findById(id)
      .populate('appointmentId', 'doctorId')
      .populate('resolvedByManagerId', 'fullName')
      .populate('patientUserId', 'fullName phone')
      .select('-__v');

    if (!detailComplaint) {
      throw new Error('Không tìm thấy đơn khiếu nại');
    }

    return detailComplaint;
  }

  /**
   * Xử lý complaint
   */
  async handleComplaint(id, managerId, data) {
    const { status, responseText } = data;

    const findComplaint = await Complaint.findById(id);
    if (!findComplaint) {
      throw new Error('Không tìm thấy đơn khiếu nại');
    }

    if (findComplaint.status !== 'Pending') {
      throw new Error('Đơn khiếu nại đã được xử lý, không thể cập nhật');
    }

    findComplaint.status = status;

    if (responseText) {
      if (typeof responseText !== 'string' || responseText.trim().length === 0) {
        throw new Error('Lý do xử lý đơn khiếu nại không được để trống');
      }

      const cleanResponseText = responseText.trim();

      if (!/^[a-zA-ZÀ-ỹ0-9\s.,!?;:'"()_-]+$/.test(cleanResponseText)) {
        throw new Error('Phản hồi đối với đơn phản ảnh của khách hàng không hợp lệ');
      }

      if (cleanResponseText.length < 5) {
        throw new Error('Độ dài phản hồi không hợp lệ (tối thiểu 5 ký tự)');
      }
    }

    findComplaint.managerResponses.push({
      managerUserId: managerId,
      responseText,
      respondedAt: new Date()
    });
    findComplaint.resolvedByManagerId = managerId;
    findComplaint.resolutionDate = new Date();

    await findComplaint.save();

    const map = {
      Approved: 'duyệt',
      Rejected: 'từ chối'
    };

    return { message: `Đã ${map[status]} đơn khiếu nại` };
  }

  /**
   * Xóa complaint
   */
  async deleteComplaint(id) {
    const complaint = await Complaint.findByIdAndDelete(id);
    if (!complaint) {
      throw new Error('Không tìm thấy đơn khiếu nại');
    }
    return true;
  }
}

module.exports = new ComplaintService();

