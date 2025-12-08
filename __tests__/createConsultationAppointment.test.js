/**
 * Unit Tests for createConsultationAppointment
 * Testing UI Error Messages (from throw new Error())
 * Total: 20 test cases covering all error scenarios
 */

require('dotenv').config();
const mongoose = require('mongoose');
const appointmentService = require('../services/appointment.service');

// Import models
require('../models/payment.model');

// Real Database IDs from MongoDB
const DB_IDS = {
  // Patients
  patient1: '691fe21b4b0b8b308033efab', // Trần Trung Hiếu
  patient2: '691fe77f8604b35e222a6a12', // Đỗ Minh Đức
  
  // Doctors
  doctor1: '691fe0184b0b8b308033eeec', // bác sĩ Hiếu
  doctor2: '691fe06a4b0b8b308033eefc', // bác sĩ Dương
  
  // Services
  examination: '68f99f4fa83a29b32e8abdb6', // Làm sạch răng (10min, not prepaid)
  consultation: '69042a1627a9b33ef7ab42a1', // Khám tổng quát (30min, prepaid)
  
  // Doctor Schedules
  schedule1: '6925be88b026e4db50c30f22', // Doctor Hiếu schedule
  schedule2: '6925be88b026e4db50c30f26'  // Doctor Hải schedule
};

