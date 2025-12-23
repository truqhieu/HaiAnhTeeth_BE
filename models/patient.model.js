const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emergencyContact: {
    name: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    relationship: {
      type: String,
      trim: true,
      enum: ['Father', 'Mother', 'Brother', 'Sister', 'Spouse', 'Friend', 'Other'],
      default: 'Other'
    }
  },
  lastVisitDate: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Patient', patientSchema, 'patients');
