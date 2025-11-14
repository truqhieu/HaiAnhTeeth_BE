const express = require('express');
const router = express.Router();

const userRoutes = require('./user.route');
const adminRoutes = require('./admin.route');
const serviceRoutes = require('./service.route');
const clinicRoutes = require('./clinicRoom.route');
const scheduleRoute = require('./schedule.route');
const tempRegisterRoutes = require('./tempRegister.route');

const doctorRoutes = require('./doctor.route');
const nurseRoutes = require('./nurse.route');
const appointmentRoutes = require('./appointment.route');
const availableSlotRoutes = require('./availableSlot.route');
const paymentRoutes = require('./payment.route');
const policyRoutes = require('./policy.route');
const complaintRoutes = require('./complaint.route');
const leaveRequestRoutes = require('./leaveRequest.route');
const deviceRoutes = require('./device.route');
const blogRoutes = require('./blog.route');
const patientRequestRoutes = require('./patientRequest.route');
const promotionRoutes = require('./promotion.route');
const notificaionRoutes = require('./notification.route')
const chatMessageRoutes = require('./chatMessage.route')


// --- ROUTES ---
router.use('/auth', userRoutes);
router.use('/admin', adminRoutes);
router.use('/manager', serviceRoutes);
router.use('/manager', clinicRoutes);
router.use('/manager', scheduleRoute);
router.use('/manager', deviceRoutes);
router.use('/manager', blogRoutes);
router.use('/manager', promotionRoutes);

router.use('/doctor', doctorRoutes);
router.use('/nurse', nurseRoutes);


router.use('/temp-register', tempRegisterRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/chat', chatMessageRoutes);
router.use('/available-slots', availableSlotRoutes);
router.use('/payments', paymentRoutes);
router.use('/policies', policyRoutes);
router.use('/complaints', complaintRoutes)
router.use('/leave-requests', leaveRequestRoutes)
router.use('/patient-requests', patientRequestRoutes)
router.use('/notifications', notificaionRoutes)
router.use('/chat-messages', chatMessageRoutes)

// --- API INFO ENDPOINT ---
router.get('/', (req, res) => {
  res.json({
    message: 'HealingMedicine API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        verifyEmail: 'GET /api/auth/verify-email',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile (requires token)',
        updateProfile: 'PATCH /api/auth/profile (requires token)',
      },
      tempRegister: {
        resendVerification: 'POST /api/temp-register/resend-verification',
        checkStatus: 'GET /api/temp-register/status',
        cancel: 'DELETE /api/temp-register/cancel',
      },
      admin: {
        createAccount: 'POST /api/admin/accounts',
        getAllAccounts: 'GET /api/admin/accounts',
        viewDetailAccount: 'GET /api/admin/accounts/:id',
        updateAccount: 'PATCH /api/admin/accounts/:id',
        lockAccount: 'PATCH /api/admin/accounts/lock/:id',
        unlockAccount: 'PATCH /api/admin/accounts/unlock/:id',
        changePassword: 'PATCH /api/admin/accounts/change-password/:id',
        assignRole: 'PATCH /api/admin/accounts/assign-role/:id',
      },
      service: {
        createService: 'POST /api/manager/services',
        getAllServices: 'GET /api/manager/services',
        viewDetailService: 'GET /api/manager/services/:id',
        updateService: 'PATCH /api/manager/services/:id',
        deleteService: 'DELETE /api/manager/services/:id',
      },
      clinic: {
        createClinicRoom: 'POST /api/manager/clinics ',
        getAllServices: 'GET /api/manager/clinics',
        viewDetailClinicRoom: 'GET /api/manager/clinics/:id',
        updateClinicRoom: 'PATCH /api/manager/clinics/:id',
        deleteClinicRoom: 'DELETE /api/manager/clinics/:id',
        listDoctor: 'GET /api/manager/clinics/doctor',
        assignDoctor: 'PATCH /api/manager/assign-doctor/:id',
        unssignDoctor: 'PATCH /api/manager/unssign-doctor/:id',
      },
      schedule: {
        getDoctorsWithWorkingHours: 'GET /api/manager/schedules/doctors-with-working-hours',
        updateDoctorWorkingHours: 'PUT /api/manager/schedules/doctor/:doctorId/working-hours',
        getWorkingHours: 'GET /api/manager/schedules/:scheduleId/working-hours',
        updateWorkingHours: 'PUT /api/manager/schedules/:scheduleId/working-hours',
        updateDoctorWorkingHoursForDate: 'PUT /api/manager/schedules/doctor/:doctorId/date/:date/working-hours',
      },
      doctor: {
        getAppointmentsSchedule: 'GET /api/doctor/appointments-schedule (requires Doctor token)',
        getAppointmentDetail: 'GET /api/doctor/appointments/:appointmentId (requires Doctor token)',
        getPatientDetail: 'GET /api/doctor/patients/:patientId (requires Doctor token)',
      },
      nurse: {
        getAppointmentsSchedule: 'GET /api/nurse/appointments-schedule (requires Nurse token)',
        getAppointmentDetail: 'GET /api/nurse/appointments/:appointmentId (requires Nurse token)',
        getPatientDetail: 'GET /api/nurse/patients/:patientId (requires Nurse token)',
      },
    },
  });
});

module.exports = router;
