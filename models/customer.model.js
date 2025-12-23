const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  fullName: {
    type: String,
    trim: true
  },
  dob: {
    type: String,
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  hasAccount: {
    type: Boolean,
    default: false
  },
  linkedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  address: {
    type: String,
    trim: true
  },
  note: {
    type: String,
    default: null
  },
  linkedStaffUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true 
});

module.exports = mongoose.model('Customer', customerSchema,'customers');
