// services/chatService.js
const ChatMessage = require('../models/chatMessage.model');
const Appointment = require('../models/appointment.model');
const User = require('../models/user.model');
const Doctor = require('../models/doctor.model');

class ChatMessageService {
  // Lấy danh sách bác sĩ đã từng khám cho patient (appointments có status Completed hoặc Finalized)
  async getDoctorsForPatient(patientId) {
    try {
      // Tìm tất cả appointments của patient có status Completed hoặc Finalized
      const appointments = await Appointment.find({
        patientUserId: patientId,
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
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Không tìm thấy ca khám');
      }

      // Kiểm tra appointment có status Completed hoặc Finalized
      if (!['Completed', 'Finalized'].includes(appointment.status)) {
        throw new Error('Chỉ có thể chat với bác sĩ sau khi ca khám hoàn thành');
      }

      // Lấy thông tin doctor và patient của appointment
      const actualDoctorUserId = appointment.replacedDoctorUserId || appointment.doctorUserId;
      const patientUserId = appointment.patientUserId;

      // Validate: người gửi và người nhận phải là patient và doctor của appointment này
      const isPatientSender = patientUserId.toString() === senderId.toString();
      const isDoctorSender = actualDoctorUserId.toString() === senderId.toString();
      const isPatientReceiver = patientUserId.toString() === receiverId.toString();
      const isDoctorReceiver = actualDoctorUserId.toString() === receiverId.toString();

      // Trường hợp hợp lệ:
      // 1. Patient gửi cho Doctor
      // 2. Doctor gửi cho Patient
      const isValidChat = 
        (isPatientSender && isDoctorReceiver) || 
        (isDoctorSender && isPatientReceiver);

      if (!isValidChat) {
        throw new Error('Bạn không có quyền chat trong ca khám này. Chỉ bệnh nhân và bác sĩ của ca khám mới có thể chat với nhau.');
      }

      // Tạo message
const message = new ChatMessage({
  appointmentId,
  patientUserId: appointment.patientUserId, 
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
        // Lấy TẤT CẢ tin nhắn mà patient tham gia (cả gửi và nhận)
        const messages = await ChatMessage.find({
          $or: [
            { senderId: userId },
            { receiverId: userId }
          ]
        })
          .populate('senderId', 'fullName email')
          .populate('receiverId', 'fullName email')
          .populate('appointmentId', 'appointmentDate status')
          .sort({ createdAt: -1 })
          .lean();

        // Group by appointmentId
        const conversationMap = new Map();
        messages.forEach(msg => {
          const appointmentId = msg.appointmentId._id.toString();
          if (!conversationMap.has(appointmentId)) {
            // Xác định doctor (người còn lại không phải patient)
            const doctor = msg.senderId._id.toString() === userId.toString() 
              ? msg.receiverId 
              : msg.senderId;

            // Đếm unread messages (tin nhắn patient nhận được chưa đọc)
            const unreadCount = messages.filter(m => 
              m.appointmentId._id.toString() === appointmentId && 
              !m.read && 
              m.receiverId._id.toString() === userId.toString()
            ).length;

            conversationMap.set(appointmentId, {
              appointmentId: msg.appointmentId._id,
              appointmentDate: msg.appointmentId.appointmentDate,
              status: msg.appointmentId.status,
              doctor: {
                _id: doctor._id,
                fullName: doctor.fullName,
                email: doctor.email
              },
              lastMessage: msg,
              unreadCount
            });
          }
        });

        conversations = Array.from(conversationMap.values());
      } else if (role === 'Doctor') {
        // Lấy TẤT CẢ tin nhắn mà doctor tham gia (cả gửi và nhận)
        const messages = await ChatMessage.find({
          $or: [
            { senderId: userId },
            { receiverId: userId }
          ]
        })
          .populate('senderId', 'fullName email')
          .populate('receiverId', 'fullName email')
          .populate('appointmentId', 'appointmentDate status')
          .sort({ createdAt: -1 })
          .lean();

        // Group by appointmentId
        const conversationMap = new Map();
        messages.forEach(msg => {
          const appointmentId = msg.appointmentId._id.toString();
          if (!conversationMap.has(appointmentId)) {
            // Xác định patient (người còn lại không phải doctor)
            const patient = msg.senderId._id.toString() === userId.toString() 
              ? msg.receiverId 
              : msg.senderId;

            // Đếm unread messages (tin nhắn doctor nhận được chưa đọc)
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
                _id: patient._id,
                fullName: patient.fullName,
                email: patient.email
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
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Không tìm thấy ca khám');
      }

      // Kiểm tra quyền truy cập
     if (role === 'Patient') {
  if (appointment.patientUserId.toString() !== userId.toString()) {
    throw new Error('Bạn không có quyền xem tin nhắn này');
  }
} else if (role === 'Doctor') {
  const doctorId = appointment.replacedDoctorUserId || appointment.doctorUserId;
  if (!doctorId || doctorId.toString() !== userId.toString()) {
    throw new Error('Bạn không có quyền xem tin nhắn này');
  }
} else {
  throw new Error('Role không hợp lệ');
}

      // Lấy tất cả messages
      const messages = await ChatMessage.find({ appointmentId })
        .populate('senderId', 'fullName email role')
        .populate('receiverId', 'fullName email role')
        .populate('appointmentId', 'appointmentDate status')
        .sort({ createdAt: 1 }) // Sắp xếp theo thời gian tăng dần
        .lean();

      // Đánh dấu messages là đã đọc nếu receiver là current user (cả Doctor và Patient)
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

      return messages;
    } catch (error) {
      console.error('Error in getMessagesByAppointment:', error);
      throw error;
    }
  }
}

module.exports = new ChatMessageService();