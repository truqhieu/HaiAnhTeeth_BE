const express = require('express');
const { createPromotion, getAllPromotions, viewDetailPromotion, updatePromotion, deletePromotion } = require('../controllers/promotion.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/promotions', verifyToken, verifyRole('Manager'), createPromotion)
router.get('/promotions', verifyToken, verifyRole('Manager'), getAllPromotions)
router.get('/promotions/:id', verifyToken, verifyRole('Manager'), viewDetailPromotion)
router.patch('/promotions/:id', verifyToken, verifyRole('Manager'), updatePromotion)
router.delete('/promotions/:id',verifyToken, verifyRole('Manager'), deletePromotion)

module.exports = router