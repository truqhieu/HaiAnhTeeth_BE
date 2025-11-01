const express = require('express');
const router = express.Router();
const { 
  createConsultationAppointment, 
  reviewAppointment,
  getPendingAppointments,
  getAllAppointments,
  getMyAppointments,
  updateAppointmentStatus,
  cancelAppointment,
  confirmCancelAppointment,
  getAppointmentDetails,
  markAsRefunded,
  requestReschedule,
  requestChangeDoctor,
  getRescheduleAvailableSlots,
  getAvailableDoctorsForTimeSlot,
  getAllDoctors
} = require('../controllers/appointment.controller');
const { getMedicalRecordForPatient, getPatientMedicalRecordsList } = require('../controllers/medicalRecord.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

// ⭐ Patient đặt lịch tư vấn/khám - Cần đăng nhập
router.post('/consultation/create', verifyToken, verifyRole('Patient'), createConsultationAppointment);

// Bao gồm cả lịch tư vấn và lịch khám
router.post('/create-by-staff', verifyToken, verifyRole(['Staff', 'Manager']), createConsultationAppointment);

// ⭐ Staff duyệt hoặc hủy lịch hẹn - Chỉ Staff/Manager được phép
router.post('/review', verifyToken, verifyRole(['Staff']), reviewAppointment);

// ⭐ API lấy danh sách lịch hẹn chờ duyệt - Staff/Manager xem
router.get('/pending', verifyToken, verifyRole(['Staff', 'Manager']), getPendingAppointments);

//  API lấy danh sách tất cả lịch hẹn (có filter)
// Patient xem lịch của mình, Staff/Manager/Doctor xem tất cả
router.get('/all', verifyToken, getAllAppointments);

// ⭐ Lấy danh sách ca khám của người dùng hiện tại - Cần đăng nhập
router.get('/my-appointments', verifyToken, getMyAppointments);

// ⭐ Patient lấy danh sách tất cả hồ sơ khám bệnh đã hoàn thành
router.get('/medical-records', verifyToken, verifyRole('Patient'), getPatientMedicalRecordsList);

// ⭐ Cập nhật trạng thái ca khám (Staff check-in, Nurse hoàn thành)
// Staff: Approved → CheckedIn
router.put('/:appointmentId/status', verifyToken, verifyRole(['Staff', 'Nurse', 'Manager']), updateAppointmentStatus);

// ⭐ Hủy ca khám - Patient có thể hủy lịch của mình
router.delete('/:appointmentId/cancel', verifyToken, cancelAppointment);

// ⭐ Xác nhận hủy lịch tư vấn (sau khi hiển thị popup policies)
router.post('/:appointmentId/confirm-cancel', verifyToken, confirmCancelAppointment);

// ⭐ Lấy chi tiết lịch hẹn với bank info - Staff/Manager xem
router.get('/:appointmentId/details', verifyToken, verifyRole(['Staff', 'Manager']), getAppointmentDetails);

// ⭐ Đánh dấu đã hoàn tiền - Chỉ Staff/Manager được phép
router.put('/:appointmentId/mark-refunded', verifyToken, verifyRole(['Staff', 'Manager']), markAsRefunded);

// ⭐ Lấy khung giờ rảnh để đổi lịch (theo appointmentId)
router.get('/:appointmentId/reschedule/slots', verifyToken, getRescheduleAvailableSlots);

// ⭐ Bệnh nhân gửi yêu cầu đổi lịch hẹn (chỉ đổi ngày/giờ)
router.post('/:appointmentId/request-reschedule', verifyToken, requestReschedule);

// ⭐ Bệnh nhân gửi yêu cầu đổi bác sĩ (chỉ đổi bác sĩ)
router.post('/:appointmentId/request-change-doctor', verifyToken, requestChangeDoctor);

// ⭐ Lấy danh sách tất cả bác sĩ (cho filter - Staff/Manager) - PHẢI đặt trước các route có :appointmentId
router.get('/doctors', verifyToken, verifyRole(['Staff', 'Manager']), getAllDoctors);

// ⭐ Lấy danh sách bác sĩ khả dụng cho thời gian cụ thể
router.get('/:appointmentId/available-doctors', verifyToken, getAvailableDoctorsForTimeSlot);

// ⭐ Patient xem hồ sơ khám bệnh (read-only)
router.get('/:appointmentId/medical-record', verifyToken, verifyRole('Patient'), getMedicalRecordForPatient);

module.exports = router;
