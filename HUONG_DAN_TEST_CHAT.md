# 📱 HƯỚNG DẪN TEST CHAT 1-1

## 🛠️ Chuẩn bị

1. **Khởi động server:**
   ```bash
   npm run dev
   # Server chạy ở: http://localhost:9999
   ```

2. **Cần có dữ liệu:**
   - ✅ 1 Patient account (role = 'Patient')
   - ✅ 1 Doctor account (role = 'Doctor')
   - ✅ 1 Appointment với status = 'Completed' hoặc 'Finalized'
   - ✅ Appointment có `patientUserId` = Patient's userId
   - ✅ Appointment có `doctorUserId` = Doctor's userId

---

## 📮 PHẦN 1: TEST BẰNG POSTMAN (REST API)

### Bước 1: Lấy JWT Token

#### 1.1. Login Patient

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:9999/api/auth/login`
- **Headers:**
  ```
  Content-Type: application/json
  ```
- **Body (JSON):**
  ```json
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
    "user": {
      "id": "670abc123def456789012345",
      "fullName": "Nguyễn Văn A",
      "email": "patient@example.com",
      "role": "Patient"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**💾 Lưu lại:**
- `PATIENT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
- `PATIENT_USER_ID = "670abc123def456789012345"`

---

#### 1.2. Login Doctor

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:9999/api/auth/login`
- **Headers:**
  ```
  Content-Type: application/json
  ```
- **Body (JSON):**
  ```json
  {
    "email": "doctor@example.com",
    "password": "password123"
  }
  ```

**💾 Lưu lại:**
- `DOCTOR_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
- `DOCTOR_USER_ID = "670def456abc789012345678"`

---

### Bước 2: Patient xem danh sách bác sĩ đã khám

**Request:**
- **Method:** `GET`
- **URL:** `http://localhost:9999/api/chat/patient/doctors`
- **Headers:**
  ```
  Authorization: Bearer {PATIENT_TOKEN}
  ```

**Response mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "670doctor123...",
      "doctorUserId": {
        "_id": "670def456abc789012345678",
        "fullName": "Dr. Trần Thị B",
        "email": "doctor@example.com"
      },
      "lastAppointmentDate": "2024-01-15T10:00:00.000Z"
    }
  ],
  "message": "Lấy danh sách bác sĩ thành công"
}
```

**✅ Kiểm tra:**
- Chỉ hiển thị doctors có appointment với status 'Completed' hoặc 'Finalized'
- Có thông tin doctor đầy đủ (tên, email)

---

### Bước 3: Patient gửi tin nhắn cho Doctor

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:9999/api/chat/send-message`
- **Headers:**
  ```
  Authorization: Bearer {PATIENT_TOKEN}
  Content-Type: application/json
  ```
- **Body (JSON):**
  ```json
  {
    "receiverId": "670def456abc789012345678",
    "appointmentId": "670appointment123...",
    "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước"
  }
  ```

**Response mong đợi:**
```json
{
  "success": true,
  "data": {
    "_id": "670message123...",
    "senderId": {
      "_id": "670abc123def456789012345",
      "fullName": "Nguyễn Văn A"
    },
    "receiverId": {
      "_id": "670def456abc789012345678",
      "fullName": "Dr. Trần Thị B"
    },
    "appointmentId": {
      "_id": "670appointment123..."
    },
    "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước",
    "read": false,
    "createdAt": "2024-01-20T10:00:00.000Z"
  },
  "message": "Gửi tin nhắn thành công"
}
```

**💾 Lưu lại:**
- `APPOINTMENT_ID = "670appointment123..."`

**✅ Kiểm tra:**
- Message được lưu vào database
- Socket.IO sẽ gửi notification real-time cho Doctor (xem Phần 2)

---

### Bước 4: Doctor xem danh sách hội thoại

**Request:**
- **Method:** `GET`
- **URL:** `http://localhost:9999/api/chat/conversations`
- **Headers:**
  ```
  Authorization: Bearer {DOCTOR_TOKEN}
  ```

