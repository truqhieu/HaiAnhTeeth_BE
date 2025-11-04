const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');const {
  getDoctorsForPatient,
  sendMessage,
  getConversations,
  getMessages
} = require('../controllers/chatMessage.controller');

// Patient routes
router.get('/patient/doctors', verifyToken, getDoctorsForPatient);

// Common routes (cho cả Patient và Doctor)
router.post('/send-message', verifyToken, sendMessage);
router.get('/conversations', verifyToken, getConversations);
router.get('/messages', verifyToken, getMessages);

module.exports = router;
