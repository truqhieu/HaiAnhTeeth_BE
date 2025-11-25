const { Messages } = require('openai/resources/chat/completions.js');
const consultationInformationService = require('../services/consultationInformation.service');

const createForm = async(req,res) =>{
    try {
        const result = await consultationInformationService.createForm(req.body)
        res.status(201).json({
            success : true, 
            message : 'Gửi thông tin tư vấn thành công',
            data : result
        })
    } catch (error) {
    console.error('Lỗi khi gửi thông tin tư vấn', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi gửi thông tin tư vấn',
    });
  }       
}

module.exports = {createForm};