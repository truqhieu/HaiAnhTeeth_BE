const ConsultationInformation = require('../models/consultationInformation.model')
const User = require('../models/user.model');
const notificationService = require('../services/notification.service')

class consultationInformationService {

    // Tạo form mới
    async createForm(data){
        try {
            const {name, phone, email} = data;

            //Validate name
            if(!name || typeof name !== 'string' || name.trim().length === 0){
                throw new Error('Họ tên không được để trống');
            }

            const cleanName = name.trim();

            if(!/^[a-zA-ZÀ-ỹ\s]+$/.test(cleanName)){
                throw new Error('Họ tên không được chứa số hoặc ký tự đặc biệt');
            }

            if(cleanName.length < 2){
                throw new Error('Độ dài họ tên không hợp lệ (tối thiểu 2 ký tự)')
            }

            // Validate phoneNumber
            if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
                throw new Error('Số điện thoại không được để trống');
            }

            const cleanPhone = phone.trim();

            if (!/^[0-9]+$/.test(cleanPhone)) {
                throw new Error('Số điện thoại chỉ được chứa chữ số');
            }

            if (!cleanPhone.startsWith('0')) {
                throw new Error('Số điện thoại phải bắt đầu bằng số 0');
            }

            if (cleanPhone.length !== 10) {
                throw new Error('Số điện thoại phải có đủ 10 số');
            }

            // Validate email
            if (!email || typeof email !== 'string' || email.trim().length === 0) {
                throw new Error('Email không được để trống');
            }

            const cleanEmail = email.trim();

            if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
                throw new Error('Email không đúng định dạng');
            }

            // const checkEmail = await User.findOne({ email });
            // if (checkEmail) {
            //     throw new Error('Email đã tồn tại!');
            // }

            const newForm = new ConsultationInformation({name: cleanName, phone: cleanPhone, email: cleanEmail})
            await newForm.save();

            // Thông báo cho lễ tân
            const listStaff = await User.find({role : "Staff"})
            try {
                await Promise.all(
                    listStaff.map(s =>
                        notificationService.createNotification({
                            userId: s._id,
                            createdByUserId: null,
                            title: 'Tư vấn',
                            message: `Đã có khách hàng gửi thông tin tư vấn`,
                            relatedAppointmentId: null, 
                            link: null,
                        })
                    )
                );
            } catch (notifError) {
                console.warn('⚠️ Lỗi gửi notification cho staff:', notifError.message);
            }

            return {
                id : newForm._id,
                name : newForm.name,
                phone : newForm.phone,
                email : newForm.email,
            }

        } catch (error) {
            throw error;
        }
    }

    // Lấy tất cả form
    async listAllForms(){
        try {
            const forms = await ConsultationInformation.find().sort({createdAt: -1}); 
            return forms;
        } catch (error) {
            throw error;
        }
    }

    // Xóa form theo id
    async deleteForm(formId){
        try {
            const form = await ConsultationInformation.findById(formId);
            if(!form){
                throw new Error('Form không tồn tại');
            }
            await ConsultationInformation.findByIdAndDelete(formId);
            return { message: 'Xóa form thành công' };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new consultationInformationService();
