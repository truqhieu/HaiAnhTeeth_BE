/**
 * Script test Socket.IO cho Chat Feature
 * 
 * Usage:
 * 1. Cài đặt: npm install socket.io-client
 * 2. Chạy: node test-socket.js <userId>
 *    Ví dụ: node test-socket.js 507f1f77bcf86cd799439011
 */

const io = require('socket.io-client');

// Lấy userId từ command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('❌ Vui lòng cung cấp userId:');
  console.log('   Usage: node test-socket.js <userId>');
  console.log('   Example: node test-socket.js 507f1f77bcf86cd799439011');
  process.exit(1);
}

// Kết nối Socket.IO
const serverUrl = process.env.SERVER_URL || 'http://localhost:9999';
console.log(`🔌 Đang kết nối đến ${serverUrl}...\n`);

const socket = io(serverUrl, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5
});

// Event: Kết nối thành công
socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO');
  console.log(`   Socket ID: ${socket.id}\n`);
  
  // Join room của user để nhận notifications
  socket.emit('join-user-room', userId);
  console.log(`📱 Đã join room: user_${userId}`);
  console.log('   Đang chờ nhận notifications...\n');
  console.log('='.repeat(60));
});

// Event: Lắng nghe notification khi có tin nhắn mới
socket.on('new-message', (data) => {
  console.log('\n🔔 NEW MESSAGE NOTIFICATION');
  console.log('='.repeat(60));
  console.log('📬 Notification:', data.notification);
  console.log('👤 Sender:', data.senderName);
  console.log('\n📝 Message Details:');
  console.log('   Message ID:', data.message._id);
  console.log('   Content:', data.message.content);
  console.log('   From:', data.message.senderId);
  console.log('   To:', data.message.receiverId);
  console.log('   Appointment:', data.message.appointmentId);
  console.log('   Read:', data.message.read ? 'Yes' : 'No');
  console.log('   Created:', new Date(data.message.createdAt).toLocaleString('vi-VN'));
  console.log('='.repeat(60));
});

// Event: Lỗi kết nối
socket.on('connect_error', (error) => {
  console.error('❌ Connection Error:', error.message);
  console.log('   Đang thử kết nối lại...');
});

// Event: Kết nối lại thành công
socket.on('reconnect', (attemptNumber) => {
  console.log(`✅ Reconnected after ${attemptNumber} attempts`);
  socket.emit('join-user-room', userId);
  console.log(`📱 Đã join lại room: user_${userId}`);
});

// Event: Ngắt kết nối
socket.on('disconnect', (reason) => {
  console.log(`\n❌ Disconnected: ${reason}`);
  
  if (reason === 'io server disconnect') {
    // Server đã ngắt kết nối, cần reconnect manually
    console.log('   Server đã ngắt kết nối, đang thử kết nối lại...');
    socket.connect();
  }
});

// Event: Lỗi từ server
socket.on('error', (error) => {
  console.error('❌ Socket Error:', error);
});

// Xử lý khi nhấn Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Đang ngắt kết nối...');
  socket.disconnect();
  process.exit(0);
});

// Giữ script chạy
console.log('\n💡 Nhấn Ctrl+C để dừng\n');
