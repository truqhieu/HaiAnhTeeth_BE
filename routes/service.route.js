const express = require('express');
const router = express.Router();
const { createService, getAllServices, viewDetailService, updateService, getDiscountedServiceDetail, getDiscountedServices } = require('../controllers/service.controller')
const { verifyToken, verifyRole, optionalAuth } = require('../middleware/auth.middleware');

// ⭐ Manager quản lý dịch vụ (CRUD)
router.post('/services', verifyToken, verifyRole('Manager'), createService)
// ⭐ Public route - cả guest và manager đều có thể xem danh sách dịch vụ
router.get('/services', optionalAuth, getAllServices)
router.get('/services/discounted', getDiscountedServices)
router.get('/services/discounted/:id', getDiscountedServiceDetail)
router.get('/services/:id', viewDetailService)
router.patch('/services/:id', verifyToken, verifyRole('Manager'), updateService)
// router.delete('/services/:id', verifyToken, verifyRole('Manager'), deleteService)

module.exports = router 