const Promotion = require('../models/promotion.model');
const PromotionServiceModel = require('../models/promotionService.model');
const Service = require('../models/service.model');

class PromotionService {
  
  /**
   * Tạo promotion mới
   */
  async createPromotion(data) {
    const {
      title,
      description,
      discountType,
      discountValue,
      applyToAll,
      startDate,
      endDate,
      serviceIds
    } = data;

    // Validate title
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Tiêu đề giảm giá không được để trống');
    }
    const cleanTitle = title.trim();
    if (!/^[\p{L}0-9\s\-%()]+$/u.test(cleanTitle)) {
      throw new Error('Tiêu đề chỉ được chứa chữ, số, khoảng trắng và ký tự: % - ( )');
    }
    if (cleanTitle.length < 5 || cleanTitle.length > 100) {
      throw new Error('Tiêu đề phải từ 5 đến 100 ký tự');
    }

    // Validate description
    if (typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả giảm giá không được để trống');
    }
    const cleanDescription = description.trim();
    if (!/^[\p{L}0-9\s\.,!?\-%()]+$/u.test(cleanDescription)) {
      throw new Error('Mô tả chỉ được chứa chữ, số, khoảng trắng và ký tự: . , ! ? - % ( )');
    }
    if (cleanDescription.length < 10) {
      throw new Error('Mô tả phải có ít nhất 10 ký tự');
    }

    // Validate discount type & value
    if (typeof discountType !== 'string' || discountType.trim().length === 0) {
      throw new Error('Thể loại giảm giá không được để trống');
    }
    const trimmedType = discountType.trim();
    if (!['Percent', 'Fix'].includes(trimmedType)) {
      throw new Error('Thể loại giảm giá chỉ được là "Percent" hoặc "Fix"');
    }
    if (typeof discountValue !== 'number' || isNaN(discountValue)) {
      throw new Error('Giá trị giảm giá phải là số');
    }
    if (trimmedType === 'Percent' && (discountValue < 1 || discountValue > 100)) {
      throw new Error('Giảm theo phần trăm phải từ 1 đến 100');
    }
    if (trimmedType === 'Fix' && discountValue <= 0) {
      throw new Error('Giá trị giảm cố định phải lớn hơn 0');
    }

    // Validate apply to all
    if (typeof applyToAll !== 'boolean') {
      throw new Error('Áp dụng cho tất cả phải là true hoặc false');
    }
    const isApplyToAll = applyToAll === true;

