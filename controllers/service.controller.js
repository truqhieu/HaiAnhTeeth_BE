const serviceService = require('../services/service.service');

const createService = async (req, res) => {
  try {
    const { serviceName, description, price, isPrepaid, durationMinutes, category } = req.body;

    const newService = await serviceService.createService({
      serviceName,
      description,
      price,
      isPrepaid,
      durationMinutes,
      category
    });

    res.status(201).json({
      success: true,
      message: `Dịch vụ ${newService.serviceName} đã được thêm mới.`,
      data: newService,
    });
  } catch (error) {
    console.error('Lỗi tạo dịch vụ:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi tạo dịch vụ',
    });
  }
};

const getAllServices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      isPrepaid,
      status,
      category,
      search,
      sortPrice,
      sortTime,
      minPrice,
    } = req.query;

    const result = await serviceService.getAllServices({
      page,
      limit,
      isPrepaid,
      status,
      category,
      search,
      sortPrice,
      sortTime,
      minPrice,
    });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Lỗi lấy danh sách dịch vụ:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi lấy danh sách dịch vụ",
    });
  }
};

const getDiscountedServices = async (req, res) => {
  try {
    const {
      status,
      page = 1,
      limit = 15,
      search,
      category,
      isPrepaid
    } = req.query;

    const result = await serviceService.getDiscountedServices({
      status,
      page,
      limit,
      search,
      category,
      isPrepaid
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách dịch vụ giảm giá', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi lấy danh sách dịch vụ giảm giá'
    });
  }
};

const getDiscountedServiceDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await serviceService.getDiscountedServiceDetail(id);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.log('Lỗi khi xem chi tiết dịch vụ được giảm giá', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xem chi tiết dịch vụ được giảm giá'
    });
  }
};

const viewDetailService = async (req, res) => {
  try {
    const detailService = await serviceService.getServiceById(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Chi tiết dịch vụ',
      data: detailService
    });
  } catch (error) {
    console.error('Lỗi xem chi tiết dịch vụ', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xem chi tiết dịch vụ'
    });
  }
};

const updateService = async (req, res) => {
  try {
    const { serviceName, description, price, isPrepaid, durationMinutes, category, status } = req.body;

    const updatedService = await serviceService.updateService(req.params.id, {
      serviceName,
      description,
      price,
      isPrepaid,
      durationMinutes,
      category,
      status
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin dịch vụ thành công',
      data: updatedService,
    });
  } catch (error) {
    console.error('Lỗi cập nhật dịch vụ:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã có lỗi khi cập nhật thông tin dịch vụ',
    });
  }
};

const deleteService = async (req, res) => {
  try {
    await serviceService.deleteService(req.params.id);
    res.status(200).json({
      status: true,
      message: 'Xóa dịch vụ thành công.'
    });
  } catch (error) {
    console.error('Lỗi xóa dịch vụ', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xóa dịch vụ'
    });
  }
};

module.exports = {
  createService,
  getAllServices,
  viewDetailService,
  getDiscountedServiceDetail,
  getDiscountedServices,
  updateService,
  deleteService
};
