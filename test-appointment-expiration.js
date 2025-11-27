const mongoose = require('mongoose');
const Appointment = require('./models/appointment.model');
const DoctorSchedule = require('./models/doctorSchedule.model');
const Timeslot = require('./models/timeslot.model');
const User = require('./models/user.model');
const appointmentMonitorService = require('./services/appointmentMonitor.service');
require('dotenv').config();

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m"
};

async function runTest() {
  try {
    console.log(colors.cyan + '🚀 Starting Appointment Expiration Logic Test' + colors.reset);

    // Connect to DB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Setup Data
    // Find a doctor
    const doctor = await User.findOne({ role: 'Doctor' });
    if (!doctor) throw new Error('No doctor found');

    // Create a past date (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(8, 0, 0, 0); // 8 AM yesterday

    // Create a schedule for yesterday
    const schedule = await DoctorSchedule.create({
      doctorUserId: doctor._id,
      date: yesterday,
      shift: 'Morning',
      workingHours: {
        morningStart: '08:00',
        morningEnd: '12:00'
      },
      status: 'Available'
    });

    // Create appointments with different statuses
    const statuses = ['Pending', 'Approved', 'CheckedIn', 'InProgress'];
    const appointments = [];

    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const startTime = new Date(yesterday);
      startTime.setHours(8 + i, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(30);

      const timeslot = await Timeslot.create({
        doctorScheduleId: schedule._id,
        doctorUserId: doctor._id,
        startTime: startTime,
        endTime: endTime,
        status: 'Booked'
      });

      const appointment = await Appointment.create({
        patientUserId: doctor._id, // Self-booking for simplicity
        doctorUserId: doctor._id,
        timeslotId: timeslot._id,
        status: status,
        bookedByUserId: doctor._id,
        type: 'Consultation',
        mode: 'Offline'
      });
      
      appointments.push(appointment);
      console.log(`Created ${status} appointment: ${appointment._id}`);
    }

    // 2. Run Expiration Logic
    console.log('\nRunning expireAppointments()...');
    await appointmentMonitorService.expireAppointments();

    // 3. Verify Results
    console.log('\nVerifying results...');
    let passed = true;

    for (const originalAppt of appointments) {
      const updatedAppt = await Appointment.findById(originalAppt._id);
      const originalStatus = originalAppt.status;
      const newStatus = updatedAppt.status;

      let expectedStatus;
      if (originalStatus === 'Pending' || originalStatus === 'Approved') {
        expectedStatus = 'Cancelled';
      } else if (originalStatus === 'CheckedIn') {
        expectedStatus = 'No-Show';
      } else if (originalStatus === 'InProgress') {
        expectedStatus = 'Completed';
      }

      const isCorrect = newStatus === expectedStatus;
      if (!isCorrect) passed = false;

      console.log(`Appointment ${originalAppt._id} (${originalStatus}) -> ${newStatus} [Expected: ${expectedStatus}] ${isCorrect ? '✅' : '❌'}`);

      if (expectedStatus === 'Cancelled') {
        if (updatedAppt.cancelReason === 'Quá hạn (Hệ thống tự động hủy)' && updatedAppt.cancelledAt) {
           console.log(`   - Cancel details set correctly ✅`);
        } else {
           console.log(`   - Cancel details missing or incorrect ❌`);
           passed = false;
        }
      }
    }

    // Cleanup
    console.log('\nCleaning up...');
    await Appointment.deleteMany({ _id: { $in: appointments.map(a => a._id) } });
    await Timeslot.deleteMany({ doctorScheduleId: schedule._id });
    await DoctorSchedule.findByIdAndDelete(schedule._id);

    if (passed) {
      console.log(colors.green + '\n✅ TEST PASSED: All statuses updated correctly.' + colors.reset);
    } else {
      console.log(colors.red + '\n❌ TEST FAILED: Some statuses incorrect.' + colors.reset);
    }

    process.exit(passed ? 0 : 1);

  } catch (error) {
    console.error(colors.red + '❌ Test Error:' + colors.reset, error);
    process.exit(1);
  }
}

runTest();
