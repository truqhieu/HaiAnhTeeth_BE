const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectMongo = require('./config/connectMongo');
const corsOptions = require('./config/corsConfig');
const paymentMonitor = require('./services/paymentMonitor.service');
const appointmentMonitor = require('./services/appointmentMonitor.service');
require('dotenv').config();

const app = express();


// Cấu hình middleware
app.use(morgan('combined')); 

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

// Logging middleware để track tất cả requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📥 [${timestamp}] ${req.method} ${req.originalUrl}`);
  console.log(`   From: ${req.ip || req.connection.remoteAddress}`);
  console.log(`   User-Agent: ${req.get('user-agent') || 'N/A'}`);
  
  // Log đặc biệt cho webhook
  if (req.originalUrl.includes('/webhook')) {
    console.log(`🔔 WEBHOOK DETECTED!`);
    console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
  }
  
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
app.listen(PORT, () => {
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
  
  console.log('='.repeat(70) + '\n');
});