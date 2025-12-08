/**
 * Unit Tests for assignDoctorToAppointment
 * Testing doctor assignment/replacement flow
 * Total: 10 test cases covering all scenarios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');
const emailService = require('../services/email.service');
const notificationService = require('../services/notification.service');

// Real Database IDs from MongoDB
const DB_IDS = {
  // Patients
  patient1: '691fe21b4b0b8b308033efab', // Trần Trung Hiếu
  
  // Doctors
  doctor1: '691fe0184b0b8b308033eeec', // bác sĩ Hiếu (original)
  doctor2: '691fe06a4b0b8b308033eefc', // bác sĩ Dương (replacement)
  
  // Staff
  staff1: '691fe0184b0b8b308033eeec', // Staff user
  
  // Services
  examination: '68f99f4fa83a29b32e8abdb6', // Làm sạch răng
  
  // Doctor Schedules
  schedule1: '6925be88b026e4db50c30f22' // Doctor Hiếu schedule
};

describe('assignDoctorToAppointment - Doctor Assignment Flow', () => {
  const Appointment = require('../models/appointment.model');
  const Timeslot = require('../models/timeslot.model');
  
  const createdAppointmentIds = [];
  const createdTimeslotIds = [];
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  });

  afterEach(async () => {
    // Cleanup created test data
    if (createdAppointmentIds.length > 0) {
      await Appointment.deleteMany({ _id: { $in: createdAppointmentIds } });
      createdAppointmentIds.length = 0;
    }
    
    if (createdTimeslotIds.length > 0) {
      await Timeslot.deleteMany({ _id: { $in: createdTimeslotIds } });
      createdTimeslotIds.length = 0;
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  });

  const getFixedDate = (day = 20, hour = 10, minute = 0) => {
    const date = new Date('2026-12-' + day.toString().padStart(2, '0'));
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };

  /**
   * Helper function to create test appointment
   */
  const createTestAppointment = async (status = 'Pending') => {
    const startTime = getFixedDate(20, 2, 0);
    const endTime = new Date(startTime.getTime() + 10 * 60000);
    
    // Create timeslot
    const timeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime,
      endTime,
      status: 'Booked',
      reservedByUserId: DB_IDS.patient1,
      reservedUntil: new Date(Date.now() + 10 * 60000)
    });
    createdTimeslotIds.push(timeslot._id);
    
    // Create appointment
    const appointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      doctorScheduleId: DB_IDS.schedule1,
      timeslotId: timeslot._id,
      status: status,
      type: 'Examination',
      mode: 'Offline',
      bookedByUserId: DB_IDS.patient1
    });
    createdAppointmentIds.push(appointment._id);
    
    return { appointment, timeslot };
  };

  /**
   * ========================================
   * SUCCESS CASES (UTC01-UTC03)
   * ========================================
   */

  describe('UTC01 - Assign Doctor to Pending Appointment', () => {
    it('should assign new doctor successfully', async () => {
      // Mock email and notification services
      const emailSpy = jest.spyOn(emailService, 'sendDoctorAssignedEmail').mockResolvedValue(true);
      const notifSpy = jest.spyOn(notificationService, 'createNotification').mockResolvedValue({ _id: 'notif123' });

      const { appointment } = await createTestAppointment('Pending');

      const result = await appointmentService.assignDoctorToAppointment(
        appointment._id.toString(),
        DB_IDS.doctor2,
        DB_IDS.staff1
      );

      expect(result).toBeDefined();
      expect(result.replacedDoctorUserId).toBeDefined();
      expect(result.replacedDoctorUserId._id.toString()).toBe(DB_IDS.doctor2);
      expect(result.confirmDeadline).toBeDefined();
      
      // Verify deadline is ~24 hours from now
      const deadline = new Date(result.confirmDeadline);
      const expectedDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(deadline - expectedDeadline);
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds

      emailSpy.mockRestore();
      notifSpy.mockRestore();
    });
  });

  describe('UTC02 - Assign Doctor to Approved Appointment', () => {
    it('should assign new doctor successfully', async () => {
      const emailSpy = jest.spyOn(emailService, 'sendDoctorAssignedEmail').mockResolvedValue(true);
      const notifSpy = jest.spyOn(notificationService, 'createNotification').mockResolvedValue({ _id: 'notif123' });

      const { appointment } = await createTestAppointment('Approved');

      const result = await appointmentService.assignDoctorToAppointment(
        appointment._id.toString(),
        DB_IDS.doctor2,
        DB_IDS.staff1
      );

      expect(result).toBeDefined();
      expect(result.replacedDoctorUserId._id.toString()).toBe(DB_IDS.doctor2);
      expect(result.confirmDeadline).toBeDefined();

      emailSpy.mockRestore();
      notifSpy.mockRestore();
    });
  });

  describe('UTC03 - Assign Doctor to CheckedIn Appointment', () => {
    it('should assign new doctor successfully', async () => {
      const emailSpy = jest.spyOn(emailService, 'sendDoctorAssignedEmail').mockResolvedValue(true);
      const notifSpy = jest.spyOn(notificationService, 'createNotification').mockResolvedValue({ _id: 'notif123' });

      const { appointment } = await createTestAppointment('CheckedIn');

      const result = await appointmentService.assignDoctorToAppointment(
        appointment._id.toString(),
        DB_IDS.doctor2,
        DB_IDS.staff1
      );

      expect(result).toBeDefined();
      expect(result.replacedDoctorUserId._id.toString()).toBe(DB_IDS.doctor2);

      emailSpy.mockRestore();
      notifSpy.mockRestore();
    });
  });

  /**
   * ========================================
   * INVALID STATUS (UTC04-UTC06)
   * ========================================
   */

  describe('Error Cases - Invalid Status', () => {
    
    it('UTC04 - should reject Completed appointment', async () => {
      const { appointment } = await createTestAppointment('Completed');

      await expect(
        appointmentService.assignDoctorToAppointment(
          appointment._id.toString(),
          DB_IDS.doctor2,
          DB_IDS.staff1
        )
      ).rejects.toThrow(/Trạng thái lịch khám.*không khả dụng/i);
    });

    it('UTC05 - should reject Cancelled appointment', async () => {
      const { appointment } = await createTestAppointment('Cancelled');

      await expect(
        appointmentService.assignDoctorToAppointment(
          appointment._id.toString(),
          DB_IDS.doctor2,
          DB_IDS.staff1
        )
      ).rejects.toThrow(/Trạng thái lịch khám.*không khả dụng/i);
    });

    it('UTC06 - should reject InProgress appointment', async () => {
      const { appointment } = await createTestAppointment('InProgress');

      await expect(
        appointmentService.assignDoctorToAppointment(
          appointment._id.toString(),
          DB_IDS.doctor2,
          DB_IDS.staff1
        )
      ).rejects.toThrow(/Trạng thái lịch khám.*không khả dụng/i);
    });
  });

  /**
   * ========================================
   * INVALID DATA (UTC07-UTC10)
   * ========================================
   */

  describe('Error Cases - Invalid Data', () => {
    
    it('UTC07 - should reject invalid appointment ID', async () => {
      const invalidId = '507f1f77bcf86cd799439011'; // Valid ObjectId format but doesn't exist

      await expect(
        appointmentService.assignDoctorToAppointment(
          invalidId,
          DB_IDS.doctor2,
          DB_IDS.staff1
        )
      ).rejects.toThrow('Lịch khám không tồn tại');
    });

    it('UTC08 - should reject null appointment ID', async () => {
      await expect(
        appointmentService.assignDoctorToAppointment(
          null,
          DB_IDS.doctor2,
          DB_IDS.staff1
        )
      ).rejects.toThrow();
    });

    it('UTC09 - should reject undefined appointment ID', async () => {
      await expect(
        appointmentService.assignDoctorToAppointment(
          undefined,
          DB_IDS.doctor2,
          DB_IDS.staff1
        )
      ).rejects.toThrow();
    });

    it('UTC10 - should reject invalid doctor ID', async () => {
      const { appointment } = await createTestAppointment('Pending');
      const invalidDoctorId = '507f1f77bcf86cd799439011'; // Valid ObjectId format but doesn't exist

      await expect(
        appointmentService.assignDoctorToAppointment(
          appointment._id.toString(),
          invalidDoctorId,
          DB_IDS.staff1
        )
      ).rejects.toThrow('Bác sĩ không tồn tại');
    });
  });

  /**
   * ========================================
   * EMAIL AND NOTIFICATION TESTS
   * ========================================
   */

  describe('Email and Notification Handling', () => {
    
    it('should send email and notification on successful assignment', async () => {
      const emailSpy = jest.spyOn(emailService, 'sendDoctorAssignedEmail').mockResolvedValue(true);
      const notifSpy = jest.spyOn(notificationService, 'createNotification').mockResolvedValue({ _id: 'notif123' });

      const { appointment } = await createTestAppointment('Pending');

      await appointmentService.assignDoctorToAppointment(
        appointment._id.toString(),
        DB_IDS.doctor2,
        DB_IDS.staff1
      );

      // Email should be called
      expect(emailSpy).toHaveBeenCalled();
      
      // Notification should be called
      expect(notifSpy).toHaveBeenCalled();

      emailSpy.mockRestore();
      notifSpy.mockRestore();
    });

    it('should handle email failure gracefully (non-blocking)', async () => {
      const emailSpy = jest.spyOn(emailService, 'sendDoctorAssignedEmail')
        .mockRejectedValue(new Error('Email service unavailable'));
      const notifSpy = jest.spyOn(notificationService, 'createNotification').mockResolvedValue({ _id: 'notif123' });

      const { appointment } = await createTestAppointment('Pending');

      // Should NOT throw error even if email fails
      const result = await appointmentService.assignDoctorToAppointment(
        appointment._id.toString(),
        DB_IDS.doctor2,
        DB_IDS.staff1
      );

      expect(result).toBeDefined();
      expect(result.replacedDoctorUserId._id.toString()).toBe(DB_IDS.doctor2);

      emailSpy.mockRestore();
      notifSpy.mockRestore();
    });

    it('should handle notification failure gracefully (non-blocking)', async () => {
      const emailSpy = jest.spyOn(emailService, 'sendDoctorAssignedEmail').mockResolvedValue(true);
      const notifSpy = jest.spyOn(notificationService, 'createNotification')
        .mockRejectedValue(new Error('Notification service unavailable'));

      const { appointment } = await createTestAppointment('Pending');

      // Should NOT throw error even if notification fails
      const result = await appointmentService.assignDoctorToAppointment(
        appointment._id.toString(),
        DB_IDS.doctor2,
        DB_IDS.staff1
      );

      expect(result).toBeDefined();
      expect(result.replacedDoctorUserId._id.toString()).toBe(DB_IDS.doctor2);

      emailSpy.mockRestore();
      notifSpy.mockRestore();
    });
  });
});
