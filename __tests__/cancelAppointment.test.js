/**
 * Unit Tests for cancelAppointment
 * Testing appointment cancellation with refund logic
 * Total: 12 test cases covering success, validation, and edge cases
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');

// Import models
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const Payment = require('../models/payment.model');

// Real Database IDs from MongoDB
const DB_IDS = {
  patient1: '691fe21b4b0b8b308033efab',
  patient2: '691fe77f8604b35e222a6a12',
  doctor1: '691fe0184b0b8b308033eeec',
  nurse1: '691fe0184b0b8b308033eeec',
  examination: '68f99f4fa83a29b32e8abdb6',
};

describe('cancelAppointment - Appointment Cancellation', () => {
  const createdAppointmentIds = [];
  const createdTimeslotIds = [];
  const createdPaymentIds = [];
  
  // Store test appointments
  let pendingAppointment;
  let approvedAppointment;
  let pendingPaymentAppointment;
  let completedAppointment;
  let checkedInAppointment;
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up test data
    const testDateStart = new Date('2025-12-25T00:00:00.000Z');
    const testDateEnd = new Date('2025-12-30T00:00:00.000Z');
    
    await Appointment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Payment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    // Create test appointments
    
    // 1. Pending Appointment
    const pendingTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T01:00:00.000Z'),
      endTime: new Date('2025-12-25T01:10:00.000Z'),
      status: 'Reserved'
    });
    
    pendingAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: pendingTimeslot._id,
      status: 'Pending',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      notes: 'Pending test appointment'
    });
    
    pendingTimeslot.appointmentId = pendingAppointment._id;
    await pendingTimeslot.save();
    
    createdAppointmentIds.push(pendingAppointment._id);
    createdTimeslotIds.push(pendingTimeslot._id);
    
    // 2. Approved Appointment
    const approvedTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T02:00:00.000Z'),
      endTime: new Date('2025-12-25T02:10:00.000Z'),
      status: 'Booked'
    });
    
    approvedAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: approvedTimeslot._id,
      status: 'Approved',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      notes: 'Approved test appointment'
    });
    
    approvedTimeslot.appointmentId = approvedAppointment._id;
    await approvedTimeslot.save();
    
    createdAppointmentIds.push(approvedAppointment._id);
    createdTimeslotIds.push(approvedTimeslot._id);
    
    // 3. PendingPayment Appointment with Payment
    const pendingPaymentTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T03:00:00.000Z'),
      endTime: new Date('2025-12-25T03:10:00.000Z'),
      status: 'Reserved'
    });
    
    const payment = await Payment.create({
      userId: DB_IDS.patient1,
      amount: 100000,
      method: 'Sepay', // Fixed: Only valid enum value
      status: 'Pending',
      description: 'Test payment for appointment'
    });
    
    pendingPaymentAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: pendingPaymentTimeslot._id,
      paymentId: payment._id,
      status: 'PendingPayment',
      mode: 'Online',
      type: 'Consultation',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      notes: 'PendingPayment test appointment'
    });
    
    pendingPaymentTimeslot.appointmentId = pendingPaymentAppointment._id;
    await pendingPaymentTimeslot.save();
    
    createdAppointmentIds.push(pendingPaymentAppointment._id);
    createdTimeslotIds.push(pendingPaymentTimeslot._id);
    createdPaymentIds.push(payment._id);
    
    // 4. Completed Appointment (cannot cancel)
    const completedTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T04:00:00.000Z'),
      endTime: new Date('2025-12-25T04:10:00.000Z'),
      status: 'Booked'
    });
    
    completedAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: completedTimeslot._id,
      status: 'Completed',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      notes: 'Completed test appointment'
    });
    
    completedTimeslot.appointmentId = completedAppointment._id;
    await completedTimeslot.save();
    
    createdAppointmentIds.push(completedAppointment._id);
    createdTimeslotIds.push(completedTimeslot._id);
    
    // 5. CheckedIn Appointment (cannot cancel)
    const checkedInTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T05:00:00.000Z'),
      endTime: new Date('2025-12-25T05:10:00.000Z'),
      status: 'Booked'
    });
    
    checkedInAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: checkedInTimeslot._id,
      status: 'CheckedIn',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      checkInByUserId: DB_IDS.nurse1,
      notes: 'CheckedIn test appointment'
    });
    
    checkedInTimeslot.appointmentId = checkedInAppointment._id;
    await checkedInTimeslot.save();
    
    createdAppointmentIds.push(checkedInAppointment._id);
    createdTimeslotIds.push(checkedInTimeslot._id);
  });

  afterAll(async () => {
    // Clean up all test data
    if (createdPaymentIds.length > 0) {
      await Payment.deleteMany({ _id: { $in: createdPaymentIds } });
    }
    
    if (createdAppointmentIds.length > 0) {
      await Appointment.deleteMany({ _id: { $in: createdAppointmentIds } });
    }
    
    if (createdTimeslotIds.length > 0) {
      await Timeslot.deleteMany({ _id: { $in: createdTimeslotIds } });
    }
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  });

  /**
   * ========================================
   * SUCCESS CASES (CA01-CA04)
   * ========================================
   */

  describe('CA01 - Cancel Pending Appointment', () => {
    it('should cancel pending appointment successfully', async () => {
      const result = await appointmentService.cancelAppointment({
        appointmentId: pendingAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Bận việc đột xuất'
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Hủy lịch hẹn thành công');
      expect(result.data.status).toBe('Cancelled');
      expect(result.data.cancelReason).toBe('Bận việc đột xuất');
      
      // Verify timeslot released
      const timeslot = await Timeslot.findById(pendingAppointment.timeslotId);
      expect(timeslot.status).toBe('Available');
      expect(timeslot.appointmentId).toBeNull();
    });
  });

  describe('CA02 - Cancel Approved Appointment', () => {
    it('should cancel approved appointment successfully', async () => {
      const result = await appointmentService.cancelAppointment({
        appointmentId: approvedAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Không thể đến được'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Cancelled');
      
      // Verify timeslot released
      const timeslot = await Timeslot.findById(approvedAppointment.timeslotId);
      expect(timeslot.status).toBe('Available');
    });
  });

  describe('CA03 - Cancel PendingPayment Appointment', () => {
    it('should cancel appointment and update payment status', async () => {
      const result = await appointmentService.cancelAppointment({
        appointmentId: pendingPaymentAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Không muốn thanh toán online'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Cancelled');
      
      // Verify payment cancelled
      const payment = await Payment.findById(pendingPaymentAppointment.paymentId);
      expect(payment.status).toBe('Cancelled');
      
      // Verify timeslot released
      const timeslot = await Timeslot.findById(pendingPaymentAppointment.timeslotId);
      expect(timeslot.status).toBe('Available');
    });
  });

  describe('CA04 - Cancel with Bank Info (Refund)', () => {
    it('should save bank info for refund processing', async () => {
      // Create a new approved appointment for this test
      const refundTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T06:00:00.000Z'),
        endTime: new Date('2025-12-25T06:10:00.000Z'),
        status: 'Booked'
      });
      
      const refundAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: refundTimeslot._id,
        status: 'Approved',
        mode: 'Online',
        type: 'Consultation',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(refundAppointment._id);
      createdTimeslotIds.push(refundTimeslot._id);
      
      const result = await appointmentService.cancelAppointment({
        appointmentId: refundAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Yêu cầu hoàn tiền',
        bankInfo: {
          accountHolderName: 'Nguyen Van A',
          accountNumber: '1234567890',
          bankName: 'Vietcombank'
        }
      });

      expect(result.success).toBe(true);
      
      // Verify bank info saved
      const updatedAppointment = await Appointment.findById(refundAppointment._id);
      expect(updatedAppointment.bankInfo).toBeDefined();
      expect(updatedAppointment.bankInfo.accountHolderName).toBe('Nguyen Van A');
      expect(updatedAppointment.bankInfo.accountNumber).toBe('1234567890');
      expect(updatedAppointment.bankInfo.bankName).toBe('Vietcombank');
    });
  });

  /**
   * ========================================
   * VALIDATION ERROR CASES (CA05-CA09)
   * ========================================
   */

  describe('CA05 - Missing Appointment ID', () => {
    it('should throw error when appointmentId is missing', async () => {
      await expect(
        appointmentService.cancelAppointment({
          appointmentId: null,
          userId: DB_IDS.patient1,
          cancelReason: 'Test'
        })
      ).rejects.toThrow(/không tìm thấy lịch hẹn/i);
    });
  });

  describe('CA06 - Appointment Not Found', () => {
    it('should throw error when appointment does not exist', async () => {
      await expect(
        appointmentService.cancelAppointment({
          appointmentId: '000000000000000000000000',
          userId: DB_IDS.patient1,
          cancelReason: 'Test'
        })
      ).rejects.toThrow(/không tìm thấy lịch hẹn/i);
    });
  });

  describe('CA07 - Cannot Cancel Completed Appointment', () => {
    it('should throw error when trying to cancel completed appointment', async () => {
      await expect(
        appointmentService.cancelAppointment({
          appointmentId: completedAppointment._id.toString(),
          userId: DB_IDS.patient1,
          cancelReason: 'Test'
        })
      ).rejects.toThrow(/không thể hủy được/i);
    });
  });

  describe('CA08 - Cannot Cancel CheckedIn Appointment', () => {
    it('should throw error when trying to cancel checked-in appointment', async () => {
      await expect(
        appointmentService.cancelAppointment({
          appointmentId: checkedInAppointment._id.toString(),
          userId: DB_IDS.patient1,
          cancelReason: 'Test'
        })
      ).rejects.toThrow(/không thể hủy được/i);
    });
  });

  describe('CA09 - Cancel Without Reason (Uses Default)', () => {
    it('should use default cancel reason when not provided', async () => {
      // Create a new appointment for this test
      const noReasonTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T07:00:00.000Z'),
        endTime: new Date('2025-12-25T07:10:00.000Z'),
        status: 'Booked'
      });
      
      const noReasonAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: noReasonTimeslot._id,
        status: 'Approved',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(noReasonAppointment._id);
      createdTimeslotIds.push(noReasonTimeslot._id);
      
      const result = await appointmentService.cancelAppointment({
        appointmentId: noReasonAppointment._id.toString(),
        userId: DB_IDS.patient1
        // No cancelReason provided
      });

      expect(result.success).toBe(true);
      expect(result.data.cancelReason).toBe('Người dùng hủy lịch hẹn');
    });
  });

  /**
   * ========================================
   * EDGE CASES (CA10-CA12)
   * ========================================
   */

  describe('CA10 - Cancel Appointment Without Timeslot', () => {
    it('should cancel appointment even if timeslot is missing', async () => {
      // Create appointment without timeslot
      const noTimeslotAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        status: 'Pending',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(noTimeslotAppointment._id);
      
      const result = await appointmentService.cancelAppointment({
        appointmentId: noTimeslotAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Test no timeslot'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Cancelled');
    });
  });

  describe('CA11 - Cancel Appointment Without Payment', () => {
    it('should cancel appointment successfully even without payment', async () => {
      // Create appointment without payment
      const noPaymentTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T08:00:00.000Z'),
        endTime: new Date('2025-12-25T08:10:00.000Z'),
        status: 'Booked'
      });
      
      const noPaymentAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: noPaymentTimeslot._id,
        status: 'Approved',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(noPaymentAppointment._id);
      createdTimeslotIds.push(noPaymentTimeslot._id);
      
      const result = await appointmentService.cancelAppointment({
        appointmentId: noPaymentAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Test no payment'
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Cancelled');
    });
  });

  describe('CA12 - Verify Timestamps After Cancellation', () => {
    it('should set cancelledAt and updatedAt timestamps', async () => {
      // Create a new appointment for this test
      const timestampTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T09:00:00.000Z'),
        endTime: new Date('2025-12-25T09:10:00.000Z'),
        status: 'Booked'
      });
      
      const timestampAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timestampTimeslot._id,
        status: 'Approved',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(timestampAppointment._id);
      createdTimeslotIds.push(timestampTimeslot._id);
      
      const beforeCancel = new Date();
      
      const result = await appointmentService.cancelAppointment({
        appointmentId: timestampAppointment._id.toString(),
        userId: DB_IDS.patient1,
        cancelReason: 'Test timestamps'
      });

      expect(result.success).toBe(true);
      expect(result.data.cancelledAt).toBeDefined();
      
      const cancelledAt = new Date(result.data.cancelledAt);
      expect(cancelledAt.getTime()).toBeGreaterThanOrEqual(beforeCancel.getTime());
      expect(cancelledAt.getTime()).toBeLessThanOrEqual(new Date().getTime());
    });
  });
});
