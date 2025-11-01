const express = require('express');
const router = express.Router();
const { getDoctorAppointmentsSchedule, getAppointmentDetail, getPatientDetail, getPatientAppointmentsForDoctor } = require('../controllers/doctor.controller');
const { getOrCreateMedicalRecord, getActiveServicesForDoctor, updateAdditionalServicesForDoctor, updateMedicalRecordForDoctor, approveMedicalRecordByDoctor } = require('../controllers/medicalRecord.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

// ⭐ Doctor xem danh sách lịch hẹn trong tuần hiện tại + tuần tiếp theo (2 tuần)
router.get('/appointments-schedule', verifyToken, verifyRole('Doctor'), getDoctorAppointmentsSchedule);

// ⭐ Doctor xem chi tiết một lịch hẹn (Pop-up ca khám)
router.get('/appointments/:appointmentId', verifyToken, verifyRole('Doctor'), getAppointmentDetail);

// ⭐ Doctor xem chi tiết thông tin bệnh nhân (Pop-up thông tin bệnh nhân)
router.get('/patients/:patientId', verifyToken, verifyRole('Doctor'), getPatientDetail);

// ⭐ Doctor lấy danh sách lịch hẹn của một bệnh nhân (chỉ của bác sĩ hiện tại)
router.get('/patients/:patientId/appointments', verifyToken, verifyRole('Doctor'), getPatientAppointmentsForDoctor);

// ⭐ Doctor - Medical Record
router.get('/medical-records/:appointmentId', verifyToken, verifyRole('Doctor'), getOrCreateMedicalRecord);

// ⭐ Doctor - list active services for dropdown
router.get('/services', verifyToken, verifyRole('Doctor'), getActiveServicesForDoctor);

// ⭐ Doctor - update additional services in medical record
router.patch('/medical-records/:appointmentId/additional-services', verifyToken, verifyRole('Doctor'), updateAdditionalServicesForDoctor);

// ⭐ Doctor - update medical record (diagnosis, conclusion, prescription, nurseNote)
router.patch('/medical-records/:appointmentId', verifyToken, verifyRole('Doctor'), updateMedicalRecordForDoctor);

// ⭐ Doctor - approve medical record
router.post('/medical-records/:appointmentId/approve', verifyToken, verifyRole('Doctor'), approveMedicalRecordByDoctor);

module.exports = router;
