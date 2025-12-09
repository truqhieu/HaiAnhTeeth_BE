const Service = require('../models/service.model');
const Promotion = require('../models/promotion.model');
const PromotionService = require('../models/promotionService.model');
const { calculateServicesPrices } = require('../utils/promotionHelper');

const REPAID = Service.schema.path('isPrepaid').enumValues;
const STATUS = Service.schema.path('status').enumValues;
const CATEGORY = Service.schema.path('category').enumValues;

class ServiceService {

  /**
   * Tạo service mới
   */
  async createService(data) {
    const { serviceName, description, price, isPrepaid, durationMinutes, category } = data;

    // Validate serviceName
    if (!serviceName || typeof serviceName !== 'string' || serviceName.trim().length === 0) {
      throw new Error('Tên dịch vụ không được bỏ trống');
    }

    const cleanServiceName = serviceName.trim().replace(/\s{2,}/g, ' ');
    if (cleanServiceName.length === 0) {
      throw new Error('Tên dịch vụ không được để trống');
    }
    if (/[<>]/.test(cleanServiceName)) {
      throw new Error('Tên dịch vụ không được chứa ký tự < hoặc >');
    }

    if (cleanServiceName.length < 2) {
      throw new Error('Độ dài tên dịch vụ không hợp lệ (tối thiểu 2 ký tự)');
    }

    const existingService = await Service.findOne({ serviceName: cleanServiceName });
    if (existingService) {
      throw new Error('Tên dịch vụ đã tồn tại');
    }

    // Validate description
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new Error('Mô tả dịch vụ không được bỏ trống');
    }

    const cleanDescription = description.trim().replace(/\s{2,}/g, ' ');
    if (cleanDescription.length === 0) {
      throw new Error('Mô tả dịch vụ không được để trống');
    }
    if (/[<>]/.test(cleanDescription)) {
      throw new Error('Mô tả dịch vụ không được chứa ký tự < hoặc >');
    }

    if (cleanDescription.length < 4) {
      throw new Error('Độ dài mô tả dịch vụ không hợp lệ (tối thiểu 4 ký tự)');
    }

    // Validate price
    if (price === undefined || price === null || price === '') {
      throw new Error('Giá dịch vụ không được bỏ trống');
    }

    if (typeof price !== 'number' || isNaN(price)) {
      throw new Error('Giá dịch vụ phải là số nguyên dương');
    }

    if (price < 0) {
      throw new Error('Giá dịch vụ không được âm');
    }

    // Validate category
    if (!category || !CATEGORY.includes(category)) {
      throw new Error('Thể loại dịch vụ không hợp lệ');
    }

    // Validate durationMinutes (nếu không phải Consultation)
    if (category !== 'Consultation') {
      if (durationMinutes === undefined || durationMinutes === null) {
        throw new Error('Thời gian làm dịch vụ không được bỏ trống');
      }
      if (typeof durationMinutes !== 'number' || isNaN(durationMinutes)) {
        throw new Error('Thời gian làm dịch vụ phải là số nguyên dương');
      }
      if (durationMinutes <= 0) {
        throw new Error('Thời gian làm dịch vụ phải lớn hơn 0 phút');
      }
    }

    const finalDuration = category === 'Consultation' ? 30 : durationMinutes;
    const finalIsPrepaid = category === 'Consultation' ? true : !!isPrepaid;

    const newService = new Service({
      serviceName: cleanServiceName,
      description: cleanDescription,
      price,
      isPrepaid: finalIsPrepaid,
      durationMinutes: finalDuration,
      category,
    });

