const mongoose = require('mongoose');

const consultationInformationSchema = new mongoose.Schema({
    name : {
        type : String,
        required: [true, 'Vui lòng nhập họ và tên'],
        trim : true,
    },
    phone :{
        type : String,
        required: [true, 'Vui lòng nhập số điện thoại'],
        trim : true,
    },
    email : {
        type : String,
        required : [true, 'Vui lòng nhập email'],
        trim : true,
    },
},{
  timestamps: true
});

module.exports = mongoose.model('ConsultationInformation', consultationInformationSchema,'consultationinformations');