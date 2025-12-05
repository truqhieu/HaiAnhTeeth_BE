/**
 * Unit Tests for createWalkInAppointment
 * Testing walk-in appointment creation by staff
 * Total: 15 test cases covering success, validation, and conflict scenarios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');

// Import models
require('../models/payment.model');

// Real Database IDs from MongoDB
const DB_IDS = {
  // Staff
  staff1: '691fe0184b0b8b308033eeec', // Staff user (bác sĩ Hiếu can act as staff)
  
  // Doctors
  doctor1: '691fe0184b0b8b308033eeec', // bác sĩ Hiếu
  doctor2: '691fe06a4b0b8b308033eefc', // bác sĩ Dương
  
  // Services
  examination: '68f99f4fa83a29b32e8abdb6', // Làm sạch răng (10min)
  consultation: '69042a1627a9b33ef7ab42a1', // Khám tổng quát (30min)
  
  // Doctor Schedules
  schedule1: '6925be88b026e4db50c30f22', // Doctor Hiếu schedule
  schedule2: '6925be88b026e4db50c30f26'  // Doctor Hải schedule
};

describe('createWalkInAppointment - Walk-in Appointment Creation', () => {
  const Appointment = require('../models/appointment.model');
  const Timeslot = require('../models/timeslot.model');
  const Customer = require('../models/customer.model');
  const createdAppointmentIds = [];
  const createdCustomerIds = [];
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up test data
    const testDateStart = new Date('2025-12-15T00:00:00.000Z');
    const testDateEnd = new Date('2025-12-20T00:00:00.000Z');
    
    await Appointment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd },
      status: { $in: ['Booked', 'Reserved'] }
    });
    
    // Clean up test customers
    await Customer.deleteMany({
      email: { $regex: /^walkin\.test.*@test\.com$/ }
    });
  });

  afterEach(async () => {
    if (createdAppointmentIds.length > 0) {
      const appointments = await Appointment.find({ _id: { $in: createdAppointmentIds } });
      const timeslotIds = appointments.map(apt => apt.timeslotId).filter(Boolean);
      
      await Appointment.deleteMany({ _id: { $in: createdAppointmentIds } });
      if (timeslotIds.length > 0) {
        await Timeslot.deleteMany({ _id: { $in: timeslotIds } });
      }
      
      createdAppointmentIds.length = 0;
    }
    
    if (createdCustomerIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdCustomerIds } });
      createdCustomerIds.length = 0;
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  });

  const getFixedDate = (day = 15, hour = 10, minute = 0) => {
    const date = new Date('2025-12-' + day.toString().padStart(2, '0'));
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };

  /**
   * ========================================
   * SUCCESS CASES (WTC01-WTC03)
   * ========================================
   */

  describe('WTC01 - Valid Walk-in Appointment (Examination)', () => {
    it('should create walk-in appointment successfully', async () => {
      const startTime = getFixedDate(15, 1, 0); // 8:00 VN
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createWalkInAppointment({
        staffUserId: DB_IDS.staff1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule1,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        fullName: 'Nguyễn Văn A',
        email: 'walkin.test1@test.com',
        phoneNumber: '0901234567',
        notes: 'Walk-in patient test'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Approved');
      expect(result.data.mode).toBe('Offline');
      expect(result.data.patientName).toBe('Nguyễn Văn A');
      expect(result.data.appointmentId).toBeDefined();
      
      createdAppointmentIds.push(result.data.appointmentId);
      
      // Verify appointment in DB
      const appointment = await Appointment.findById(result.data.appointmentId);
      expect(appointment).toBeDefined();
      expect(appointment.status).toBe('Approved');
      expect(appointment.mode).toBe('Offline');
      expect(appointment.patientUserId.toString()).toBe(DB_IDS.staff1);
      expect(appointment.customerId).toBeDefined();
      
      createdCustomerIds.push(appointment.customerId);
      
      // Verify customer created
      const customer = await Customer.findById(appointment.customerId);
      expect(customer).toBeDefined();
      expect(customer.fullName).toBe('Nguyễn Văn A');
      expect(customer.email).toBe('walkin.test1@test.com');
      expect(customer.phoneNumber).toBe('0901234567');
    });
  });

  describe('WTC02 - Walk-in with Reserved Timeslot', () => {
    it('should reuse reserved timeslot when provided', async () => {
      const startTime = getFixedDate(15, 2, 0); // 9:00 VN
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      // First create a reserved timeslot
      const reservedSlot = await Timeslot.create({
        doctorUserId: DB_IDS.doctor1,
        startTime,
        endTime,
        status: 'Reserved',
        reservedBy: DB_IDS.staff1,
        reservedAt: new Date(),
        reservedUntil: new Date(Date.now() + 5 * 60000)
      });

      const result = await appointmentService.createWalkInAppointment({
        staffUserId: DB_IDS.staff1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        fullName: 'Trần Thị B',
        email: 'walkin.test2@test.com',
        phoneNumber: '0902345678',
        reservedTimeslotId: reservedSlot._id.toString()
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Approved');
      
      createdAppointmentIds.push(result.data.appointmentId);
      
      // Verify timeslot was reused and updated to Booked
      const updatedSlot = await Timeslot.findById(reservedSlot._id);
      expect(updatedSlot.status).toBe('Booked');
      expect(updatedSlot.appointmentId.toString()).toBe(result.data.appointmentId);
      
      const appointment = await Appointment.findById(result.data.appointmentId);
      createdCustomerIds.push(appointment.customerId);
    });
  });

  describe('WTC03 - Walk-in with Consultation Service', () => {
    it('should create walk-in appointment with consultation service', async () => {
      const startTime = getFixedDate(15, 3, 0); // 10:00 VN
      const endTime = new Date(startTime.getTime() + 30 * 60000);

      const result = await appointmentService.createWalkInAppointment({
        staffUserId: DB_IDS.staff1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.consultation,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        fullName: 'Lê Văn C',
        email: 'walkin.test3@test.com',
        phoneNumber: '0903456789'
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('Approved');
      expect(result.data.service).toBeDefined();
      
      createdAppointmentIds.push(result.data.appointmentId);
      
      const appointment = await Appointment.findById(result.data.appointmentId);
      createdCustomerIds.push(appointment.customerId);
    });
  });

  /**
   * ========================================
   * VALIDATION ERROR CASES (WTC04-WTC09)
   * ========================================
   */

  describe('WTC04 - Missing Staff User ID', () => {
    it('should throw error when staffUserId is missing', async () => {
      const startTime = getFixedDate(15, 4, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createWalkInAppointment({
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          fullName: 'Test User',
          email: 'test@test.com',
          phoneNumber: '0900000000'
        })
      ).rejects.toThrow('Thiếu thông tin người tạo (staffUserId)');
    });
  });

  describe('WTC05 - Missing Required Fields', () => {
    it('should throw error when doctor/service/slot is missing', async () => {
      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          fullName: 'Test User',
          email: 'test@test.com',
          phoneNumber: '0900000000'
        })
      ).rejects.toThrow('Vui lòng cung cấp đủ: dịch vụ, bác sĩ và khung giờ');
    });
  });

  describe('WTC06 - Missing Patient Information', () => {
    it('should throw error when patient info is incomplete', async () => {
      const startTime = getFixedDate(15, 5, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          fullName: 'Test User'
          // Missing email and phoneNumber
        })
      ).rejects.toThrow('Vui lòng nhập đầy đủ họ tên, email và số điện thoại của bệnh nhân');
    });
  });

  describe('WTC07 - Invalid Time Slot', () => {
    it('should throw error when time slot is invalid', async () => {
      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          selectedSlot: {
            startTime: 'invalid-date',
            endTime: 'invalid-date'
          },
          fullName: 'Test User',
          email: 'test@test.com',
          phoneNumber: '0900000000'
        })
      ).rejects.toThrow('Thời gian khung giờ không hợp lệ');
    });
  });

  describe('WTC08 - Invalid Service', () => {
    it('should throw error when service does not exist', async () => {
      const startTime = getFixedDate(15, 6, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: '000000000000000000000000', // Non-existent service
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          fullName: 'Test User',
          email: 'test@test.com',
          phoneNumber: '0900000000'
        })
      ).rejects.toThrow('Dịch vụ không tồn tại');
    });
  });

  describe('WTC09 - Invalid Doctor', () => {
    it('should throw error when doctor does not exist', async () => {
      const startTime = getFixedDate(15, 7, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          doctorUserId: '000000000000000000000000', // Non-existent doctor
          serviceId: DB_IDS.examination,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          fullName: 'Test User',
          email: 'test@test.com',
          phoneNumber: '0900000000'
        })
      ).rejects.toThrow('Bác sĩ không hợp lệ');
    });
  });

  /**
   * ========================================
   * CONFLICT CASES (WTC10-WTC11)
   * ========================================
   */

  describe('WTC10 - Time Slot Already Booked', () => {
    it('should throw error when time slot conflicts with existing appointment', async () => {
      const startTime = getFixedDate(16, 1, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      // Create first appointment
      const firstResult = await appointmentService.createWalkInAppointment({
        staffUserId: DB_IDS.staff1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        fullName: 'First Patient',
        email: 'walkin.test.first@test.com',
        phoneNumber: '0901111111'
      });

      createdAppointmentIds.push(firstResult.data.appointmentId);
      const firstApt = await Appointment.findById(firstResult.data.appointmentId);
      createdCustomerIds.push(firstApt.customerId);

      // Try to create second appointment at same time
      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          fullName: 'Second Patient',
          email: 'walkin.test.second@test.com',
          phoneNumber: '0902222222'
        })
      ).rejects.toThrow(/đã có lịch hẹn|trùng lịch|conflict|đã được đặt|đã có lịch khám/i);
    });
  });

  describe('WTC11 - Past Time Slot', () => {
    it('should throw error when trying to book past time', async () => {
      const pastTime = new Date('2025-01-01T01:00:00.000Z');
      const pastEndTime = new Date(pastTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createWalkInAppointment({
          staffUserId: DB_IDS.staff1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          selectedSlot: {
            startTime: pastTime.toISOString(),
            endTime: pastEndTime.toISOString()
          },
          fullName: 'Test User',
          email: 'test@test.com',
          phoneNumber: '0900000000'
        })
      ).rejects.toThrow(/đã qua|past|quá khứ|chưa có lịch làm việc/i);
    });
  });
});
