const notificationService = require('../services/notification.service');

const getUserNotifications = async(req,res) =>{
    try {
        const userId = req.user.userId;
        const {page = 1,limit= 10} = req.query;
        const listNotification = await notificationService.getUserNotifications(
            userId,
              { page: Number(page), limit: Number(limit) }
        )

      return res.status(200).json({
      success: true,
      message: 'Lấy danh sách tất cả thông báo thành công',
      data: listNotification
    });

    } catch (error) {
    console.error('❌ Error in getUserNotificaions:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });
    }
}

const markAsRead = async(req,res) =>{
    try {
        const markNotification = await notificationService.markAsRead(req.params.id);

        return res.status(200).json({
            success : true,
            data : markNotification
        })
    } catch (error) {
    console.error('❌ Error in markAsRead:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });        
    }
}

const markAllAsRead = async(req,res) =>{
    try {
        const markAll = await notificationService.markAllAsRead(req.user.userId);
        return res.status(200).json({
            success : true,
            message : 'Đã xem hết các thông báo'
        })
    } catch (error) {
    console.error('❌ Error in markAsRead:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });        
    }
}

const deleteNotification = async(req,res) =>{
    try {
        const result = await notificationService.deleteNotification(req.params.id);
        return res.status(200).json({
            success : true,
            message : 'Đã xóa thông báo thành công'
        })
    } catch (error) {
    console.error('❌ Error in deleteNotificaion:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi máy chủ',
      error: error.message
    });         
    }
}
module.exports = {getUserNotifications, markAsRead, markAllAsRead, deleteNotification}