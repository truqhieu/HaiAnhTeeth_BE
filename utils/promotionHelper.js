const Promotion = require('../models/promotion.model');
const PromotionService = require('../models/promotionService.model');

/**
 * Helper function để tính promotion cho một service
 * @param {String} serviceId - ID của service
 * @param {Number} servicePrice - Giá gốc của service
 * @returns {Object} { originalPrice, finalPrice, hasPromotion, promotionInfo, discountAmount }
 */
async function calculateServicePrice(serviceId, servicePrice) {
  try {
    const now = new Date();

    // 1. Lấy links từ PromotionService
    const links = await PromotionService.find({
      serviceId: serviceId
    }).lean();

    if (links.length === 0) {
      // Không có promotion
      return {
        originalPrice: servicePrice,
        finalPrice: servicePrice,
        hasPromotion: false,
        promotionInfo: null,
        discountAmount: 0
      };
    }

    const promotionIds = links.map(l => l.promotionId);

    // 2. Lấy promotions ACTIVE (check theo thời gian thực)
    const promotions = await Promotion.find({
      _id: { $in: promotionIds },
      startDate: { $lte: now },  // Đã bắt đầu
      endDate: { $gte: now },      // Chưa hết hạn
      status: { $ne: 'Expired', $ne: 'Inactive' }   
    }).lean();

    if (promotions.length === 0) {
      // Không có promotion active
      return {
        originalPrice: servicePrice,
        finalPrice: servicePrice,
        hasPromotion: false,
        promotionInfo: null,
        discountAmount: 0
      };
    }

    // 3. Tính giá cho từng promotion, chọn tốt nhất (giá thấp nhất)
    let bestPrice = servicePrice;
    let bestPromotion = null;

    for (const promo of promotions) {
      // Double check thời gian (đảm bảo chắc chắn)
      const isActive = now >= promo.startDate && now <= promo.endDate;
      if (!isActive) continue;

      let finalPrice = servicePrice;

      if (promo.discountType === 'Percent') {
        finalPrice = servicePrice * (1 - promo.discountValue / 100);
      } else if (promo.discountType === 'Fix') {
        finalPrice = Math.max(0, servicePrice - promo.discountValue);
      }

      if (finalPrice < bestPrice) {
        bestPrice = Math.round(finalPrice);
        bestPromotion = promo;
      }
    }

    const discountAmount = bestPromotion ? servicePrice - bestPrice : 0;

    return {
      originalPrice: servicePrice,
      finalPrice: bestPrice,
      hasPromotion: bestPromotion !== null,
      promotionInfo: bestPromotion ? {
        promotionId: bestPromotion._id,
        title: bestPromotion.title,
        discountType: bestPromotion.discountType,
        discountValue: bestPromotion.discountValue,
        discountAmount: discountAmount
      } : null,
      discountAmount: discountAmount
    };

  } catch (error) {
    console.error('❌ [PromotionHelper] Lỗi tính promotion:', error);
    // Nếu lỗi, trả về giá gốc
    return {
      originalPrice: servicePrice,
      finalPrice: servicePrice,
      hasPromotion: false,
      promotionInfo: null,
      discountAmount: 0
    };
  }
}

/**
 * Tính promotion cho nhiều services (batch)
 * @param {Array} services - Array of { _id, price, ... }
 * @returns {Array} Services với promotion info
 */
async function calculateServicesPrices(services) {
  const results = await Promise.all(
    services.map(async (service) => {
      const promotionData = await calculateServicePrice(
        service._id,
        service.price
      );

      return {
        ...service,
        ...promotionData
      };
    })
  );

  return results;
}

module.exports = {
  calculateServicePrice,
  calculateServicesPrices
};

