const User = require('../models/user.model');
const TempRegister = require('../models/tempRegister.model');
const Patient = require('../models/patient.model');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

class UserService {

  async registerUser(userData) {
    const { fullName, email, password, gender, dateOfBirth } = userData;
    const role = 'Patient'; 

    if (!fullName || !email || !password) {
      throw new Error('Dữ liệu đầu vào không hợp lệ');
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new Error('Email này đã được đăng ký');
    }

    const existingTempUser = await TempRegister.findOne({ email: email.toLowerCase() });
    if (existingTempUser) {
      // Xóa bản ghi cũ để tạo mới
      await TempRegister.deleteOne({ email: email.toLowerCase() });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Tạo verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const tempUserData = {
      fullName,
      email: email.toLowerCase(),
      passwordHash,
      role,
      verificationToken
    };

    // Thêm gender và dateOfBirth nếu có
    if (gender) {
      tempUserData.gender = gender;
    }
    if (dateOfBirth) {
      tempUserData.dateOfBirth = new Date(dateOfBirth);
    }

    // Lưu vào tempRegister
    const tempUser = new TempRegister(tempUserData);
    await tempUser.save();

    return { tempUser, verificationToken };
  }

  async verifyEmail(token, email) {
    if (!token || !email) {
      throw new Error('Thiếu thông tin xác thực');
    }

    // Tìm user trong tempRegister
    const tempUser = await TempRegister.findOne({
      email: email.toLowerCase(),
      verificationToken: token
    });

    if (!tempUser) {
      throw new Error('Link xác thực không hợp lệ hoặc đã hết hạn');
    }

    if (tempUser.tokenExpireAt < new Date()) {
      await TempRegister.deleteOne({ _id: tempUser._id });
      throw new Error('Link xác thực đã hết hạn. Vui lòng đăng ký lại');
    }

    const userData = {
      fullName: tempUser.fullName,
      email: tempUser.email,
      passwordHash: tempUser.passwordHash,
      role: tempUser.role,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Thêm gender và dob nếu có trong tempUser
    if (tempUser.gender) {
      userData.gender = tempUser.gender;
    }
    if (tempUser.dateOfBirth) {
      userData.dob = tempUser.dateOfBirth;
    }

    const result = await User.collection.insertOne(userData);
    const newUser = await User.findById(result.insertedId);

    // Xóa tempUser sau khi tạo user thành công
    await TempRegister.deleteOne({ _id: tempUser._id });

    // ⭐ Nếu là Patient, tự động tạo record trong bảng Patient
    if (newUser.role === 'Patient') {
      const newPatient = new Patient({
        patientUserId: newUser._id
      });
      await newPatient.save();
    }

    // Tạo JWT token
    const jwtToken = jwt.sign(
      { 
        userId: newUser._id,
        email: newUser.email,
        role: newUser.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    return { user: newUser, token: jwtToken };
  }

  async loginUser(email, password) {
    if (!email || !password) {
      throw new Error('Vui lòng nhập email và mật khẩu');
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new Error('Email hoặc mật khẩu không đúng');
    }

    if (user.status === 'Lock') {
      throw new Error('Tài khoản của bạn đã bị khóa');
    }
    
    if (user.status !== 'Active') {
      throw new Error('Tài khoản của bạn chưa được kích hoạt');
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error('Email hoặc mật khẩu không đúng');
    }

    // Tạo JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    // Cập nhật thời gian đăng nhập cuối
    user.updatedAt = new Date();
    await user.save();

    // ⭐ Lấy emergencyContact từ bảng Patient nếu user là Patient
    let emergencyContact = null;
    if (user.role === 'Patient') {
      let patient = await Patient.findOne({ patientUserId: user._id });
      console.log('🔍 [LOGIN] Patient record found:', patient ? 'Yes' : 'No');
      
      if (!patient) {
        // ⭐ Tự động tạo Patient record nếu chưa có (cho user cũ)
        console.log('🔍 [LOGIN] Creating Patient record for existing user');
        patient = new Patient({
          patientUserId: user._id
        });
        await patient.save();
      }
      
      if (patient) {
        console.log('🔍 [LOGIN] EmergencyContact data:', JSON.stringify(patient.emergencyContact));
        emergencyContact = patient.emergencyContact || null;
      }
    }

    return { user, token, emergencyContact };
  }

  async getUserProfile(userId) {
    const user = await User.findById(userId).select('-passwordHash');
    
    if (!user) {
      throw new Error('Không tìm thấy thông tin người dùng');
    }

    // ⭐ Lấy emergencyContact từ bảng Patient nếu user là Patient
    let emergencyContact = null;
    if (user.role === 'Patient') {
      let patient = await Patient.findOne({ patientUserId: userId });
      console.log('🔍 [GET PROFILE] Patient record found:', patient ? 'Yes' : 'No');
      
      if (!patient) {
        // ⭐ Tự động tạo Patient record nếu chưa có (cho user cũ)
        console.log('🔍 [GET PROFILE] Creating Patient record for existing user');
        patient = new Patient({
          patientUserId: userId
        });
        await patient.save();
      }
      
      if (patient) {
        console.log('🔍 [GET PROFILE] EmergencyContact data:', JSON.stringify(patient.emergencyContact));
        emergencyContact = patient.emergencyContact || null;
      }
    }

    return { ...user.toObject(), emergencyContact };
  }

  verifyJWTToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }

  async fixUserPassword(email, newPassword) {
    if (!email || !newPassword) {
      throw new Error('Vui lòng nhập email và newPassword');
    }

    // Chỉ hoạt động trong development mode
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Endpoint này chỉ khả dụng trong development mode');
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      throw new Error('Không tìm thấy user với email này');
    }

    // Hash password mới
    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Cập nhật password trực tiếp vào database (bypass middleware)
    await User.collection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          passwordHash: newPasswordHash,
          updatedAt: new Date()
        }
      }
    );

