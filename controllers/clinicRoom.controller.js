const clinicService = require('../services/clinicRoom.service');

const createClinicRoom = async (req, res) => {
  try {
    const { name, description } = req.body;
    const data = await clinicService.createClinicRoom({ name, description });

    res.status(201).json({
      success: true,
      message: 'Tạo phòng khám mới thành công',
      data
    });
  } catch (error) {
    console.error('Lỗi tạo phòng khám', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi tạo phòng khám'
    });
  }
};

const getAllClinicRooms = async (req, res) => {
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

    const result = await clinicService.getAllClinicRooms({
      page, limit, status, search, startDate, endDate, sort
    });

    return res.status(200).json({
      status: true,
      ...result
    });
  } catch (error) {
    console.log('Lỗi lấy danh sách phòng khám', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi lấy danh sách phòng khám'
    });
  }
};

const viewDetailClinicRoom = async (req, res) => {
  try {
    const detailRoom = await clinicService.getClinicRoomById(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Chi tiết phòng khám',
      data: detailRoom
    });
  } catch (error) {
    console.log('Lỗi khi xem chi tiết phòng khám', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xem chi tiết phòng khám'
    });
  }
};

const updateClinicRoom = async (req, res) => {
  try {
    const room = await clinicService.updateClinicRoom(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin phòng khám thành công',
      data: room
    });
  } catch (error) {
    console.log('Lỗi cập nhật phòng khám', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi cập nhật thông tin phòng khám'
    });
  }
};

const deleteClinicRoom = async (req, res) => {
  try {
    await clinicService.deleteClinicRoom(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Xóa phòng khám thành công.'
    });
  } catch (error) {
    console.error('Lỗi xóa phòng khám', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xóa phòng khám'
    });
  }
};

const listDoctor = async (req, res) => {
  try {
    const data = await clinicService.listAvailableDoctors();
    res.status(200).json({
      success: true,
      message: 'Danh sách bác sĩ chưa được gán phòng khám',
      data,
    });
  } catch (error) {
    console.log('Lỗi lấy danh sách bác sĩ.', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi lấy danh sách bác sĩ'
    });
  }
};

const assignDoctor = async (req, res) => {
  try {
    const { doctorId } = req.body;
    const { clinic, doctor } = await clinicService.assignDoctor(req.params.id, doctorId);

    res.status(200).json({
      success: true,
      message: `Gán bác sĩ ${doctor.fullName} vào phòng khám ${clinic.name} thành công.`,
      data: clinic
    });
  } catch (error) {
    console.log('Lỗi gán bác sĩ cho phòng khám', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi gán bác sĩ vào phòng khám'
    });
  }
};

const unssignDoctor = async (req, res) => {
  try {
    const clinic = await clinicService.unassignDoctor(req.params.id);
    res.status(200).json({
      success: true,
      message: `Gỡ bác sĩ khỏi phòng khám thành công.`,
      data: clinic
    });
  } catch (error) {
    console.log('Lỗi gỡ bác sĩ cho phòng khám', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi gỡ bác sĩ khỏi phòng khám'
    });
  }
};

module.exports = {
  createClinicRoom,
  getAllClinicRooms,
  viewDetailClinicRoom,
  updateClinicRoom,
  deleteClinicRoom,
  listDoctor,
  assignDoctor,
  unssignDoctor
};
