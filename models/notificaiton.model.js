const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    title :{
        type : String,
        required: [true, 'Tiêu đề của thông báo không được để trống'],
        trim : true,
    },
    message : {
        type : String,
        required : [true, 'Vui lòng nhập nội dung thông báo'],
        trim : true,
    },
    isRead : {
        type : Boolean,
        default : false,
    },
    relatedAppointmentId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        default : null,
    },
    leaveRequestId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeaveRequest',
        default : null,
    },
    link : {
        type : String,
        default : null,
    },
    sentAt : {
        type : Date,
        default : null,
    },
    createdByUserId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },   
},{
  timestamps: true
});

module.exports = mongoose.model('Notificaiton', notificationSchema,'notifications');