const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
  doctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  },
  timeslotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timeslot'
  },
  status: {
    type: String,
    enum: ['PendingPayment', 'Pending', 'Approved', 'Cancelled', 'Completed', 'CheckedIn', 'InProgress', 'Expired', 'Refunded', 'No-Show'],
    default: 'Pending',
  },
  paymentHoldExpiresAt: {
    type: Date,
    default: null
  },
  type: {
    type: String,
    enum: ['Consultation', 'Examination', 'FollowUp'],
    default: 'Consultation',
  },
  mode: {
    type: String,
    enum: ['Online', 'Offline'],
    default: 'Online',
  },
  linkMeetUrl: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  },
  bookedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  approvedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  checkInByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  checkedInAt: {
    type: Date,
    default: null
  },
  inProgressAt: {
    type: Date,
    default: null
  },
  inProgressByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  replacedDoctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  confirmDeadline : {
    type : Date,
    default : null,
  },
  cancelReason: {
    type: String,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  rescheduleCount: {
    type: Number,
    default: 0
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  bankInfo: {
    accountHolderName: {
      type: String,
      default: null
    },
    accountNumber: {
      type: String,
      default: null
    },
    bankName: {
      type: String,
      default: null
    }
  },
  appointmentFor: {
    type: String,
    enum: ['self', 'other'],
    default: 'self'
  },
  promotionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promotion',
    default: null
  },
  originalPrice: {
    type: Number,
    default: null
  },
  finalPrice: {
    type: Number,
    default: null
  },
  discountAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true 
});

module.exports = mongoose.model('Appointment', appointmentSchema,'appointments');