**Response mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "appointmentId": "670appointment123...",
      "patient": {
        "_id": "670abc123def456789012345",
        "fullName": "Nguyễn Văn A"
      },
      "lastMessage": {
        "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước",
        "createdAt": "2024-01-20T10:00:00.000Z"
      },
      "unreadCount": 1,
      "lastMessageDate": "2024-01-20T10:00:00.000Z"
    }
  ],
  "message": "Lấy danh sách hội thoại thành công"
}
```

**✅ Kiểm tra:**
- Hiển thị conversations của doctor
- Có `unreadCount` = 1 (tin nhắn chưa đọc)
- Có thông tin patient và last message

---

### Bước 5: Doctor xem tin nhắn trong hội thoại

**Request:**
- **Method:** `GET`
- **URL:** `http://localhost:9999/api/chat/messages?appointmentId={APPOINTMENT_ID}`
  - Thay `{APPOINTMENT_ID}` bằng ID thực tế từ Bước 3
- **Headers:**
  ```
  Authorization: Bearer {DOCTOR_TOKEN}
  ```

**Response mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "670message123...",
      "senderId": {
        "_id": "670abc123def456789012345",
        "fullName": "Nguyễn Văn A"
      },
      "receiverId": {
        "_id": "670def456abc789012345678",
        "fullName": "Dr. Trần Thị B"
      },
      "content": "Xin chào bác sĩ, em muốn hỏi về kết quả khám lần trước",
      "read": true,
      "createdAt": "2024-01-20T10:00:00.000Z"
    }
  ],
  "message": "Lấy tin nhắn thành công"
}
```

**✅ Kiểm tra:**
- Messages được đánh dấu `read = true` khi doctor xem
- Sắp xếp theo thời gian (cũ nhất trước)

---

### Bước 6: Doctor phản hồi tin nhắn

**Request:**
- **Method:** `POST`
- **URL:** `http://localhost:9999/api/chat/send-message`
- **Headers:**
  ```
  Authorization: Bearer {DOCTOR_TOKEN}
  Content-Type: application/json
  ```
- **Body (JSON):**
  ```json
  {
    "receiverId": "670abc123def456789012345",
    "appointmentId": "670appointment123...",
    "content": "Chào bạn, kết quả khám của bạn bình thường. Cần tôi giải thích thêm gì không?"
  }
  ```

**✅ Kiểm tra:**
- Message được lưu với `senderId = Doctor`
- Socket.IO sẽ gửi notification real-time cho Patient (xem Phần 2)

---

## 🌐 PHẦN 2: TEST SOCKET.IO BẰNG TRÌNH DUYỆT

### Cách 1: Dùng Socket.IO Client Tool (Dễ nhất)

1. **Mở trình duyệt và vào:**
   ```
   https://amritb.github.io/socketio-client-tool/
   ```

2. **Cấu hình kết nối:**
   - **Socket.IO Version:** `4.x`
   - **Server URL:** `http://localhost:9999`
   - **Transport:** `websocket`
   - Click **"Connect"**

