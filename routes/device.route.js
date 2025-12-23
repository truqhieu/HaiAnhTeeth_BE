const express = require('express');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createDevice, getAllDevices, viewDetailDevice, updateDevice, deleteDevice } = require('../controllers/device.controller');
const router = express.Router();


router.post('/devices', verifyToken, verifyRole('Manager'),createDevice)
router.get('/devices', verifyToken, verifyRole('Manager'),getAllDevices)
router.get('/devices/:id', verifyToken, verifyRole('Manager'),viewDetailDevice)
router.patch('/devices/:id', verifyToken, verifyRole('Manager'),updateDevice)
router.delete('/devices/:id', verifyToken, verifyRole('Manager'),deleteDevice)

module.exports = router