const introductionService = require('../services/introduction.service');

const createIntroduction = async (req, res) => {
    try {
        const {
            title,
            summary,
            status,
        } = req.body;
        
        const introduction = await introductionService.createIntroduction(
            { title, summary, status },
            req.file
        );

        res.status(201).json({
            success: true,
            message: 'Tạo mới giới thiệu thành công',
            data: introduction
        });
    } catch (error) {
        console.log('Lỗi khi tạo giới thiệu', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi tạo giới thiệu'
        });
    }
};

const getAllIntroductions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            search,
            startDate,
            endDate,
            sort = 'desc'
        } = req.query;

        const result = await introductionService.getAllIntroductions({
            page,
            limit,
            status,
            search,
            startDate,
            endDate,
            sort
        }, req.user?.role);

        return res.status(200).json({
            success: true,
            message: 'Lấy danh sách giới thiệu thành công',
            data: result
        });
    } catch (error) {
        console.log('Lỗi khi lấy danh sách giới thiệu', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi lấy danh sách giới thiệu'
        });
    }
};

const viewDetailIntroduction = async (req, res) => {
    try {
        const introduction = await introductionService.getIntroductionById(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Chi tiết giới thiệu',
            data: introduction
        });
    } catch (error) {
        console.log('Lỗi khi xem chi tiết giới thiệu', error);
        return res.status(404).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi xem chi tiết giới thiệu'
        });
    }
};

const updateIntroduction = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};
        const allowedFields = ['title', 'summary', 'status'];

        // Lấy các fields được gửi lên
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        const introduction = await introductionService.updateIntroduction(id, updates, req.file);

        res.status(200).json({
            success: true,
            message: 'Cập nhật giới thiệu thành công',
            data: introduction
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật giới thiệu:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi cập nhật giới thiệu'
        });
    }
};

// const deleteIntroduction = async (req, res) => {
//   try {
//     await introductionService.deleteIntroduction(req.params.id);
//
//     res.status(200).json({
//       success: true,
//       message: 'Xóa giới thiệu thành công'
//     });
//   } catch (error) {
//     console.error('Lỗi khi xóa giới thiệu:', error);
//     return res.status(500).json({
//       success: false,
//       message: error.message || 'Đã xảy ra lỗi khi xóa giới thiệu'
//     });
//   }
// };

module.exports = { createIntroduction, getAllIntroductions, viewDetailIntroduction, updateIntroduction };