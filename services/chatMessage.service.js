// services/chatService.js
const ChatMessage = require('../models/chatMessage.model');
const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const MedicalRecord = require('../models/medicalRecord.model');

class ChatMessageService {
  // Lấy danh sách bác sĩ đã từng khám cho patient (appointments có status Completed hoặc Finalized)
  async getDoctorsForPatient(patientId) {
    try {
      // Tìm tất cả appointments của patient có status Completed hoặc Finalized
      // Bao phủ cả case Walk-in: match theo email giữa User và Customer
      const user = await User.findById(patientId).select('email').lean();
      const Customer = require('../models/customer.model');
      let emailCustomerIds = [];
      if (user?.email) {
        const customers = await Customer.find({ email: user.email }).select('_id').lean();
        emailCustomerIds = customers.map(c => c._id);
      }

      const orConds = [{ patientUserId: patientId }];
      if (emailCustomerIds.length > 0) {
        orConds.push({ customerId: { $in: emailCustomerIds } });
      }

      const appointments = await Appointment.find({
        $or: orConds,
        status: { $in: ['Completed', 'Finalized'] }
      })
.populate('doctorUserId', '_id fullName email specialization')
.populate('replacedDoctorUserId', '_id fullName email specialization')
        .lean();

      // Lấy danh sách doctor unique
      const doctorMap = new Map();
      
      appointments.forEach(appointment => {
  // Ưu tiên replacedDoctorUserId nếu có
  const doctor = appointment.replacedDoctorUserId || appointment.doctorUserId;
  
  if (doctor && doctor._id) {
    const doctorId = doctor._id.toString();
    
    if (!doctorMap.has(doctorId)) {
      doctorMap.set(doctorId, {
        _id: doctor._id,
        fullName: doctor.fullName,
        email: doctor.email,
        specialization: doctor.specialization,
        appointmentId: appointment._id,
        appointmentDate: appointment.timeslotId?.startTime || appointment.createdAt
      });
    }
  }
});


      // Convert Map to Array
      const doctors = Array.from(doctorMap.values());
      
      // Sắp xếp theo appointmentDate mới nhất
      doctors.sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));

