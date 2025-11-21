const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title : {
        type : String,
        required: [true, 'Vui lòng điền tiêu đề của blog'],
        trim : true,
    },
    category :{
        type : String,
        enum : [
            "News",              
            "Health Tips",       
            "Medical Services",  
            "Promotions",        
            "Patient Stories",   
            "Recruitment" 
        ],
        required: [true, 'Vui chọn thể loại của blog'],
        trim : true,
    },
    summary : {
        type : String,
        required : [true, 'Vui lòng điền tóm tắt blog'],
        trim : true,
    },
    content : {
        type : String,
        required : [true, 'Vui lòng điền nội dung blog'],
        trim : true,
    },
    thumbnailUrl : {
        type : String,
        required : [true, 'Vui lòng thêm ảnh của blog'],
        trim : true,
    },
    authorUserId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status : {
        type : String,
        enum : ["Published","Hidden"],
        default : "Published",
    },
    startDate : {
        type : Date,
        required : false,
    },
    endDate : {
        type : Date,
        required : false,
    },
},{
  timestamps: true
});

module.exports = mongoose.model('Blog', blogSchema,'blogs');