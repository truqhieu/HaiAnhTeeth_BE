const Blog = require('../models/blog.model');
const { cloudinary, deleteOldImage } = require('../config/cloudinary');
const fs = require('fs');
// const { content } = require('googleapis/build/src/apis/content');

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
    const { title, category, summary, content, status, startDate, endDate } = data;
  
    // 1. Validate title
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Tiêu đề blog không được để trống');
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) {
      throw new Error('Tiêu đề blog phải có ít nhất 3 ký tự');
    }
    // simple: chỉ chặn < >
    if (/[<>]/.test(cleanTitle)) {
      throw new Error('Tiêu đề blog không được chứa ký tự < hoặc >');
    }
  
    // 2. Validate summary
    if (!summary || typeof summary !== 'string' || !summary.trim()) {
      throw new Error('Tóm tắt blog không được để trống');
    }
    const cleanSummary = summary.trim();
    if (cleanSummary.length < 10) {
      throw new Error('Tóm tắt blog phải có ít nhất 10 ký tự');
    }
    if (/[<>]/.test(cleanSummary)) {
      throw new Error('Tóm tắt blog không được chứa ký tự < hoặc > để tránh lỗi bảo mật.');
    }
  
    // 3. Validate content
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new Error('Nội dung blog không được để trống');
    }
    const cleanContent = content.trim();
    if (cleanContent.length < 10) {
      throw new Error('Nội dung blog phải có ít nhất 10 ký tự');
    }
    if (/[<>]/.test(cleanContent)) {
      throw new Error('Nội dung blog không được chứa ký tự < hoặc > để tránh lỗi bảo mật.');
    }
  
    // 4. Validate category
    const ALLOWED_CATEGORIES = [
      "News",
      "Health Tips",
      "Medical Services",
      "Promotions",
      "Patient Stories",
      "Recruitment"
    ];
    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      throw new Error('Thể loại blog không hợp lệ');
    }
  
    // 5. Validate dates (optional)
    let parsedStartDate;
    let parsedEndDate;
  
    if (startDate != null && String(startDate).trim() !== '') {
      const d = new Date(startDate);
      if (isNaN(d.getTime())) {
        throw new Error('Ngày bắt đầu không hợp lệ');
      }
      parsedStartDate = d;
    }
  
    if (endDate != null && String(endDate).trim() !== '') {
      const d = new Date(endDate);
      if (isNaN(d.getTime())) {
        throw new Error('Ngày kết thúc không hợp lệ');
      }
      parsedEndDate = d;
    }
  
    if (parsedStartDate && parsedEndDate && parsedEndDate < parsedStartDate) {
      throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
    }
  
    // 6. Validate & upload image
    if (!file) {
      throw new Error('Vui lòng thêm ảnh thumbnail cho blog');
    }
  
    const result = await this.uploadImage(file.path);
    const imageUrl = result.secure_url;
    const imageId = result.public_id; // nếu cần lưu thì thêm field vào schema
  
    fs.unlinkSync(file.path);
  
    // 7. Tạo blog
    const blog = new Blog({
      title: cleanTitle,
      category,
      summary: cleanSummary,
      content: cleanContent,
      authorUserId,
      thumbnailUrl: imageUrl,
      status,              // nếu không truyền sẽ dùng default trong schema
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      // thumbnailId: imageId, nếu có field này trong schema
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
    const TEXT_FIELDS = ['title', 'summary', 'content', 'category', 'status'];
    const updates = {};
    let uploadedImageId = null;
    let tempFilePath = null;
    let oldBlog = null;
  
    const FIELD_LABELS = {
      title: 'Tiêu đề',
      summary: 'Tóm tắt',
      content: 'Nội dung',
      category: 'Danh mục',
      status: 'Trạng thái',
      startDate: 'Ngày bắt đầu',
      endDate: 'Ngày kết thúc',
    };
  
    const ALLOWED_CATEGORIES = [
      "News",
      "Health Tips",
      "Medical Services",
      "Promotions",
      "Patient Stories",
      "Recruitment"
    ];
  
    const ALLOWED_STATUS = ["Published", "Hidden"];
  
    try {
      // 0. Lấy blog cũ
      oldBlog = await Blog.findById(id);
      if (!oldBlog) {
        throw new Error('Không tìm thấy blog');
      }
  
      // 1. Xử lý các trường text (title, summary, content, category, status)
      for (const field of TEXT_FIELDS) {
        const value = data[field];
  
        // Không gửi thì bỏ qua (partial update)
        if (value === undefined) continue;
  
        if (typeof value !== 'string') {
          throw new Error(`${FIELD_LABELS[field]} không hợp lệ`);
        }
  
        const cleanValue = value.trim();
        if (!cleanValue) {
          throw new Error(`${FIELD_LABELS[field]} không được để trống`);
        }
  
        // Validate theo từng field
        if (field === 'title') {
          if (cleanValue.length < 3) {
            throw new Error('Tiêu đề phải có ít nhất 3 ký tự');
          }
          if (/[<>]/.test(cleanValue)) {
            throw new Error('Tiêu đề không được chứa ký tự < hoặc >');
          }
        }
  
        if (field === 'summary') {
          if (cleanValue.length < 10) {
            throw new Error('Tóm tắt phải có ít nhất 10 ký tự');
          }
          if (/[<>]/.test(cleanValue)) {
            throw new Error('Tóm tắt không được chứa ký tự < hoặc > để tránh lỗi bảo mật.');
          }
        }
  
        if (field === 'content') {
          if (cleanValue.length < 10) {
            throw new Error('Nội dung phải có ít nhất 10 ký tự');
          }
          if (/[<>]/.test(cleanValue)) {
            throw new Error('Nội dung không được chứa ký tự < hoặc > để tránh lỗi bảo mật.');
          }
        }
  
        if (field === 'category') {
          if (!ALLOWED_CATEGORIES.includes(cleanValue)) {
            throw new Error('Danh mục blog không hợp lệ');
          }
        }
  
        if (field === 'status') {
          if (!ALLOWED_STATUS.includes(cleanValue)) {
            throw new Error('Trạng thái blog không hợp lệ');
          }
        }
  
        updates[field] = cleanValue;
      }
  
      // 2. Xử lý startDate, endDate (kiểu Date, optional)
      let parsedStartDate;
      let parsedEndDate;
  
      if (data.startDate !== undefined) {
        const raw = String(data.startDate).trim();
        // Nếu raw rỗng -> không update startDate
        if (raw) {
          const d = new Date(raw);
          if (isNaN(d.getTime())) {
            throw new Error(`${FIELD_LABELS.startDate} không hợp lệ`);
          }
          parsedStartDate = d;
          updates.startDate = d;
        }
      }
  
      if (data.endDate !== undefined) {
        const raw = String(data.endDate).trim();
        // Nếu raw rỗng -> không update endDate
        if (raw) {
          const d = new Date(raw);
          if (isNaN(d.getTime())) {
            throw new Error(`${FIELD_LABELS.endDate} không hợp lệ`);
          }
          parsedEndDate = d;
          updates.endDate = d;
        }
      }
  
      // Nếu có cả 2 (từ body hoặc đã có trong DB) thì check endDate >= startDate
      const effectiveStart = parsedStartDate || oldBlog.startDate;
      const effectiveEnd = parsedEndDate || oldBlog.endDate;
      if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
        throw new Error('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
      }
  
      // 3. Xử lý ảnh (nếu có)
      if (file) {
        tempFilePath = file.path;
  
        // Upload ảnh mới trước
        const result = await this.uploadImage(file.path);
        uploadedImageId = result.public_id;
  
        updates.thumbnailUrl = result.secure_url;
        updates.thumbnailId = result.public_id; // nhớ có field này trong schema
      }
  
      if (Object.keys(updates).length === 0) {
        throw new Error('Không có trường hợp lệ để cập nhật');
      }
  
      // 4. Update database
      const updatedBlog = await Blog.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      );
  
      if (!updatedBlog) {
        throw new Error('Không tìm thấy blog sau khi cập nhật');
      }
  
      // 5. Xóa ảnh cũ SAU khi update thành công
      if (file && oldBlog.thumbnailId && oldBlog.thumbnailId !== uploadedImageId) {
        await deleteOldImage(oldBlog.thumbnailId);
      }
  
      return updatedBlog;
  
    } catch (error) {
      // Nếu có lỗi, xóa ảnh vừa upload (rollback)
      if (uploadedImageId) {
        console.warn(`⚠️  Xóa ảnh upload vì có lỗi: ${uploadedImageId}`);
        await deleteOldImage(uploadedImageId);
      }
      throw error;
  
    } finally {
      // Cleanup file tạm
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