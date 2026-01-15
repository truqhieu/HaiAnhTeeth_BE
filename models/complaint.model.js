const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  patientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Vui lòng nhập tiêu đề khiếu nại.'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Vui lòng nhập mô tả khiếu nại.'],
    trim: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  managerResponses: [
    {
      managerUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      responseText: {
        type: String,
        required: true,
        trim: true,
      },
      respondedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  resolvedByManagerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default : null
  },
  resolutionDate: {
    type: Date,
  },
}, {
  timestamps: true,
});

// ✅ Tên model và collection nên trùng với ngữ cảnh
module.exports = mongoose.model('Complaint', complaintSchema, 'complaints');
