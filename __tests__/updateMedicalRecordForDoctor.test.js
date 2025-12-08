/**
 * Unit Tests for updateMedicalRecordForDoctor
 * Testing medical record updates by doctor
 * Total: 12 test cases covering validation, updates, prescriptions, and follow-up logic
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
  doctor1: '691fe0184b0b8b308033eeec', // bác sĩ Hiếu
  doctor2: '691fe77f8604b35e222a6a12', // Different doctor for permission test
  patient1: '691fe21b4b0b8b308033efab',
  nurse1: '691fe0184b0b8b308033eeec',
  examination: '68f99f4fa83a29b32e8abdb6', // Làm sạch răng
};

describe('updateMedicalRecordForDoctor - Medical Record Updates', () => {
  const createdAppointmentIds = [];
  const createdMedicalRecordIds = [];
  const createdTimeslotIds = [];
  
  // Store test appointments
  let normalAppointment;
  let completedAppointment;
  let differentDoctorAppointment;
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up test data
    const testDateStart = new Date('2026-12-25T00:00:00.000Z');
    const testDateEnd = new Date('2026-12-30T00:00:00.000Z');
    
    await Appointment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await MedicalRecord.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    // Create test appointments
    
    // 1. Normal Appointment with Draft Medical Record
    const normalTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2026-12-25T01:00:00.000Z'),
      endTime: new Date('2026-12-25T01:10:00.000Z'),
      status: 'Booked'
    });
    
    normalAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor1,
      serviceId: DB_IDS.examination,
      timeslotId: normalTimeslot._id,
      status: 'Approved',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      notes: 'Normal test appointment'
    });
    
    const normalMedicalRecord = await MedicalRecord.create({
      appointmentId: normalAppointment._id,
      doctorUserId: DB_IDS.doctor1,
      patientUserId: DB_IDS.patient1,
      nurseId: DB_IDS.nurse1,
      patientAge: 25,
      address: 'Test Address',
      additionalServiceIds: [DB_IDS.examination],
      status: 'Draft'
    });
    
    createdAppointmentIds.push(normalAppointment._id);
    createdMedicalRecordIds.push(normalMedicalRecord._id);
    createdTimeslotIds.push(normalTimeslot._id);
    
    // 2. Completed Appointment
    const completedTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor1,
      startTime: new Date('2026-12-25T02:00:00.000Z'),
      endTime: new Date('2026-12-25T02:10:00.000Z'),
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
    
    // 3. Different Doctor Appointment
    const differentDoctorTimeslot = await Timeslot.create({
      doctorUserId: DB_IDS.doctor2,
      startTime: new Date('2026-12-25T03:00:00.000Z'),
      endTime: new Date('2026-12-25T03:10:00.000Z'),
      status: 'Booked'
    });
    
    differentDoctorAppointment = await Appointment.create({
      patientUserId: DB_IDS.patient1,
      doctorUserId: DB_IDS.doctor2,
      serviceId: DB_IDS.examination,
      timeslotId: differentDoctorTimeslot._id,
      status: 'Approved',
      mode: 'Offline',
      type: 'Examination',
      appointmentFor: 'self',
      bookedByUserId: DB_IDS.patient1,
      notes: 'Different doctor appointment'
    });
    
    const differentDoctorMedicalRecord = await MedicalRecord.create({
      appointmentId: differentDoctorAppointment._id,
      doctorUserId: DB_IDS.doctor2,
      patientUserId: DB_IDS.patient1,
      nurseId: DB_IDS.nurse1,
      patientAge: 25,
      address: 'Test Address',
      additionalServiceIds: [DB_IDS.examination],
      status: 'Draft'
    });
    
    createdAppointmentIds.push(differentDoctorAppointment._id);
    createdMedicalRecordIds.push(differentDoctorMedicalRecord._id);
    createdTimeslotIds.push(differentDoctorTimeslot._id);
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
   * SUCCESS CASES (UMRD01-UMRD03)
   * ========================================
   */

  describe('UMRD01 - Update Diagnosis and Conclusion', () => {
    it('should update diagnosis and conclusion successfully', async () => {
      const result = await medicalRecordService.updateMedicalRecordForDoctor(
        normalAppointment._id.toString(),
        {
          diagnosis: 'Sâu răng hàm dưới',
          conclusion: 'Cần điều trị và tái khám sau 2 tuần'
        },
        DB_IDS.doctor1
      );

      expect(result).toBeDefined();
      expect(result.diagnosis).toBe('Sâu răng hàm dưới');
      expect(result.conclusion).toBe('Cần điều trị và tái khám sau 2 tuần');
      expect(result.status).toBe('Draft');
    });
  });

  describe('UMRD02 - Update with Prescription (Object Format)', () => {
    it('should save single prescription as array (backward compatibility)', async () => {
      const result = await medicalRecordService.updateMedicalRecordForDoctor(
        normalAppointment._id.toString(),
        {
          diagnosis: 'Viêm nướu',
          conclusion: 'Uống thuốc theo đơn',
          prescription: {
            medicine: 'Paracetamol',
            dosage: '500mg x 2 viên/lần',
            duration: '3 ngày'
          }
        },
        DB_IDS.doctor1
      );

      expect(result).toBeDefined();
      expect(result.prescriptions).toBeDefined();
      expect(Array.isArray(result.prescriptions)).toBe(true);
      expect(result.prescriptions.length).toBe(1);
      expect(result.prescriptions[0].medicine).toBe('Paracetamol');
      expect(result.prescriptions[0].dosage).toBe('500mg x 2 viên/lần');
      expect(result.prescriptions[0].duration).toBe('3 ngày');
    });
  });

  describe('UMRD03 - Update with Multiple Prescriptions (Array Format)', () => {
    it('should save multiple prescriptions correctly', async () => {
      const result = await medicalRecordService.updateMedicalRecordForDoctor(
        normalAppointment._id.toString(),
        {
          diagnosis: 'Nhiễm trùng răng',
          conclusion: 'Uống kháng sinh',
          prescription: [
            { medicine: 'Amoxicillin', dosage: '500mg x 3 lần/ngày', duration: '7 ngày' },
            { medicine: 'Ibuprofen', dosage: '400mg khi đau', duration: '5 ngày' }
          ]
        },
        DB_IDS.doctor1
      );

      expect(result).toBeDefined();
      expect(result.prescriptions).toBeDefined();
      expect(result.prescriptions.length).toBe(2);
      expect(result.prescriptions[0].medicine).toBe('Amoxicillin');
      expect(result.prescriptions[1].medicine).toBe('Ibuprofen');
    });
  });

  /**
   * ========================================
   * VALIDATION ERROR CASES (UMRD04-UMRD08)
   * ========================================
   */

  describe('UMRD04 - Missing Appointment ID', () => {
    it('should throw error when appointmentId is missing', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          null,
          { diagnosis: 'Test' },
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/thiếu appointmentId/i);
    });
  });

  describe('UMRD05 - Appointment Not Found', () => {
    it('should throw error when appointment does not exist', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          '000000000000000000000000',
          { diagnosis: 'Test' },
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/không tìm thấy lịch hẹn/i);
    });
  });

  describe('UMRD06 - Appointment Already Completed', () => {
    it('should throw error when appointment status is Completed', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          completedAppointment._id.toString(),
          { diagnosis: 'Test' },
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/ca khám đã hoàn thành/i);
    });
  });

  describe('UMRD07 - Wrong Doctor (Permission Denied)', () => {
    it('should throw error when doctor tries to update another doctor\'s record', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          differentDoctorAppointment._id.toString(),
          { diagnosis: 'Test' },
          DB_IDS.doctor1 // Trying to update doctor2's appointment
        )
      ).rejects.toThrow(/không có quyền/i);
    });
  });

  describe('UMRD08 - Empty Diagnosis (Required Field)', () => {
    it('should throw error when diagnosis is empty string', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          normalAppointment._id.toString(),
          { diagnosis: '' },
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/chẩn đoán là bắt buộc/i);
    });
  });

  /**
   * ========================================
   * FOLLOW-UP LOGIC (UMRD09-UMRD12)
   * ========================================
   */

  describe('UMRD09 - Enable Follow-up with Valid Date', () => {
    it('should save follow-up information correctly', async () => {
      const futureDate = new Date('2026-01-15T14:00:00.000Z');
      
      const result = await medicalRecordService.updateMedicalRecordForDoctor(
        normalAppointment._id.toString(),
        {
          diagnosis: 'Cần tái khám',
          conclusion: 'Theo dõi tiến triển',
          followUpRequired: true,
          followUpDate: futureDate,
          followUpNote: 'Tái khám sau 1 tháng để kiểm tra'
        },
        DB_IDS.doctor1
      );

      expect(result).toBeDefined();
      expect(result.followUpRequired).toBe(true);
      expect(new Date(result.followUpDate).getTime()).toBe(futureDate.getTime());
      expect(result.followUpNote).toBe('Tái khám sau 1 tháng để kiểm tra');
      // Note: Follow-up appointment is only created when approving, not when saving
      expect(result.followUpAppointmentId).toBeFalsy(); // null or undefined
    });
  });

  describe('UMRD10 - Disable Follow-up', () => {
    it('should clear follow-up information when disabled', async () => {
      // First enable follow-up
      await medicalRecordService.updateMedicalRecordForDoctor(
        normalAppointment._id.toString(),
        {
          diagnosis: 'Test',
          conclusion: 'Test',
          followUpRequired: true,
          followUpDate: new Date('2026-01-15T14:00:00.000Z'),
          followUpNote: 'Test note'
        },
        DB_IDS.doctor1
      );
      
      // Then disable it
      const result = await medicalRecordService.updateMedicalRecordForDoctor(
        normalAppointment._id.toString(),
        {
          followUpRequired: false
        },
        DB_IDS.doctor1
      );

      expect(result).toBeDefined();
      expect(result.followUpRequired).toBe(false);
      expect(result.followUpDate).toBeNull();
      expect(result.followUpNote).toBe('');
    });
  });

  describe('UMRD11 - Missing Follow-up Date When Required', () => {
    it('should throw error when followUpDate is missing but required', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          normalAppointment._id.toString(),
          {
            diagnosis: 'Test',
            conclusion: 'Test',
            followUpRequired: true,
            followUpDate: null
          },
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/vui lòng chọn ngày và giờ tái khám/i);
    });
  });

  describe('UMRD12 - Past Follow-up Date', () => {
    it('should throw error when followUpDate is in the past', async () => {
      await expect(
        medicalRecordService.updateMedicalRecordForDoctor(
          normalAppointment._id.toString(),
          {
            diagnosis: 'Test',
            conclusion: 'Test',
            followUpRequired: true,
            followUpDate: new Date('2020-01-01T14:00:00.000Z')
          },
          DB_IDS.doctor1
        )
      ).rejects.toThrow(/ngày tái khám phải ở trong tương lai/i);
    });
  });
});
