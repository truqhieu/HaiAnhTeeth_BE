const Introduction = require('../models/introduction.model');
const { cloudinary, deleteOldImage } = require('../config/cloudinary');
const fs = require('fs');

const STATUS = Introduction.schema.path('status').enumValues;

class IntroductionService {

  /**
   * Upload image to cloudinary
   */
  async uploadImage(filePath) {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "introductions",
      resource_type: "image",
      transformation: [
        { width: 300, height: 300, crop: "fill", gravity: "face" },
        { quality: "auto" },
      ],
    });
    return result;
  }

  /**
   * Tạo introduction mới
   */
  async createIntroduction(data, file) {
    const { title, summary, status } = data;

    if (title) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('Tiêu đề giới thiệu không được để trống');
      }

      const cleanTitle = title.trim();
      // if (!/^[a-zA-ZÁ-ỹ0-9\s]+$/.test(cleanTitle)) {
      //   throw new Error('Tiêu đề giới thiệu không chứa ký tự đặc biệt');
      // }

      if (cleanTitle.length < 3) {
        throw new Error('Tiêu đề giới thiệu phải có ít nhất 3 ký tự');
      }
    }

    if (summary) {
      if (typeof summary !== 'string' || summary.trim().length === 0) {
        throw new Error('Nội dung giới thiệu không được để trống');
      }

      const cleanSummary = summary.trim();
      // if (!/^[a-zA-ZÁ-ỹ0-9\s]+$/.test(cleanSummary)) {
      //   throw new Error('Nội dung giới thiệu không chứa ký tự đặc biệt');
      // }

      if (cleanSummary.length < 10) {
        throw new Error('Nội dung giới thiệu phải có ít nhất 10 ký tự');
      }
    }

    if (!file) {
      throw new Error('Vui lòng cung cấp hình ảnh');
    }

    let imageUrl = null;
    let imageId = null;
    if (file) {
      const result = await this.uploadImage(file.path);
      imageUrl = result.secure_url;
      imageId = result.public_id;
      fs.unlinkSync(file.path);
    }

    const introduction = new Introduction({
      title,
      summary,
      thumbnailUrl: imageUrl,
      thumbnailId: imageId,
      status,
    });

    await introduction.save();
    return introduction;
  }

  /**
   * Lấy danh sách introductions
   */
  async getAllIntroductions(filters = {}, userRole = null) {
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
    if (userRole !== 'Manager') {
      filter.status = 'Published';
    }
    if (status && STATUS.includes(status)) filter.status = status;

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      filter.$or = [
        { title: { $regex: regex } },
        { summary: { $regex: regex } },
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

    const [total, introductions] = await Promise.all([
      Introduction.countDocuments(filter),
      Introduction.find(filter)
        .sort({ createdAt: sortOrder })
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
      data: introductions
    };
  }

  /**
   * Lấy chi tiết introduction
   */
  async getIntroductionById(id) {
    const introduction = await Introduction.findById(id);
    if (!introduction) {
      throw new Error('Không tìm thấy giới thiệu');
    }
    return introduction;
  }

  /**
   * Cập nhật introduction
   */
async updateIntroduction(id, data, file) {
  let uploadedImageId = null;
  let tempFilePath = null;
  let oldImageId = null;

  try {
    const allowedFields = ['title', 'summary', 'status'];
    const updates = {};

    // ✅ Lấy introduction cũ để lưu avatarId trước khi update
    const introduction = await Introduction.findById(id);
    if (!introduction) {
      throw new Error('Không tìm thấy giới thiệu');
    }

    // Lưu imageId cũ (nếu có)
    if (file && introduction.thumbnailId) {
      oldImageId = introduction.thumbnailId;
    }

    // Xử lý các trường text
    for (const field of allowedFields) {
      const value = data[field];

      if (value === undefined) continue;

      if (typeof value !== 'string' || value.trim().length === 0) {
        const fieldNames = {
          title: 'Tiêu đề',
          summary: 'Nội dung',
          status: 'Trạng thái'
        };
        throw new Error(`${fieldNames[field]} không được để trống`);
      }

      const cleanValue = value.trim();

      if (!/^[a-zA-ZÀ-ỹ0-9\s]+$/.test(cleanValue)) {
        const fieldNames = {
          title: 'Tiêu đề',
          summary: 'Nội dung',
          status: 'Trạng thái'
        };
        throw new Error(`${fieldNames[field]} không được chứa ký tự đặc biệt`);
      }

      const minLength = field === 'title' ? 3 :
        field === 'summary' ? 10 : 3;

      if (cleanValue.length < minLength) {
        const fieldNames = {
          title: 'Tiêu đề',
          summary: 'Nội dung',
          status: 'Trạng thái'
        };
        throw new Error(`${fieldNames[field]} phải có ít nhất ${minLength} ký tự`);
      }

      updates[field] = cleanValue;
    }

    // ✅ Upload ảnh mới trước (nếu có)
    if (file) {
      tempFilePath = file.path;
      const result = await this.uploadImage(file.path);
      uploadedImageId = result.public_id;
      updates.thumbnailUrl = result.secure_url;
      updates.thumbnailId = result.public_id;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    // ✅ Update database
    const updatedIntroduction = await Introduction.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedIntroduction) {
      throw new Error('Không tìm thấy giới thiệu');
    }

    // ✅ Xóa ảnh cũ SAU khi update thành công
    if (oldImageId && oldImageId !== uploadedImageId) {
      await deleteOldImage(oldImageId);
    }

    return updatedIntroduction;

  } catch (error) {
    console.error('Lỗi cập nhật giới thiệu:', error);

    // ❌ Nếu có lỗi, xóa ảnh vừa upload
    if (uploadedImageId) {
      console.warn(`⚠️  Xóa ảnh upload vì có lỗi: ${uploadedImageId}`);
      await deleteOldImage(uploadedImageId);
    }

    throw error;

  } finally {
    // ✅ Cleanup file tạm thời (an toàn)
    if (tempFilePath) {
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        console.error('❌ Lỗi khi xóa file tạm:', cleanupError);
      }
    }
  }
}

  /**
   * Xóa introduction
   */
  async deleteIntroduction(id) {
    const introduction = await Introduction.findById(id);
    if (!introduction) {
      throw new Error('Không tìm thấy giới thiệu để xóa');
    }

    // Nếu có ảnh thì xóa trên Cloudinary
    if (introduction.thumbnailId) {
      try {
        await deleteOldImage(introduction.thumbnailId);
      } catch (err) {
        console.warn('⚠️ Lỗi khi xóa ảnh Cloudinary:', err.message);
      }
    }

    // Xóa introduction khỏi MongoDB
    await Introduction.findByIdAndDelete(id);
    return true;
  }
}

module.exports = new IntroductionService();