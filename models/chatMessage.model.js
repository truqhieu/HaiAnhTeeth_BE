const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
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
  doctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['Sent', 'Delivered', 'Read', 'Failed'],
    default: 'Sent'
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true // Tự động tạo createdAt và updatedAt
});

// Index để tối ưu query
chatMessageSchema.index({ appointmentId: 1, createdAt: -1 });
chatMessageSchema.index({ senderId: 1, receiverId: 1 });
chatMessageSchema.index({ receiverId: 1, read: 1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
