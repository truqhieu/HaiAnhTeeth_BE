const express = require('express');
const router = express.Router();
const { verifyToken} = require('../middleware/auth.middleware');
const { getUserNotifications, markAsRead, markAllAsRead, deleteNotification } = require('../controllers/notificaion.controller');

router.get('/all', verifyToken,  getUserNotifications)
router.put('/all', verifyToken, markAllAsRead)
router.put('/:id', verifyToken,  markAsRead)
router.delete('/:id', verifyToken,  deleteNotification)

module.exports = router