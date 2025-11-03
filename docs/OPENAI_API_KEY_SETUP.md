# 🔑 Hướng dẫn lấy OpenAI API Key và cấu hình

## 📝 Bước 1: Đăng nhập/Create Account OpenAI

1. Truy cập: https://platform.openai.com/
2. Nếu chưa có tài khoản:
   - Click **Sign up** hoặc **Sign in**
   - Đăng ký bằng email hoặc Google/Microsoft account
   - Xác thực email nếu cần

## 🔑 Bước 2: Tạo API Key

1. Sau khi đăng nhập, truy cập: https://platform.openai.com/api-keys
2. Click nút **"Create new secret key"** (+ Create new secret key)
3. Đặt tên cho key (tùy chọn): ví dụ "HaiAnhTeeth AI Booking"
4. Click **"Create secret key"**
5. ⚠️ **QUAN TRỌNG**: Copy key ngay lập tức! OpenAI chỉ hiển thị key một lần duy nhất.
   - Key sẽ có dạng: `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 💰 Bước 3: Nạp tiền (Nếu cần)

**Lưu ý**: OpenAI có free tier nhưng giới hạn. Để demo đồ án, bạn có thể:

1. Truy cập: https://platform.openai.com/account/billing
2. Click **"Add payment method"**
3. Nạp tiền tối thiểu $5 (khoảng 118,000 VNĐ)
   - Hoặc sử dụng free tier nếu còn available

**Free Tier (nếu có)**:
- Một số account mới có $5 free credit
- Hoặc có thể dùng trong giới hạn nhất định

## 📁 Bước 4: Thêm Key vào .env

1. Mở file `.env` trong thư mục `HaiAnhTeeth_BE/HaiAnhTeeth_BE/`

2. Nếu chưa có file `.env`, tạo mới:
   ```bash
   cd HaiAnhTeeth_BE/HaiAnhTeeth_BE
   # Tạo file .env (hoặc copy từ .env.example nếu có)
   ```

3. Thêm dòng sau vào file `.env`:
   ```env
   OPENAI_API_KEY=sk-proj-your-actual-api-key-here
   ```

   **Ví dụ:**
   ```env
   OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
   ```

4. ⚠️ **Lưu ý quan trọng**:
   - **KHÔNG** commit file `.env` lên Git!
   - Đảm bảo `.env` đã có trong `.gitignore`
   - Thay `your-actual-api-key-here` bằng key thực tế của bạn
   - Không có dấu ngoặc kép, không có khoảng trắng

## 🔒 Bước 5: Kiểm tra .gitignore

Đảm bảo file `.env` đã được thêm vào `.gitignore`:

```gitignore
# Environment variables
.env
.env.local
.env.*.local
```

## ✅ Bước 6: Restart Server

Sau khi thêm key vào `.env`:

```bash
# Dừng server nếu đang chạy (Ctrl + C)
# Sau đó start lại:
npm start
# hoặc
node server.js
```

## 🧪 Bước 7: Test API Key

Kiểm tra xem key có hoạt động không bằng cách:

1. Test qua Postman (xem `POSTMAN_COLLECTION_AI_BOOKING.json`)
2. Hoặc test qua Frontend tại `/patient/ai-booking`

Nếu gặp lỗi `401 Unauthorized` hoặc `Invalid API Key`, kiểm tra lại:
- Key đã copy đúng chưa
- Key đã được thêm vào `.env` chưa
- Server đã restart sau khi thêm key chưa

## 📊 Bước 8: Monitor Usage

Theo dõi usage và chi phí:

1. Truy cập: https://platform.openai.com/usage
2. Xem số tokens đã sử dụng
3. Set budget alerts tại: https://platform.openai.com/account/billing/budgets

**Gợi ý**: Set budget $5 hoặc $10 để tránh vượt quá ngân sách.

## 🔐 Security Best Practices

1. ✅ **Không share key** với bất kỳ ai
2. ✅ **Không commit** `.env` lên Git
3. ✅ **Rotate key** định kỳ (mỗi 3-6 tháng)
4. ✅ **Set usage limits** trên OpenAI dashboard
5. ✅ **Monitor usage** thường xuyên

## 💡 Tips cho Student Project

1. **Sử dụng free tier** nếu có
2. **Set budget limit** thấp ($5-10)
3. **Test trước** với ít requests để ước tính chi phí
4. **Document** trong demo rằng bạn đã set budget limit
5. **Có thể dùng** API key cũ (của người khác đã share) cho demo, nhưng không khuyến khích

## ❌ Troubleshooting

### Lỗi: "Invalid API Key"
- Kiểm tra key đã copy đúng chưa
- Kiểm tra không có khoảng trắng hoặc ký tự thừa
- Restart server sau khi thêm key

### Lỗi: "Insufficient quota"
- Nạp thêm tiền vào account
- Hoặc kiểm tra free tier còn không

### Lỗi: "Rate limit exceeded"
- Đợi một chút rồi thử lại
- Hoặc upgrade plan

---

**📌 Lưu ý quan trọng**: 
- OpenAI API key là **sensitive data**, không được share hoặc commit lên public repository!
- Mỗi key có **usage limit** và **rate limit** tùy theo plan của bạn.
- Cho demo đồ án, có thể nạp $5-10 là đủ để test nhiều lần.