    await newService.save();
    return newService;
  }

  /**
   * Lấy danh sách services
   */
  async getAllServices(filters = {}) {
    const {
      page = 1,
      limit = 10,
      isPrepaid,
      status,
      category,
      search,
      sortPrice,
      sortTime,
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (isPrepaid !== undefined) {
      filter.isPrepaid = isPrepaid === "true";
    }

    if (status) filter.status = status;

    if (category) filter.category = category;

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      filter.$or = [{ serviceName: { $regex: regex } }];
    }

    const sortOption = [];

    if (sortPrice) {
      sortOption.push(["price", sortPrice === "asc" ? 1 : -1]);
    }

    if (sortTime) {
      sortOption.push(["durationMinutes", sortTime === "asc" ? 1 : -1]);
    }

    if (sortOption.length === 0) {
      sortOption.push(["createdAt", -1]);
    }

    const [total, services] = await Promise.all([
      Service.countDocuments(filter),
      Service.find(filter)
        .select('-__v')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    // ⭐ Tính promotion cho mỗi service
    const servicesWithPromotion = await calculateServicesPrices(services);

    const totalPages = Math.max(1, Math.ceil(total / limitNum));

    return {
      total,
      totalPages,
      page: pageNum,
      limit: limitNum,
      data: servicesWithPromotion,
    };
  }

  /**
   * Lấy chi tiết service
   */
  async getServiceById(id) {
    const service = await Service.findById(id).select('-__v');
    if (!service) {
      throw new Error('Không tìm thấy dịch vụ');
    }
    return service;
  }

  /**
   * Lấy danh sách services có giảm giá
   */
  async getDiscountedServices(filters = {}) {
    const {
      status,
      page = 1,
      limit = 15,
      search,
      category,
      isPrepaid
    } = filters;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, parseInt(limit, 10));
    const now = new Date();

    // Lấy tất cả promotion (check theo thời gian thực + status)
    const promoFilter = {
      startDate: { $lte: now },  // Đã bắt đầu
      endDate: { $gte: now },      // Chưa hết hạn
      status: { $ne: 'Expired' }   // Không phải Expired
    };
    if (status && status !== 'Expired') {
      promoFilter.status = status;
    }

    const promotions = await Promotion.find(promoFilter).lean();
    if (promotions.length === 0) {
      return {
        total: 0,
        page: pageNum,
        limit: limitNum,
        data: []
      };
    }

    const promoIds = promotions.map(p => p._id);

    // Lấy liên kết PromotionService
    const links = await PromotionService.find({
      promotionId: { $in: promoIds }
    }).lean();

    if (links.length === 0) {
      return {
        total: 0,
        page: pageNum,
        limit: limitNum,
        data: []
      };
    }

    const serviceIds = [...new Set(links.map(l => l.serviceId))];

    // Xây dựng filter cho Service
    const serviceFilter = { _id: { $in: serviceIds } };

    if (isPrepaid !== undefined) {
      serviceFilter.isPrepaid = isPrepaid === 'true';
    }

    if (category) {
      serviceFilter.category = category;
    }

    if (search && String(search).trim().length > 0) {
      const searchKey = String(search).trim();
      const safe = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      serviceFilter.serviceName = { $regex: regex };
    }

    // Lấy thông tin dịch vụ
    const services = await Service.find(serviceFilter)
      .select('serviceName price durationMinutes isPrepaid category')
      .lean();

    if (services.length === 0) {
      return {
        total: 0,
        page: pageNum,
        limit: limitNum,
        data: []
      };
    }

    const serviceMap = Object.fromEntries(
      services.map(s => [s._id.toString(), s])
    );

    // Gộp theo service + tính giá tốt nhất
    const serviceDiscountMap = {};

    for (const link of links) {
      const service = serviceMap[link.serviceId.toString()];
      if (!service) continue;

      const promo = promotions.find(p => p._id.toString() === link.promotionId.toString());
      if (!promo) continue;

      const key = service._id.toString();
      if (!serviceDiscountMap[key]) {
        serviceDiscountMap[key] = {
          serviceId: service._id,
          serviceName: service.serviceName,
          originalPrice: service.price,
          durationMinutes: service.durationMinutes,
          isPrepaid: service.isPrepaid,
          category: service.category,
          promotions: []
        };
      }

      // Double check thời gian (đảm bảo chắc chắn)
      const isActive = now >= promo.startDate && now <= promo.endDate;
      if (!isActive || promo.status === 'Expired') continue;

      let finalPrice = service.price;
      if (promo.discountType === 'Percent') {
        finalPrice = service.price * (1 - promo.discountValue / 100);
      } else if (promo.discountType === 'Fix') {
        finalPrice = Math.max(0, service.price - promo.discountValue);
      }

      serviceDiscountMap[key].promotions.push({
        promotionId: promo._id,
        title: promo.title,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        finalPrice: Math.round(finalPrice),
        status: promo.status,
        startDate: promo.startDate,
        endDate: promo.endDate
      });
    }

    // Tính giá tốt nhất cho mỗi service
    const result = Object.values(serviceDiscountMap).map(item => {
      const best = item.promotions.reduce((best, curr) =>
        curr.finalPrice < best.finalPrice ? curr : best
      );

      return {
        serviceId: item.serviceId,
        serviceName: item.serviceName,
        originalPrice: item.originalPrice,
        durationMinutes: item.durationMinutes,
        isPrepaid: item.isPrepaid,
        category: item.category,
        bestPrice: best.finalPrice,
        saved: item.originalPrice - best.finalPrice,
        bestPromotion: {
          id: best.promotionId,
          title: best.title,
        }
      };
    });

    // Sắp xếp & phân trang
    result.sort((a, b) => b.saved - a.saved);

    const total = result.length;
    const start = (pageNum - 1) * limitNum;
    const paginated = result.slice(start, start + limitNum);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      data: paginated
    };
  }

  /**
   * Lấy chi tiết service có giảm giá
   */
  async getDiscountedServiceDetail(id) {
    const service = await Service.findById(id)
      .select('serviceName price durationMinutes')
      .lean();

    if (!service) {
      throw new Error('Không tìm thấy');
    }

    // Lấy tất cả liên kết
    const links = await PromotionService.find({ serviceId: id }).lean();
    if (links.length === 0) {
      return {
        ...service,
        allPromotions: []
      };
    }

    // Lấy promotion
    const promotions = await Promotion.find({
      _id: { $in: links.map(l => l.promotionId) }
    }).lean();

    // Tính giá cho từng promotion
    const allPromotions = promotions.map(promo => {
      let finalPrice = service.price;
      if (promo.discountType === 'Percent') {
        finalPrice = service.price * (1 - promo.discountValue / 100);
      } else if (promo.discountType === 'Fix') {
        finalPrice = Math.max(0, service.price - promo.discountValue);
      }

      return {
        promotionId: promo._id,
        title: promo.title,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        finalPrice: Math.round(finalPrice),
        status: promo.status,
        startDate: promo.startDate,
        endDate: promo.endDate
      };
    });

    return {
      serviceId: service._id,
      serviceName: service.serviceName,
      originalPrice: service.price,
      durationMinutes: service.durationMinutes,
      allPromotions
    };
  }

  /**
   * Cập nhật service
   */
  async updateService(id, data) {
    const { serviceName, description, price, isPrepaid, durationMinutes, category, status } = data;

    const existingService = await Service.findById(id);
    if (!existingService) {
      throw new Error('Không tìm thấy dịch vụ');
    }

    const updates = {};

    // Validate serviceName
    if (serviceName !== undefined) {
      const cleanServiceName = serviceName.trim().replace(/\s{2,}/g, ' ');
      if (cleanServiceName.length === 0) {
        throw new Error('Tên dịch vụ không được bỏ trống');
      }
      if (/[<>]/.test(cleanServiceName)) {
        throw new Error('Tên dịch vụ không được chứa ký tự < hoặc >');
      }
      if (cleanServiceName.length < 2) {
        throw new Error('Độ dài tên dịch vụ không hợp lệ (tối thiểu 2 ký tự)');
      }

      const duplicate = await Service.findOne({
        serviceName: cleanServiceName,
        _id: { $ne: id },
      });
      if (duplicate) {
        throw new Error('Tên dịch vụ đã tồn tại');
      }

      updates.serviceName = cleanServiceName;
    }

    // Validate description
    if (description !== undefined) {
      const cleanDescription = description.trim().replace(/\s{2,}/g, ' ');
      if (cleanDescription.length === 0) {
        throw new Error('Mô tả dịch vụ không được để trống');
      }
      if (/[<>]/.test(cleanDescription)) {
        throw new Error('Mô tả dịch vụ không được chứa ký tự < hoặc >');
      }
      if (cleanDescription.length < 4) {
        throw new Error('Độ dài mô tả dịch vụ không hợp lệ (tối thiểu 4 ký tự)');
      }
      updates.description = cleanDescription;
    }

    // Validate price
    if (price !== undefined) {
      if (isNaN(price) || Number(price) <= 0) {
        throw new Error('Giá dịch vụ phải là số nguyên dương');
      }
      updates.price = Number(price);
    }

    // Validate isPrepaid
    if (isPrepaid !== undefined) {
      if (typeof isPrepaid !== 'boolean') {
        throw new Error('Giá trị trả trước phải là true hoặc false');
      }
      updates.isPrepaid = isPrepaid;
    }

    // Validate category
    if (category !== undefined) {
      const validCategories = ['Consultation', 'Examination'];
      if (!validCategories.includes(category)) {
        throw new Error(`Thể loại dịch vụ không hợp lệ. Chỉ chấp nhận: ${validCategories.join(', ')}`);
      }
      updates.category = category;
    }

    // Validate durationMinutes
    if (durationMinutes !== undefined) {
      if (isNaN(durationMinutes) || Number(durationMinutes) <= 0) {
        throw new Error('Thời gian làm dịch vụ phải là số dương (phút)');
      }
      updates.durationMinutes = Number(durationMinutes);
    }

    // Logic tự động theo category
    if (category === 'Consultation') {
      updates.durationMinutes = 30;
      updates.isPrepaid = true;
    } else if (category === 'Examination') {
      updates.durationMinutes = 45;
      updates.isPrepaid = false;
    }

    // Validate status
    if (status !== undefined) {
      const validStatus = ['Active', 'Inactive'];
      if (!validStatus.includes(status)) {
        throw new Error(`Trạng thái không hợp lệ. Chỉ chấp nhận: ${validStatus.join(', ')}`);
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Không có trường hợp lệ để cập nhật');
    }

    const updatedService = await Service.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    return updatedService;
  }

  /**
   * Xóa service
   */
  async deleteService(id) {
    const service = await Service.findByIdAndDelete(id);
    if (!service) {
      throw new Error('Không tìm thấy dịch vụ để xóa');
    }
    return true;
  }
}

module.exports = new ServiceService();