describe('createConsultationAppointment - UI Error Messages', () => {
  const Appointment = require('../models/appointment.model');
  const Timeslot = require('../models/timeslot.model');
  const createdAppointmentIds = [];
  
  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Clean up test data
    const testDateStart = new Date('2026-12-08T00:00:00.000Z');
    const testDateEnd = new Date('2026-12-11T00:00:00.000Z');
    
    await Appointment.deleteMany({
      createdAt: { $gte: testDateStart, $lt: testDateEnd }
    });
    
    await Timeslot.deleteMany({
      startTime: { $gte: testDateStart, $lt: testDateEnd },
      status: { $in: ['Booked', 'Reserved'] }
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
  });

  afterAll(async () => {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  });

  const getFixedDate = (day = 8, hour = 10, minute = 0) => {
    const date = new Date('2026-12-' + day.toString().padStart(2, '0'));
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };

  /**
   * ========================================
   * SUCCESS CASES (UTC01-UTC05)
   * ========================================
   */

  describe('UTC01 - Valid Appointment Self (Examination)', () => {
    it('should create appointment successfully', async () => {
      const startTime = getFixedDate(8, 1, 0); // 8:00 VN
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule1,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'self',
        fullName: 'Đỗ Minh Đức',
        email: 'ddomin142@gmail.com',
        phoneNumber: '0901234567',
        notes: 'Test'
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
      expect(result.appointmentId).toBeDefined();
      expect(result.status).toBe('Pending');
      expect(result.mode).toBe('Offline');
      expect(result.requirePayment).toBe(false);
    });
  });

  describe('UTC02 - Valid Appointment Self (Consultation with Payment)', () => {
    it('should create appointment with payment requirement', async () => {
      const startTime = getFixedDate(8, 2, 0); // 9:00 VN
      const endTime = new Date(startTime.getTime() + 30 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.consultation,
        doctorScheduleId: DB_IDS.schedule1,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'self',
        fullName: 'Đỗ Minh Đức',
        email: 'ddomin142@gmail.com',
        phoneNumber: '0901234567',
        notes: null
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
      expect(result.status).toBe('PendingPayment');
      expect(result.requirePayment).toBe(true);
      expect(result.payment).toBeDefined();
    });
  });

  describe('UTC03 - Valid Appointment for Other Person', () => {
    it('should create appointment for another person', async () => {
      const startTime = getFixedDate(8, 3, 0); // 10:00 VN
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule1,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'other',
        fullName: 'Nguyễn Văn Thao',
        email: 'thao.test@gmail.com',
        phoneNumber: '0901234568',
        notes: 'Test'
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
      expect(result.status).toBe('Pending');
    });
  });

  describe('UTC04 - Different Doctor and Time', () => {
    it('should create appointment with doctor2', async () => {
      const startTime = getFixedDate(8, 7, 0); // 14:00 VN
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient2,
        doctorUserId: DB_IDS.doctor2,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule2,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'self',
        fullName: 'Hiếu',
        email: 'vutrongthu@gmail.com',
        phoneNumber: '0901234569',
        notes: null
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
    });
  });

  describe('UTC05 - Multiple Appointments Same Day', () => {
    it('should allow booking different times on same day', async () => {
      const startTime = getFixedDate(8, 8, 0); // 15:00 VN
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient2,
        doctorUserId: DB_IDS.doctor2,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule2,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'other',
        fullName: 'Vũ Trọng Thư',
        email: 'truuhieu7038@fpt.edu.vn',
        phoneNumber: '0901234570',
        notes: 'Test'
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
    });
  });

  /**
   * ========================================
   * ERROR CASES - MISSING REQUIRED FIELDS (UTC06-UTC11)
   * ========================================
   */
  describe('Error Cases - Missing Required Fields', () => {
    
    it('UTC06 - should reject when patientUserId is missing', async () => {
      const startTime = getFixedDate(9, 1, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: null,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234571'
        })
      ).rejects.toThrow('Vui lòng nhập đầy đủ thông tin để đặt lịch tư vấn.');
    });

    it('UTC07 - should reject when doctorUserId is missing', async () => {
      const startTime = getFixedDate(9, 2, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: null,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234572'
        })
      ).rejects.toThrow('Vui lòng nhập đầy đủ thông tin để đặt lịch tư vấn.');
    });

    it('UTC08 - should reject when serviceId is missing', async () => {
      const startTime = getFixedDate(9, 3, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: null,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234573'
        })
      ).rejects.toThrow('Vui lòng nhập đầy đủ thông tin để đặt lịch tư vấn.');
    });

    it('UTC09 - should reject when doctorScheduleId is missing', async () => {
      const startTime = getFixedDate(9, 4, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: null,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234574'
        })
      ).rejects.toThrow('Vui lòng nhập đầy đủ thông tin để đặt lịch tư vấn.');
    });

    it('UTC10 - should reject when selectedSlot.startTime is missing', async () => {
      const endTime = getFixedDate(9, 5, 10);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: null,
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234575'
        })
      ).rejects.toThrow('Thông tin khung giờ không hợp lệ. Vui lòng chọn lại thời gian.');
    });

    it('UTC11 - should reject when selectedSlot.endTime is missing', async () => {
      const startTime = getFixedDate(9, 6, 0);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: null
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234576'
        })
      ).rejects.toThrow('Thông tin khung giờ không hợp lệ. Vui lòng chọn lại thời gian.');
    });
  });

  /**
   * ========================================
   * ERROR CASES - TIME VALIDATION (UTC12-UTC14)
   * ========================================
   */
  describe('Error Cases - Time Validation', () => {
    
    it('UTC12 - should reject past time slot', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setUTCHours(2, 0, 0, 0);
      const pastEndDate = new Date(yesterday.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: yesterday.toISOString(),
            endTime: pastEndDate.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234577'
        })
      ).rejects.toThrow(/không có lịch làm việc|quá khứ/i);
    });

    it('UTC13 - should reject outside working hours (before 8:00 AM)', async () => {
      // 6:00 AM VN = 23:00 UTC previous day
      const startTime = getFixedDate(7, 23, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234578'
        })
      ).rejects.toThrow(/không có lịch làm việc|ngoài giờ|không nằm trong lịch làm việc/i);
    });

    it('UTC14 - should reject outside working hours (after 8:00 PM)', async () => {
      // 00:00 VN next day = 17:00 UTC (after 8:00 PM, outside working hours)
      const startTime = getFixedDate(8, 17, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'self',
          fullName: 'Test',
          email: 'test@gmail.com',
          phoneNumber: '0901234579'
        })
      ).rejects.toThrow(/không có lịch làm việc|ngoài giờ|không nằm trong lịch làm việc/i);
    });
  });

  /**
   * ========================================
   * ERROR CASES - MISSING CUSTOMER INFO FOR OTHER (UTC15)
   * ========================================
   */
  describe('Error Cases - Missing Customer Info for Other', () => {
    
    it('UTC15 - should reject when fullName missing for other', async () => {
      const startTime = getFixedDate(10, 1, 30);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      await expect(
        appointmentService.createConsultationAppointment({
          patientUserId: DB_IDS.patient1,
          doctorUserId: DB_IDS.doctor1,
          serviceId: DB_IDS.examination,
          doctorScheduleId: DB_IDS.schedule1,
          selectedSlot: {
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString()
          },
          appointmentFor: 'other',
          fullName: null,
          email: 'customer@gmail.com',
          phoneNumber: '0901234580'
        })
      ).rejects.toThrow(/họ tên|customer|đầy đủ/i);
    });
  });

  /**
   * ========================================
   * EDGE CASES (UTC16-UTC17)
   * ========================================
   */
  describe('Edge Cases', () => {
    
    it('UTC16 - should handle notes as optional field', async () => {
      const startTime = getFixedDate(10, 3, 30);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule1,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'self',
        fullName: 'Đỗ Minh Đức',
        email: 'ddomin142@gmail.com',
        phoneNumber: '0901234582',
        notes: null
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
    });

    it('UTC17 - should handle empty notes string', async () => {
      const startTime = getFixedDate(10, 7, 0);
      const endTime = new Date(startTime.getTime() + 10 * 60000);

      const result = await appointmentService.createConsultationAppointment({
        patientUserId: DB_IDS.patient1,
        doctorUserId: DB_IDS.doctor1,
        serviceId: DB_IDS.examination,
        doctorScheduleId: DB_IDS.schedule1,
        selectedSlot: {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        appointmentFor: 'self',
        fullName: 'Đỗ Minh Đức',
        email: 'ddomin142@gmail.com',
        phoneNumber: '0901234583',
        notes: ''
      });

      createdAppointmentIds.push(result.appointmentId);

      expect(result).toBeDefined();
    });
  });
});
