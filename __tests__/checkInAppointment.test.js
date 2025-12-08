/**
 * Unit Tests for checkInAppointment
 * Testing appointment check-in workflow
 * Total: 8 test cases
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');

// Import models
const Appointment = require('../models/appointment.model');
const Timeslot = require('../models/timeslot.model');

// Real Database IDs from MongoDB
const DB_IDS = {
  doctor1: '691fe0184b0b8b308033eeec',
  patient1: '691fe21b4b0b8b308033efab',
  nurse1: '691fe0184b0b8b308033eeec',
  examination: '68f99f4fa83a29b32e8abdb6',
};

describe('checkInAppointment - Appointment Check-In', () => {
  const createdAppointmentIds = [];
  const createdTimeslotIds = [];
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up test data
    const testDateStart = new Date('2025-12-06T00:00:00.000Z');
    const testDateEnd = new Date('2025-12-10T00:00:00.000Z');
    
    await Appointment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd }
    });
  });

  afterAll(async () => {
    // Clean up all test data
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
   * SUCCESS CASES (CI01-CI02)
   * ========================================
   */

  describe('CI01 - Check-in Approved Appointment', () => {
    it('should check-in approved appointment successfully', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-06T01:00:00.000Z'),
        endTime: new Date('2025-12-06T01:10:00.000Z'),
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
      
      const result = await appointmentService.updateAppointmentStatus(
        appointment._id.toString(),
        'CheckedIn',
        DB_IDS.nurse1
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.newStatus).toBe('CheckedIn');
      
      // Verify appointment was updated
      const updatedAppointment = await Appointment.findById(appointment._id);
      expect(updatedAppointment.status).toBe('CheckedIn');
      expect(updatedAppointment.checkedInAt).toBeDefined();
      expect(updatedAppointment.checkInByUserId.toString()).toBe(DB_IDS.nurse1);
    });
  });

  describe('CI02 - Check-in No-Show Appointment', () => {
    it('should allow check-in from No-Show status', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-06T02:00:00.000Z'),
        endTime: new Date('2025-12-06T02:10:00.000Z'),
        status: 'Booked'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'No-Show',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      createdAppointmentIds.push(appointment._id);
      createdTimeslotIds.push(timeslot._id);
      
      const result = await appointmentService.updateAppointmentStatus(
        appointment._id.toString(),
        'CheckedIn',
        DB_IDS.nurse1
      );

      expect(result.success).toBe(true);
      expect(result.data.newStatus).toBe('CheckedIn');
      
      // Verify appointment was updated
      const updatedAppointment = await Appointment.findById(appointment._id);
      expect(updatedAppointment.status).toBe('CheckedIn');
      expect(updatedAppointment.checkedInAt).toBeDefined();
    });
  });

  /**
   * ========================================
   * VALIDATION ERROR CASES (CI03-CI06)
   * ========================================
   */

  describe('CI03 - Check-in Pending Appointment', () => {
    it('should throw error when checking in pending appointment', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-06T03:00:00.000Z'),
        endTime: new Date('2025-12-06T03:10:00.000Z'),
        status: 'Reserved'
      });
      
      const appointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: timeslot._id,
        status: 'Pending',
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
          'CheckedIn',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không thể check-in/i);
    });
  });

  describe('CI04 - Check-in Already CheckedIn', () => {
    it('should throw error when appointment already checked in', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-06T04:00:00.000Z'),
        endTime: new Date('2025-12-06T04:10:00.000Z'),
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
      
      await expect(
        appointmentService.updateAppointmentStatus(
          appointment._id.toString(),
          'CheckedIn',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không thể check-in/i);
    });
  });

  describe('CI05 - Missing Appointment ID', () => {
    it('should throw error when appointmentId is missing', async () => {
      await expect(
        appointmentService.updateAppointmentStatus(
          null,
          'CheckedIn',
          DB_IDS.nurse1
        )
      ).rejects.toThrow();
    });
  });

  describe('CI06 - Appointment Not Found', () => {
    it('should throw error when appointment does not exist', async () => {
      await expect(
        appointmentService.updateAppointmentStatus(
          '000000000000000000000000',
          'CheckedIn',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không tìm thấy lịch hẹn/i);
    });
  });

  /**
   * ========================================
   * EDGE CASES (CI07-CI08)
   * ========================================
   */

  describe('CI07 - Check-in Future Appointment', () => {
    it('should throw error when checking in future appointment', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2026-12-06T05:00:00.000Z'), // Future date
        endTime: new Date('2026-12-06T05:10:00.000Z'),
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
          'CheckedIn',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không thể check-in sớm/i);
    });
  });

  describe('CI08 - Check-in Completed Appointment', () => {
    it('should throw error when checking in completed appointment', async () => {
      const timeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-06T06:00:00.000Z'),
        endTime: new Date('2025-12-06T06:10:00.000Z'),
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
          'CheckedIn',
          DB_IDS.nurse1
        )
      ).rejects.toThrow(/không thể check-in/i);
    });
  });
});
