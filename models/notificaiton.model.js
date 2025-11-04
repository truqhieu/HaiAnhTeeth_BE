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
        required : [true, 'Vui lòng điền tóm tắt blog'],
        trim : true,
    },
    isRead : {
        type : Boolean,
        default : false,
    },
    relatedAppointmentId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment'
    },
    leaveRequestId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeaveRequest'
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