      return doctors;
    } catch (error) {
      console.error('Error in getDoctorsForPatient:', error);
      throw new Error('Không thể lấy danh sách bác sĩ');
    }
  }

  // Tạo tin nhắn mới
  async createMessage(messageData) {
    try {
      const { senderId, receiverId, appointmentId, content } = messageData;

      // Validate input
      if (!senderId || !receiverId || !appointmentId || !content) {
        throw new Error('Thiếu thông tin bắt buộc: senderId, receiverId, appointmentId, content');
      }

      // Validate appointment thuộc về patient và doctor
      const appointment = await Appointment.findById(appointmentId)
        .populate('customerId', 'email')
        .populate('patientUserId', '_id')
        .populate('doctorUserId', '_id');
      if (!appointment) {
        throw new Error('Không tìm thấy ca khám');
      }

      // Kiểm tra appointment có status Completed hoặc Finalized
      if (!['Completed', 'Finalized'].includes(appointment.status)) {
        throw new Error('Chỉ có thể chat với bác sĩ sau khi ca khám hoàn thành');
      }

      // Tìm doctor từ appointment
      const doctor = await User.findById(appointment.doctorUserId);
      if (!doctor) {
        throw new Error('Bác sĩ không thuộc ca khám này');
      }

      // Xác định patient User (bao phủ Walk-in)
      const sender = await User.findById(senderId).select('role email').lean();
      let patientUserIdForMessage = appointment.patientUserId;

      if (sender?.role === 'Patient') {
        // Kiểm tra quyền sở hữu: là patient của appointment hoặc trùng email với customerId
        const isPatientOwner = appointment.patientUserId?._id?.toString() === senderId.toString();
        let isEmailOwner = false;
        if (appointment.customerId && sender?.email) {
          const customerEmail = appointment.customerId.email || null;
          if (customerEmail) {
            isEmailOwner = customerEmail.toLowerCase() === sender.email.toLowerCase();
          }
        }
        if (!isPatientOwner && !isEmailOwner) {
          throw new Error('Bạn không có quyền gửi tin nhắn cho ca khám này');
        }
        patientUserIdForMessage = senderId; // luôn gắn theo user hiện tại
      }

      // Tạo message
const message = new ChatMessage({
  appointmentId,
  patientUserId: patientUserIdForMessage, 
  doctorUserId: appointment.replacedDoctorUserId || appointment.doctorUserId, 
  senderId,
  receiverId,
  content: content.trim(),
  status: 'Sent'
});

      await message.save();

      // Populate thông tin để trả về
      await message.populate([
        { path: 'senderId', select: 'fullName email' },
        { path: 'receiverId', select: 'fullName email' },
        { path: 'appointmentId', select: 'appointmentDate status' }
      ]);

      return message;
    } catch (error) {
      console.error('Error in createMessage:', error);
      throw error;
    }
  }

  // Lấy danh sách hội thoại cho Patient hoặc Doctor
  async getConversations(userId, role) {
    try {
      let conversations = [];

      if (role === 'Patient') {
        // Lấy tất cả conversations của patient, group theo appointment và doctor
        // Tin nhắn có thể được gửi bởi patient (senderId=userId) hoặc doctor nhưng thuộc patientUserId=userId
        const messages = await ChatMessage.find({
          $or: [
            { senderId: userId },
            { patientUserId: userId }
          ]
        })
          .populate('receiverId', 'fullName email')
          .populate('appointmentId', 'appointmentDate status')
          .sort({ createdAt: -1 })
          .lean();

        // Group by appointmentId
        const conversationMap = new Map();
        messages.forEach(msg => {
          const appointmentId = msg.appointmentId._id.toString();
          if (!conversationMap.has(appointmentId)) {
            conversationMap.set(appointmentId, {
              appointmentId: msg.appointmentId._id,
              appointmentDate: msg.appointmentId.appointmentDate,
              status: msg.appointmentId.status,
              doctor: {
                _id: msg.receiverId._id,
                fullName: msg.receiverId.fullName,
                email: msg.receiverId.email
              },
              lastMessage: msg,
              unreadCount: 0 // Patient không có unread vì họ là người gửi
            });
          }
        });

        conversations = Array.from(conversationMap.values());
      } else if (role === 'Doctor') {
        // Lấy tất cả conversations của doctor, group theo appointment và patient
        const messages = await ChatMessage.find({
          receiverId: userId
        })
          .populate('senderId', 'fullName email')
          .populate('appointmentId', 'appointmentDate status')
          .sort({ createdAt: -1 })
          .lean();

        // Group by appointmentId
        const conversationMap = new Map();
        messages.forEach(msg => {
          const appointmentId = msg.appointmentId._id.toString();
          if (!conversationMap.has(appointmentId)) {
            // Đếm unread messages
            const unreadCount = messages.filter(m => 
              m.appointmentId._id.toString() === appointmentId && 
              !m.read && 
              m.receiverId._id.toString() === userId.toString()
            ).length;

            conversationMap.set(appointmentId, {
              appointmentId: msg.appointmentId._id,
              appointmentDate: msg.appointmentId.appointmentDate,
              status: msg.appointmentId.status,
              patient: {
                _id: msg.senderId._id,
                fullName: msg.senderId.fullName,
                email: msg.senderId.email
              },
              lastMessage: msg,
              unreadCount
            });
          }
        });

        conversations = Array.from(conversationMap.values());
      }

      return conversations;
    } catch (error) {
      console.error('Error in getConversations:', error);
      throw new Error('Không thể lấy danh sách hội thoại');
    }
  }

  // Lấy tất cả tin nhắn theo appointmentId
 async getMessagesByAppointment(appointmentId, userId, role) {
  try {
    // Validate user có quyền xem messages của appointment này
    const appointment = await Appointment.findById(appointmentId)
      .populate('patientUserId', 'fullName email phone address')
      .populate('customerId', 'fullName email phoneNumber address')
      .populate('doctorUserId', 'fullName email specialization');
    
    if (!appointment) {
      throw new Error('Không tìm thấy ca khám');
    }

    // Kiểm tra quyền truy cập
    if (role === 'Patient') {
      const user = await User.findById(userId).select('email').lean();
      const isPatientOwner = appointment.patientUserId?._id?.toString() === userId.toString();
      let isEmailOwner = false;
      if (appointment.customerId && appointment.customerId.email && user?.email) {
        isEmailOwner = appointment.customerId.email.toLowerCase() === user.email.toLowerCase();
      }
      if (!isPatientOwner && !isEmailOwner) {
        throw new Error('Bạn không có quyền xem tin nhắn này');
      }
    } else if (role === 'Doctor') {
      const doctorId = appointment.replacedDoctorUserId || appointment.doctorUserId._id;
      if (!doctorId || doctorId.toString() !== userId.toString()) {
        throw new Error('Bạn không có quyền xem tin nhắn này');
      }
    } else {
      throw new Error('Vai trò không hợp lệ');
    }

    // Lấy tất cả messages
    const messages = await ChatMessage.find({ appointmentId })
      .populate('senderId', 'fullName email role')
      .populate('receiverId', 'fullName email role')
      .populate('appointmentId', 'appointmentDate status')
      .sort({ createdAt: 1 })
      .lean();

    // Lấy medical record
    const medicalRecord = await MedicalRecord.findOne({ 
      appointmentId: appointmentId 
    }).populate('additionalServiceIds', 'serviceName')
    .lean();

    // Format medical record
    let formattedMedicalRecord = null;
    if (medicalRecord) {
      formattedMedicalRecord = {
        _id: medicalRecord._id,
        appointmentId: medicalRecord.appointmentId,
        
        // Thông tin bệnh nhân
        patient: (() => {
          // Ưu tiên thông tin từ medicalRecord/display nếu có; fallback appointment
          // Với Walk-in, appointment.customerId sẽ là nguồn chính
          const patientFromApt = appointment.customerId || appointment.patientUserId || {};
          return {
            _id: patientFromApt._id,
            fullName: patientFromApt.fullName,
            email: patientFromApt.email,
            phone: patientFromApt.phone || patientFromApt.phoneNumber,
            age: medicalRecord.patientAge,
            address: medicalRecord.address
          };
        })(),
        
        // Thông tin bác sĩ
        doctor: {
          _id: appointment.doctorUserId._id || medicalRecord.doctorUserId,
          fullName: appointment.doctorUserId.fullName,
          email: appointment.doctorUserId.email,
          specialization: appointment.doctorUserId.specialization
        },
        
        // Thông tin ca khám
        appointment: {
          date: appointment.updatedAt,
          status: appointment.status
        },

        // Các dịch vụ sử dụng

        service : medicalRecord.additionalServiceIds?.map(p =>({
          name : p.serviceName
        })),    
        // Thông tin y tế
        medicalInfo: {
          diagnosis: medicalRecord.diagnosis || 'Chưa có chẩn đoán',
          conclusion: medicalRecord.conclusion || 'Không có',
          // nurseNote: medicalRecord.nurseNote || 'Không có ghi chú',
        },
        
        // Đơn thuốc
        prescription: medicalRecord.prescriptions?.map(p => ({
          medicineName: p.medicine,
          dosage: p.dosage,
          duration : p.duration
        })) || [],

        
        // Dịch vụ bổ sung
        // additionalServices: medicalRecord.additionalServiceIds || [],
        
        // Theo dõi sau
        followUp: {
          date: medicalRecord.followUpDate || null,
          appointmentId: medicalRecord.followUpAppointmentId || null
        },
        
        // Thông tin hệ thống
        status: medicalRecord.status,
        createdAt: medicalRecord.createdAt,
        updatedAt: medicalRecord.updatedAt
      };
    }

    // Đánh dấu messages là đã đọc nếu receiver là current user
    if (role === 'Doctor') {
      await ChatMessage.updateMany(
        {
          appointmentId,
          receiverId: userId,
          read: false
        },
        {
          read: true
        }
      );
    }

    return {
      success: true,
      data: {
        medicalRecord: formattedMedicalRecord,
        messages: messages,
        appointment: {
          _id: appointment._id,
          appointmentDate: appointment.appointmentDate,
          status: appointment.status
        }
      },
      message: 'Lấy tin nhắn thành công'
    };
  } catch (error) {
    console.error('Error in getMessagesByAppointment:', error);
    throw error;
  }
}
}

module.exports = new ChatMessageService();