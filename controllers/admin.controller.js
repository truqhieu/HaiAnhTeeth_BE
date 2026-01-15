const adminService = require('../services/admin.service');

const ROLE_ACCOUNT = ['Doctor', 'Nurse', 'Staff', 'Patient', 'Manager'];

const createAccount = async (req, res) => {
  try {
    const { fullName, email, passwordHash, dob, role, phoneNumber, address, specialization, yearsOfExperience } = req.body;

    const data = await adminService.createAccount({
      fullName,
      email,
      passwordHash,
      dob,
      role,
      phoneNumber,
      address,
      specialization,
      yearsOfExperience
    });

    const roleMap = {
      Doctor: 'Bác sĩ',
      Nurse: 'Y tá',
      Staff: 'Lễ tân',
      Manager: 'Quản lý'
    };

    res.status(201).json({
      success: true,
      message: `Tạo tài khoản cho ${roleMap[role]} mới thành công`,
      data
    });

  } catch (error) {
    console.error('Lỗi tạo tài khoản:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi tạo tài khoản'
    });
  }
};

const getAllAccounts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      gender,
      role,
      startDate,
      endDate,
      sort = 'desc'
    } = req.query;

    const result = await adminService.getAllAccounts({
      page,
      limit,
      status,
      search,
      gender,
      role,
      startDate,
      endDate,
      sort
    });

    return res.status(200).json({
      status: true,
      ...result
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách tài khoản', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã có lỗi khi lấy danh sách tài khoản'
    });
  }
};

const viewDetailAccount = async (req, res) => {
  try {
    const detailAccount = await adminService.getAccountById(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Chi tết tài khoản',
      data: detailAccount
    });
  } catch (error) {
    console.error('Lỗi xem chi tiết tài khoản', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Đã có lỗi khi xem chi tiết tài khoản'
    });
  }
};

const updateAccount = async (req, res) => {
  try {
    const account = await adminService.updateAccount(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin tài khoản thành công',
      data: account,
    });
  } catch (error) {
    console.error('Lỗi cập nhật tài khoản:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã có lỗi khi cập nhật thông tin tài khoản'
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { password } = req.body;
    await adminService.changePassword(req.params.id, password);

    const User = require('../models/user.model');
    const user = await User.findById(req.params.id).select('fullName email');

    res.status(200).json({
      success: true,
      message: `Đổi mật khẩu thành công cho người dùng : ${user.fullName || user.email}`
    });
  } catch (error) {
    console.error('Lỗi thay đổi mật khẩu:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã có lỗi khi thay đổi mật khẩu'
    });
  }
};

const lockAccounts = async (req, res) => {
  try {
    const { selectedIds } = req.body;
    const count = await adminService.lockAccounts(selectedIds);

    return res.status(200).json({
      success: true,
      message: `Đã khóa ${count} tài khoản thành công`,
    });
  } catch (error) {
    console.error('Lỗi khi khóa tài khoản:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi khóa tài khoản',
    });
  }
};

const unlockAccounts = async (req, res) => {
  try {
    const { selectedIds } = req.body;
    const count = await adminService.unlockAccounts(selectedIds);

    return res.status(200).json({
      success: true,
      message: `Đã mở khóa ${count} tài khoản thành công`,
    });
  } catch (error) {
    console.error('Lỗi khi mở khóa tài khoản:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi mở khóa tài khoản',
    });
  }
};

const assignRole = async (req, res) => {
  try {
    await adminService.assignRole(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Thay đổi vai trò thành công',
    });
  } catch (error) {
    console.error('Lỗi thay đổi vai trò', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi đổi vai trò'
    });
  }
};

module.exports = {
  createAccount,
  getAllAccounts,
  viewDetailAccount,
  updateAccount,
  changePassword,
  lockAccounts,
  unlockAccounts,
  assignRole
};
