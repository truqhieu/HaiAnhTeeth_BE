const tempRegisterService = require('../services/tempRegister.service');
const emailService = require('../services/email.service');

const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Xử lý resend verification qua service
    const { tempUser, verificationToken } = await tempRegisterService.resendVerification(email);

    // Tạo link xác thực mới với domain thực tế
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const verificationLink = emailService.createVerificationLink(verificationToken, email, baseUrl);

    // Gửi email
    try {
      await emailService.resendVerificationEmail(tempUser.fullName, email, verificationLink);

      res.status(200).json({
        success: true,
        message: 'Email xác thực đã được gửi lại thành công',
        data: {
          email,
          message: 'Vui lòng kiểm tra email và nhấp vào link xác thực'
        }
      });

    } catch (emailError) {
      console.error('Lỗi gửi email:', emailError);
      res.status(500).json({
        success: false,
        message: 'Không thể gửi email. Vui lòng thử lại sau',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    console.error('Lỗi gửi lại email xác thực:', error);
    
    if (error.message.includes('Vui lòng nhập email') || 
        error.message.includes('Không tìm thấy yêu cầu đăng ký')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const checkRegistrationStatus = async (req, res) => {
  try {
    const { email } = req.query;

    // Xử lý check status qua service
    const statusData = await tempRegisterService.checkStatus(email);

    res.status(200).json({
      success: true,
      data: statusData
    });

  } catch (error) {
    console.error('Lỗi kiểm tra trạng thái đăng ký:', error);
    
    // Xử lý lỗi từ service (validation errors)
    if (error.message.includes('Vui lòng nhập email') || 
        error.message.includes('Không tìm thấy yêu cầu đăng ký')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const cancelRegistration = async (req, res) => {
  try {
    const { email } = req.body;

    // Xử lý cancel registration qua service
    await tempRegisterService.cancelRegistration(email);

    res.status(200).json({
      success: true,
      message: 'Đã hủy yêu cầu đăng ký thành công'
    });

  } catch (error) {
    console.error('Lỗi hủy đăng ký:', error);
    
    // Xử lý lỗi từ service (validation errors)
    if (error.message.includes('Vui lòng nhập email') || 
        error.message.includes('Không tìm thấy yêu cầu đăng ký')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getVerificationToken = async (req, res) => {
  try {
    const { email } = req.query;

    // Xử lý get debug token qua service
    const tokenData = await tempRegisterService.getDebugToken(email);

    res.status(200).json({
      success: true,
      data: tokenData
    });

  } catch (error) {
    console.error('Lỗi lấy debug token:', error);
    
    // Xử lý lỗi từ service (validation errors)
    if (error.message.includes('Vui lòng nhập email') || 
        error.message.includes('Không tìm thấy yêu cầu đăng ký') ||
        error.message.includes('Endpoint này chỉ khả dụng trong development mode')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  resendVerificationEmail,
  checkRegistrationStatus,
  cancelRegistration,
  getVerificationToken
};
