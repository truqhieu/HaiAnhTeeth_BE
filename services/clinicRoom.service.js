const Clinicroom = require('../models/clinicRoom.model');
const User = require('../models/user.model');
const ScheduleDoctor = require('../models/doctorSchedule.model')

const STATUS = Clinicroom.schema.path('status').enumValues;

class ClinicService {

  /**
   * Validate name
   */
  _validateName(name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Tên phòng khám không được để trống');
    }

    const cleanName = name.trim().replace(/\s{2,}/g, ' ');
    if (!cleanName) {
      throw new Error('Tên phòng khám không được để trống');
    }

    if (/[<>]/.test(cleanName)) {
      throw new Error('Tên phòng khám không được chứa ký tự < hoặc >');
    }

    if (cleanName.length < 2) {
      throw new Error('Độ dài tên phòng khám không hợp lệ (tối thiểu 2 ký tự)');
    }

    return cleanName;
  }

  /**
   * Validate description
   */
  _validateDescription(description) {
    if (typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả phòng khám không được để trống');
    }

    const cleanDescription = description.trim().replace(/\s{2,}/g, ' ');
    if (!cleanDescription) {
      throw new Error('Mô tả phòng khám không được để trống');
    }

    if (/[<>]/.test(cleanDescription)) {
      throw new Error('Mô tả phòng khám không được chứa ký tự < hoặc >');
    }

    if (cleanDescription.length < 4) {
      throw new Error('Độ dài mô tả phòng khám không hợp lệ (tối thiểu 4 ký tự)');
    }

    return cleanDescription;
  }

  /**
   * Tạo phòng khám mới
   */
  async createClinicRoom(data) {
    const { name, description } = data;

    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Tên phòng khám không được để trống');
    }

    const cleanName = name.trim().replace(/\s{2,}/g, ' ');
    if (!cleanName) {
      throw new Error('Tên phòng khám không được để trống');
    }

    if (/[<>]/.test(cleanName)) {
      throw new Error('Tên phòng khám không được chứa ký tự < hoặc >');
    }

    if (cleanName.length < 2) {
      throw new Error('Độ dài tên phòng khám không hợp lệ (tối thiểu 2 ký tự)');
    }

    if (typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả phòng khám không được để trống');
    }

    const cleanDescription = description.trim().replace(/\s{2,}/g, ' ');
    if (!cleanDescription) {
      throw new Error('Mô tả phòng khám không được để trống');
    }

    if (/[<>]/.test(cleanDescription)) {
      throw new Error('Mô tả phòng khám không được chứa ký tự < hoặc >');
    }

    if (cleanDescription.length < 4) {
      throw new Error('Độ dài mô tả phòng khám không hợp lệ (tối thiểu 4 ký tự)');
    }


    const createRoom = new Clinicroom({ name: cleanName, description: cleanDescription });
    await createRoom.save();
    return createRoom;
  }

  /**
   * Lấy danh sách phòng khám
   */
  async getAllClinicRooms(filters = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      startDate,
      endDate,
      sort = 'desc'
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (status && STATUS.includes(status)) filter.status = status;

    if (search && String(search).trim().length > 0) {
      const serachKey = String(search).trim();
      const safe = serachKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regax = new RegExp(safe, 'i');
      filter.$or = [
        { name: { $regex: regax } },
        { description: { $regex: regax } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 9999);
        filter.createdAt.$lte = end;
      }
    }

    const sortOrder = sort === 'asc' ? 1 : -1;

    const [total, clinicrooms] = await Promise.all([
      Clinicroom.countDocuments(filter),
      Clinicroom.find(filter)
        .populate({
          path: 'assignedDoctorId',
          select: 'fullName'
        })
        .sort({ createdAt: sortOrder })
        .select('-__v')
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    return {
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
      data: clinicrooms
    };
  }

  /**
   * Lấy chi tiết phòng khám
   */
  async getClinicRoomById(id) {
    const detailRoom = await Clinicroom.findById(id)
      .populate({
        path: "assignedDoctorId",
        select: "fullName"
      });

    if (!detailRoom) {
      throw new Error('Không tìm thấy phòng khám');
    }

    return detailRoom;
  }

  /**
   * Cập nhật phòng khám
   */
  async updateClinicRoom(id, data) {
    const updateFields = ['name', 'description', 'status'];
    const updates = {};

    for (const key of Object.keys(data)) {
      if (!updateFields.includes(key)) continue;

      let value = data[key];

      if (key === 'name') {
        const cleanName = value.trim().replace(/\s{2,}/g, ' ');
        if (cleanName.length === 0) {
          throw new Error('Tên phòng khám không được để trống');
        }
        if (/[<>]/.test(cleanName)) {
          throw new Error('Tên phòng khám không được chứa ký tự < hoặc >');
        }
        if (cleanName.length < 2) {
          throw new Error('Độ dài tên phòng khám không hợp lệ (tối thiểu 2 ký tự)');
        }
        updates[key] = cleanName;
      }

      if (key === 'description') {
        const cleanDescription = value.trim().replace(/\s{2,}/g, ' ');
        if (cleanDescription.length === 0) {
          throw new Error('Mô tả phòng khám không được để trống');
        }
        if (/[<>]/.test(cleanDescription)) {
          throw new Error('Mô tả phòng khám không được chứa ký tự < hoặc >');
        }
        if (cleanDescription.length < 4) {
          throw new Error('Độ dài mô tả phòng khám không hợp lệ (tối thiểu 4 ký tự)');
        }
        updates[key] = cleanDescription;
      }

      if (key === 'status') {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    const room = await Clinicroom.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!room) {
      throw new Error('Không tìm thấy phòng khám');
    }

    return room;
  }

  /**
   * Xóa phòng khám
   */
  async deleteClinicRoom(id) {
    const room = await Clinicroom.findByIdAndDelete(id).populate('assignedDoctorId');
    if (!room) throw new Error('Không tìm thấy phòng khám')

    if (room.assignedDoctorId !== null) throw new Error('Có bác sĩ đang được gán với phòng khám này')
    return true;
  }

  /**
   * Lấy danh sách bác sĩ chưa được gán phòng
   */
  async listAvailableDoctors() {
    const offDoctor = await Clinicroom.find({ assignedDoctorId: { $ne: null } }).distinct('assignedDoctorId');

    const onDoctor = await User.find({
      role: 'Doctor',
      _id: { $nin: offDoctor }
    });

    return onDoctor;
  }

  /**
   * Gán bác sĩ cho phòng khám
   */
  async assignDoctor(clinicId, doctorId) {
    const clinic = await Clinicroom.findByIdAndUpdate(
      clinicId,
      { assignedDoctorId: doctorId },
      { new: true }
    ).populate({
      path: 'assignedDoctorId',
      select: 'fullName'
    });

    const doctor = await User.findById(doctorId);
    return { clinic, doctor };
  }

  /**
   * Gỡ bác sĩ khỏi phòng khám
   */
  async unassignDoctor(clinicId) {
    const clinic = await Clinicroom.findByIdAndUpdate(
      clinicId,
      { assignedDoctorId: null },
      { new: true }
    );

    if (!clinic) {
      throw new Error('Không tìm thấy phòng khám');
    }

    return clinic;
  }
}

module.exports = new ClinicService();

