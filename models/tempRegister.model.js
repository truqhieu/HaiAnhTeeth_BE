const mongoose = require('mongoose');

const tempRegisterSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Vui lòng nhập họ tên'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Vui lòng nhập email'],
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: [true, 'Vui lòng nhập mật khẩu']
  },
  role: {
    type: String,
    enum: ['Patient', 'Doctor', 'Admin'],
    default: 'Patient'
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  dateOfBirth: {
    type: Date
  },
  verificationToken: {
    type: String,
    required: true
  },
  tokenExpireAt: {
    type: Date,
    // Token sẽ tự động hết hạn sau 24 giờ
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
}, {
  timestamps: true
});
// TTL index for auto-delete after 24 hours
tempRegisterSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('TempRegister', tempRegisterSchema,'tempregisters');
