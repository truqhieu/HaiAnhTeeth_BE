const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const {createAccount, getAllAccounts, viewDetailAccount, updateAccount,lockAccounts, unlockAccounts, changePassword, assignRole} = require('../controllers/admin.controller');

// ⭐ Chỉ Admin được phép quản lý tài khoản
router.post('/accounts',verifyToken, verifyRole('Admin'), createAccount)
router.get('/accounts',verifyToken, verifyRole('Admin'),  getAllAccounts)
router.patch('/accounts/lock', verifyToken, verifyRole('Admin'), lockAccounts)
router.patch('/accounts/unlock', verifyToken, verifyRole('Admin'), unlockAccounts)
router.patch('/accounts/change-password/:id', verifyToken, verifyRole('Admin'), changePassword)
router.patch('/accounts/assign-role/:id', verifyToken, verifyRole('Admin'), assignRole)
router.get('/accounts/:id', verifyToken, verifyRole('Admin'),viewDetailAccount)
router.patch('/accounts/:id', verifyToken, verifyRole('Admin'), updateAccount)

module.exports = router;
