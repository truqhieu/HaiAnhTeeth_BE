const Device = require('../models/device.model');

const STATUS = Device.schema.path('status').enumValues;

class DeviceService {

  /**
   * Validate name
   */
  _validateName(name) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Tên thiết bị không được để trống');
    }

    const cleanName = name.trim().replace(/\s{2,}/g, ' ');
    if (cleanName.length === 0) {
      throw new Error('Tên thiết bị không được để trống');
    }

    if (/[<>]/.test(cleanName)) {
      throw new Error('Tên thiết bị không được chứa ký tự < hoặc >');
    }

    if (cleanName.length < 3) {
      throw new Error('Tên thiết bị phải có ít nhất 3 ký tự');
    }

    return cleanName;
  }

  /**
   * Validate description
   */
  _validateDescription(description) {
    if (typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả thiết bị không được để trống');
    }

    const cleanDescription = description.trim().replace(/\s{2,}/g, ' ');
    if (cleanDescription.length === 0) {
      throw new Error('Mô tả thiết bị không được để trống');
    }

    if (/[<>]/.test(cleanDescription)) {
      throw new Error('Mô tả thiết bị không được chứa ký tự < hoặc >');
    }

    if (cleanDescription.length < 3) {
      throw new Error('Mô tả thiết bị phải có ít nhất 3 ký tự');
    }

    return cleanDescription;
  }

  /**
   * Validate dates
   */
  _validateDates(purchaseDate, expireDate) {
    const start = new Date(purchaseDate);

    if (isNaN(start.getTime())) {
      throw new Error('Ngày mua thiết bị không hợp lệ.');
    }

    const end = new Date(expireDate);

    if (end <= start) {
      throw new Error('Ngày hết hạn phải lớn hơn ngày bắt đầu mua.');
    }
  }

  /**
   * Tạo thiết bị mới
   */
  async createDevice(data) {
    const { name, description, purchaseDate, expireDate } = data;

    if (!name || !description || !purchaseDate || !expireDate) {
      throw new Error('Vui lòng không để trống các trường nhập');
    }

    this._validateName(name);
    this._validateDescription(description);
    this._validateDates(purchaseDate, expireDate);

    const newDevice = new Device({
      name,
      description,
      purchaseDate,
      expireDate
    });

    await newDevice.save();
    return newDevice;
  }

  /**
   * Lấy danh sách thiết bị
   */
  async getAllDevices(filters = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sort = 'desc',
      startDate,
      endDate
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // Lọc theo trạng thái (nếu có)
    if (status && STATUS.includes(status)) filter.status = status;

    // Tìm kiếm theo tên hoặc mô tả
    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      filter.$or = [
        { name: { $regex: regex } },
        { description: { $regex: regex } },
      ];
    }

    // Auto update expired devices
    const now = new Date();
    await Device.updateMany(
      { expireDate: { $lt: now }, status: { $ne: 'Inactive' } },
      { $set: { status: 'Inactive' } }
    );

    // Lọc theo khoảng thời gian mua
    if (startDate || endDate) {
      filter.purchaseDate = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start)) filter.purchaseDate.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end)) filter.purchaseDate.$lte = end;
      }
    }

    const sortOrder = sort.toLowerCase() === 'asc' ? 1 : -1;

    const [total, devices] = await Promise.all([
      Device.countDocuments(filter),
      Device.find(filter)
        .select('-__v')
        .sort({ purchaseDate: sortOrder })
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
      data: devices
    };
  }

  /**
   * Lấy chi tiết thiết bị
   */
  async getDeviceById(id) {
    const detailDevice = await Device.findById(id).select('-__v');
    if (!detailDevice) {
      throw new Error('Thiết bị không tồn tại');
    }
    return detailDevice;
  }

  /**
   * Cập nhật thiết bị
   */
  async updateDevice(id, data) {
    const { name, description, purchaseDate, expireDate, status } = data;
    const updates = {};

    // Validate name
    if (name !== undefined) {
      const cleanName = this._validateName(name);
      updates.name = cleanName;
    }

    // Validate description
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        throw new Error('Mô tả thiết bị không được để trống');
      }

      const cleanDescription = description.trim().replace(/\s{2,}/g, ' ');
      if (cleanDescription.length === 0) {
        throw new Error('Mô tả thiết bị không được để trống');
      }

      if (/[<>]/.test(cleanDescription)) {
        throw new Error('Mô tả thiết bị không được chứa ký tự < hoặc >');
      }

      if (cleanDescription.length < 3) {
        throw new Error('Mô tả thiết bị phải có ít nhất 3 ký tự');
      }

      updates.description = cleanDescription;
    }

    // Validate dates
    let start, end;
    if (purchaseDate !== undefined) {
      start = new Date(purchaseDate);
      if (isNaN(start.getTime())) {
        throw new Error('Ngày mua thiết bị không hợp lệ');
      }
      updates.purchaseDate = start;
    }

    if (expireDate !== undefined) {
      end = new Date(expireDate);
      if (isNaN(end.getTime())) {
        throw new Error('Ngày hết hạn thiết bị không hợp lệ');
      }
      updates.expireDate = end;
    }

    // Kiểm tra quan hệ giữa start và end
    if (updates.purchaseDate && updates.expireDate) {
      if (updates.expireDate <= updates.purchaseDate) {
        throw new Error('Ngày hết hạn phải lớn hơn ngày mua thiết bị');
      }
    }

    // Validate status
    if (status !== undefined) {
      const validStatuses = ['Active', 'Inactive'];
      if (!validStatuses.includes(status)) {
        throw new Error('Trạng thái thiết bị không hợp lệ');
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    const device = await Device.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!device) {
      throw new Error('Không tìm thấy thiết bị');
    }

    return device;
  }

  /**
   * Xóa thiết bị
   */
  async deleteDevice(id) {
    const device = await Device.findByIdAndDelete(id);
    if (!device) {
      throw new Error('Không tìm thấy thiết bị');
    }
    return true;
  }
}

module.exports = new DeviceService();

