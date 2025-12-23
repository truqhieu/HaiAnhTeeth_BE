const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
  },
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  method: {
    type: String,
    enum: ['Sepay'],
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Expired', 'Refunded', 'Cancelled'],
    default: 'Pending',
  },
  QRurl: {
    type: String,
    default: null
  },
  holdExpiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true 
});

module.exports = mongoose.model('Payment', paymentSchema,'payments');
