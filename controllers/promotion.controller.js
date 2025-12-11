const promotionService = require('../services/promotion.service');

const createPromotion = async (req, res) => {
    try {
        const {
            title,
            description,
            discountType,
            discountValue,
            applyToAll,
            startDate,
            endDate,
            serviceIds
        } = req.body;

        const result = await promotionService.createPromotion({
            title,
            description,
            discountType,
            discountValue,
            applyToAll,
            startDate,
            endDate,
            serviceIds
        });

        res.status(201).json({
            success: true,
            message: 'Tạo ưu đãi giảm giá thành công',
            data: result
        });

    } catch (error) {
        console.error('Lỗi khi tạo ưu đãi giảm giá:', error);

        // Handle conflict error
        if (error.conflictedServiceIds) {
            return res.status(400).json({
                success: false,
                message: error.message,
                conflictedServiceIds: error.conflictedServiceIds
            });
        }

        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi tạo ưu đãi giảm giá'
        });
    }
};

const getAllPromotions = async (req, res) => {
    try {
        const {
            search,
            startDate,
            endDate,
            discountType,
            status,
            sort = 'desc',
            page = 1,
            limit = 10
        } = req.query;

        const result = await promotionService.getAllPromotions({
            search,
            startDate,
            endDate,
            discountType,
            status,
            sort,
            page,
            limit
        });

        return res.status(200).json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('Lỗi lấy danh sách ưu đãi', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi lấy danh sách ưu đãi'
        });
    }
};

const viewDetailPromotion = async (req, res) => {
    try {
        const result = await promotionService.getPromotionById(req.params.id);
        res.status(200).json({
            success: true,
            message: 'Chi tiết ưu đãi',
            data: result
        })
    } catch (error) {
        console.error('Lỗi khi xem chi tiết ưu đãi', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi xem chi tiết ưu đãi'
        });
    }
}

const updatePromotion = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            discountType,
            discountValue,
            applyToAll,
            startDate,
            endDate,
            serviceIds,
            status
        } = req.body;

        const result = await promotionService.updatePromotion(id, {
            title,
            description,
            discountType,
            discountValue,
            applyToAll,
            startDate,
            endDate,
            serviceIds,
            status
        });

        res.status(200).json({
            success: true,
            message: 'Cập nhật ưu đãi thành công',
            data: result
        });

    } catch (error) {
        console.error('Lỗi khi cập nhật ưu đãi:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi cập nhật ưu đãi'
        });
    }
};

const deletePromotion = async (req, res) => {
    try {
        await promotionService.deletePromotion(req.params.id);

        res.status(200).json({
            success: true,
            message: 'Đã xóa ưu đãi và các liên kết dịch vụ thành công',
        });
    } catch (error) {
        console.error('Lỗi khi xóa ưu đãi', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Đã xảy ra lỗi khi xóa ưu đãi'
        });
    }
};

module.exports = { createPromotion, getAllPromotions, viewDetailPromotion, updatePromotion, deletePromotion };
