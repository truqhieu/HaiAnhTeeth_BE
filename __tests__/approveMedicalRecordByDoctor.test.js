/**
 * Unit Tests for approveMedicalRecordByDoctor
 * Testing medical record approval and follow-up appointment creation
 * Total: 12 test cases covering approval, follow-up logic, and validation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const medicalRecordService = require('../services/medicalRecord.service');

// Import models
const Appointment = require('../models/appointment.model');
const MedicalRecord = require('../models/medicalRecord.model');
const Timeslot = require('../models/timeslot.model');

// Real Database IDs from MongoDB
const DB_IDS = {
  doctor1: '691fe0184b0b8b308033eeec',
  patient1: '691fe21b4b0b8b308033efab',
  nurse1: '691fe0184b0b8b308033eeec',
  examination: '68f99f4fa83a29b32e8abdb6',
};

describe('approveMedicalRecordByDoctor - Medical Record Approval', () => {
  const createdAppointmentIds = [];
  const createdMedicalRecordIds = [];
  const createdTimeslotIds = [];
  
  // Store test appointments
  let normalAppointment;
  let followUpRequiredAppointment;
  let completedAppointment;
  let noRecordAppointment;
  let alreadyFinalizedAppointment;
  
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
    
    await MedicalRecord.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    // Create test appointments and medical records
    
    // 1. Normal Appointment with Draft Medical Record (no follow-up)
    const normalTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T01:00:00.000Z'),
      endTime: new Date('2025-12-25T01:10:00.000Z'),
      status: 'Booked'
    });
    
    normalAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: normalTimeslot._id,
      status: 'InProgress',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1
    });
    
    const normalMedicalRecord = await MedicalRecord.create({
      appointmentId: normalAppointment._id,
      doctorUserId: DB_IDS.doctor1,
      patientUserId: DB_IDS.patient1,
      nurseId: DB_IDS.nurse1,
      patientAge: 25,
      address: 'Test Address',
      additionalServiceIds: [DB_IDS.examination],
      diagnosis: 'Test diagnosis',
      conclusion: 'Test conclusion',
      status: 'Draft',
      followUpRequired: false
    });
    
    createdAppointmentIds.push(normalAppointment._id);
    createdMedicalRecordIds.push(normalMedicalRecord._id);
    createdTimeslotIds.push(normalTimeslot._id);
    
    // 2. Appointment with Follow-up Required
    const followUpTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T02:00:00.000Z'),
      endTime: new Date('2025-12-25T02:10:00.000Z'),
      status: 'Booked'
    });
    
    followUpRequiredAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: followUpTimeslot._id,
      status: 'InProgress',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1
    });
    
    const followUpMedicalRecord = await MedicalRecord.create({
      appointmentId: followUpRequiredAppointment._id,
      doctorUserId: DB_IDS.doctor1,
      patientUserId: DB_IDS.patient1,
      nurseId: DB_IDS.nurse1,
      patientAge: 25,
      address: 'Test Address',
      additionalServiceIds: [DB_IDS.examination],
      diagnosis: 'Cần tái khám',
      conclusion: 'Theo dõi sau 1 tháng',
      status: 'Draft',
      followUpRequired: true,
      followUpDate: new Date('2026-01-25T03:00:00.000Z'), // 10:00 VN time (Morning shift)
      followUpNote: 'Tái khám sau 1 tháng'
    });
    
    createdAppointmentIds.push(followUpRequiredAppointment._id);
    createdMedicalRecordIds.push(followUpMedicalRecord._id);
    createdTimeslotIds.push(followUpTimeslot._id);
    
    // 3. Completed Appointment (cannot approve)
    const completedTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T03:00:00.000Z'),
      endTime: new Date('2025-12-25T03:10:00.000Z'),
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
      bookedByUserId: DB_IDS.patient1
    });
    
    const completedMedicalRecord = await MedicalRecord.create({
      appointmentId: completedAppointment._id,
      doctorUserId: DB_IDS.doctor1,
      patientUserId: DB_IDS.patient1,
      nurseId: DB_IDS.nurse1,
      patientAge: 25,
      address: 'Test Address',
      additionalServiceIds: [DB_IDS.examination],
      diagnosis: 'Completed diagnosis',
      conclusion: 'Completed conclusion',
      status: 'Finalized'
    });
    
    createdAppointmentIds.push(completedAppointment._id);
    createdMedicalRecordIds.push(completedMedicalRecord._id);
    createdTimeslotIds.push(completedTimeslot._id);
    
    // 4. Appointment without Medical Record
    const noRecordTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T04:00:00.000Z'),
      endTime: new Date('2025-12-25T04:10:00.000Z'),
      status: 'Booked'
    });
    
    noRecordAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: noRecordTimeslot._id,
      status: 'InProgress',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1
    });
    
    createdAppointmentIds.push(noRecordAppointment._id);
    createdTimeslotIds.push(noRecordTimeslot._id);
    
    // 5. Already Finalized Appointment (idempotent test)
    const finalizedTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2025-12-25T05:00:00.000Z'),
      endTime: new Date('2025-12-25T05:10:00.000Z'),
      status: 'Booked'
    });
    
    alreadyFinalizedAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: finalizedTimeslot._id,
      status: 'InProgress',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1
    });
    
    const finalizedMedicalRecord = await MedicalRecord.create({
      appointmentId: alreadyFinalizedAppointment._id,
      doctorUserId: DB_IDS.doctor1,
      patientUserId: DB_IDS.patient1,
      nurseId: DB_IDS.nurse1,
      patientAge: 25,
      address: 'Test Address',
      additionalServiceIds: [DB_IDS.examination],
      diagnosis: 'Already finalized',
      conclusion: 'Already finalized',
      status: 'Finalized'
    });
    
    createdAppointmentIds.push(alreadyFinalizedAppointment._id);
    createdMedicalRecordIds.push(finalizedMedicalRecord._id);
    createdTimeslotIds.push(finalizedTimeslot._id);
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
   * SUCCESS CASES (AMRD01-AMRD04)
   * ========================================
   */

  describe('AMRD01 - Approve Medical Record Without Follow-up', () => {
    it('should finalize medical record successfully', async () => {
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        normalAppointment._id.toString()
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('Finalized');
      expect(result.diagnosis).toBe('Test diagnosis');
      expect(result.conclusion).toBe('Test conclusion');
      expect(result.followUpRequired).toBe(false);
      expect(result.followUpAppointmentId).toBeNull();
    });
  });

  describe('AMRD02 - Approve Medical Record With Follow-up', () => {
    it('should finalize record and create follow-up appointment', async () => {
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        followUpRequiredAppointment._id.toString()
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('Finalized');
      expect(result.followUpRequired).toBe(true);
      expect(result.followUpAppointmentId).toBeDefined();
      expect(result.followUpAppointmentId).not.toBeNull();
      
      // Verify follow-up appointment created
      const followUpAppointment = await Appointment.findById(result.followUpAppointmentId);
      expect(followUpAppointment).toBeDefined();
      expect(followUpAppointment.type).toBe('FollowUp');
      expect(followUpAppointment.followUpOfAppointmentId.toString()).toBe(followUpRequiredAppointment._id.toString());
      
      // Clean up created follow-up
      if (followUpAppointment.timeslotId) {
        createdTimeslotIds.push(followUpAppointment.timeslotId);
      }
      createdAppointmentIds.push(followUpAppointment._id);
    });
  });

  describe('AMRD03 - Approve Already Finalized Record (Idempotent)', () => {
    it('should return existing finalized record without error', async () => {
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        alreadyFinalizedAppointment._id.toString()
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('Finalized');
      expect(result.diagnosis).toBe('Already finalized');
    });
  });

  describe('AMRD04 - Approve Record with Multiple Services', () => {
    it('should copy all services to follow-up appointment', async () => {
      // Create appointment with multiple services
      const multiServiceTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T06:00:00.000Z'),
        endTime: new Date('2025-12-25T06:10:00.000Z'),
        status: 'Booked'
      });
      
      const multiServiceAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: multiServiceTimeslot._id,
        status: 'InProgress',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      const multiServiceRecord = await MedicalRecord.create({
        appointmentId: multiServiceAppointment._id,
        doctorUserId: DB_IDS.doctor1,
        patientUserId: DB_IDS.patient1,
        nurseId: DB_IDS.nurse1,
        patientAge: 25,
        address: 'Test Address',
        additionalServiceIds: [DB_IDS.examination, DB_IDS.examination], // Multiple services
        diagnosis: 'Multiple services test',
        conclusion: 'Follow-up needed',
        status: 'Draft',
        followUpRequired: true,
        followUpDate: new Date('2026-02-01T10:00:00.000Z'),
        followUpNote: 'Check all treatments'
      });
      
      createdAppointmentIds.push(multiServiceAppointment._id);
      createdMedicalRecordIds.push(multiServiceRecord._id);
      createdTimeslotIds.push(multiServiceTimeslot._id);
      
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        multiServiceAppointment._id.toString()
      );

      expect(result.status).toBe('Finalized');
      expect(result.followUpAppointmentId).toBeDefined();
      
      // Verify follow-up has multiple services
      const followUpAppointment = await Appointment.findById(result.followUpAppointmentId);
      expect(followUpAppointment.additionalServiceIds).toBeDefined();
      expect(followUpAppointment.additionalServiceIds.length).toBeGreaterThan(0);
      
      // Clean up
      if (followUpAppointment.timeslotId) {
        createdTimeslotIds.push(followUpAppointment.timeslotId);
      }
      createdAppointmentIds.push(followUpAppointment._id);
    });
  });

  /**
   * ========================================
   * VALIDATION ERROR CASES (AMRD05-AMRD09)
   * ========================================
   */

  describe('AMRD05 - Missing Appointment ID', () => {
    it('should throw error when appointmentId is missing', async () => {
      await expect(
        medicalRecordService.approveMedicalRecordByDoctor(null)
      ).rejects.toThrow(/thiếu appointmentId/i);
    });
  });

  describe('AMRD06 - Appointment Not Found', () => {
    it('should throw error when appointment does not exist', async () => {
      await expect(
        medicalRecordService.approveMedicalRecordByDoctor('000000000000000000000000')
      ).rejects.toThrow(/không tìm thấy lịch hẹn/i);
    });
  });

  describe('AMRD07 - Appointment Already Completed', () => {
    it('should throw error when appointment status is Completed', async () => {
      await expect(
        medicalRecordService.approveMedicalRecordByDoctor(completedAppointment._id.toString())
      ).rejects.toThrow(/ca khám đã hoàn thành/i);
    });
  });

  describe('AMRD08 - Medical Record Not Found', () => {
    it('should throw error when medical record does not exist', async () => {
      await expect(
        medicalRecordService.approveMedicalRecordByDoctor(noRecordAppointment._id.toString())
      ).rejects.toThrow(/không tìm thấy hồ sơ khám bệnh/i);
    });
  });

  describe('AMRD09 - Invalid Follow-up Date', () => {
    it('should throw error when follow-up date is in the past', async () => {
      // Create appointment with past follow-up date
      const pastDateTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T07:00:00.000Z'),
        endTime: new Date('2025-12-25T07:10:00.000Z'),
        status: 'Booked'
      });
      
      const pastDateAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: pastDateTimeslot._id,
        status: 'InProgress',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      const pastDateRecord = await MedicalRecord.create({
        appointmentId: pastDateAppointment._id,
        doctorUserId: DB_IDS.doctor1,
        patientUserId: DB_IDS.patient1,
        nurseId: DB_IDS.nurse1,
        patientAge: 25,
        address: 'Test Address',
        additionalServiceIds: [DB_IDS.examination],
        diagnosis: 'Test',
        conclusion: 'Test',
        status: 'Draft',
        followUpRequired: true,
        followUpDate: new Date('2020-01-01T10:00:00.000Z'), // Past date
        followUpNote: 'Test'
      });
      
      createdAppointmentIds.push(pastDateAppointment._id);
      createdMedicalRecordIds.push(pastDateRecord._id);
      createdTimeslotIds.push(pastDateTimeslot._id);
      
      await expect(
        medicalRecordService.approveMedicalRecordByDoctor(pastDateAppointment._id.toString())
      ).rejects.toThrow(/ngày tái khám phải ở trong tương lai/i);
    });
  });

  /**
   * ========================================
   * EDGE CASES (AMRD10-AMRD12)
   * ========================================
   */

  describe('AMRD10 - Follow-up Required But No Date', () => {
    it('should finalize without creating follow-up when date is missing', async () => {
      // Create appointment with followUpRequired but no date
      const noDateTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T08:00:00.000Z'),
        endTime: new Date('2025-12-25T08:10:00.000Z'),
        status: 'Booked'
      });
      
      const noDateAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: noDateTimeslot._id,
        status: 'InProgress',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      const noDateRecord = await MedicalRecord.create({
        appointmentId: noDateAppointment._id,
        doctorUserId: DB_IDS.doctor1,
        patientUserId: DB_IDS.patient1,
        nurseId: DB_IDS.nurse1,
        patientAge: 25,
        address: 'Test Address',
        additionalServiceIds: [DB_IDS.examination],
        diagnosis: 'Test',
        conclusion: 'Test',
        status: 'Draft',
        followUpRequired: true,
        followUpDate: null // No date
      });
      
      createdAppointmentIds.push(noDateAppointment._id);
      createdMedicalRecordIds.push(noDateRecord._id);
      createdTimeslotIds.push(noDateTimeslot._id);
      
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        noDateAppointment._id.toString()
      );

      expect(result.status).toBe('Finalized');
      expect(result.followUpRequired).toBe(true);
      expect(result.followUpAppointmentId).toBeNull(); // No follow-up created
    });
  });

  describe('AMRD11 - Follow-up Already Exists', () => {
    it('should not create duplicate follow-up appointment', async () => {
      // Create appointment with existing follow-up
      const existingFollowUpTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T09:00:00.000Z'),
        endTime: new Date('2025-12-25T09:10:00.000Z'),
        status: 'Booked'
      });
      
      const existingFollowUpAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: existingFollowUpTimeslot._id,
        status: 'InProgress',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      // Create existing follow-up
      const existingFollowUp = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        status: 'Pending',
        mode: 'Offline',
        type: 'FollowUp',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1,
        followUpOfAppointmentId: existingFollowUpAppointment._id
      });
      
      const existingFollowUpRecord = await MedicalRecord.create({
        appointmentId: existingFollowUpAppointment._id,
        doctorUserId: DB_IDS.doctor1,
        patientUserId: DB_IDS.patient1,
        nurseId: DB_IDS.nurse1,
        patientAge: 25,
        address: 'Test Address',
        additionalServiceIds: [DB_IDS.examination],
        diagnosis: 'Test',
        conclusion: 'Test',
        status: 'Draft',
        followUpRequired: true,
        followUpDate: new Date('2026-03-01T10:00:00.000Z'),
        followUpAppointmentId: existingFollowUp._id // Already has follow-up
      });
      
      createdAppointmentIds.push(existingFollowUpAppointment._id, existingFollowUp._id);
      createdMedicalRecordIds.push(existingFollowUpRecord._id);
      createdTimeslotIds.push(existingFollowUpTimeslot._id);
      
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        existingFollowUpAppointment._id.toString()
      );

      expect(result.status).toBe('Finalized');
      expect(result.followUpAppointmentId._id.toString()).toBe(existingFollowUp._id.toString());
      
      // Verify no duplicate created
      const followUpCount = await Appointment.countDocuments({
        followUpOfAppointmentId: existingFollowUpAppointment._id
      });
      expect(followUpCount).toBe(1); // Only one follow-up
    });
  });

  describe('AMRD12 - Verify Record Populated After Approval', () => {
    it('should return fully populated medical record', async () => {
      // Create new appointment for this test
      const populatedTimeslot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime: new Date('2025-12-25T10:00:00.000Z'),
        endTime: new Date('2025-12-25T10:10:00.000Z'),
        status: 'Booked'
      });
      
      const populatedAppointment = await Appointment.create({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        timeslotId: populatedTimeslot._id,
        status: 'InProgress',
        mode: 'Offline',
        type: 'Examination',
        appointmentFor: 'self',
        bookedByUserId: DB_IDS.patient1
      });
      
      const populatedRecord = await MedicalRecord.create({
        appointmentId: populatedAppointment._id,
        doctorUserId: DB_IDS.doctor1,
        patientUserId: DB_IDS.patient1,
        nurseId: DB_IDS.nurse1,
        patientAge: 25,
        address: 'Test Address',
        additionalServiceIds: [DB_IDS.examination],
        diagnosis: 'Populated test',
        conclusion: 'Populated test',
        status: 'Draft'
      });
      
      createdAppointmentIds.push(populatedAppointment._id);
      createdMedicalRecordIds.push(populatedRecord._id);
      createdTimeslotIds.push(populatedTimeslot._id);
      
      const result = await medicalRecordService.approveMedicalRecordByDoctor(
        populatedAppointment._id.toString()
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('Finalized');
      expect(result.additionalServiceIds).toBeDefined();
      expect(Array.isArray(result.additionalServiceIds)).toBe(true);
      expect(result.additionalServiceIds.length).toBeGreaterThan(0);
      
      // Verify service is populated
      const firstService = result.additionalServiceIds[0];
      expect(firstService.serviceName).toBeDefined();
      expect(firstService.price).toBeDefined();
    });
  });
});
