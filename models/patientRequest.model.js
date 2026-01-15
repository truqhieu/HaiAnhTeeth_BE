const mongoose = require('mongoose');

const patientRequestSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true
  },
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestType: {
    type: String,
    enum: ['Reschedule', 'ChangeDoctor'],
    required: true
  },
  currentData: {
    // Dữ liệu hiện tại của appointment
    doctorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timeslotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timeslot'
    },
    startTime: Date,
    endTime: Date
  },
  requestedData: {
    // Dữ liệu yêu cầu thay đổi
    doctorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timeslotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timeslot'
    },
    startTime: Date,
    endTime: Date,
    reason: String // Lý do yêu cầu thay đổi
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  staffResponse: {
    staffUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    response: {
      type: String,
      enum: ['Approved', 'Rejected']
    },
    reason: String, // Lý do từ chối (nếu có)
    respondedAt: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PatientRequest', patientRequestSchema, 'patientRequests');