    return user;
  }

  async forgotPassword(email) {
    if (!email) {
      throw new Error('Vui lòng nhập email');
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new Error('Không tìm thấy tài khoản với email này');
    }

    if (user.status === 'Lock') {
      throw new Error('Tài khoản của bạn đã bị khóa');
    }
    
    if (user.status !== 'Active') {
      throw new Error('Tài khoản của bạn chưa được kích hoạt');
    }

    const resetToken = user.generateResetPasswordToken();
    
    // Lưu user với reset token và expire time
    await user.save({ validateBeforeSave: false });

    return { resetToken, user };
  }

  async resetPassword(token, email, newPassword) {
    if (!token || !email || !newPassword) {
      throw new Error('Thiếu thông tin cần thiết để reset password');
    }

    // Hash token để so sánh với DB
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Tìm user với token chưa hết hạn
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      throw new Error('Token không hợp lệ hoặc đã hết hạn');
    }

    // Validation password mới
    if (newPassword.length < 6) {
      throw new Error('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    // Hash password mới
    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Cập nhật password trực tiếp vào database (bypass middleware)
    await User.collection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          passwordHash: newPasswordHash,
          resetPasswordToken: undefined,
          resetPasswordExpire: undefined,
          updatedAt: new Date()
        }
      }
    );

    // Lấy user đã cập nhật
    const updatedUser = await User.findById(user._id);
    return updatedUser;
  }

async changePassword(userId, data) {
  const { oldPassword, newPassword, reNewPassword } = data;

  // 1. Kiểm tra user tồn tại
  const user = await User.findById(userId);
  if (!user) throw new Error("Vui lòng đăng nhập");

  // 2. So sánh mật khẩu cũ
  const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isMatch) throw new Error("Mật khẩu hiện tại không đúng, vui lòng nhập lại");

  // 3. Kiểm tra mật khẩu mới trùng xác nhận
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      throw new Error('Mật khẩu mới không được để trống');
    }

    const cleanPassword = newPassword.trim();

    if (!/^(?=.*[A-Z])(?=(?:.*\d){2,})(?=.*[!@#$%^&*()_+{}\[\]:;"'<>,.?/~`-]).+$/.test(cleanPassword)) {
      throw new Error('Mật khẩu phải chứa ít nhất 1 chữ hoa, 2 chữ số và 1 kí tự đặc biệt');
    }

    if (cleanPassword.length < 4) {
      throw new Error('Độ dài mật khẩu không hợp lệ (tối thiểu 4 ký tự)');
    }
      if (newPassword !== reNewPassword)throw new Error("Mật khẩu mới không trùng nhau");

  // 4. Hash mật khẩu mới
  const newHashedPassword = await bcrypt.hash(newPassword, 12);

  // 5. Cập nhật vào DB
  const updatePassword = await User.findByIdAndUpdate(
    userId,
    { passwordHash: newHashedPassword },
    { new: true }
  );

  return updatePassword;
}

}

module.exports = new UserService();