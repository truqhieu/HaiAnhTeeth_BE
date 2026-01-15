
function validateConfirmPassword(password, confirmPassword) {
  // Kiểm tra type
  if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
    return {
      isValid: false,
      message: 'Mật khẩu phải là chuỗi ký tự'
    };
  }

  // Kiểm tra độ dài
  if (password.length === 0 || confirmPassword.length === 0) {
    return {
      isValid: false,
      message: 'Mật khẩu không được để trống'
    };
  }

  // Kiểm tra độ dài khác nhau
  if (password.length !== confirmPassword.length) {
    return {
      isValid: false,
      message: 'Độ dài mật khẩu và xác nhận mật khẩu không khớp'
    };
  }

  // Kiểm tra nội dung chính xác (timing-safe comparison)
  if (!timingSafeEqual(password, confirmPassword)) {
    return {
      isValid: false,
      message: 'Mật khẩu và xác nhận mật khẩu không khớp'
    };
  }

  return {
    isValid: true,
    message: 'Mật khẩu hợp lệ'
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function sanitizePassword(obj) {

  if (typeof obj === 'object' && obj !== null && 'confirmPassword' in obj) {
    delete obj.confirmPassword;
  }
  return null; 
}


function validatePasswordWithHeader(password, confirmHash) {
  const crypto = require('crypto');
  
  if (!password || !confirmHash) {
    return {
      isValid: false,
      message: 'Thiếu thông tin xác nhận mật khẩu'
    };
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  
  if (!timingSafeEqual(passwordHash, confirmHash)) {
    return {
      isValid: false,
      message: 'Mật khẩu không khớp'
    };
  }

  return {
    isValid: true,
    message: 'Mật khẩu hợp lệ'
  };
}

module.exports = {
  validateConfirmPassword,
  timingSafeEqual,
  sanitizePassword,
  validatePasswordWithHeader
};
