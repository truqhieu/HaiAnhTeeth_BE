const mongoose = require('mongoose');

const introductionSchema = new mongoose.Schema({
    title : {
        type : String,
        required: [true, 'Vui lòng điền tiêu đề của giới thiệu trang '],
        trim : true,
    },
    summary : {
        type : String,
        required : [true, 'Vui lòng điền nội dung'],
        trim : true,
    },
    thumbnailUrl : {
        type : String,
        required : [true, 'Vui lòng thêm ảnh'],
        trim : true,
    },
    status : {
        type : String,
        enum : ["Published","Hidden"],
        default : "Published",
    }
},{
  timestamps: true
});

module.exports = mongoose.model('Introduction', introductionSchema,'introductions');