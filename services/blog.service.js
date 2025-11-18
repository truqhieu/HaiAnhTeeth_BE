const Blog = require('../models/blog.model');
const { cloudinary, deleteOldImage } = require('../config/cloudinary');
const fs = require('fs');

const CATEGORY = Blog.schema.path('category').enumValues;
const STATUS = Blog.schema.path('status').enumValues;

class BlogService {

  /**
   * Upload image to cloudinary
   */
  async uploadImage(filePath) {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: "blogs",
      resource_type: "image",
      transformation: [
        { width: 300, height: 300, crop: "fill", gravity: "face" },
        { quality: "auto" },
      ],
    });
    return result;
  }

  /**
   * Tạo blog mới
   */
  async createBlog(data, file, authorUserId) {
    const { title, category, summary, status } = data;

    if (title) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('Tiêu đề blog không được để trống');
      }

      const cleanTitle = title.trim();
      if (!/^[a-zA-ZÁ-ỹ0-9\s]+$/.test(cleanTitle)) {
        throw new Error('Tiêu đề blog không chứa kí tự đặc biệt');
      }

      if (cleanTitle.length < 3) {
        throw new Error('Tiêu đề blog phải có ít nhất 3 ký tự');
      }
    }

    if (summary) {
      if (typeof summary !== 'string' || summary.trim().length === 0) {
        throw new Error('Mô tả blog không được để trống');
      }

      const cleanSummary = summary.trim();
      if (/[<>]/.test(cleanSummary)) {
      throw new Error('Mô tả blog không được chứa ký tự < hoặc > để tránh lỗi bảo mật.');
      }

      if (cleanSummary.length < 10) {
        throw new Error('Mô tả blog phải có ít nhất 10 ký tự');
      }
    }

    let imageUrl = null;
    let imageId = null;
    if (file) {
      const result = await this.uploadImage(file.path);
      imageUrl = result.secure_url;
      imageId = result.public_id;
      fs.unlinkSync(file.path);
    }

    const blog = new Blog({
      title,
      category,
      summary,
      authorUserId,
      thumbnailUrl: imageUrl,
      thumbnailId: imageId,
      status,
    });

    await blog.save();
    return blog;
  }

  /**
   * Lấy danh sách blogs
   */
  async getAllBlogs(filters = {}, userRole = null) {
    const {
      page = 1,
      limit = 10,
      category,
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
    if (category && CATEGORY.includes(category)) filter.category = category;
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

    const [total, blogs] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter)
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
      data: blogs
    };
  }

  /**
   * Lấy danh sách blogs theo thể loại Promotions
   */
   async getPromotionBlogs(filters = {}, userRole = null) {
    const {
      page = 1,
      limit = 10,
      search,
      startDate,
      endDate,
      sort = 'desc'
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = { category: 'Promotions', status: 'Published' };

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

    const [total, blogs] = await Promise.all([
      Blog.countDocuments(filter),
      Blog.find(filter)
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
      data: blogs
    };
  }

  /**
   * Lấy chi tiết blog
   */
  async getBlogById(id) {
    const blog = await Blog.findById(id);
    if (!blog) {
      throw new Error('Không tìm thấy blog');
    }
    return blog;
  }

  /**
   * Cập nhật blog
   */
  async updateBlog(id, data, file) {
    const allowedFields = ['title', 'summary', 'category', 'status'];
    const updates = {};

    // Xử lý các trường text
    for (const field of allowedFields) {
      const value = data[field];

      if (value === undefined) continue;

      if (typeof value !== 'string' || value.trim().length === 0) {
        const fieldNames = {
          title: 'Tiêu đề',
          summary: 'Mô tả',
          category: 'Danh mục',
          status: 'Trạng thái'
        };
        throw new Error(`${fieldNames[field]} không được để trống`);
      }

      const cleanValue = value.trim();

      if (!/^[a-zA-ZÀ-ỹ0-9\s]+$/.test(cleanValue)) {
        const fieldNames = {
          title: 'Tiêu đề',
          summary: 'Mô tả',
          category: 'Danh mục',
          status: 'Trạng thái'
        };
        throw new Error(`${fieldNames[field]} không được chứa ký tự đặc biệt`);
      }

      const minLength = field === 'title' ? 3 :
        field === 'summary' ? 10 :
          field === 'category' ? 2 : 3;

      if (cleanValue.length < minLength) {
        const fieldNames = {
          title: 'Tiêu đề',
          summary: 'Mô tả',
          category: 'Danh mục',
          status: 'Trạng thái'
        };
        throw new Error(`${fieldNames[field]} phải có ít nhất ${minLength} ký tự`);
      }

      updates[field] = cleanValue;
    }

    // Xử lý ảnh (nếu có)
    if (file) {
      const result = await this.uploadImage(file.path);

      const blog = await Blog.findById(id);
      if (blog && blog.thumbnailId) {
        await deleteOldImage(blog.thumbnailId);
      }

      updates.thumbnailUrl = result.secure_url;
      updates.thumbnailId = result.public_id;

      fs.unlinkSync(file.path);
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    const blog = await Blog.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!blog) {
      throw new Error('Không tìm thấy blog');
    }

    return blog;
  }

  /**
   * Xóa blog
   */
  async deleteBlog(id) {
    const blog = await Blog.findById(id);
    if (!blog) {
      throw new Error('Không tìm thấy blog để xóa');
    }

    // Nếu có ảnh thì xóa trên Cloudinary
    if (blog.thumbnailId) {
      try {
        await deleteOldImage(blog.thumbnailId);
      } catch (err) {
        console.warn('⚠️ Lỗi khi xóa ảnh Cloudinary:', err.message);
      }
    }

    // Xóa blog khỏi MongoDB
    await Blog.findByIdAndDelete(id);
    return true;
  }
}

module.exports = new BlogService();