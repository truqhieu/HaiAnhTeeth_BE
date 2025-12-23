const mongoose = require('mongoose');

const doctorScheduleSchema = new mongoose.Schema({
  doctorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  shift: {
    type: String,
    enum: ['Morning', 'Afternoon'],
    required: true
  },
  status: {
    type: String,
    enum: ['Available', 'Unavailable', 'Booked', 'Cancelled'],
    default: 'Available',
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clinicroom',
  },
  maxSlots: {
    type: Number,
    required: true,
    min: 1
  },
  workingHours: {
    morningStart: {
      type: String,
      default: '08:00',
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian bắt đầu ca sáng phải có định dạng HH:MM (24h)'
      }
    },
    morningEnd: {
      type: String,
      default: '12:00',
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian kết thúc ca sáng phải có định dạng HH:MM (24h)'
      }
    },
    afternoonStart: {
      type: String,
      default: '14:00',
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian bắt đầu ca chiều phải có định dạng HH:MM (24h)'
      }
    },
    afternoonEnd: {
      type: String,
      default: '18:00',
      validate: {
        validator: function(v) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian kết thúc ca chiều phải có định dạng HH:MM (24h)'
      }
    }
  }
}, {
  timestamps: true
});

// ⭐ Unique index để ngăn duplicate schedule cho cùng 1 bác sĩ, ngày, và ca
doctorScheduleSchema.index({ doctorUserId: 1, date: 1, shift: 1 }, { unique: true });
doctorScheduleSchema.index({ status: 1 });

module.exports = mongoose.model('DoctorSchedule', doctorScheduleSchema, 'doctorschedules');

