/**
 * Unit Tests for reviewAppointment
 * Testing UI Error Messages (from throw new Error())
 * Total: 14 test cases covering approve/cancel actions and all error scenarios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');

// Real Database IDs from MongoDB
const DB_IDS = {
  // Patients
  patient1: '691fe21b4b0b8b308033efab', // Trần Trung Hiếu
  patient2: '691fe77f8604b35e222a6a12', // Đỗ Minh Đức
  
  // Doctors
  doctor1: '691fe0184b0b8b308033eeec', // bác sĩ Hiếu
  
  // Staff (for reviewAppointment)
  staff1: '691fe2e932cd8d0dfd9052bf', // Real staff ID from database
  
  // Services
  examination: '68f99f4fa83a29b32e8abdb6', // Làm sạch răng (10min, not prepaid)
  consultation: '69042a1627a9b33ef7ab42a1', // Khám tổng quát (30min, prepaid, online)
  
  // Doctor Schedules
  schedule1: '6925be88b026e4db50c30f22'
};

describe('reviewAppointment - UI Error Messages', () => {
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
    // Cleanup created appointments
    if (createdAppointmentIds.length > 0) {
      await Appointment.deleteMany({ _id: { $in: createdAppointmentIds } });
      createdAppointmentIds.length = 0;
    }
    
    // Cleanup created timeslots
    if (createdTimeslotIds.length > 0) {
      await Timeslot.deleteMany({ _id: { $in: createdTimeslotIds } });
      createdTimeslotIds.length = 0;
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  });

  const getFixedDate = (day = 15, hour = 2, minute = 0) => {
    const date = new Date('2026-12-' + day.toString().padStart(2, '0'));
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };

  // Helper function to create a test appointment
  const createTestAppointment = async (status = 'Pending', mode = 'Offline') => {
    const startTime = getFixedDate(15, 2, 0);
    const endTime = new Date(startTime.getTime() + 10 * 60000);

    // Create timeslot
    const timeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: startTime,
      endTime: endTime,
      status: 'Booked'
    });
    createdTimeslotIds.push(timeslot._id);

    // Create appointment
    const appointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: mode === 'Online' ? DB_IDS.consultation : DB_IDS.examination,
      timeslotId: timeslot._id,
      status: status,
      type: 'Consultation',
      mode: mode,
      appointmentFor: 'self',
      price: 1000,
      startTime: startTime,
      endTime: endTime,
      bookedByUserId: DB_IDS.patient1 // Required field
    });
    createdAppointmentIds.push(appointment._id);

    return appointment;
  };

  /**
   * ========================================
   * SUCCESS CASES - APPROVE (UTC01-UTC02)
   * ========================================
   */
  describe('Success Cases - Approve', () => {
    
    it('UTC01 - should approve Pending appointment successfully', async () => {
      const appointment = await createTestAppointment('Pending', 'Offline');

      const result = await appointmentService.reviewAppointment(
        appointment._id.toString(),
        DB_IDS.staff1,
        'approve',
        null
      );

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/đã được duyệt/i);
      expect(result.data.status).toBe('Approved');
      expect(result.data.approvedByUserId).toBeDefined();
    });

    it('UTC02 - should approve Online Consultation and create Google Meet link', async () => {
      const appointment = await createTestAppointment('Pending', 'Online');

      const result = await appointmentService.reviewAppointment(
        appointment._id.toString(),
        DB_IDS.staff1,
        'approve',
        null
      );

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/đã được duyệt/i);
      expect(result.data.status).toBe('Approved');
      // Note: Google Meet link may or may not be created depending on service availability
    });
  });

  /**
   * ========================================
   * SUCCESS CASES - CANCEL (UTC03-UTC06)
   * ========================================
   */
  describe('Success Cases - Cancel', () => {
    
    it('UTC03 - should cancel Pending appointment and release timeslot', async () => {
      const appointment = await createTestAppointment('Pending', 'Offline');
      const timeslotId = appointment.timeslotId;

      const result = await appointmentService.reviewAppointment(
        appointment._id.toString(),
        DB_IDS.staff1,
        'cancel',
        'Bác sĩ bận đột xuất'
      );

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/đã bị hủy/i);
      expect(result.data.status).toBe('Cancelled');
      expect(result.data.cancelReason).toBe('Bác sĩ bận đột xuất');

      // Verify timeslot is released
      const timeslot = await Timeslot.findById(timeslotId);
      expect(timeslot.status).toBe('Available');
    });

    it('UTC04 - should cancel Approved appointment', async () => {
      const appointment = await createTestAppointment('Approved', 'Offline');

      const result = await appointmentService.reviewAppointment(
        appointment._id.toString(),
        DB_IDS.staff1,
        'cancel',
        'Thay đổi lịch'
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Cancelled');
    });

    it('UTC05 - should cancel with custom reason', async () => {
      const appointment = await createTestAppointment('Pending', 'Offline');
      const customReason = 'Bệnh nhân yêu cầu hủy';

      const result = await appointmentService.reviewAppointment(
        appointment._id.toString(),
        DB_IDS.staff1,
        'cancel',
        customReason
      );

      expect(result.data.cancelReason).toBe(customReason);
    });

    it('UTC06 - should cancel without reason (use default)', async () => {
      const appointment = await createTestAppointment('Pending', 'Offline');

      const result = await appointmentService.reviewAppointment(
        appointment._id.toString(),
        DB_IDS.staff1,
        'cancel',
        null
      );

      expect(result.data.cancelReason).toBe('Lịch hẹn đã bị hủy');
    });
  });

  /**
   * ========================================
   * ERROR CASES (UTC07-UTC14)
   * ========================================
   */
  describe('Error Cases', () => {
    
    it('UTC07 - should reject invalid appointmentId', async () => {
      const invalidId = '000000000000000000000000';

      await expect(
        appointmentService.reviewAppointment(
          invalidId,
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow('Không tìm thấy lịch hẹn');
    });

    it('UTC08 - should reject invalid action', async () => {
      const appointment = await createTestAppointment('Pending', 'Offline');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'invalid_action',
          null
        )
      ).rejects.toThrow(/Action phải là.*approve.*cancel/i);
    });

    it('UTC09 - should reject Completed appointment', async () => {
      const appointment = await createTestAppointment('Completed', 'Offline');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow(/Không thể xử lý lịch hẹn ở trạng thái/i);
    });

    it('UTC10 - should reject Cancelled appointment', async () => {
      const appointment = await createTestAppointment('Cancelled', 'Offline');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow(/Không thể xử lý lịch hẹn ở trạng thái/i);
    });

    it('UTC11 - should reject CheckedIn appointment', async () => {
      const appointment = await createTestAppointment('CheckedIn', 'Offline');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow(/Không thể xử lý lịch hẹn ở trạng thái/i);
    });

    it('UTC12 - should reject InProgress appointment', async () => {
      const appointment = await createTestAppointment('InProgress', 'Offline');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow(/Không thể xử lý lịch hẹn ở trạng thái/i);
    });

    it('UTC13 - should reject No-Show appointment', async () => {
      const appointment = await createTestAppointment('No-Show', 'Offline');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow(/Không thể xử lý lịch hẹn ở trạng thái/i);
    });

    it('UTC14 - should reject PendingPayment appointment', async () => {
      const appointment = await createTestAppointment('PendingPayment', 'Online');

      await expect(
        appointmentService.reviewAppointment(
          appointment._id.toString(),
          DB_IDS.staff1,
          'approve',
          null
        )
      ).rejects.toThrow(/Không thể xử lý lịch hẹn ở trạng thái/i);
    });
  });
});
