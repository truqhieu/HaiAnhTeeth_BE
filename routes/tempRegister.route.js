const express = require('express');
const router = express.Router();
const {
  resendVerificationEmail,
  checkRegistrationStatus,
  cancelRegistration
} = require('../controllers/tempRegister.controller');

router.post('/resend-verification', resendVerificationEmail);

router.get('/status', checkRegistrationStatus);

router.delete('/cancel', cancelRegistration);

module.exports = router;
