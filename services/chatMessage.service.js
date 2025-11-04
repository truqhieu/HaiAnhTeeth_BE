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
        patientId: patientId,
        status: { $in: ['Completed', 'Finalized'] }
      })
        .populate('doctorId', 'doctorUserId specialization')
        .populate({
          path: 'doctorId',
          populate: {
            path: 'doctorUserId',
            select: 'fullName email phoneNumber'
          }
        })
        .lean();

      // Lấy danh sách doctor unique
      const doctorMap = new Map();
      
      appointments.forEach(appointment => {
        if (appointment.doctorId && appointment.doctorId.doctorUserId) {
          const doctorUserId = appointment.doctorId.doctorUserId._id.toString();
          
          if (!doctorMap.has(doctorUserId)) {
            doctorMap.set(doctorUserId, {
              doctorId: appointment.doctorId._id,
              doctorUserId: appointment.doctorId.doctorUserId._id,
              fullName: appointment.doctorId.doctorUserId.fullName,
              email: appointment.doctorId.doctorUserId.email,
              phoneNumber: appointment.doctorId.doctorUserId.phoneNumber,
              specialization: appointment.doctorId.specialization,
              appointmentId: appointment._id, // Appointment gần nhất
              appointmentDate: appointment.appointmentDate
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

      // Kiểm tra sender là patient và receiver là doctor của appointment
      if (appointment.patientId.toString() !== senderId.toString()) {
        throw new Error('Bệnh nhân không có quyền chat với ca khám này');
      }

      // Tìm doctor từ appointment
      const doctor = await Doctor.findById(appointment.doctorId);
      if (!doctor || doctor.doctorUserId.toString() !== receiverId.toString()) {
        throw new Error('Bác sĩ không thuộc ca khám này');
      }

      // Tạo message
      const message = new ChatMessage({
        senderId,
        receiverId,
        appointmentId,
        content: content.trim(),
        read: false
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
        const messages = await ChatMessage.find({
          senderId: userId
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
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Không tìm thấy ca khám');
      }

      // Kiểm tra quyền truy cập
      if (role === 'Patient') {
        if (appointment.patientId.toString() !== userId.toString()) {
          throw new Error('Bạn không có quyền xem tin nhắn này');
        }
      } else if (role === 'Doctor') {
        const doctor = await Doctor.findById(appointment.doctorId);
        if (!doctor || doctor.doctorUserId.toString() !== userId.toString()) {
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

      return messages;
    } catch (error) {
      console.error('Error in getMessagesByAppointment:', error);
      throw error;
    }
  }
}

module.exports = new ChatMessageService();