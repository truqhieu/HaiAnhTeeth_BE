const express = require('express');
const router = express.Router();
const { getNurseSchedule, getAppointmentDetail, getPatientDetail, getAllDoctors } = require('../controllers/nurse.controller');
const { getOrCreateMedicalRecord, updateNurseNote } = require('../controllers/medicalRecord.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

// ⭐ Nurse xem danh sách lịch hẹn của tất cả bác sĩ (tuần hiện tại + tuần tiếp theo)
router.get('/appointments-schedule', verifyToken, verifyRole('Nurse'), getNurseSchedule);

// ⭐ Nurse xem chi tiết một lịch hẹn (Pop-up ca khám)
router.get('/appointments/:appointmentId', verifyToken, verifyRole('Nurse'), getAppointmentDetail);

// ⭐ Nurse xem chi tiết thông tin bệnh nhân (Pop-up thông tin bệnh nhân)
router.get('/patients/:patientId', verifyToken, verifyRole('Nurse'), getPatientDetail);

// ⭐ Medical Record (Nurse)
router.get('/medical-records/:appointmentId', verifyToken, verifyRole('Nurse'), getOrCreateMedicalRecord);
router.patch('/medical-records/:appointmentId/nurse-note', verifyToken, verifyRole('Nurse'), updateNurseNote);

// ⭐ Lấy danh sách tất cả bác sĩ (cho filter)
router.get('/doctors', verifyToken, verifyRole('Nurse'), getAllDoctors);

module.exports = router;
