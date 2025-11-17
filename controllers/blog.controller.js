const blogService = require('../services/blog.service');

const createBlog = async (req, res) => {
    try {
        const {
            title,
            category,
            summary,
            status,
        } = req.body;
        
    const blog = await blogService.createBlog(
      { title, category, summary, status },
      req.file,
      req.user.userId
    );

        res.status(201).json({
      success: true,
      message: 'Tạo mới blog thành công',
      data: blog
    });
    } catch (error) {
        console.log('Lỗi khi tạo blog', error);
        return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi tạo blog'
    });
  }
};

const getAllBlogs = async (req, res) => {
   try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      search,
      startDate,
      endDate,
      sort = 'desc'
    } = req.query;

    const result = await blogService.getAllBlogs({
      page,
      limit,
      category,
      status,
      search,
      startDate,
      endDate,
      sort
    }, req.user?.role);

    return res.status(200).json({
      status: true,
      ...result
    });
    } catch (error) {
        console.log('Lỗi khi lấy danh sách blog', error);
        return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi lấy danh sách blog'
    });
  }
};

const viewDetailBlogs = async (req, res) => {
  try {
    const blog = await blogService.getBlogById(req.params.id);

        res.status(200).json({
      success: true,
      message: 'Chi tiết blog',
      data: blog
    });
    } catch (error) {
        console.log('Lỗi khi xem chi tiết blog', error);
    return res.status(404).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xem chi tiết blog'
    });
  }
};

const updateBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};
        const allowedFields = ['title', 'summary', 'category', 'status'];

    // Lấy các fields được gửi lên
        for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const blog = await blogService.updateBlog(id, updates, req.file);

        res.status(200).json({
            success: true,
            message: 'Cập nhật blog thành công',
            data: blog
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật blog:', error);
        return res.status(500).json({
            success: false,
      message: error.message || 'Đã xảy ra lỗi khi cập nhật blog'
        });
    }
};

// const deleteBlog = async (req, res) => {
//   try {
//     await blogService.deleteBlog(req.params.id);

//     res.status(200).json({
//       success: true,
//       message: 'Xóa blog thành công'
//     });
//   } catch (error) {
//     console.error('Lỗi khi xóa blog:', error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || 'Đã xảy ra lỗi khi xóa blog'
//     });
//   }
// };

module.exports = { createBlog, getAllBlogs, viewDetailBlogs, updateBlog};
