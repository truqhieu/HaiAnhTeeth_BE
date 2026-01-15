const express = require('express');
const router = express.Router();
const { 
  createConsultationAppointment, 
  createWalkInAppointment,
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
  getAllDoctors,
  assignDoctorToAppointment,
  confirmChangeDoctor,
  cancelChangeDoctor,
  getVisitTicket,
  managerDashboard,
  getMonthlyRevenue,
  getDashboardDetails,
  getMyRelatives,
  reserveTimeslot,
  releaseReservedTimeslot,
  getServiceRevenueReport,
  getRevenueServicePDF,
  checkEmailExistence // ⭐ THÊM export
} = require('../controllers/appointment.controller');
const { getMedicalRecordForPatient, getPatientMedicalRecordsList } = require('../controllers/medicalRecord.controller');
const { createAppointmentByAI } = require('../controllers/aiBooking.controller');
const { verifyToken, verifyRole } = require('../middleware/auth.middleware');

// ⭐ AI tự động đặt lịch từ prompt
router.post('/ai-create', verifyToken, verifyRole('Patient'), createAppointmentByAI);

// ⭐ Patient đặt lịch tư vấn/khám - Cần đăng nhập
router.post('/consultation/create', verifyToken, verifyRole('Patient'), createConsultationAppointment);

// ⭐ Patient/Doctor/Staff/Manager giữ chỗ tạm thời cho khung giờ
router.post('/reserve-slot', verifyToken, verifyRole(['Patient', 'Doctor', 'Staff', 'Manager']), reserveTimeslot);

// ⭐ Patient/Doctor/Staff/Manager hủy giữ chỗ
router.post('/release-slot', verifyToken, verifyRole(['Patient', 'Doctor', 'Staff', 'Manager']), releaseReservedTimeslot);

// ⭐ Staff tạo lịch hẹn khám trực tiếp (walk-in)
router.post('/walk-in/create', verifyToken, verifyRole(['Staff', 'Manager']), createWalkInAppointment);

// ⭐ Check email existence (Staff only)
router.get('/walk-in/check-email', verifyToken, verifyRole(['Staff', 'Manager']), checkEmailExistence);

// Bao gồm cả lịch tư vấn và lịch khám
router.post('/create-by-staff', verifyToken, verifyRole(['Staff', 'Manager']), createConsultationAppointment);

// ⭐ Staff duyệt hoặc hủy lịch hẹn - Chỉ Staff/Manager được phép
router.post('/review', verifyToken, verifyRole(['Staff']), reviewAppointment);

// ⭐ API lấy danh sách lịch hẹn chờ duyệt - Staff/Manager xem
router.get('/pending', verifyToken, verifyRole(['Staff', 'Manager']), getPendingAppointments);

//  API lấy danh sách tất cả lịch hẹn (có filter)
router.get('/all', verifyToken, verifyRole(['Staff']), getAllAppointments);

// ⭐ Lấy danh sách ca khám của người dùng hiện tại - Cần đăng nhập
router.get('/my-appointments', verifyToken, getMyAppointments);

// ⭐ Lấy danh sách người thân đã đặt lịch - Cần đăng nhập
router.get('/my-relatives', verifyToken, verifyRole('Patient'), getMyRelatives);

// ⭐ Patient lấy danh sách tất cả hồ sơ khám bệnh đã hoàn thành
router.get('/medical-records', verifyToken, verifyRole('Patient'), getPatientMedicalRecordsList);

// ⭐ Cập nhật trạng thái ca khám (Staff check-in, Nurse hoàn thành)
// Staff: Approved → CheckedIn
router.put('/:appointmentId/status', verifyToken, verifyRole(['Staff', 'Nurse', 'Manager', 'Doctor']), updateAppointmentStatus);

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

// ⭐ Staff gán bác sĩ mới thay thế bác sĩ cũ vắng mặt
router.post('/:appointmentId/assign-replace-doctor', verifyToken, verifyRole('Staff'), assignDoctorToAppointment);

// ⭐ Xác nhận đổi bác sĩ mới thay thế bác sĩ cũ
router.post('/:appointmentId/confirm-change-doctor', verifyToken, verifyRole('Patient'), confirmChangeDoctor);

// ⭐ Từ chối đổi bác sĩ mới thay thế bác sĩ cũ
router.post('/:appointmentId/cancel-change-doctor', verifyToken, verifyRole('Patient'), cancelChangeDoctor);

// ⭐ Lấy phiếu khám bệnh
router.get('/:appointmentId/visit-ticket/pdf', verifyToken, verifyRole('Staff'), getVisitTicket);

// ⭐ Lấy doanh thu
router.get('/dashboard', verifyToken, verifyRole('Manager'), managerDashboard);

// ⭐ So sánh doanh thu từng tháng theo 1 năm
router.get('/dashboard/monthly-revenue', verifyToken, verifyRole('Manager'), getMonthlyRevenue);

// ⭐ So sánh doanh thu các dịch vụ theo từng tháng
router.get('/dashboard/service-revenue-report', verifyToken, verifyRole('Manager'), getServiceRevenueReport);

// ⭐ Lấy báo cáo doanh thu trong 1 dịch vụ dưới dạng PDF
router.get('/dashboard/service-revenue-report/pdf', verifyToken, verifyRole('Manager'), getRevenueServicePDF);


module.exports = router;