    let finalServiceIds = [];
    if (!isApplyToAll) {
      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất một dịch vụ khi không áp dụng cho tất cả');
      }
      finalServiceIds = serviceIds;
    } else {
      // Lấy tất cả service nếu applyAll
      finalServiceIds = await Service.find().distinct('_id');
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Ngày không hợp lệ');
    }
    if (end <= start) {
      throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
    }

    // Check conflict promotion for services
    const conflictingPromotions = await PromotionServiceModel.aggregate([
      { $match: { serviceId: { $in: finalServiceIds } } },
      { $lookup: { from: 'promotions', localField: 'promotionId', foreignField: '_id', as: 'promotion' } },
      { $unwind: '$promotion' },
      { $match: { 
        $or: [
          { 'promotion.startDate': { $lte: end }, 'promotion.endDate': { $gte: start } }
        ]
      }}
    ]);

    if (conflictingPromotions.length > 0) {
      const conflictedServiceIds = conflictingPromotions.map(c => c.serviceId);
      const error = new Error('Một số dịch vụ đã có khuyến mãi trùng thời gian');
      error.conflictedServiceIds = conflictedServiceIds;
      throw error;
    }

    // Tính status realtime
    const now = new Date();
    let status = 'Upcoming';
    if (start <= now && now <= end) status = 'Active';
    else if (now > end) status = 'Expired';

    // Tạo promotion
    const promotion = new Promotion({
      title: cleanTitle,
      description: cleanDescription,
      discountType: trimmedType,
      discountValue,
      applyToAll: isApplyToAll,
      startDate: start,
      endDate: end,
      status
    });
    await promotion.save();

    // Tạo liên kết dịch vụ trong PromotionService
    if (finalServiceIds.length > 0) {
      const links = finalServiceIds.map(id => ({ promotionId: promotion._id, serviceId: id }));
      await PromotionServiceModel.insertMany(links);
    }

    // Lấy tên dịch vụ
    const appliedServices = await Service.find({ _id: { $in: finalServiceIds } })
      .select('_id serviceName')
      .lean();

    return {
      ...promotion.toObject(),
      appliedServices,
      status
    };
  }

  /**
   * Lấy danh sách promotions
   */
  async getAllPromotions(filters = {}) {
      const {
    search,
    status,
    sort = 'desc',
    page = 1,
    limit = 10
  } = filters;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  if (status) filter.status = status;

  if (search && String(search).trim().length > 0) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safe, 'i');
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const sortOrder = sort.toLowerCase() === 'asc' ? 1 : -1;

  // 🧠 Lấy danh sách promotion
  const [total, promotions] = await Promise.all([
    Promotion.countDocuments(filter),
    Promotion.find(filter)
      .sort({ startDate: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .lean()
  ]);

  // ⚙️ Lấy danh sách service cho từng promotion (nếu applyToAll = false)
  const promotionIds = promotions.map(p => p._id);
  const promoServices = await PromotionServiceModel.find({
    promotionId: { $in: promotionIds }
  })
    .populate('serviceId', 'serviceName price category status')
    .lean();

  // Gom các service theo promotionId
  const promoServiceMap = {};
  for (const ps of promoServices) {
    const pid = ps.promotionId.toString();
    if (!promoServiceMap[pid]) promoServiceMap[pid] = [];
    promoServiceMap[pid].push(ps.serviceId);
  }

  // 🧾 Format lại kết quả cuối
  const formattedPromotions = promotions.map(promo => {
    const promoId = promo._id.toString();
    if (promo.applyToAll) {
      return {
        ...promo,
        applyNote: 'Áp dụng cho toàn bộ dịch vụ hệ thống',
        services: []
      };
    } else {
      return {
        ...promo,
        applyNote: 'Áp dụng cho các dịch vụ cụ thể',
        services: promoServiceMap[promoId] || []
      };
    }
  });

  return {
    total,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
    page: pageNum,
    limit: limitNum,
    data: formattedPromotions
  };
  }

  /**
   * Lấy chi tiết promotion
   */
  async getPromotionById(id) {
    const promotion = await Promotion.findById(id);
    if (!promotion) {
      throw new Error('Không tìm thấy ưu đãi');
    }
    return promotion;
  }

  /**
   * Cập nhật promotion
   */
  async updatePromotion(id, data) {
    const {
      title,
      description,
      discountType,
      discountValue,
      applyToAll,
      startDate,
      endDate,
      serviceIds
    } = data;

    const promotion = await Promotion.findById(id);
    if (!promotion) {
      throw new Error('Không tìm thấy ưu đãi');
    }

    // Validate title
    let cleanTitle = promotion.title;
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('Tiêu đề không được để trống');
      }
      cleanTitle = title.trim();
      if (!/^[\p{L}0-9\s\-%()]+$/u.test(cleanTitle)) {
        throw new Error('Tiêu đề chỉ được chứa chữ, số, khoảng trắng và ký tự: % - ( )');
      }
      if (cleanTitle.length < 5 || cleanTitle.length > 100) {
        throw new Error('Tiêu đề phải từ 5 đến 100 ký tự');
      }
    }

    // Validate description
    let cleanDescription = promotion.description;
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        throw new Error('Mô tả không được để trống');
      }
      cleanDescription = description.trim();
      if (!/^[\p{L}0-9\s\.,!?\-%()]+$/u.test(cleanDescription)) {
        throw new Error('Mô tả chỉ được chứa chữ, số, khoảng trắng và ký tự: . , ! ? - % ( )');
      }
      if (cleanDescription.length < 10) {
        throw new Error('Mô tả phải có ít nhất 10 ký tự');
      }
    }

    // Validate discount type & value
    let finalDiscountType = promotion.discountType;
    let finalDiscountValue = promotion.discountValue;

    if (discountType !== undefined) {
      if (typeof discountType !== 'string' || discountType.trim().length === 0) {
        throw new Error('Thể loại giảm giá không được để trống');
      }
      const trimmedType = discountType.trim();
      if (!['Percent', 'Fix'].includes(trimmedType)) {
        throw new Error('Thể loại giảm giá chỉ được là Percent hoặc Fix');
      }
      finalDiscountType = trimmedType;
    }

    if (discountValue !== undefined) {
      if (typeof discountValue !== 'number' || isNaN(discountValue)) {
        throw new Error('Giá trị giảm giá phải là số');
      }
      if (finalDiscountType === 'Percent' && (discountValue < 1 || discountValue > 100)) {
        throw new Error('Giảm theo phần trăm phải từ 1 đến 100');
      }
      if (finalDiscountType === 'Fix' && discountValue <= 0) {
        throw new Error('Giá trị giảm cố định phải lớn hơn 0');
      }
      finalDiscountValue = discountValue;
    }

    // Validate apply to all & service ids
    let isApplyToAll = promotion.applyToAll;
    if (applyToAll !== undefined) {
      if (typeof applyToAll !== 'boolean') {
        throw new Error('Áp dụng cho tất cả phải là true hoặc false');
      }
      isApplyToAll = applyToAll;
    }

    if (!isApplyToAll && serviceIds !== undefined) {
      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất một dịch vụ khi không áp dụng cho tất cả');
      }
    }

    // Validate dates
    let finalStartDate = promotion.startDate;
    let finalEndDate = promotion.endDate;

    if (startDate !== undefined || endDate !== undefined) {
      const newStart = startDate ? new Date(startDate) : promotion.startDate;
      const newEnd = endDate ? new Date(endDate) : promotion.endDate;

      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
        throw new Error('Ngày không hợp lệ');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (newStart < today) {
        throw new Error('Ngày bắt đầu không được sửa về trước hôm nay');
      }

      if (newEnd <= newStart) {
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu');
      }

      finalStartDate = newStart;
      finalEndDate = newEnd;
    }

    // Tính status realtime
    const now = new Date();
    let newStatus = 'Upcoming';

    if (finalStartDate <= now && now <= finalEndDate) {
      newStatus = 'Active';
    }

    // Cập nhật promotion
    promotion.title = cleanTitle;
    promotion.description = cleanDescription;
    promotion.discountType = finalDiscountType;
    promotion.discountValue = finalDiscountValue;
    promotion.applyToAll = isApplyToAll;
    promotion.startDate = finalStartDate;
    promotion.endDate = finalEndDate;
    promotion.status = newStatus;

    await promotion.save();

    // Cập nhật liên kết dịch vụ
    if (!isApplyToAll && serviceIds !== undefined) {
      await PromotionServiceModel.deleteMany({ promotionId: promotion._id });
      if (serviceIds.length > 0) {
        const links = serviceIds.map(id => ({
          promotionId: promotion._id,
          serviceId: id
        }));
        await PromotionServiceModel.insertMany(links);
      }
    }

    return {
      ...promotion.toObject(),
      status: newStatus
    };
  }

  /**
   * Xóa promotion
   */
  async deletePromotion(id) {
    const result = await Promotion.findByIdAndDelete(id);
    if (!result) {
      throw new Error('Không tìm thấy ưu đãi');
    }

    // Xóa các liên kết trong PromotionService
    await PromotionServiceModel.deleteMany({ promotionId: id });

    return true;
  }
}

module.exports = new PromotionService();

