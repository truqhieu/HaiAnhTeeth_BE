const mongoose = require('mongoose');

const timeslotSchema = new mongoose.Schema({
  doctorScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DoctorSchedule',
  },
  doctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  breakAfterMinutes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Available', 'Reserved', 'Booked', 'Cancelled', 'Completed'],
    default: 'Available',
  },
  reservedUntil: {
    type: Date,
    default: null,
  },
  reservedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Timeslot', timeslotSchema,'timeslots');
