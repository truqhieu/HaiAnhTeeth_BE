const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    name : {
        type : String,
        required: [true, 'Vui lòng nhập tên thiết bị'],
        trim : true,
    },
    description :{
        type : String,
        required: [true, 'Vui lòng nhập mô tả của thiết bị'],
        trim : true,
    },
    purchaseDate : {
        type : Date,
        required : [true, 'Vui lòng nhập ngày mua thiết bị'],
        trim : true,
    },
    expireDate : {
        type : Date,
        required : [true, 'Vui lòng nhập ngày hết hạn của thiết bị'],
        trim : true,
    },
    status : {
        type : String,
        enum : ["Active","Inactive"],
        default : "Active",
    }
},{
  timestamps: true
});

module.exports = mongoose.model('Device', deviceSchema,'devices');