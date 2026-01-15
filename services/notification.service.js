const Appointment = require('../models/appointment.model');
const LeaveRequest = require('../models/leaveRequest.model');
const Notification = require('../models/notificaiton.model');

class NotificationService {
  /**
   * Tạo thông báo cho cả Appointment và LeaveRequest
   */
  async createNotification(data) {
    try {
      const {
        userId,
        createdByUserId = null,
        title,
        message,
        relatedAppointmentId = null,
        leaveRequestId = null,
        link = null,
      } = data;

      // ✅ Validate: Phải có userId và title
      if (!userId) throw new Error('userId không được để trống');
      if (!title) throw new Error('Tiêu đề thông báo không được để trống');
      if (!message) throw new Error('Nội dung thông báo không được để trống');

      // ✅ Validate: Phải có ít nhất 1 trong 2 (appointmentId hoặc leaveRequestId)
      if (!relatedAppointmentId && !leaveRequestId) {
        throw new Error('Phải chỉ định appointmentId hoặc leaveRequestId');
      }

      // ✅ Kiểm tra Appointment nếu có
      if (relatedAppointmentId) {
        const appointment = await Appointment.findById(relatedAppointmentId);
        if (!appointment) {
          throw new Error('Không tìm thấy lịch khám bệnh');
        }
      }

      // ✅ Kiểm tra LeaveRequest nếu có
      if (leaveRequestId) {
        const leaveRequest = await LeaveRequest.findById(leaveRequestId);
        if (!leaveRequest) {
          throw new Error('Không tìm thấy yêu cầu nghỉ phép');
        }
      }

      // ✅ Tạo thông báo
      const notification = new Notification({
        userId,
        createdByUserId: createdByUserId || null,
        title,
        message,
        isRead: false,
        relatedAppointmentId: relatedAppointmentId || null,
        leaveRequestId: leaveRequestId || null,
        link: link || null,
        sentAt: new Date(),
      });

      await notification.save();

      return notification;
    } catch (error) {
      console.error('❌ createNotification error:', error.message);
      throw error;
    }
  }

  /**
   * Lấy tất cả thông báo của user
   */
  async getUserNotifications(userId, data = {}) {
    try {
      const { page = 1, limit = 10, isRead = null } = data;
      const skip = (page - 1) * limit;

      const query = { userId };
      if (isRead !== null) query.isRead = isRead;

const notifications = await Notification.find(query)
  .select('title message isRead link sentAt relatedAppointmentId leaveRequestId') 
  .populate('relatedAppointmentId','')
  .populate('leaveRequestId')
  .populate('createdByUserId', 'fullName')
  .sort({ sentAt: -1 })
  .skip(skip)
  .limit(limit);


      const total = await Notification.countDocuments(query);

return {
  data: notifications.map(n => ({
    id: n._id,
    title: n.title,
    message: n.message,
    link: n.link,
    isRead: n.isRead,
    sentAt: n.sentAt,
    appointmentId: n.relatedAppointmentId?._id || null,
  })),
  total,
  page,
  pages: Math.ceil(total / limit),
};

    } catch (error) {
      console.error('❌ getUserNotifications error:', error.message);
      throw error;
    }
  }

  /**
   * Đánh dấu thông báo đã đọc và trả về link chuyển hướng
   */
  async markAsRead(notificationId) {
    try {
      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { isRead: true },
        { new: true }
      ).populate('relatedAppointmentId', '_id')
       .populate('leaveRequestId', '_id');

      if (!notification) throw new Error('Thông báo không tồn tại');

      // ✅ Return link để frontend chuyển hướng
      return {
        notification,
        redirectLink: notification.link
      };
    } catch (error) {
      console.error('❌ markAsRead error:', error.message);
      throw error;
    }
  }

  /**
   * Xóa thông báo
   */
  async deleteNotification(notificationId) {
    try {
      const notification = await Notification.findByIdAndDelete(notificationId);
      if (!notification) throw new Error('Thông báo không tồn tại');
      return { message: 'Đã xóa thông báo thành công' };
    } catch (error) {
      console.error('❌ deleteNotification error:', error.message);
      throw error;
    }
  }

  /**
   * Đánh dấu tất cả thông báo của user đã đọc
   */
  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true }
      );
      return result;
    } catch (error) {
      console.error('❌ markAllAsRead error:', error.message);
      throw error;
    }
  }
}

module.exports = new NotificationService();