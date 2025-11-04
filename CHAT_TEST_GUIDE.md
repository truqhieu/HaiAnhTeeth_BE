# 📋 HƯỚNG DẪN TEST CHAT 1-1

## ⚙️ Prerequisites (Yêu cầu)

1. **Khởi động server:**
   ```bash
   npm run dev
   # hoặc
   node server.js
   ```

2. **Cần có dữ liệu trong database:**
   - ✅ Có ít nhất 1 Patient (User với role = 'Patient')
   - ✅ Có ít nhất 1 Doctor (User với role = 'Doctor')
   - ✅ Có Appointment với:
     - `patientUserId` = Patient's userId
     - `doctorUserId` = Doctor's userId  
     - `status` = 'Completed' hoặc 'Finalized'

3. **Lấy JWT Token:**
   - Đăng nhập để lấy token cho cả Patient và Doctor

---

## 🔐 Bước 1: Lấy JWT Token

### 1.1. Đăng nhập Patient:
```bash
POST http://localhost:9999/api/auth/login
Content-Type: application/json

{
  "email": "patient@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "patient_user_id_here", ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Lưu token:** `PATIENT_TOKEN = "token_here"`

### 1.2. Đăng nhập Doctor:
```bash
POST http://localhost:9999/api/auth/login
Content-Type: application/json

{
  "email": "doctor@example.com",
  "password": "password123"
}
```

**Lưu token:** `DOCTOR_TOKEN = "token_here"`

---

## 📱 Bước 2: Test API Endpoints

### 2.1. Patient xem danh sách bác sĩ đã khám (GET /api/chat/patient/doctors)

```bash
GET http://localhost:9999/api/chat/patient/doctors
Authorization: Bearer {PATIENT_TOKEN}
```

**Response mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "doctor_id",
      "doctorUserId": {
        "_id": "user_id",
        "fullName": "Dr. Nguyễn Văn A",
        "email": "doctor@example.com"
      },
      "lastAppointmentDate": "2024-01-15T10:00:00.000Z"
    }
  ],
  "message": "Lấy danh sách bác sĩ thành công"
}
```

**Kiểm tra:**
- ✅ Chỉ hiển thị doctors có appointment với status 'Completed' hoặc 'Finalized'
- ✅ Không hiển thị doctors chưa từng khám

---

### 2.2. Patient gửi tin nhắn cho Doctor (POST /api/chat/send-message)

```bash
POST http://localhost:9999/api/chat/send-message
Authorization: Bearer {PATIENT_TOKEN}
Content-Type: application/json

{
  "receiverId": "doctor_user_id",
  "appointmentId": "appointment_id_from_completed_appointment",
  "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước"
}
```

**Response mong đợi:**
```json
{
  "success": true,
  "data": {
    "_id": "message_id",
    "senderId": { "_id": "patient_user_id", "fullName": "Bệnh nhân A" },
    "receiverId": { "_id": "doctor_user_id", "fullName": "Dr. Nguyễn Văn A" },
    "appointmentId": { "_id": "appointment_id" },
    "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước",
    "read": false,
    "createdAt": "2024-01-20T10:00:00.000Z"
  },
  "message": "Gửi tin nhắn thành công"
}
```

**Kiểm tra:**
- ✅ Message được lưu vào database
- ✅ Socket.IO gửi notification real-time cho Doctor (xem Bước 3)

---

### 2.3. Doctor xem danh sách hội thoại (GET /api/chat/conversations)

```bash
GET http://localhost:9999/api/chat/conversations
Authorization: Bearer {DOCTOR_TOKEN}
```

