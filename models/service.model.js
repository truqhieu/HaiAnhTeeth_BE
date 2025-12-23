const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    min: 0
  },
  isPrepaid: {
    type: Boolean,
    default: false
  },
  durationMinutes: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
  },
  category: {
    type: String,
    enum: ['Examination', 'Consultation'],
  }
}, {
  timestamps: true 
});

module.exports = mongoose.model('Service', serviceSchema,'services');