3. **Join room để nhận notifications:**
   - Chọn tab **"Emit"**
   - **Event Name:** `join-user-room`
   - **Data:** `"670def456abc789012345678"` (Doctor's userId)
   - Click **"Emit"**

4. **Lắng nghe event `new-message`:**
   - Chọn tab **"Listen"**
   - **Event Name:** `new-message`
   - Click **"Start Listening"**

5. **Test:**
   - Gửi message từ Patient qua Postman (Bước 3 ở Phần 1)
   - Xem tab **"Messages"** → Sẽ thấy notification:
   ```json
   {
     "notification": "Bạn có tin nhắn mới từ bệnh nhân Nguyễn Văn A",
     "senderName": "Nguyễn Văn A",
     "message": {
       "_id": "...",
       "content": "Xin chào bác sĩ...",
       ...
     }
   }
   ```

---

### Cách 2: Tạo file HTML test (Nếu muốn test trên local)

Tạo file `test-socket.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Socket.IO Chat Test</title>
    <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
</head>
<body>
    <h1>Socket.IO Chat Test</h1>
    
    <div>
        <label>Server URL:</label>
        <input type="text" id="serverUrl" value="http://localhost:9999" />
        <button onclick="connect()">Connect</button>
        <button onclick="disconnect()">Disconnect</button>
    </div>
    
    <div style="margin-top: 20px;">
        <label>User ID (để join room):</label>
        <input type="text" id="userId" placeholder="Nhập userId của Doctor" />
        <button onclick="joinRoom()">Join Room</button>
    </div>
    
    <div style="margin-top: 20px;">
        <h3>Notifications:</h3>
        <div id="notifications" style="border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: auto;"></div>
    </div>

    <script>
        let socket = null;

        function connect() {
            const serverUrl = document.getElementById('serverUrl').value;
            socket = io(serverUrl, {
                transports: ['websocket']
            });

            socket.on('connect', () => {
                addNotification('✅ Connected to Socket.IO: ' + socket.id, 'success');
            });

            socket.on('new-message', (data) => {
                addNotification('🔔 NEW MESSAGE NOTIFICATION', 'info');
                addNotification('Notification: ' + data.notification, 'info');
                addNotification('Sender: ' + data.senderName, 'info');
                addNotification('Content: ' + data.message.content, 'message');
                console.log('New message:', data);
            });

            socket.on('disconnect', () => {
                addNotification('❌ Disconnected', 'error');
            });

            socket.on('connect_error', (error) => {
                addNotification('❌ Connection Error: ' + error.message, 'error');
            });
        }

        function disconnect() {
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        }

        function joinRoom() {
            if (!socket || !socket.connected) {
                alert('Vui lòng connect trước!');
                return;
            }
            
            const userId = document.getElementById('userId').value;
            if (!userId) {
                alert('Vui lòng nhập User ID!');
                return;
            }

            socket.emit('join-user-room', userId);
            addNotification('📱 Joined room: user_' + userId, 'success');
        }

        function addNotification(message, type = 'info') {
            const div = document.getElementById('notifications');
            const time = new Date().toLocaleTimeString('vi-VN');
            const color = type === 'success' ? 'green' : type === 'error' ? 'red' : type === 'message' ? 'blue' : 'black';
            div.innerHTML += `<p style="color: ${color};">[${time}] ${message}</p>`;
            div.scrollTop = div.scrollHeight;
        }
    </script>
</body>
</html>
```

**Cách dùng:**
1. Mở file `test-socket.html` trong trình duyệt
2. Click **"Connect"**
3. Nhập Doctor's userId vào ô **"User ID"**
4. Click **"Join Room"**
5. Gửi message từ Patient qua Postman
6. Xem notifications hiển thị trong trang

---

## 📋 CHECKLIST TEST

### API Endpoints (Postman):
- [ ] Patient login thành công
- [ ] Doctor login thành công
- [ ] Patient xem danh sách doctors đã khám
- [ ] Patient gửi message cho doctor
- [ ] Doctor xem danh sách conversations
- [ ] Doctor xem messages trong conversation
- [ ] Messages được đánh dấu đã đọc
- [ ] Doctor phản hồi message
- [ ] Patient xem conversations và messages

### Socket.IO (Trình duyệt):
- [ ] Kết nối Socket.IO thành công
- [ ] Join room thành công
- [ ] Nhận notification khi Patient gửi message
- [ ] Notification text đúng: "Bạn có tin nhắn mới từ bệnh nhân [Tên]"
- [ ] Nhận notification khi Doctor reply

---

## 🐛 Troubleshooting

### Lỗi: "Cannot GET /api/chat/..."
- ✅ Kiểm tra server đã khởi động chưa
- ✅ Kiểm tra route `/api/chat` đã được register trong `routes/index.js`

### Lỗi: "Unauthorized" hoặc "Invalid token"
- ✅ Kiểm tra token còn hợp lệ không (token hết hạn sau 7 ngày)
- ✅ Kiểm tra header `Authorization: Bearer {token}` đúng format
- ✅ Login lại để lấy token mới

### Lỗi: "Appointment không tồn tại"
- ✅ Kiểm tra appointmentId có đúng không
- ✅ Kiểm tra appointment có status 'Completed' hoặc 'Finalized' không

### Socket.IO không nhận được notification:
- ✅ Kiểm tra đã `join-user-room` với đúng userId chưa
- ✅ Kiểm tra console server có log: `📱 [Socket.IO] User xxx joined room: user_xxx`
- ✅ Kiểm tra receiverId trong message có đúng với userId đã join room không

---

## 💡 Tips

1. **Postman Environment Variables:**
   - Tạo Environment trong Postman
   - Lưu `PATIENT_TOKEN`, `DOCTOR_TOKEN`, `APPOINTMENT_ID` vào variables
   - Dùng `{{PATIENT_TOKEN}}` trong requests

2. **Test nhanh:**
   - Mở 2 tab Postman: 1 cho Patient, 1 cho Doctor
   - Mở Socket.IO client tool để test real-time

3. **Debug:**
   - Xem console server để debug
   - Logs sẽ hiển thị mọi request và Socket.IO events
