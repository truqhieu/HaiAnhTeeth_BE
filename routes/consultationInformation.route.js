const express = require('express');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createForm, listAllForms, deleteForm } = require('../controllers/consultationInformation.controller');
const router = express.Router();


router.post('/create', createForm)
router.get('/all', verifyToken, verifyRole('Staff'), listAllForms)
router.delete('/:formId', verifyToken, verifyRole('Staff'), deleteForm)


module.exports = router