const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createClinicRoom, getAllClinicRooms, viewDetailClinicRoom, updateClinicRoom, listDoctor, assignDoctor, unssignDoctor } = require('../controllers/clinicRoom.controller');

router.post('/clinic-rooms', verifyToken, verifyRole('Manager'), createClinicRoom)
router.get('/clinic-rooms', getAllClinicRooms)
router.get('/clinic-rooms/doctor', verifyToken, verifyRole('Manager'), listDoctor)
router.get('/clinic-rooms/:id', viewDetailClinicRoom)
router.patch('/clinic-rooms/:id', verifyToken, verifyRole('Manager'), updateClinicRoom)
router.patch('/clinic-rooms/assign-doctor/:id', verifyToken, verifyRole('Manager'), assignDoctor)
router.patch('/clinic-rooms/unssign-doctor/:id', verifyToken, verifyRole('Manager'), unssignDoctor)
// router.delete('/clinic-rooms/:id', verifyToken, verifyRole('Manager'), deleteClinicRoom)


module.exports = router;


