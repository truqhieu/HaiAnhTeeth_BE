const userService = require('../services/user.service');
const emailService = require('../services/email.service');
const TempRegister = require('../models/tempRegister.model');
const User = require('../models/user.model');
const jwt = require('jsonwebtoken');


const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here';

const register = async (req, res) => {
  try {
    const { fullName, email, gender, dateOfBirth, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ thông tin bắt buộc'
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải có ít nhất 6 ký tự'
      });
    }

    // Kiểm tra email format (để tăng security)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không đúng định dạng'
      });
    }

    // Xử lý đăng ký qua service (role sẽ được set default = 'Patient' trong service)
    const { tempUser, verificationToken } = await userService.registerUser({
      fullName, email, password, gender, dateOfBirth
    });

    // Tạo link xác thực với domain thực tế
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const verificationLink = emailService.createVerificationLink(verificationToken, email, baseUrl);

    // Gửi email xác thực
    try {
      await emailService.sendVerificationEmail(fullName, email, verificationLink);

      res.status(200).json({
        success: true,
        message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực tài khoản',
        data: {
          email,
          fullName,
          role: tempUser.role,
          message: 'Link xác thực đã được gửi đến email của bạn và có hiệu lực trong 24 giờ',
          expiresAt: tempUser.tokenExpireAt
        }
      });

    } catch (emailError) {
      console.error('Lỗi gửi email:', emailError);
      
      // Xóa tempUser nếu gửi email thất bại
      await TempRegister.deleteOne({ _id: tempUser._id });
      
      res.status(500).json({
        success: false,
        message: 'Không thể gửi email xác thực. Vui lòng thử lại sau',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    
    // Xử lý lỗi từ service (validation errors)
    if (error.message.includes('Vui lòng nhập') || 
        error.message.includes('Email không đúng') || 
        error.message.includes('Mật khẩu phải') ||
        error.message.includes('Email này đã được đăng ký') ||
        error.message.includes('Mật khẩu và xác nhận mật khẩu không khớp')) {
      return res.status(400).json({
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

const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    const { user: newUser, token: jwtToken } = await userService.verifyEmail(token, email);

    res.status(200).json({
      success: true,
      message: 'Xác thực email thành công! Tài khoản đã được kích hoạt.',
      data: {
        user: {
          id: newUser._id,
          fullName: newUser.fullName,
          email: newUser.email,
          role: newUser.role,
          status: newUser.status,
          gender: newUser.gender,
          dob: newUser.dob
        },
        token: jwtToken
      }
    });

  } catch (error) {
    console.error('Lỗi xác thực email:', error);
    
    // Xử lý lỗi từ service (validation errors)
    if (error.message.includes('Thiếu thông tin') || 
        error.message.includes('Link xác thực không hợp lệ') || 
        error.message.includes('Link xác thực đã hết hạn')) {
      return res.status(400).json({
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

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Xử lý đăng nhập qua service
    const { user, token, emergencyContact } = await userService.loginUser(email, password);

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phoneNumber,
          address: user.address,
          dateOfBirth: user.dob,
          gender: user.gender,
          avatar: user.avatar,
          emergencyContact: emergencyContact,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    
    // Xử lý lỗi từ service (validation errors)
    if (error.message.includes('Vui lòng nhập') || 
        error.message.includes('Email hoặc mật khẩu không đúng') || 
        error.message.includes('Tài khoản của bạn đã bị khóa') ||
        error.message.includes('Tài khoản của bạn chưa được kích hoạt')) {
      return res.status(401).json({
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

const getProfile = async (req, res) => {
  try {
    // Lấy profile qua service
    const user = await userService.getUserProfile(req.user.userId);

    res.status(200).json({
      success: true,
      data: { 
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phoneNumber,
          address: user.address,
          dateOfBirth: user.dob,
          gender: user.gender,
          avatar: user.avatar,
          emergencyContact: user.emergencyContact,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Lỗi lấy profile:', error);
    
    if (error.message.includes('Không tìm thấy thông tin người dùng')) {
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

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập email'
      });
    }

    // Kiểm tra email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không đúng định dạng'
      });
    }

    // Xử lý forgot password qua service
    const { resetToken, user } = await userService.forgotPassword(email);

    // Tạo link reset password
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = emailService.createResetPasswordLink(resetToken, email, baseUrl);

    // Gửi email reset password
    try {
      await emailService.sendResetPasswordEmail(user.fullName, email, resetLink);

      res.status(200).json({
        success: true,
        message: 'Email đặt lại mật khẩu đã được gửi thành công',
        data: {
          email,
          message: 'Vui lòng kiểm tra email và làm theo hướng dẫn. Link có hiệu lực trong 10 phút.',
          fullName: user.fullName
        }
      });

    } catch (emailError) {
      console.error('Lỗi gửi email reset password:', emailError);

      // Xóa reset token nếu gửi email thất bại
      await User.updateOne(
        { email: email.toLowerCase() },
        { 
          $unset: { 
            resetPasswordToken: 1, 
            resetPasswordExpire: 1 
          } 
        }
      );

      res.status(500).json({
        success: false,
        message: 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau',
        error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

  } catch (error) {
    console.error('Lỗi forgot password:', error);
    
    if (error.message.includes('Vui lòng nhập email') ||
        error.message.includes('Không tìm thấy tài khoản') ||
        error.message.includes('Tài khoản của bạn đã bị khóa') ||
        error.message.includes('Tài khoản của bạn chưa được kích hoạt')) {
      return res.status(400).json({
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

const resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ thông tin'
      });
    }

    // Validation password mới
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự'
      });
    }

    // Xử lý reset password qua service
    const updatedUser = await userService.resetPassword(token, email, newPassword);

    res.status(200).json({
      success: true,
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập với mật khẩu mới',
      data: {
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        message: 'Vui lòng đăng nhập lại với mật khẩu mới'
      }
    });

  } catch (error) {
    console.error('Lỗi reset password:', error);
    
    // Xử lý lỗi từ service
    if (error.message.includes('Thiếu thông tin') ||
        error.message.includes('Token không hợp lệ') ||
        error.message.includes('Mật khẩu mới phải')) {
      return res.status(400).json({
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

// Verify reset password token (GET endpoint)
const verifyResetPasswordToken = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu token hoặc email'
      });
    }

    // Hash token để so sánh với DB
    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Tìm user với token chưa hết hạn
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token không hợp lệ hoặc đã hết hạn'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token hợp lệ, bạn có thể đặt lại mật khẩu',
      data: {
        email: user.email,
        fullName: user.fullName,
        message: 'Token hợp lệ. Bạn có thể đặt lại mật khẩu mới.'
      }
    });

  } catch (error) {
    console.error('Lỗi verify reset password token:', error);
    
    res.status(500).json({
      success: false,
      message: 'Lỗi server. Vui lòng thử lại sau',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Các trường sẽ validate giống updateAccount
    const allowedFields = ['fullName', 'phoneNumber', 'address', 'dob', 'gender', 'emergencyContact'];
    const updates = {};
    let emergencyContactUpdate = null;

    for (const key of Object.keys(req.body)) {
      if (!allowedFields.includes(key)) continue;

      const value = req.body[key];

      // --- Validate fullName ---
      if (key === 'fullName') {
        const cleanName = value?.trim() || '';
        if (cleanName.length === 0) {
          return res.status(400).json({ success: false, message: 'Họ tên không được để trống' });
        }
        if (!/^[a-zA-ZÀ-Ỹà-ỹĐđ\s]+$/.test(cleanName)) {
          return res.status(400).json({ success: false, message: 'Họ tên không được chứa số hoặc ký tự đặc biệt' });
        }
        if (cleanName.length < 2) {
          return res.status(400).json({ success: false, message: 'Độ dài họ và tên không hợp lệ (tối thiểu 2 ký tự)' });
        }
        updates[key] = cleanName;
      }

      // --- Validate phoneNumber ---
      if (key === 'phoneNumber') {
        const cleanPhone = value?.trim() || '';
        updates[key] = cleanPhone.length === 0 ? null : cleanPhone;
        if (cleanPhone.length > 0 && (!/^[0-9]{10}$/.test(cleanPhone) || !cleanPhone.startsWith('0'))) {
          return res.status(400).json({ success: false, message: 'Số điện thoại phải bắt đầu bằng 0 và có đúng 10 chữ số' });
        }
      }

      // --- Validate address ---
      if (key === 'address') {
        const cleanAddress = value?.trim() || '';
        updates[key] = cleanAddress.length === 0 ? null : cleanAddress;
        if (cleanAddress.length > 0) {
          if (!/^[a-zA-ZÀ-Ỹà-ỹĐđ0-9\s,.\-\/]+$/.test(cleanAddress)) {
            return res.status(400).json({ success: false, message: 'Địa chỉ không hợp lệ' });
          }
          if (cleanAddress.length < 2) {
            return res.status(400).json({ success: false, message: 'Độ dài địa chỉ không hợp lệ (tối thiểu 2 ký tự)' });
          }
        }
      }

      // --- Validate dob ---
      else if (key === 'dob') {
        const birthDate = new Date(value);
        if (isNaN(birthDate.getTime())) {
          return res.status(400).json({ success: false, message: 'Ngày sinh không hợp lệ' });
        }
        const now = new Date();
        let age = now.getFullYear() - birthDate.getFullYear();
        const m = now.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
        if (age < 18) {
          return res.status(400).json({ success: false, message: 'Người dùng phải đủ 18 tuổi trở lên' });
        }
        updates[key] = value;
      }

      // --- Gender & Status ---
      else if (key === 'gender') {
        updates[key] = value;
      }

      // --- emergencyContact giữ nguyên logic cũ ---
      else if (key === 'emergencyContact') {
        const ec = value;
        if (ec) {
          if (!ec.name || typeof ec.name !== 'string' || ec.name.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'emergencyContact.name không được để trống' });
          }
          if (!ec.phone || typeof ec.phone !== 'string' || ec.phone.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'emergencyContact.phone không được để trống' });
          }
          const phoneRegex = /^[0-9]{10,11}$/;
          if (!phoneRegex.test(ec.phone.replace(/\D/g, ''))) {
            return res.status(400).json({ success: false, message: 'emergencyContact.phone phải là 10-11 số' });
          }
          const validRelationships = ['Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Friend', 'Other'];
          if (!ec.relationship || !validRelationships.includes(ec.relationship)) {
            return res.status(400).json({ success: false, message: `emergencyContact.relationship phải là một trong: ${validRelationships.join(', ')}` });
          }
          emergencyContactUpdate = {
            name: ec.name.trim(),
            phone: ec.phone.trim(),
            relationship: ec.relationship
          };
        }
      }
    }

    if (Object.keys(updates).length === 0 && !emergencyContactUpdate) {
      return res.status(400).json({ success: false, message: 'Không có trường hợp lệ để cập nhật' });
    }

    // Cập nhật User
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash -__v');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin người dùng' });
    }

    // Cập nhật emergencyContact trong Patient nếu có
    if (emergencyContactUpdate && updatedUser.role === 'Patient') {
      const Patient = require('../models/patient.model');
      let patient = await Patient.findOne({ patientUserId: userId });
      if (!patient) {
        patient = new Patient({ patientUserId: userId, emergencyContact: emergencyContactUpdate });
        await patient.save();
      } else {
        patient.emergencyContact = emergencyContactUpdate;
        await patient.save();
      }
    }

    // Lấy emergencyContact mới nhất
    let emergencyContactResponse = null;
    if (updatedUser.role === 'Patient') {
      const Patient = require('../models/patient.model');
      const patient = await Patient.findOne({ patientUserId: userId });
      if (patient) {
        emergencyContactResponse = patient.emergencyContact || null;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin cá nhân thành công',
      data: {
        user: {
          id: updatedUser._id,
          fullName: updatedUser.fullName,
          email: updatedUser.email,
          role: updatedUser.role,
          status: updatedUser.status,
          phone: updatedUser.phoneNumber,
          address: updatedUser.address,
          dateOfBirth: updatedUser.dob,
          gender: updatedUser.gender,
          avatar: updatedUser.avatar,
          emergencyContact: emergencyContactResponse,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Lỗi cập nhật profile:', error);
    res.status(500).json({ success: false, message: 'Lỗi server. Vui lòng thử lại sau' });
  }
};


// Middleware xác thực JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Không có token xác thực'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        message: 'Token không hợp lệ'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Token đã hết hạn'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Lỗi xác thực token'
      });
    }
  }
};


const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, reNewPassword } = req.body;

    const result = await userService.changePassword(
      req.user.userId,
      { oldPassword, newPassword, reNewPassword }
    );

    res.status(200).json({
      success: true,
      message: "Thay đổi mật khẩu thành công",
      result,
    });
  } catch (error) {
    console.error("Lỗi cập nhật đổi mật khẩu:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Lỗi server. Vui lòng thử lại sau",
    });
  }
};




module.exports = {
  register,
  verifyEmail,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyResetPasswordToken,
  authenticateToken,
  changePassword,
};
