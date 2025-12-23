const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    startDate: {
        type: Date,
        required: [true, 'Vui lòng nhập ngày bắt đầu.'],
        trim: true,
    },
    endDate: {
        type: Date,
        required: [true, 'Vui lòng nhập ngày kết thúc.'],
        trim: true,
    },
    reason: {
        type: String,
        required: [true, 'Vui lòng nhập lý do nghỉ'],
        trim: true,
    },
    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected", "Expired"],
        default: "Pending",
    },
    approvedByManager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema, 'leaverequests');