**Response mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "appointmentId": "appointment_id",
      "patient": {
        "_id": "patient_user_id",
        "fullName": "Bệnh nhân A"
      },
      "lastMessage": {
        "content": "Xin chào bác sĩ...",
        "createdAt": "2024-01-20T10:00:00.000Z"
      },
      "unreadCount": 1,
      "lastMessageDate": "2024-01-20T10:00:00.000Z"
    }
  ],
  "message": "Lấy danh sách hội thoại thành công"
}
```

**Kiểm tra:**
- ✅ Hiển thị tất cả conversations của doctor
- ✅ Có `unreadCount` cho tin nhắn chưa đọc
- ✅ Sắp xếp theo `lastMessageDate` (mới nhất trước)

---

### 2.4. Doctor xem tin nhắn trong hội thoại (GET /api/chat/messages)

```bash
GET http://localhost:9999/api/chat/messages?appointmentId={appointment_id}
Authorization: Bearer {DOCTOR_TOKEN}
```

**Response mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "message_id",
      "senderId": { "_id": "patient_user_id", "fullName": "Bệnh nhân A" },
      "receiverId": { "_id": "doctor_user_id", "fullName": "Dr. Nguyễn Văn A" },
      "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước",
      "read": true,
      "createdAt": "2024-01-20T10:00:00.000Z"
    }
  ],
  "message": "Lấy tin nhắn thành công"
}
```

**Kiểm tra:**
- ✅ Khi doctor xem messages, tất cả messages được đánh dấu `read = true`
- ✅ Sắp xếp theo `createdAt` (cũ nhất trước)

---

### 2.5. Doctor phản hồi (POST /api/chat/send-message)

```bash
POST http://localhost:9999/api/chat/send-message
Authorization: Bearer {DOCTOR_TOKEN}
Content-Type: application/json

{
  "receiverId": "patient_user_id",
  "appointmentId": "appointment_id",
  "content": "Chào bạn, kết quả khám của bạn bình thường. Cần tôi giải thích thêm gì không?"
}
```

**Response mong đợi:**
```json
{
  "success": true,
  "data": {
    "_id": "message_id",
    "senderId": { "_id": "doctor_user_id", "fullName": "Dr. Nguyễn Văn A" },
    "receiverId": { "_id": "patient_user_id", "fullName": "Bệnh nhân A" },
    "appointmentId": { "_id": "appointment_id" },
    "content": "Chào bạn, kết quả khám của bạn bình thường...",
    "read": false,
    "createdAt": "2024-01-20T10:05:00.000Z"
  },
  "message": "Gửi tin nhắn thành công"
}
```

**Kiểm tra:**
- ✅ Message được lưu với `senderId = Doctor`
- ✅ Socket.IO gửi notification real-time cho Patient

---

### 2.6. Patient xem hội thoại và messages

```bash
# Xem danh sách conversations
GET http://localhost:9999/api/chat/conversations
Authorization: Bearer {PATIENT_TOKEN}

# Xem messages trong conversation
GET http://localhost:9999/api/chat/messages?appointmentId={appointment_id}
Authorization: Bearer {PATIENT_TOKEN}
```

**Kiểm tra:**
- ✅ Patient thấy conversation với doctor
- ✅ Patient thấy tất cả messages đã gửi/nhận

---

## 🔔 Bước 3: Test Socket.IO Real-time Notifications

### 3.1. Setup Socket.IO Client (Node.js example)

Tạo file `test-socket.js`:

```javascript
const io = require('socket.io-client');

// Kết nối Socket.IO
const socket = io('http://localhost:9999', {
  transports: ['websocket']
});

// Lấy userId từ login (giả sử doctor_user_id = "abc123")
const userId = "doctor_user_id"; // Thay bằng userId thực tế

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO:', socket.id);
  
  // Join room của user để nhận notifications
  socket.emit('join-user-room', userId);
  console.log(`📱 Joined room: user_${userId}`);
});

// Lắng nghe notification khi có tin nhắn mới
socket.on('new-message', (data) => {
  console.log('\n🔔 NEW MESSAGE NOTIFICATION:');
  console.log('Notification:', data.notification);
  console.log('Message:', data.message);
  console.log('Sender:', data.senderName);
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from Socket.IO');
});

// Giữ connection sống
setTimeout(() => {
  console.log('Socket test completed');
  socket.disconnect();
}, 60000); // Chạy 60 giây
```

