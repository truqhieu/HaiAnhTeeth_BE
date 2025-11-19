const express = require('express');
const router = express.Router();
const { updateWorkingHours, getWorkingHours, updateDoctorWorkingHoursForDate, getDoctorsWithWorkingHours, getDoctorsWithoutWorkingHours, updateDoctorWorkingHours, createSchedule } = require('../controllers/schedule.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

// Routes for doctor working hours management
router.get('/schedules/doctors-with-working-hours', verifyToken, verifyRole('Manager'), getDoctorsWithWorkingHours);
router.get('/schedules/doctors-without-working-hours', verifyToken, verifyRole('Manager'), getDoctorsWithoutWorkingHours);
router.put('/schedules/doctor/:doctorId/working-hours', verifyToken, verifyRole('Manager'), updateDoctorWorkingHours);

// ⭐ Create schedule route (tự động tạo cả ca sáng và ca chiều)
router.post('/schedules', verifyToken, verifyRole('Manager'), createSchedule);

// Working Hours routes
router.get('/schedules/:scheduleId/working-hours', verifyToken, verifyRole('Manager'), getWorkingHours);
router.put('/schedules/:scheduleId/working-hours', verifyToken, verifyRole('Manager'), updateWorkingHours);
router.put('/schedules/doctor/:doctorId/date/:date/working-hours', verifyToken, verifyRole('Manager'), updateDoctorWorkingHoursForDate);

module.exports = router;
