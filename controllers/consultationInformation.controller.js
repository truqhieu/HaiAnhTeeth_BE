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


const listAllForms= async(req,res)=>{
    try {
        const result = await consultationInformationService.listAllForms()
        res.status(200).json({
            success : true,
            message : 'Danh sách các form tư vấn',
            data : result
        })
    } catch (error) {
    console.error('Lỗi khi lấy danh sách các form tư vấn', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi lấy danh sách các form tư vấn',
    });        
    }
}

const deleteForm = async(req,res)=>{
    try {
        const result = await consultationInformationService.deleteForm(req.params.formId)
        res.status(200).json({
            success : true,
            message : 'Xóa form tư vấn thành công',
        })
    } catch (error) {
    console.error('Lỗi khi xóa form tư vấn', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Đã xảy ra lỗi khi xóa form tư vấn',
    });        
    }
}
module.exports = {createForm, listAllForms, deleteForm}