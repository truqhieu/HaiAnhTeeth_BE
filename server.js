const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectMongo = require('./config/connectMongo');
const corsOptions = require('./config/corsConfig');
const paymentMonitor = require('./services/paymentMonitor.service');
const appointmentMonitor = require('./services/appointmentMonitor.service');
const http = require('http');
const { Server } = require('socket.io')
const cookieParser = require('cookie-parser');


require('dotenv').config();


const app = express();




// Cấu hình middleware
// ⭐ GIẢM LOG: Chỉ log trong development, và dùng format ngắn gọn hơn
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // Format ngắn gọn hơn 'combined'
} else {
  app.use(morgan('combined'));
}


// QUAN TRỌNG: Đặt CORS trước các middleware khác
// Nhưng BYPASS CORS cho webhook endpoint (server-to-server)
app.use((req, res, next) => {
  // Log CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('🔄 [CORS] OPTIONS preflight request from:', req.headers.origin);
    console.log('📋 [CORS] Request headers:', JSON.stringify(req.headers, null, 2));
  }

  // Webhook từ Sepay không cần CORS check
  if (req.path.includes('/webhook')) {
    return next();
  }
  // Các route khác vẫn check CORS bình thường
  return cors(corsOptions)(req, res, next);
});


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


app.use(cookieParser());


// Logging middleware để track tất cả requests
// ⭐ GIẢM LOG: Chỉ log chi tiết cho webhook và một số route quan trọng
app.use((req, res, next) => {
  // ⭐ Chỉ log chi tiết cho webhook hoặc route quan trọng
  if (req.originalUrl.includes('/webhook')) {
    const timestamp = new Date().toISOString();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔔 WEBHOOK [${timestamp}] ${req.method} ${req.originalUrl}`);
    console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
  }
  // ⭐ Bỏ qua log chi tiết cho các request thông thường (morgan đã log rồi)

  next();
});


connectMongo();


// ⭐ THÊM: Import cron job cập nhật khuyến mãi hết hạn
require('./config/cron');
console.log('🔔 Khởi động Promotion Expiry Job (chạy hàng ngày lúc 0h00)');




// ⭐ THÊM: Khởi động PaymentMonitor (auto-expire payment sau 15 phút)
console.log('\n🔔 Khởi động Payment Monitor...');
paymentMonitor.startMonitoring(1); // Check mỗi 1 phút
console.log('');


// ⭐ THÊM: Khởi động AppointmentMonitor (auto-expire appointments sau 18:00)
console.log('🔔 Khởi động Appointment Monitor...');
appointmentMonitor.startMonitoring(60); // Check mỗi 60 phút (1 giờ)
console.log('');


// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to HealingMedicine API',
    version: '1.0.0',
    status: 'Server is running successfully'
  });
});


// Test CORS endpoint
app.get('/test-cors', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.get('Origin') || 'No origin header',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});


// API Routes
app.use('/api', require('./routes/index'));




// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      message: 'CORS Error: Origin not allowed',
      origin: req.get('Origin'),
      error: 'This domain is not authorized to access this API'
    });
  }

  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});


// ⭐ Tạo HTTP server từ Express app
const server = http.createServer(app);


// ⭐ Cấu hình Socket.IO với CORS từ .env
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:4200',
        process.env.FRONTEND_URL,
        process.env.FRONTEND_PRODUCTION_URL,
      ].filter(Boolean);

      if (process.env.NODE_ENV === 'development' || !origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST']
  }
});


// ⭐ Inject Socket.IO vào chatMessage controller để gửi notification real-time
const { setSocketIO } = require('./controllers/chatMessage.controller');
setSocketIO(io);


// ⭐ Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('🔌 [Socket.IO] Client connected:', socket.id);


  // Join room theo userId để nhận messages và notifications
  socket.on('join-user-room', (userId) => {
    const roomName = `user_${userId}`;
    socket.join(roomName);
    console.log(`📱 [Socket.IO] User ${userId} joined room: ${roomName}`);
  });


  // Leave room khi disconnect
  socket.on('disconnect', () => {
    console.log('🔌 [Socket.IO] Client disconnected:', socket.id);
  });
});


// 404 handler - phải đặt cuối cùng
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});


// Cấu hình port
const PORT = process.env.PORT || 9999;


// Khởi động server
server.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Server URL: ${process.env.NODE_ENV === 'production'
    ? 'https://haianhteethbe-production.up.railway.app'
    : `http://localhost:${PORT}`}`);
  console.log(`🏥 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${process.env.MONGO_URI ? 'MongoDB Atlas' : 'Not configured'}`);
  console.log('='.repeat(70));

  console.log('\n🔔 WEBHOOK STATUS:');
  console.log(`   ✅ Webhook endpoint: /api/payments/webhook/sepay`);
  console.log(`   ✅ Listening for Sepay notifications`);
  console.log(`   📝 All webhook requests will be logged\n`);

  console.log('📊 MONITORING:');
  console.log(`   → All requests will be logged with details`);
  console.log(`   → Webhook calls will have special logging`);
  console.log(`   → Check logs for payment confirmations\n`);

  console.log('💬 SOCKET.IO STATUS:');
  console.log(`   ✅ Socket.IO server is ready`);
  console.log(`   ✅ Chat notifications enabled`);
  console.log(`   ✅ CORS configured for: ${process.env.FRONTEND_URL || 'localhost ports'}\n`);

  console.log('='.repeat(70) + '\n');
});

