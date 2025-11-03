const TempRegister = require('../models/tempRegister.model');
const crypto = require('crypto');

class TempRegisterService {

  async resendVerification(email) {
    if (!email) {
      throw new Error('Vui lòng nhập email');
    }

    // Tìm user trong tempRegister
    const tempUser = await TempRegister.findOne({ email: email.toLowerCase() });

    if (!tempUser) {
      throw new Error('Không tìm thấy yêu cầu đăng ký cho email này');
    }

    // Tạo token mới
    const newVerificationToken = crypto.randomBytes(32).toString('hex');
    
    // Cập nhật token và thời gian hết hạn
    tempUser.verificationToken = newVerificationToken;
    tempUser.tokenExpireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ
    await tempUser.save();

    return { tempUser, verificationToken: newVerificationToken };
  }
  async checkStatus(email) {
    if (!email) {
      throw new Error('Vui lòng nhập email');
    }

    const tempUser = await TempRegister.findOne({ email: email.toLowerCase() });

    if (!tempUser) {
      throw new Error('Không tìm thấy yêu cầu đăng ký cho email này');
    }

    const isExpired = tempUser.tokenExpireAt < new Date();

    return {
      email: tempUser.email,
      fullName: tempUser.fullName,
      role: tempUser.role,
      isExpired,
      tokenExpireAt: tempUser.tokenExpireAt,
      createdAt: tempUser.createdAt,
      timeRemaining: isExpired ? 0 : Math.max(0, tempUser.tokenExpireAt - new Date())
    };
  }

  async cancelRegistration(email) {
    if (!email) {
      throw new Error('Vui lòng nhập email');
    }

    const result = await TempRegister.deleteOne({ email: email.toLowerCase() });

    if (result.deletedCount === 0) {
      throw new Error('Không tìm thấy yêu cầu đăng ký cho email này');
    }

    return true;
  }

  async getDebugToken(email) {
    if (!email) {
      throw new Error('Vui lòng nhập email');
    }

    const tempUser = await TempRegister.findOne({ email: email.toLowerCase() });

    if (!tempUser) {
      throw new Error('Không tìm thấy yêu cầu đăng ký cho email này');
    }

    // Chỉ hiển thị trong development mode
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Endpoint này chỉ khả dụng trong development mode');
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:9999';
    const verificationLink = `${baseUrl}/api/auth/verify-email?token=${tempUser.verificationToken}&email=${email}`;

    return {
      email: tempUser.email,
      verificationToken: tempUser.verificationToken,
      verificationLink,
      tokenExpireAt: tempUser.tokenExpireAt,
      isExpired: tempUser.tokenExpireAt < new Date()
    };
  }

  async sendEmailChangeDoctor(email){
    
  }
}

module.exports = new TempRegisterService();