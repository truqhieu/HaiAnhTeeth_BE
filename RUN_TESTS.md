# 🧪 Quick Test Guide - AI Booking System

## 🚀 Quick Start

```bash
# 1. Make sure server is NOT running (tests connect directly to DB)
taskkill /F /IM node.exe /T

# 2. Navigate to backend directory
cd D:\Colaboration\FPT_DoAn\HaiAnhTeeth_BE

# 3. Run the test suite
node test-ai-booking-cases.js
```

---

## ⚙️ Setup (First Time Only)

### 1. Get a Test Patient ID

Option A - From existing user:
```bash
# Connect to MongoDB
mongo

# Switch to database
use healingmedicine

# Find a patient
db.users.findOne({role: 'Patient'})

# Copy the _id
```

Option B - Create a test user in the application

### 2. Update Test File

Edit `test-ai-booking-cases.js` line 10:
```javascript
const TEST_PATIENT_ID = 'YOUR_PATIENT_ID_HERE'; // ⬅️ Replace this
```

---

## 📊 Understanding Test Output

### Success Example
```
✅ TEST CASE 1: Người dùng đổi ý nhiều lần
  💬 User: "Tôi muốn đặt lịch với bác sĩ Dương"
  🤖 Bot: "Bạn đã chọn bác sĩ Dương..."
  ✅ Hệ thống đã chuyển sang bác sĩ Hiếu
```

### Failure Example
```
❌ TEST CASE 9: Duy trì ngữ cảnh
  💬 User: "Ok, đặt cho tôi dịch vụ đó"
  🤖 Bot: "Bạn muốn chọn dịch vụ nào?"
  ❌ Không nhớ context (cần cải thiện)
```

---

## 🎯 Test Case Quick Reference

| # | Test Case | Critical? | Current Status |
|---|-----------|-----------|----------------|
| 1 | Đổi ý nhiều lần | ⚠️ Medium | ⚠️ Partial |
| 2 | Prompt chung chung | ✅ High | ✅ Working |
| 3 | Thời gian tương đối | ⚠️ Medium | ⚠️ Limited |
| 4 | Giờ không hợp lệ | ✅ High | ✅ Working |
| 5 | Slot đã đầy | ✅ High | ✅ Working |
| 6 | One-shot prompt | ✅ High | ⚠️ Partial |
| 7 | Thời gian quá khứ | ✅ High | ⚠️ Limited |
| 8 | Yêu cầu trừu tượng | ⚠️ Medium | ⚠️ Limited |
| 9 | Context retention | ⚠️ Low | ❌ Not Working |
| 10 | Lỗi chính tả | ⚠️ Medium | ⚠️ Partial |

---

## 🔍 What to Look For

### ✅ Good Signs
- All messages in Vietnamese
- No error logs in red
- Logical conversation flow
- Correct information extraction

### ❌ Bad Signs
- Empty responses
- "Vui lòng nhập đầy đủ thông tin" errors
- Repeated questions
- Wrong data extraction

---

## 🐛 Common Issues

### Issue: "Cannot connect to MongoDB"
**Solution:** Make sure MongoDB is running and MONGO_URI is set in `.env`

### Issue: "Patient not found"
**Solution:** Update TEST_PATIENT_ID to a valid patient ID from your database

### Issue: "No doctors found"
**Solution:** Make sure you have doctors with:
- `role: 'Doctor'`
- `status: 'Active'`  
- Valid `workingHours` in Doctor model

### Issue: "No services found"
**Solution:** Make sure you have services with `status: 'Active'`

### Issue: Tests hang/timeout
**Solution:** 
- Stop all running Node processes
- Check MongoDB connection
- Restart the test

---

## 📝 After Running Tests

### 1. Review Results
Look for ❌ marks and identify which cases failed

### 2. Prioritize Fixes
Focus on:
- **Critical (Cases 4, 5, 6, 7):** Must work for production
- **Important (Cases 2, 10):** Improves user experience
- **Nice-to-have (Cases 1, 3, 8, 9):** Future improvements

### 3. Document Issues
For each failed test, note:
- What was expected
- What actually happened
- Potential fix approach

### 4. Clean Up
The test automatically clears context after each case, but you may want to:
```bash
# Clear all test data if needed
mongo healingmedicine --eval "db.appointments.deleteMany({patientUserId: ObjectId('YOUR_TEST_PATIENT_ID')})"
```

---

## 🔄 Continuous Testing

### Before Deployment
```bash
# Run tests
node test-ai-booking-cases.js

# All critical tests should pass:
# - Case 4: Time validation ✅
# - Case 5: Conflict detection ✅
# - Case 6: One-shot booking ✅
# - Case 7: Past date rejection ✅
```

### After Code Changes
Always run tests to ensure:
1. No regressions
2. New features work as expected
3. Edge cases are handled

---

## 💡 Tips

1. **Run tests regularly** - Don't wait until deployment
2. **Add new test cases** - When you find bugs, add tests
3. **Keep test data clean** - Use a separate test database if possible
4. **Document failures** - Track what needs improvement
5. **Celebrate progress** - Even partial passes are progress!

---

## 📚 More Information

- Full documentation: `TEST_CASES_DOCUMENTATION.md`
- Implementation details: `LANGCHAIN_FIXES_SUMMARY.md`
- Quick start guide: `LANGCHAIN_QUICK_START.md`

---

## 🆘 Need Help?

If tests consistently fail:
1. Check `test-ai-booking-cases.js` line-by-line
2. Verify database has required data (doctors, services, schedules)
3. Ensure `.env` is configured correctly
4. Review `aiBookingLangchain.service.js` implementation

**Remember:** Tests are meant to help you find issues early, not to make you feel bad! Every failed test is a chance to improve the system. 🚀

