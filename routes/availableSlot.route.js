const express = require('express');
const router = express.Router();
const { 
  generateSlotsByDate,
  getAvailableSlots,
  getAvailableDoctors,
  getAvailableDoctorsForTimeSlot,
  getDoctorScheduleRange,
  getDoctorScheduleRangeForFollowUp,
  validateAppointmentTime
} = require('../controllers/availableSlot.controller');
const { optionalAuth } = require('../middleware/auth.middleware');

// ⭐ Generate danh sách khung giờ cho một ngày (không cần bác sĩ)
// GET /api/available-slots/generate?serviceId=xxx&date=2025-10-25
router.get('/generate', optionalAuth, generateSlotsByDate);

// API lấy khung giờ available động cho một bác sĩ cụ thể
// GET /api/available-slots?doctorUserId=xxx&serviceId=xxx&date=2025-10-25
router.get('/', getAvailableSlots);

// API lấy danh sách tất cả bác sĩ có khung giờ rảnh vào một ngày cụ thể
// GET /api/available-slots/doctors/list?serviceId=xxx&date=2025-10-25
router.get('/doctors/list', getAvailableDoctors);

// API lấy danh sách bác sĩ có khung giờ rảnh tại một khung giờ cụ thể
// GET /api/available-slots/doctors/time-slot?serviceId=xxx&date=2025-10-25&startTime=2025-10-25T08:00:00Z&endTime=2025-10-25T08:30:00Z
router.get('/doctors/time-slot', getAvailableDoctorsForTimeSlot);

// ⭐ NEW: Lấy khoảng thời gian khả dụng của một bác sĩ cụ thể
// GET /api/available-slots/doctor-schedule?doctorUserId=xxx&serviceId=xxx&date=2025-10-25
router.get('/doctor-schedule', optionalAuth, getDoctorScheduleRange);

// ⭐ NEW: Endpoint dành riêng cho bác sĩ tạo lịch tái khám
// GET /api/available-slots/doctor-schedule/follow-up?doctorUserId=xxx&serviceId=xxx&date=2025-10-25
router.get('/doctor-schedule/follow-up', optionalAuth, getDoctorScheduleRangeForFollowUp);

// ⭐ NEW: Validate appointment time
// GET /api/available-slots/validate-appointment-time?doctorUserId=xxx&serviceId=xxx&date=2025-10-25&startTime=2025-10-25T09:20:00Z
router.get('/validate-appointment-time', optionalAuth, validateAppointmentTime);

module.exports = router;

