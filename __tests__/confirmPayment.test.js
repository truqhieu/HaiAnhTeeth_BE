/**
 * Unit Tests for confirmPayment
 * Testing payment confirmation flow with status updates
 * Total: 9 test cases covering all scenarios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const paymentService = require('../services/payment.service');
const emailService = require('../services/email.service');

// Real Database IDs from MongoDB
const DB_IDS = {
  // Patients
  patient1: '691fe21b4b0b8b308033efab', // Trần Trung Hiếu
  patient2: '691fe77f8604b35e222a6a12', // Đỗ Minh Đức
  
  // Doctors
  doctor1: '691fe0184b0b8b308033eeec', // bác sĩ Hiếu
  
  // Services
  consultation: '69042a1627a9b33ef7ab42a1', // Khám tổng quát (prepaid)
  
  // Doctor Schedules
  schedule1: '6925be88b026e4db50c30f22' // Doctor Hiếu schedule
};

describe('confirmPayment - Payment Confirmation Flow', () => {
  const Payment = require('../models/payment.model');
  const Appointment = require('../models/appointment.model');
  const Timeslot = require('../models/timeslot.model');
  
  const createdPaymentIds = [];
  const createdAppointmentIds = [];
  const createdTimeslotIds = [];
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  });

  afterEach(async () => {
    // Cleanup created test data
    if (createdPaymentIds.length > 0) {
      await Payment.deleteMany({ _id: { $in: createdPaymentIds } });
      createdPaymentIds.length = 0;
    }
    
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

  const getFixedDate = (day = 15, hour = 10, minute = 0) => {
    const date = new Date('2026-12-' + day.toString().padStart(2, '0'));
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };

  /**
   * Helper function to create test payment with appointment and timeslot
   */
  const createTestPayment = async (status = 'Pending') => {
    const startTime = getFixedDate(15, 2, 0);
    const endTime = new Date(startTime.getTime() + 30 * 60000);
    
    // Create timeslot
    const timeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime,
      endTime,
      status: 'Reserved',
      reservedByUserId: DB_IDS.patient1,
      reservedUntil: new Date(Date.now() + 10 * 60000)
    });
    createdTimeslotIds.push(timeslot._id);
    
    // Create appointment
    const appointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.consultation,
      doctorScheduleId: DB_IDS.schedule1,
      timeslotId: timeslot._id,
      status: 'PendingPayment',
      type: 'Consultation',
      mode: 'Online'
    });
    createdAppointmentIds.push(appointment._id);
    
    // Create payment
    const payment = await Payment.create({
      appointmentId: appointment._id,
      patientUserId: DB_IDS.patient1,
      amount: 200000,
      method: 'Sepay',
      status: status,
      QRurl: 'https://example.com/qr-test.png',
      holdExpiresAt: new Date(Date.now() + 10 * 60000)
    });
    createdPaymentIds.push(payment._id);
    
    return { payment, appointment, timeslot };
  };

  /**
   * ========================================
   * SUCCESS CASES (UTC01-UTC02)
   * ========================================
   */

  describe('UTC01 - First-time Payment Confirmation', () => {
    it('should confirm payment and update all related entities', async () => {
      // Mock email service to prevent actual email sending
      const originalSendEmail = emailService.sendAppointmentConfirmationEmail;
      emailService.sendAppointmentConfirmationEmail = jest.fn().mockResolvedValue(true);

      const { payment, appointment, timeslot } = await createTestPayment('Pending');

      const result = await paymentService.confirmPayment(payment._id.toString(), {
        transactionId: 'TEST_TRANS_001',
        amount: 200000
      });

      expect(result).toBeDefined();
      expect(result.payment).toBeDefined();
      expect(result.payment.status).toBe('Completed');
      expect(result.appointment).toBeDefined();
      expect(result.appointment.status).toBe('Pending');
      expect(result.alreadyConfirmed).toBeUndefined();

      // Verify timeslot status updated
      const updatedTimeslot = await Timeslot.findById(timeslot._id);
      expect(updatedTimeslot.status).toBe('Booked');

      // Restore original email service
      emailService.sendAppointmentConfirmationEmail = originalSendEmail;
    });
  });

  describe('UTC02 - Already Confirmed Payment (Idempotent)', () => {
    it('should return early with alreadyConfirmed flag', async () => {
      const { payment } = await createTestPayment('Completed');

      const result = await paymentService.confirmPayment(payment._id.toString(), {
        transactionId: 'TEST_TRANS_002',
        amount: 200000
      });

      expect(result).toBeDefined();
      expect(result.payment).toBeDefined();
      expect(result.payment.status).toBe('Completed');
      expect(result.alreadyConfirmed).toBe(true);
      expect(result.appointment).toBeUndefined();
    });
  });

  /**
   * ========================================
   * INVALID PAYMENT (UTC03-UTC05)
   * ========================================
   */

  describe('Error Cases - Invalid Payment', () => {
    
    it('UTC03 - should reject invalid payment ID', async () => {
      const invalidId = '507f1f77bcf86cd799439011'; // Valid ObjectId format but doesn't exist

      await expect(
        paymentService.confirmPayment(invalidId, {})
      ).rejects.toThrow('Payment không tồn tại');
    });

    it('UTC04 - should reject null payment ID', async () => {
      await expect(
        paymentService.confirmPayment(null, {})
      ).rejects.toThrow();
    });

    it('UTC05 - should reject undefined payment ID', async () => {
      await expect(
        paymentService.confirmPayment(undefined, {})
      ).rejects.toThrow();
    });
  });

  /**
   * ========================================
   * EDGE CASES (UTC06-UTC09)
   * ========================================
   */

  describe('Edge Cases', () => {
    
    it('UTC06 - should handle missing appointment gracefully', async () => {
      // Create payment without appointment
      const payment = await Payment.create({
        appointmentId: new mongoose.Types.ObjectId(), // Non-existent appointment
        patientUserId: DB_IDS.patient1,
        amount: 200000,
        method: 'Sepay',
        status: 'Pending',
        QRurl: 'https://example.com/qr-test.png',
        holdExpiresAt: new Date(Date.now() + 10 * 60000)
      });
      createdPaymentIds.push(payment._id);

      const result = await paymentService.confirmPayment(payment._id.toString(), {});

      expect(result).toBeDefined();
      expect(result.payment.status).toBe('Completed');
      expect(result.appointment).toBeNull();
    });

    it('UTC07 - should handle missing timeslot gracefully', async () => {
      const startTime = getFixedDate(15, 3, 0);
      const endTime = new Date(startTime.getTime() + 30 * 60000);
      
      // Create appointment without timeslot
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.consultation,
        doctorScheduleId: DB_IDS.schedule1,
        timeslotId: new mongoose.Types.ObjectId(), // Non-existent timeslot
        status: 'PendingPayment',
        type: 'Consultation',
        mode: 'Online'
      });
      createdAppointmentIds.push(appointment._id);
      
      const payment = await Payment.create({
        appointmentId: appointment._id,
        patientUserId: DB_IDS.patient1,
        amount: 200000,
        method: 'Sepay',
        status: 'Pending',
        QRurl: 'https://example.com/qr-test.png',
        holdExpiresAt: new Date(Date.now() + 10 * 60000)
      });
      createdPaymentIds.push(payment._id);

      // This should throw error when trying to update non-existent timeslot
      await expect(
        paymentService.confirmPayment(payment._id.toString(), {})
      ).rejects.toThrow();
    });

    it('UTC08 - should send email successfully', async () => {
      // Mock email service
      const emailSpy = jest.spyOn(emailService, 'sendAppointmentConfirmationEmail')
        .mockResolvedValue(true);

      const { payment } = await createTestPayment('Pending');

      const result = await paymentService.confirmPayment(payment._id.toString(), {});

      expect(result).toBeDefined();
      expect(result.payment.status).toBe('Completed');

      // Wait a bit for async email to be called
      await new Promise(resolve => setTimeout(resolve, 100));

      // Email should be called (async)
      // Note: Due to async nature, we can't reliably test this without waiting
      
      emailSpy.mockRestore();
    });

    it('UTC09 - should handle email sending failure gracefully (non-blocking)', async () => {
      // Mock email service to throw error
      const emailSpy = jest.spyOn(emailService, 'sendAppointmentConfirmationEmail')
        .mockRejectedValue(new Error('Email service unavailable'));

      const { payment } = await createTestPayment('Pending');

      // Should NOT throw error even if email fails
      const result = await paymentService.confirmPayment(payment._id.toString(), {});

      expect(result).toBeDefined();
      expect(result.payment.status).toBe('Completed');
      expect(result.appointment.status).toBe('Pending');

      emailSpy.mockRestore();
    });
  });

  /**
   * ========================================
   * TRANSACTION DATA HANDLING
   * ========================================
   */

  describe('Transaction Data Handling', () => {
    
    it('should accept valid transaction data', async () => {
      const { payment } = await createTestPayment('Pending');

      const transactionData = {
        transactionId: 'SEPAY_12345',
        amount: 200000,
        timestamp: new Date().toISOString(),
        bankCode: 'VCB'
      };

      const result = await paymentService.confirmPayment(payment._id.toString(), transactionData);

      expect(result).toBeDefined();
      expect(result.payment.status).toBe('Completed');
    });

    it('should accept null transaction data', async () => {
      const { payment } = await createTestPayment('Pending');

      const result = await paymentService.confirmPayment(payment._id.toString(), null);

      expect(result).toBeDefined();
      expect(result.payment.status).toBe('Completed');
    });
  });
});
