const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here';

const verifyToken = (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    
    // console.log('🔍 DEBUG verifyToken middleware:');
    // console.log('   - URL:', req.originalUrl);
    // console.log('   - Method:', req.method);
    // console.log('   - Authorization header:', authHeader ? 'EXISTS' : 'MISSING');
    // console.log('   - All headers:', JSON.stringify(req.headers, null, 2));
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No valid Authorization header found');
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để tiếp tục'
      });
    }

    const token = authHeader.split(' ')[1];
    
    console.log('   - Token extracted:', token ? 'YES' : 'NO');

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('   - Token decoded:', decoded);
    
    // Gắn thông tin user vào request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    console.log('   ✅ User info attached:', req.user);
    next();
  } catch (error) {
    console.error('Token verification error:', error);

    if (error.name === 'JsonWebTokenError') {
      console.error('❌ JWT Error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Token không hợp lệ'
      });
    }

    if (error.name === 'TokenExpiredError') {
      console.error('❌ Token Expired:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Token đã hết hạn. Vui lòng đăng nhập lại'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực'
    });
  }
};

const verifyRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.error('❌ verifyRole: No user found in request');
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập'
      });
    }

    // ⭐ Flatten array nếu phần tử đầu tiên là array (hỗ trợ cả verifyRole('Staff') và verifyRole(['Staff']))
    const roles = Array.isArray(allowedRoles[0]) ? allowedRoles[0] : allowedRoles;
    
    // ⭐ Normalize roles để so sánh case-insensitive (hỗ trợ cả 'Doctor' và 'doctor')
    const normalizedAllowedRoles = roles.map(r => {
      // Capitalize first letter: 'doctor' -> 'Doctor', 'nurse' -> 'Nurse'
      if (typeof r === 'string' && r.length > 0) {
        return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
      }
      return r;
    });
    
    // Normalize user role
    const userRole = req.user.role;
    const normalizedUserRole = userRole && typeof userRole === 'string' && userRole.length > 0
      ? userRole.charAt(0).toUpperCase() + userRole.slice(1).toLowerCase()
      : userRole;
    
    console.log('🔍 verifyRole check:');
    console.log('   - User role (original):', req.user.role);
    console.log('   - User role (normalized):', normalizedUserRole);
    console.log('   - Allowed roles (original):', roles);
    console.log('   - Allowed roles (normalized):', normalizedAllowedRoles);
    console.log('   - Has permission?', normalizedAllowedRoles.includes(normalizedUserRole));

    if (!normalizedAllowedRoles.includes(normalizedUserRole)) {
      console.error('❌ Permission denied for role:', req.user.role);
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập'
      });
    }

    console.log('✅ Permission granted');
    next();
  };
};

/**
 * Optional auth middleware - Decode token nếu có, nhưng không reject nếu không có
 * Dùng cho các route public nhưng có thể personalize nếu user đã login
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Không có token, tiếp tục nhưng không có req.user
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Gắn thông tin user vào request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role
      };
      
      console.log('✅ [OptionalAuth] User authenticated:', req.user.userId);
    } catch (error) {
      // Token không hợp lệ hoặc expired, vẫn cho phép request
      console.log('⚠️ [OptionalAuth] Invalid token, continuing as guest');
      req.user = null;
    }
    
    next();
  } catch (error) {
    console.error('OptionalAuth error:', error);
    req.user = null;
    next();
  }
};

module.exports = {
  verifyToken,
  verifyRole,
  optionalAuth
};