**Chạy test:**
```bash
node test-socket.js
```

### 3.2. Test Flow:

1. **Khởi động Socket.IO client (Doctor):**
   ```bash
   node test-socket.js
   # Hoặc dùng tool như Postman Socket.IO tab, hoặc website: https://amritb.github.io/socketio-client-tool/
   ```

2. **Patient gửi message qua REST API** (Bước 2.2)

3. **Kiểm tra:**
   - ✅ Socket.IO client của Doctor nhận được event `new-message`
   - ✅ Notification text: "Bạn có tin nhắn mới từ bệnh nhân [Tên bệnh nhân]"
   - ✅ Có thông tin message đầy đủ

---

## 🧪 Bước 4: Test Edge Cases & Validation

### 4.1. Test validation errors:

**Gửi message thiếu thông tin:**
```bash
POST http://localhost:9999/api/chat/send-message
Authorization: Bearer {PATIENT_TOKEN}
Content-Type: application/json

{
  "receiverId": "doctor_user_id"
  // Thiếu appointmentId và content
}
```

**Expected:** Status 400, message: "Vui lòng nhập đầy đủ thông tin..."

---

**Gửi message với appointmentId không tồn tại:**
```bash
{
  "receiverId": "doctor_user_id",
  "appointmentId": "invalid_appointment_id",
  "content": "Test message"
}
```

**Expected:** Status 400, message: "Không tìm thấy appointment..."

---

**Gửi message với appointment status chưa Completed/Finalized:**
```bash
{
  "receiverId": "doctor_user_id",
  "appointmentId": "appointment_id_with_pending_status",
  "content": "Test message"
}
```

**Expected:** Status 400, message: "Appointment chưa hoàn thành..."

---

### 4.2. Test authorization:

**Doctor cố gắng xem danh sách doctors:**
```bash
GET http://localhost:9999/api/chat/patient/doctors
Authorization: Bearer {DOCTOR_TOKEN}
```

**Expected:** Status 403, message: "Chỉ bệnh nhân mới có thể xem danh sách bác sĩ"

---

**Gửi message với appointmentId không thuộc về user:**
```bash
POST http://localhost:9999/api/chat/send-message
Authorization: Bearer {PATIENT_TOKEN}
Content-Type: application/json

{
  "receiverId": "other_doctor_user_id",
  "appointmentId": "appointment_id_belonging_to_other_patient",
  "content": "Test message"
}
```

**Expected:** Status 400, message: "Appointment không thuộc về bạn..."

---

## 📝 Checklist Test

- [ ] Patient có thể xem danh sách doctors đã khám (status Completed/Finalized)
- [ ] Patient có thể gửi message cho doctor
- [ ] Doctor nhận notification real-time qua Socket.IO
- [ ] Doctor có thể xem danh sách conversations
- [ ] Doctor có thể xem messages trong conversation
- [ ] Messages được đánh dấu đã đọc khi doctor xem
- [ ] Doctor có thể phản hồi message
- [ ] Patient nhận notification real-time khi doctor reply
- [ ] Patient có thể xem conversations và messages
- [ ] Validation errors hoạt động đúng
- [ ] Authorization checks hoạt động đúng
- [ ] Unread count hiển thị đúng

---

## 🛠️ Tools để Test

1. **API Testing:**
   - Postman
   - Insomnia
   - cURL
   - Thunder Client (VS Code extension)

2. **Socket.IO Testing:**
   - https://amritb.github.io/socketio-client-tool/
   - Postman Socket.IO tab (nếu có)
   - Custom Node.js script (như ví dụ ở trên)

---

## 📞 Support

Nếu gặp lỗi, kiểm tra:
1. ✅ Server đã khởi động chưa?
2. ✅ MongoDB đã kết nối chưa?
3. ✅ JWT Token còn hợp lệ không?
4. ✅ Appointment có status 'Completed' hoặc 'Finalized' không?
5. ✅ Socket.IO server đã sẵn sàng? (Check console log)
