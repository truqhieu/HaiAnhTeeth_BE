const Customer = require('../models/customer.model');
const User = require('../models/user.model');
const notificationService = require('../services/notification.service');
const mailService = require('../services/email.service'); 

class consultationInformationService {

    // Tạo form mới
    async createForm(data){
        try {
            const { fullName, phoneNumber, email } = data;

            // ===== Validate name =====
            if (!fullName || typeof fullName !== 'string' || fullName.trim().length === 0) {
                throw new Error('Họ tên không được để trống');
            }

            const cleanName = fullName.trim();

            if (/[<>]/.test(cleanName)) {
                throw new Error('Họ tên không được chứa ký tự < hoặc >');
            }

            if (cleanName.length < 2) {
                throw new Error('Độ dài họ tên không hợp lệ (tối thiểu 2 ký tự)');
            }

            // ===== Validate phoneNumber =====
            if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
                throw new Error('Số điện thoại không được để trống');
            }

            const cleanPhone = phoneNumber.trim();

            if (!/^[0-9]+$/.test(cleanPhone)) {
                throw new Error('Số điện thoại chỉ được chứa chữ số');
            }

            if (!cleanPhone.startsWith('0')) {
                throw new Error('Số điện thoại phải bắt đầu bằng số 0');
            }

            if (cleanPhone.length !== 10) {
                throw new Error('Số điện thoại phải có đủ 10 số');
            }

            // ===== Validate email =====
            if (!email || typeof email !== 'string' || email.trim().length === 0) {
                throw new Error('Email không được để trống');
            }

            const cleanEmail = email.trim();

            if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
                throw new Error('Email không đúng định dạng');
            }

            // ===== Lưu thông tin khách hàng =====
            const newForm = new Customer({
                fullName: cleanName,
                phoneNumber: cleanPhone,
                email: cleanEmail
            });
            await newForm.save();

            // ===== Gửi email cho staff =====
            try {
                // Lấy danh sách staff (hoặc bạn có thể findOne nếu chỉ gửi cho 1 người)
                const listStaff = await User.find({ role: 'Staff' });

                await Promise.all(
                    listStaff
                        .filter(s => !!s.email)
                        .map(s =>
                            mailService.sendConsultationFormStaffEmail(s.email, {
                                fullName: cleanName,
                                phoneNumber: cleanPhone,
                                email: cleanEmail,
                                clinicName: 'Phòng khám Hải An',
                            })
                        )
                );
            } catch (mailError) {
                console.warn('⚠️ Lỗi gửi email tư vấn cho staff:', mailError.message);
            }

            // Nếu muốn vẫn giữ notification trong hệ thống, bật lại đoạn này
            /*
            try {
                const listStaff = await User.find({ role: 'Staff' });
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
            */

            return {
                id: newForm._id,
                fullName: newForm.fullName,
                phoneNumber: newForm.phoneNumber,
                email: newForm.email,
            };

        } catch (error) {
            throw error;
        }
    }
}

module.exports = new consultationInformationService();
