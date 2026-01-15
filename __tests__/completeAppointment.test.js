/**
 * Unit Tests for completeAppointment
 * Testing appointment completion workflow
 * Total: 8 test cases
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');

// Import models
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');
const MedicalRecord = require('../models/medicalRecord.model');

// Real Database IDs from MongoDB
const DB_IDS = {
  doctor1: '691fe0184b0b8b308033eeec',
  patient1: '691fe21b4b0b8b308033efab',
  nurse1: '691fe0184b0b8b308033eeec',
  examination: '68f99f4fa83a29b32e8abdb6',
};

describe('completeAppointment - Appointment Completion', () => {
  const createdAppointmentIds = [];
  const createdTimeslotIds = [];
  const createdMedicalRecordIds = [];
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up test data
    const testDateStart = new Date('2026-12-06T00:00:00.000Z');
    const testDateEnd = new Date('2026-12-10T00:00:00.000Z');
    
    await Appointment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await MedicalRecord.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
  });

  afterAll(async () => {
    // Clean up all test data
    if (createdMedicalRecordIds.length > 0) {
      await MedicalRecord.deleteMany({ _id: { $in: createdMedicalRecordIds } });
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
   * SUCCESS CASES (CO01-CO02)
   * ========================================
   */

  describe('CO01 - Complete InProgress Appointment', () => {
    it('should complete in-progress appointment successfully', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T01:00:00.000Z'),
        endTime: new Date('2026-12-06T01:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'InProgress',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1,
        checkedInAt: new Date(),
        checkInByUserId: DB_IDS.nurse1
      });
      
      // Create finalized medical record
      const medicalRecord = await MedicalRecord.create({
        appointmentId: appointment._id,
        doctorUserId: DB_IDS.doctor1,
        patientUserId: DB_IDS.patient1,
        nurseId: DB_IDS.nurse1,
        patientAge: 25,
        address: 'Test Address',
        additionalServiceIds: [DB_IDS.examination],
        diagnosis: 'Test diagnosis',
        conclusion: 'Test conclusion',
        status: 'Finalized'
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      createdMedicalRecordIds.push(medicalRecord._id);
      
      const result = await appointmentService.updateAppointmentStatus(
        appointment._id.toString(),
        'Completed',
        DB_IDS.doctor1
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.newStatus).toBe('Completed');
      
      // Verify appointment was updated
      const updatedAppointment = await Appointment.findById(appointment._id);
      expect(updatedAppointment.status).toBe('Completed');
    });
  });

  describe('CO02 - Start InProgress from CheckedIn', () => {
    it('should transition from CheckedIn to InProgress', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T02:00:00.000Z'),
        endTime: new Date('2026-12-06T02:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'CheckedIn',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1,
        checkedInAt: new Date(),
        checkInByUserId: DB_IDS.nurse1
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      
      const result = await appointmentService.updateAppointmentStatus(
        appointment._id.toString(),
        'InProgress',
        DB_IDS.nurse1
      );

      expect(result.success).toBe(true);
      expect(result.data.newStatus).toBe('InProgress');
      
      // Verify appointment was updated
      const updatedAppointment = await Appointment.findById(appointment._id);
      expect(updatedAppointment.status).toBe('InProgress');
    });
  });

  /**
   * ========================================
   * VALIDATION ERROR CASES (CO03-CO06)
   * ========================================
   */

  describe('CO03 - Complete CheckedIn Appointment (Skip InProgress)', () => {
    it('should allow completing directly from CheckedIn status', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T03:00:00.000Z'),
        endTime: new Date('2026-12-06T03:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'CheckedIn',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1,
        checkedInAt: new Date(),
        checkInByUserId: DB_IDS.nurse1
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      
      const result = await appointmentService.updateAppointmentStatus(
        appointment._id.toString(),
        'Completed',
        DB_IDS.doctor1
      );

      expect(result.success).toBe(true);
      expect(result.data.newStatus).toBe('Completed');
      
      // Verify appointment was updated
      const updatedAppointment = await Appointment.findById(appointment._id);
      expect(updatedAppointment.status).toBe('Completed');
    });
  });

  describe('CO04 - Start InProgress from Approved', () => {
    it('should throw error when starting from Approved', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T04:00:00.000Z'),
        endTime: new Date('2026-12-06T04:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'Approved',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      
      await expect(
        appointmentService.updateAppointmentStatus(
          appointment._id.toString(),
          'InProgress',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không thể chuyển sang đang trong ca/i);
    });
  });

  describe('CO05 - Missing Appointment ID', () => {
    it('should throw error when appointmentId is missing', async () => {
      await expect(
        appointmentService.updateAppointmentStatus(
          null,
          'Completed',
          DB_IDS.doctor1
        )
      ).rejects.toThrow();
    });
  });

  describe('CO06 - Appointment Not Found', () => {
    it('should throw error when appointment does not exist', async () => {
      await expect(
        appointmentService.updateAppointmentStatus(
          '000000000000000000000000',
          'Completed',
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/không tìm thấy lịch hẹn/i);
    });
  });

  /**
   * ========================================
   * EDGE CASES (CO07-CO08)
   * ========================================
   */

  describe('CO07 - Start InProgress Future Appointment', () => {
    it('should throw error when starting future appointment', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T05:00:00.000Z'), // Future
        endTime: new Date('2026-12-06T05:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'CheckedIn',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      
      await expect(
        appointmentService.updateAppointmentStatus(
          appointment._id.toString(),
          'InProgress',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không thể bắt đầu ca khám sớm/i);
    });
  });

  describe('CO08 - Complete Already Completed', () => {
    it('should throw error when appointment already completed', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T06:00:00.000Z'),
        endTime: new Date('2026-12-06T06:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'Completed',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      
      await expect(
        appointmentService.updateAppointmentStatus(
          appointment._id.toString(),
          'Completed',
          DB_IDS.doctor1
        )
      ).rejects.toThrow();
    });
  });
});
