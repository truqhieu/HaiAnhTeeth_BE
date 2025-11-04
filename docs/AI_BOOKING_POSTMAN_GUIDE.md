# 📮 Hướng dẫn Test AI Booking API với Postman

## 🔗 Endpoint

```
POST /api/appointments/ai-create
```

## 🔐 Authentication

**Required**: `Authorization: Bearer <token>`

**Role**: Chỉ user có role `Patient` mới được phép sử dụng.

## 📋 Request Body

```json
{
  "prompt": "string (required)",
  "appointmentFor": "self | other (optional, default: 'self')"
}
```

### Parameters:
- **`prompt`** (required): Yêu cầu đặt lịch bằng tiếng Việt tự nhiên
- **`appointmentFor`** (optional): 
  - `"self"` - Đặt cho chính mình (default)
  - `"other"` - Đặt cho người khác

## 📝 Các mẫu Prompt để test

### ✅ Prompt đầy đủ thông tin:
```json
{
  "prompt": "Đặt lịch khám răng với bác sĩ Huy ngày mai lúc 9h sáng",
  "appointmentFor": "self"
}
```

### ✅ Prompt chỉ có dịch vụ và ngày:
```json
{
  "prompt": "Tôi muốn đặt lịch tư vấn nha khoa vào thứ 3 tuần sau"
}
```

### ✅ Prompt có ngày và giờ cụ thể:
```json
{
  "prompt": "Đặt lịch nhổ răng ngày 15/11 lúc 14:30"
}
```

### ✅ Prompt chỉ có timePreference:
```json
{
  "prompt": "Khám răng với bác sĩ Huy vào buổi sáng ngày mai"
}
```

### ✅ Prompt ngắn gọn:
```json
{
  "prompt": "Tôi muốn khám răng sáng mai"
}
```

### ✅ Đặt lịch cho người khác:
```json
{
  "prompt": "Đặt lịch khám răng cho tôi vào ngày mai lúc 10h sáng",
  "appointmentFor": "other"
}
```

## ✅ Response Success (200)

```json
{
  "success": true,
  "message": "Đặt lịch thành công!",
  "data": {
    "appointmentId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "appointment": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "patientUserId": "...",
      "doctorUserId": "...",
      "serviceId": "...",
      "status": "PendingPayment",
      "finalPrice": 500000,
      // ... other appointment fields
    },
    "parsedInfo": {
      "serviceName": "Đã xác định",
      "doctorName": "Đã xác định",
      "date": "2025-11-03",
      "time": "09:00",
      "confidence": "high"
    }
  }
}
```

## ❌ Response Error Cases

### 1. Thiếu prompt (400)
```json
{
  "success": false,
  "message": "Vui lòng nhập yêu cầu đặt lịch (ví dụ: \"Đặt lịch khám răng với bác sĩ Huy ngày mai lúc 9h sáng\")"
}
```

### 2. Chưa đăng nhập (401)
```json
{
  "success": false,
  "message": "Vui lòng đăng nhập để sử dụng tính năng đặt lịch tự động"
}
```

### 3. Không tìm thấy dịch vụ/slot (400)
```json
{
  "success": false,
  "message": "Không tìm thấy dịch vụ phù hợp. Vui lòng chỉ định rõ dịch vụ bạn muốn đặt lịch."
}
```

hoặc

```json
{
  "success": false,
  "message": "Không tìm thấy slot khả dụng vào ngày này"
}
```

### 4. Lỗi server (500)
```json
{
  "success": false,
  "message": "Đã xảy ra lỗi khi đặt lịch tự động. Vui lòng thử lại."
}
```

## 🚀 Cách test trong Postman

### Bước 1: Import Collection
1. Mở Postman
2. Click **Import**
3. Chọn file `POSTMAN_COLLECTION_AI_BOOKING.json`
4. Collection sẽ xuất hiện trong sidebar

### Bước 2: Lấy Token
1. Chạy request **"1. Login (Lấy token)"**
2. Token sẽ tự động được lưu vào biến `{{token}}`
3. Hoặc copy token từ response và paste vào variable `token`

### Bước 3: Test các request
1. Chọn bất kỳ request nào từ **"2. AI Booking"** đến **"7. AI Booking"**
2. Click **Send**
3. Kiểm tra response

### Bước 4: Test Error Cases
- Request **"8. AI Booking - Lỗi: Thiếu prompt"**: Không có prompt → 400
- Request **"9. AI Booking - Lỗi: Không có token"**: Không có Authorization → 401

## ⚙️ Cấu hình biến môi trường

### Development:
```
baseUrl = http://localhost:3000/api
```

### Production:
```
baseUrl = https://your-domain.com/api
```

## 📊 Debug Tips

1. **Check token**: Đảm bảo token còn hợp lệ và chưa hết hạn
2. **Check role**: User phải có role `Patient`
3. **Check services**: Đảm bảo có services trong database với `status: 'Active'`
4. **Check doctors**: Đảm bảo có doctors có lịch làm việc
5. **Check AI response**: Xem console log để biết AI parse được gì

## 🔍 Xem logs

Trong backend console, bạn sẽ thấy:
```
🤖 [AI Booking] User prompt: ...
🤖 [AI Booking] Patient ID: ...
🤖 [AI] Parsed booking data: {...}
```

---

**Lưu ý**: 
- Cần có `OPENAI_API_KEY` trong `.env` để API hoạt động
- AI sẽ tự động parse prompt và tìm slot phù hợp
- Nếu không tìm thấy slot, API sẽ trả về lỗi rõ ràng

