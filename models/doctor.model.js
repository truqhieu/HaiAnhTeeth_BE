const mongoose = require('mongoose');

const timeValidator = {
  validator: function(v) {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
  },
  message: 'Thời gian phải có định dạng HH:MM (24h)'
};

const doctorSchema = new mongoose.Schema({
  doctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  specialization: {
    type: String,
    trim: true
  },
  yearsOfExperience: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['Available', 'Busy', 'On Leave', 'Inactive'],
    default: 'Available'
  },
  workingHours: {
    morningStart: {
      type: String,
      default: '08:00',
      validate: timeValidator
    },
    morningEnd: {
      type: String,
      default: '12:00',
      validate: timeValidator
    },
    afternoonStart: {
      type: String,
      default: '14:00',
      validate: timeValidator
    },
    afternoonEnd: {
      type: String,
      default: '18:00',
      validate: timeValidator
    }
  },
  workingHoursUpdatedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Doctor', doctorSchema,'doctors');
