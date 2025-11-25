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
  
    // =========================
    // 1. Validate title
    // =========================
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Tiêu đề giảm giá không được để trống');
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3 || cleanTitle.length > 200) {
      throw new Error('Tiêu đề phải từ 3 đến 200 ký tự');
    }
    if (/[<>]/.test(cleanTitle)) {
      throw new Error('Tiêu đề không được chứa ký tự < hoặc >');
    }
  
    // =========================
    // 2. Validate description
    // =========================
    if (typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả giảm giá không được để trống');
    }
    const cleanDescription = description.trim();
    if (cleanDescription.length < 10) {
      throw new Error('Mô tả phải có ít nhất 10 ký tự');
    }
    if (/[<>]/.test(cleanDescription)) {
      throw new Error('Mô tả không được chứa ký tự < hoặc >');
    }
  
    // =========================
    // 3. Validate discount type & value
    // =========================
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
  
    // =========================
    // 4. Validate applyToAll & services
    // =========================
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
      // Lấy tất cả service nếu applyToAll
      finalServiceIds = await Service.find().distinct('_id');
    }
  
    // =========================
    // 5. Parse & normalize dates
    // =========================
    const startRaw = new Date(startDate);
    const endRaw = new Date(endDate);
  
    if (isNaN(startRaw.getTime()) || isNaN(endRaw.getTime())) {
      throw new Error('Ngày không hợp lệ');
    }
  
    const now = new Date();
  
    // Chuẩn hóa phần "ngày"
    const startDay = new Date(startRaw);
    startDay.setHours(0, 0, 0, 0);
  
    const endDay = new Date(endRaw);
    endDay.setHours(0, 0, 0, 0);
  
    const today = new Date();
    today.setHours(0, 0, 0, 0);
  
    // ✅ Không cho tạo khuyến mãi với ngày < hôm nay
    if (startDay < today) {
      throw new Error('Ngày bắt đầu khuyến mãi không được nhỏ hơn ngày hiện tại');
    }
    if (endDay < today) {
      throw new Error('Ngày kết thúc khuyến mãi không được nhỏ hơn ngày hiện tại');
    }
    // (an toàn thêm): không cho end < start theo ngày
    if (endDay < startDay) {
      throw new Error('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
    }
  
    let start;
    let end;
  
    if (startDay.getTime() === endDay.getTime()) {
      // 👉 Khuyến mãi 1 ngày
  
      // end luôn là cuối ngày
      end = new Date(endDay);
      end.setHours(23, 59, 59, 999);
  
      if (startDay.getTime() === today.getTime() && now < end) {
        // Nếu là "ngày hôm nay" → chạy từ bây giờ đến hết ngày
        start = new Date(now);
        console.log('📅 [Promotion] One-day promo for TODAY: from now to end of day');
      } else {
        // Nếu là ngày tương lai → chạy cả ngày
        start = new Date(startDay);
        start.setHours(0, 0, 0, 0);
        console.log('📅 [Promotion] One-day promo (full day):', start.toISOString(), '→', end.toISOString());
      }
    } else {
      // 👉 Khoảng nhiều ngày: start = 00:00 ngày bắt đầu, end = 23:59:59.999 ngày kết thúc
      start = new Date(startDay);
      start.setHours(0, 0, 0, 0);
  
      end = new Date(endDay);
      end.setHours(23, 59, 59, 999);
  
      console.log('📅 [Promotion] Multi-day promo:', start.toISOString(), '→', end.toISOString());
    }
  
    if (end < start) {
      throw new Error('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu');
    }
  
    console.log('⏰ [Promotion] Now:', now.toISOString());
    console.log('📅 [Promotion] Start:', start.toISOString());
    console.log('📅 [Promotion] End:', end.toISOString());
  
    // =========================
    // 6. Check conflict with existing promotions
    //    Khoảng [start, end] giao với [promo.startDate, promo.endDate]
    // =========================
    const conflictingPromotions = await PromotionServiceModel.aggregate([
      { $match: { serviceId: { $in: finalServiceIds } } },
      {
        $lookup: {
          from: 'promotions',
          localField: 'promotionId',
          foreignField: '_id',
          as: 'promotion'
        }
      },
      { $unwind: '$promotion' },
      {
        $match: {
          'promotion.startDate': { $lte: end },
          'promotion.endDate': { $gte: start }
        }
      }
    ]);
  
    if (conflictingPromotions.length > 0) {
      const conflictedServiceIds = conflictingPromotions.map(c => c.serviceId);
      const error = new Error('Một số dịch vụ đã có khuyến mãi trùng thời gian');
      error.conflictedServiceIds = conflictedServiceIds;
      throw error;
    }
  
    // =========================
    // 7. Tính status ban đầu
    //    Cron sẽ đồng bộ lại sau (Expired / Active / Upcoming)
    // =========================
    let status = 'Upcoming';
    if (start <= now && now < end) {
      status = 'Active';
      console.log('✅ [Promotion] Status = Active');
    } else if (now >= end) {
      status = 'Expired';
      console.log('⏱️  [Promotion] Status = Expired');
    } else {
      console.log('🔜 [Promotion] Status = Upcoming');
    }
  
    // =========================
    // 8. Tạo promotion
    // =========================
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
  
    console.log(`✅ [Promotion] Tạo thành công: ${promotion._id} - Status: ${status}`);
  
    // =========================
    // 9. Tạo liên kết dịch vụ trong PromotionService
    // =========================
    if (finalServiceIds.length > 0) {
      const links = finalServiceIds.map(id => ({
        promotionId: promotion._id,
        serviceId: id
      }));
      await PromotionServiceModel.insertMany(links);
    }
  
    // =========================
    // 10. Lấy tên dịch vụ áp dụng
    // =========================
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
      if (cleanTitle.length < 3 || cleanTitle.length > 200) {
        throw new Error('Tiêu đề phải từ 3 đến 200 ký tự');
      }
      if (/[<>]/.test(cleanTitle)) {
        throw new Error('Tiêu đề không được chứa ký tự < hoặc >');
      }
    }

    // Validate description
    let cleanDescription = promotion.description;
    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        throw new Error('Mô tả không được để trống');
      }
      cleanDescription = description.trim();
      if (cleanDescription.length < 10) {
        throw new Error('Mô tả phải có ít nhất 10 ký tự');
      }
      if (/[<>]/.test(cleanDescription)) {
        throw new Error('Mô tả không được chứa ký tự < hoặc >');
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

