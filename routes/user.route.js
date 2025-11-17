const express = require('express');
const router = express.Router();
const {
  register,
  verifyEmail,
  login,
  getProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
  verifyResetPasswordToken,
  authenticateToken,
  changePassword
} = require('../controllers/user.controller');

// Routes công khai (không cần authentication)
router.post('/register', register);
router.get('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.get('/reset-password', verifyResetPasswordToken);
router.post('/reset-password', resetPassword);

// Routes cần authentication
router.get('/profile', authenticateToken, getProfile);
router.patch('/profile', authenticateToken, updateProfile);
router.patch('/change-password', authenticateToken, changePassword)
module.exports = router;
