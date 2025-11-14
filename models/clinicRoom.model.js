const mongoose = require('mongoose');

const clinicroomSchema = new mongoose.Schema({
    name : {
        type : String,
        required: [true, 'Vui lòng nhập tên phòng khám.'],
        trim : true,
    },
    description :{
        type : String,
        required: [true, 'Vui lòng nhập mô tả phòng khám.'],
        trim : true,
    },
    assignedDoctorId :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default : null
    },
    status : {
        type : String,
        enum : ["Active","Inactive"],
        default : "Active",
    }
},{
  timestamps: true
});

module.exports = mongoose.model('Clinicroom', clinicroomSchema,'clinicrooms');