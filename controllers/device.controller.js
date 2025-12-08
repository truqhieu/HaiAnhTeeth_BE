const deviceService = require('../services/device.service');

const createDevice = async (req, res) => {
  try {
    const { name, description, purchaseDate, expireDate } = req.body;

    const newDevice = await deviceService.createDevice({
      name,
      description,
      purchaseDate,
      expireDate
    });

    res.status(201).json({
      success: true,
      message: 'Tạo thiết bị mới thành công',
      data: newDevice
    });
  } catch (error) {
    console.log('Lỗi khi tạo thiết bị mới', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi tạo thiết bị mới cho phòng khám'
    });
  }
};

const getAllDevices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sort = 'desc',
      startDate,
      endDate
    } = req.query;

    const result = await deviceService.getAllDevices({
      page, limit, status, search, sort, startDate, endDate
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách thiết bị', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi lấy danh sách thiết bị trong phòng khám.'
    });
  }
};

const viewDetailDevice = async (req, res) => {
  try {
    const detailDevice = await deviceService.getDeviceById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Chi tiết thiêt bị',
      data: detailDevice,
    });
  } catch (error) {
    console.log('Lỗi khi xem chi tiết thiết bị', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xem chi tiết thiết bị trong phòng khám,'
    });
  }
};

const updateDevice = async (req, res) => {
  try {
    const { name, description, purchaseDate, expireDate, status } = req.body;

    const device = await deviceService.updateDevice(req.params.id, {
      name,
      description,
      purchaseDate,
      expireDate,
      status
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin thiết bị thành công',
      data: device,
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật thiết bị:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi cập nhật thiết bị của phòng khám',
    });
  }
};

const deleteDevice = async (req, res) => {
  try {
    await deviceService.deleteDevice(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Xóa thiết bị khỏi phòng khám thành công'
    });
  } catch (error) {
    console.log('Lỗi khi xóa thiết bị', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã có lỗi khi xóa thiết bị khỏi phòng khám'
    });
  }
};

module.exports = { createDevice, getAllDevices, viewDetailDevice, updateDevice, deleteDevice };
