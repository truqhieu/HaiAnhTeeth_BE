const policyService = require('../services/policy.service');

const getActivePolicies = async (req, res) => {
  try {
    const policies = await policyService.getActivePolicies();

    res.status(200).json({
      success: true,
      message: `Tìm thấy ${policies.length} chính sách`,
      data: policies
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách chính sách:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getAllPolicies = async (req, res) => {
  try {
    const policies = await policyService.getAllPolicies();

    res.status(200).json({
      success: true,
      message: `Tìm thấy ${policies.length} chính sách`,
      data: policies
    });
  } catch (error) {
    console.error('Lỗi lấy tất cả chính sách:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const createPolicy = async (req, res) => {
  try {
    const { title, description, active = true, status = 'Active' } = req.body;

    const policy = await policyService.createPolicy({
      title,
      description,
      active,
      status
    });

    res.status(201).json({
      success: true,
      message: 'Tạo chính sách thành công',
      data: policy
    });
  } catch (error) {
    console.error('Lỗi tạo chính sách:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const updatePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, active, status } = req.body;

    const policy = await policyService.updatePolicy(id, {
      title,
      description,
      active,
      status
    });

    res.status(200).json({
      success: true,
      message: 'Cập nhật chính sách thành công',
      data: policy
    });
  } catch (error) {
    console.error('Lỗi cập nhật chính sách:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deletePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    await policyService.deletePolicy(id);

    res.status(200).json({
      success: true,
      message: 'Xóa chính sách thành công'
    });
  } catch (error) {
    console.error('Lỗi xóa chính sách:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const listTitle = async (req, res) => {
  try {
    const policies = await policyService.listTitle();

    res.status(200).json({
      success: true,
      message: `Tìm thấy ${policies.length} chính sách`,
      data: policies
    });
  } catch (error) {
    console.error('Lỗi lấy danh sách chính sách:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  getActivePolicies,
  getAllPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  listTitle
};
