const Policy = require('../models/policy.model');

class PolicyService {

  /**
   * Lấy danh sách policies đang active
   */
  async getActivePolicies() {
    return await Policy.getActivePolicies();
  }

  /**
   * Lấy tất cả policies
   */
  async getAllPolicies() {
    return await Policy.find().sort({ createdAt: -1 });
  }

  /**
   * Lấy danh sách title của policies
   */
  async listTitle() {
    return await Policy.find().select({ title: 1 });
  }

  /**
   * Tạo policy mới
   */
  async createPolicy(data) {
    const { title, description, active = true, status = 'Active' } = data;

    if (!title || !description) {
      throw new Error('Vui lòng nhập đầy đủ tiêu đề và mô tả');
    }

    const check = await Policy.findOne({ title, status: 'Active' });
    if (check) {
      throw new Error('Chính sách đã tồn tại');
    }

    const policy = new Policy({
      title,
      description,
      active,
      status
    });

    await policy.save();
    return policy;
  }

  /**
   * Cập nhật policy
   */
  async updatePolicy(id, data) {
    const { title, description, active, status } = data;

    const policy = await Policy.findOne({ _id: id, status: 'Active' });
    if (!policy) {
      throw new Error('Không tìm thấy chính sách');
    }

    const check = await Policy.findOne({ title, status: 'Active' });
    if (check) {
      throw new Error('Chính sách đã tồn tại');
    }

    if (title) policy.title = title;
    if (description) policy.description = description;
    if (typeof active === 'boolean') policy.active = active;
    if (status) policy.status = status;

    await policy.save();
    return policy;
  }

  /**
   * Xóa policy
   */
  async deletePolicy(id) {
    const policy = await Policy.findByIdAndDelete(id);
    if (!policy) {
      throw new Error('Không tìm thấy chính sách');
    }
    return true;
  }
}

module.exports = new PolicyService();

