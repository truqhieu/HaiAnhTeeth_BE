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
      default: null, // ⭐ Không có default - phải do manager tạo
      validate: {
        validator: function(v) {
          // Cho phép null hoặc empty, nếu có giá trị thì validate format
          if (!v || v === null || v === '') return true;
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian phải có định dạng HH:MM (24h)'
      }
    },
    morningEnd: {
      type: String,
      default: null,
      validate: {
        validator: function(v) {
          if (!v || v === null || v === '') return true;
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian phải có định dạng HH:MM (24h)'
      }
    },
    afternoonStart: {
      type: String,
      default: null,
      validate: {
        validator: function(v) {
          if (!v || v === null || v === '') return true;
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian phải có định dạng HH:MM (24h)'
      }
    },
    afternoonEnd: {
      type: String,
      default: null,
      validate: {
        validator: function(v) {
          if (!v || v === null || v === '') return true;
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Thời gian phải có định dạng HH:MM (24h)'
      }
    }
  },
  workingHoursUpdatedAt: {
    type: Date,
    default: null
  },
  workingHoursEffectiveDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Doctor', doctorSchema,'doctors');
