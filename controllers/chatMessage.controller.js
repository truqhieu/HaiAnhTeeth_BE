const chatMessageService = require('../services/chatMessage.service');
const User = require('../models/user.model');

// Socket.IO sẽ được inject từ server.js
let io = null;
const setSocketIO = (socketIO) => {
  io = socketIO;
};

// Lấy danh sách bác sĩ đã từng khám cho patient
const getDoctorsForPatient = async (req, res) => {
  try {
    const patientId = req.user.userId;

    // Kiểm tra role
    if (req.user.role !== 'Patient') {
      return res.status(403).json({
        success: false,
        message: 'Chỉ bệnh nhân mới có thể xem danh sách bác sĩ'
      });
    }

    const doctors = await chatMessageService.getDoctorsForPatient(patientId);

    res.status(200).json({
      success: true,
      data: doctors,
      message: 'Lấy danh sách bác sĩ thành công'
    });
  } catch (error) {
    console.error('Error in getDoctorsForPatient controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy danh sách bác sĩ'
    });
  }
};

// Gửi tin nhắn
const sendMessage = async (req, res) => {
  try {
    const { receiverId, appointmentId, content } = req.body;
    const senderId = req.user.userId;
    const role = req.user.role;

    // Validate input
    if (!receiverId || !appointmentId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập đầy đủ thông tin: receiverId, appointmentId, content'
      });
    }

    // Kiểm tra content không rỗng
    if (!content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nội dung tin nhắn không được để trống'
      });
    }

    // Tạo message
    const message = await chatMessageService.createMessage({
      senderId,
      receiverId,
      appointmentId,
      content
    });

    // Lấy thông tin sender để gửi notification
    const sender = await User.findById(senderId).select('fullName');

    // Gửi notification real-time cho receiver qua Socket.IO
    if (io) {
      // Nếu sender là Patient, gửi notification cho Doctor
      if (role === 'Patient') {
        io.to(`user_${receiverId}`).emit('new-message', {
          message: {
            _id: message._id,
            senderId: message.senderId,
            receiverId: message.receiverId,
            appointmentId: message.appointmentId,
            content: message.content,
            read: message.read,
            createdAt: message.createdAt
          },
          notification: `Bạn có tin nhắn mới từ bệnh nhân ${sender.fullName}`,
          senderName: sender.fullName
        });
      } else if (role === 'Doctor') {
        // Nếu sender là Doctor, gửi notification cho Patient
        io.to(`user_${receiverId}`).emit('new-message', {
          message: {
            _id: message._id,
            senderId: message.senderId,
            receiverId: message.receiverId,
            appointmentId: message.appointmentId,
            content: message.content,
            read: message.read,
            createdAt: message.createdAt
          },
          notification: `Bạn có tin nhắn mới từ bác sĩ ${sender.fullName}`,
          senderName: sender.fullName
        });
      }
    }

    res.status(201).json({
      success: true,
      data: message,
      message: 'Gửi tin nhắn thành công'
    });
  } catch (error) {
    console.error('Error in sendMessage controller:', error);
    
    // Xử lý các lỗi validation
    if (error.message.includes('Thiếu thông tin') ||
        error.message.includes('Không tìm thấy') ||
        error.message.includes('không có quyền') ||
        error.message.includes('không thuộc') ||
        error.message.includes('chưa hoàn thành')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Không thể gửi tin nhắn'
    });
  }
};

// Lấy danh sách hội thoại
const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    // Chỉ Patient và Doctor mới có thể xem conversations
    if (!['Patient', 'Doctor'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Chỉ bệnh nhân và bác sĩ mới có thể xem hội thoại'
      });
    }

    const conversations = await chatMessageService.getConversations(userId, role);

    res.status(200).json({
      success: true,
      data: conversations,
      message: 'Lấy danh sách hội thoại thành công'
    });
  } catch (error) {
    console.error('Error in getConversations controller:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy danh sách hội thoại'
    });
  }
};

// Lấy tin nhắn theo appointmentId
const getMessages = async (req, res) => {
  try {
    const { appointmentId } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp appointmentId'
      });
    }

    // Chỉ Patient và Doctor mới có thể xem messages
    // if (!['Patient', 'Doctor'].includes(role)) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Chỉ bệnh nhân và bác sĩ mới có thể xem tin nhắn'
    //   });
    // }

    const messages = await chatMessageService.getMessagesByAppointment(appointmentId, userId, role);

    res.status(200).json({
      success: true,
      data: messages,
      message: 'Lấy tin nhắn thành công'
    });
  } catch (error) {
    console.error('Error in getMessages controller:', error);
    
    // Xử lý các lỗi validation
    if (error.message.includes('Không tìm thấy') ||
        error.message.includes('không có quyền') ||
        error.message.includes('không hợp lệ')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Không thể lấy tin nhắn'
    });
  }
};

module.exports = {
  getDoctorsForPatient,
  sendMessage,
  getConversations,
  getMessages,
  setSocketIO
};
