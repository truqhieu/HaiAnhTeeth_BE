const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');
const { createClinicRoom, getAllClinicRooms, viewDetailClinicRoom, updateClinicRoom, deleteClinicRoom, listDoctor, assignDoctor, unssignDoctor } = require('../controllers/clinicRoom.controller');

router.post('/clinics', verifyToken, verifyRole('Manager'), createClinicRoom)
router.get('/clinics',  getAllClinicRooms)
router.get('/clinics/doctor', verifyToken, verifyRole('Manager'), listDoctor)
router.get('/clinics/:id', viewDetailClinicRoom)
router.patch('/clinics/:id', verifyToken, verifyRole('Manager'), updateClinicRoom)
router.patch('/clinics/assign-doctor/:id', verifyToken, verifyRole('Manager'), assignDoctor)
router.patch('/clinics/unssign-doctor/:id', verifyToken, verifyRole('Manager'), unssignDoctor)
router.delete('/clinics/:id', verifyToken, verifyRole('Manager'), deleteClinicRoom)


module.exports = router;


