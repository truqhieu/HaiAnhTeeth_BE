/**
 * AI Booking Comprehensive Test Cases
 * Tests all edge cases and user scenarios for the LangChain-based booking system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { AIBookingLangchainService } = require('./services/aiBookingLangchain.service');

// Test configuration
const TEST_PATIENT_ID = '691fe21b4b0b8b308033efab'; // Replace with a valid test patient ID
const aiBookingService = new AIBookingLangchainService();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(caseNumber, title) {
  console.log('\n' + '='.repeat(80));
  log(`📋 TEST CASE ${caseNumber}: ${title}`, colors.bright + colors.cyan);
  console.log('='.repeat(80));
}

function logStep(step, message) {
  log(`  ${step}. ${message}`, colors.yellow);
}

function logResult(success, message) {
  const icon = success ? '✅' : '❌';
  const color = success ? colors.green : colors.red;
  log(`  ${icon} ${message}`, color);
}

async function sendMessage(prompt, conversationHistory = []) {
  try {
    log(`  💬 User: "${prompt}"`, colors.blue);
    
    const result = await aiBookingService.createAppointmentFromAI(
      prompt,
      TEST_PATIENT_ID,
      'self',
      conversationHistory
    );
    
    // The service returns 'response' not 'message'
    const message = result.response || result.message || result.followUpQuestion || 'No response';
    log(`  🤖 Bot: "${message}"`, colors.cyan);
    
    return { ...result, message }; // Add message field for test compatibility
  } catch (error) {
    logResult(false, `Error: ${error.message}`);
    return { success: false, message: error.message, response: error.message };
  }
}

// Track test results
const testResults = [];

function recordTestResult(caseNumber, title, passed, details) {
  testResults.push({ caseNumber, title, passed, details });
}

async function runTests() {
  try {
    // Connect to database
    log('📡 Connecting to MongoDB...', colors.yellow);
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    log('✅ Connected to MongoDB\n', colors.green);

    // ==========================================================================
    // CASE 1: Người dùng đổi ý nhiều lần
    // ==========================================================================
    logTest(1, 'Người dùng đổi ý nhiều lần trong lúc đặt lịch');
    
    logStep(1, 'Bắt đầu đặt lịch với bác sĩ Dương');
    let result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Dương');
    let history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Dương' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'Chọn dịch vụ Làm sạch răng');
    result = await sendMessage('Làm sạch răng', history);
    history.push({ role: 'user', content: 'Làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });
    
    logStep(3, 'Đổi ý - Chọn bác sĩ Hiếu thay vì Dương');
    result = await sendMessage('À không, tôi muốn đặt với bác sĩ Hiếu', history);
    const hasDoctorChange = result.message.toLowerCase().includes('hiếu');
    logResult(hasDoctorChange, hasDoctorChange ? 'Hệ thống đã chuyển sang bác sĩ Hiếu' : 'Không nhận diện được yêu cầu đổi bác sĩ');
    
    logStep(4, 'Đổi ý - Chọn dịch vụ Tẩy trắng răng thay vì Làm sạch răng');
    history.push({ role: 'user', content: 'À không, tôi muốn đặt với bác sĩ Hiếu' });
    history.push({ role: 'assistant', content: result.message });
    result = await sendMessage('Tôi đổi ý, tôi muốn tẩy trắng răng', history);
    const hasServiceChange = result.message.toLowerCase().includes('tẩy trắng');
    logResult(hasServiceChange, hasServiceChange ? 'Hệ thống đã chuyển sang dịch vụ Tẩy trắng răng' : 'Không nhận diện được yêu cầu đổi dịch vụ');
    
    recordTestResult(1, 'Người dùng đổi ý nhiều lần', hasDoctorChange && hasServiceChange, 
      `Doctor change: ${hasDoctorChange}, Service change: ${hasServiceChange}`);
    
    // Clear context for next test
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 2: Prompt chung chung về dịch vụ
    // ==========================================================================
    logTest(2, 'Prompt chung chung - Hiển thị danh sách dịch vụ liên quan');
    
    logStep(1, 'User prompt: "tôi muốn đặt lịch khám răng"');
    result = await sendMessage('Tôi muốn đặt lịch khám răng');
    const hasServiceList = result.message.includes('1.') || result.message.includes('dịch vụ');
    logResult(hasServiceList, hasServiceList ? 'Hiển thị danh sách dịch vụ' : 'Không hiển thị danh sách dịch vụ');
    
    recordTestResult(2, 'Prompt chung chung - Hiển thị danh sách', hasServiceList, 
      hasServiceList ? 'Shows service list' : 'No service list shown');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 3: Xử lý thời gian tương đối (tuần sau, tuần kia)
    // ==========================================================================
    logTest(3, 'Xử lý thời gian tương đối (tuần sau, thứ 3 tuần sau)');
    
    logStep(1, 'User prompt: "Tôi muốn đặt lịch tuần sau"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Dương tuần sau');
    const asksForDay = result.message.toLowerCase().includes('thứ') || 
                       result.message.toLowerCase().includes('ngày nào');
    logResult(asksForDay, asksForDay ? 'Hệ thống hỏi thứ mấy' : 'Không hỏi ngày cụ thể');
    
    recordTestResult(3, 'Thời gian tương đối (tuần sau)', asksForDay,
      asksForDay ? 'Asks for specific day' : 'Does not ask for day');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 4: Thời gian không hợp lệ (ngoài giờ làm việc)
    // ==========================================================================
    logTest(4, 'Thời gian không trong giờ làm việc của bác sĩ');
    
    logStep(1, 'Đặt lịch với bác sĩ Dương');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Dương');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Dương' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'Chọn dịch vụ');
    result = await sendMessage('Làm sạch răng', history);
    history.push({ role: 'user', content: 'Làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });
    
    logStep(3, 'Chọn ngày mai');
    result = await sendMessage('ngày mai', history);
    history.push({ role: 'user', content: 'ngày mai' });
    history.push({ role: 'assistant', content: result.message });
    
    logStep(4, 'Chọn 13:00 (giờ nghỉ trưa - không hợp lệ)');
    result = await sendMessage('13:00', history);
    const rejectsInvalidTime = result.message.includes('không khả dụng') || 
                                result.message.includes('không hợp lệ');
    logResult(rejectsInvalidTime, rejectsInvalidTime ? 'Từ chối giờ không hợp lệ' : 'Chấp nhận giờ không hợp lệ (BUG)');
    
    recordTestResult(4, 'Thời gian không hợp lệ (ngoài giờ LV)', rejectsInvalidTime,
      rejectsInvalidTime ? 'Rejects invalid time' : 'Accepts invalid time');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 5: Slot đã đầy
    // ==========================================================================
    logTest(5, 'Xử lý trùng lịch - Slot đã đầy');
    
    logStep(1, 'Tạo booking tại 10:00 để làm đầy slot');
    // First, create a booking at 10:00 to make the slot full
    const tomorrowStr = require('./utils/dateHelper').getTomorrowVN();
    const Service = require('./models/service.model');
    const User = require('./models/user.model');
    const DoctorSchedule = require('./models/doctorSchedule.model');
    const Timeslot = require('./models/timeslot.model');
    
    // Find doctor Hiếu
    const doctorHieu = await User.findOne({ fullName: { $regex: /hiếu/i }, role: 'Doctor' });
    const serviceClean = await Service.findOne({ serviceName: { $regex: /làm sạch/i } });
    
    if (doctorHieu && serviceClean) {
      // Create a blocking timeslot at 10:00
      const tomorrow = new Date(tomorrowStr);
      tomorrow.setHours(0, 0, 0, 0);
      
      // Ensure schedule exists
      let schedule = await DoctorSchedule.findOne({ doctorUserId: doctorHieu._id, date: tomorrow });
      if (!schedule) {
        schedule = await DoctorSchedule.create({
          doctorUserId: doctorHieu._id,
          date: tomorrow,
          shift: 'Morning',
          workingHours: { morningStart: '08:00', morningEnd: '12:00', afternoonStart: '14:00', afternoonEnd: '18:00' },
          status: 'Available',
          maxSlots: 10
        });
      }
      
      const startTime = new Date(tomorrow);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);
      
      await Timeslot.deleteMany({ doctorUserId: doctorHieu._id, date: tomorrow }); // Clear old slots
      
      await Timeslot.create({
        doctorScheduleId: schedule._id,
        doctorUserId: doctorHieu._id,
        serviceId: serviceClean._id,
        startTime: startTime,
        endTime: endTime,
        status: 'Booked'
      });
      
      logStep(2, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào 10:00 ngày mai"');
      result = await sendMessage(`Tôi muốn đặt lịch với bác sĩ Hiếu vào 10:00 ngày mai`);
      
      // Should show conflict message and available gaps
      const showsConflict = result.message.includes('không khả dụng') || 
                            result.message.includes('đã có lịch hẹn khác');
      const showsAlternatives = result.message.includes('khung giờ khả dụng') || 
                                result.message.includes('Buổi sáng:') ||
                                result.message.includes('10:30'); // Should show gap that includes 10:30
                                
      const testPassed = showsConflict && showsAlternatives;
      logResult(testPassed, testPassed ? 'Hiển thị conflict và khung giờ thay thế (gaps)' : 'Không hiển thị đúng (BUG)');
      
      recordTestResult(5, 'Xử lý trùng lịch - Slot đầy', testPassed,
        testPassed ? 'Shows conflict and alternative gaps' : 'No alternatives shown');
        
    } else {
      logResult(false, 'Setup failed: Doctor or Service not found');
    }
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 6: "One-shot" Prompt (Đủ thông tin 1 lần)
    // ==========================================================================
    logTest(6, '"One-shot" Prompt - Cung cấp đủ thông tin 1 lần');
    
    logStep(1, 'User: "Đặt lịch làm sạch răng với bác sĩ Dương vào 15h chiều mai"');
    result = await sendMessage('Đặt lịch làm sạch răng với bác sĩ Dương vào 15h chiều mai');
    const skipToConfirmation = result.message.includes('xác nhận') || 
                               result.message.includes('15:00') ||
                               result.message.includes('15h');
    logResult(skipToConfirmation, skipToConfirmation ? 'Đi thẳng đến xác nhận' : 'Vẫn hỏi thêm thông tin');
    
    recordTestResult(6, '"One-shot" Prompt - All info at once', skipToConfirmation,
      skipToConfirmation ? 'Skips to confirmation' : 'Still asks for info');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 7: Thời gian quá khứ
    // ==========================================================================
    logTest(7, 'Logic thời gian quá khứ');
    
    logStep(1, 'User: "Đặt lịch cho ngày hôm qua"');
    result = await sendMessage('Đặt lịch với bác sĩ Dương ngày hôm qua');
    const rejectsPast = result.message.includes('tương lai') || 
                        result.message.includes('không hợp lệ') ||
                        result.message.includes('quá khứ');
    logResult(rejectsPast, rejectsPast ? 'Từ chối thời gian quá khứ' : 'Chấp nhận thời gian quá khứ (BUG)');
    
    recordTestResult(7, 'Logic thời gian quá khứ', rejectsPast,
      rejectsPast ? 'Rejects past dates' : 'Accepts past dates');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 8: Yêu cầu trừu tượng về thời gian
    // ==========================================================================
    logTest(8, 'Yêu cầu trừu tượng/mơ hồ về thời gian');
    
    logStep(1, 'User: "Đặt cho tôi lịch sớm nhất có thể vào ngày mai"');
    result = await sendMessage('Đặt lịch làm sạch răng với bác sĩ Dương sớm nhất có thể vào ngày mai');
    const showsEarliestSlot = result.message.includes('08:') || 
                              result.message.includes('07:') ||
                              result.message.includes('khả dụng');
    logResult(showsEarliestSlot, showsEarliestSlot ? 'Hiển thị slot sớm nhất' : 'Không tự động tìm slot');
    
    recordTestResult(8, 'Yêu cầu trừu tượng (sớm nhất)', showsEarliestSlot,
      showsEarliestSlot ? 'Shows earliest slot' : 'Does not auto-find slot');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 9: Duy trì ngữ cảnh hội thoại
    // ==========================================================================
    logTest(9, 'Duy trì ngữ cảnh hội thoại (Context retention)');
    
    logStep(1, 'User hỏi giá: "Giá tẩy trắng răng là bao nhiêu?"');
    result = await sendMessage('Giá tẩy trắng răng là bao nhiêu?');
    history = [
      { role: 'user', content: 'Giá tẩy trắng răng là bao nhiêu?' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'User đặt luôn: "Ok, đặt cho tôi dịch vụ đó vào 10h sáng mai với bác sĩ Dương"');
    result = await sendMessage('Ok, đặt cho tôi dịch vụ đó vào 10h sáng mai với bác sĩ Dương', history);
    const remembersService = result.message.toLowerCase().includes('tẩy trắng');
    logResult(remembersService, remembersService ? 'Nhớ dịch vụ đã hỏi' : 'Không nhớ context (cần cải thiện)');
    
    recordTestResult(9, 'Duy trì ngữ cảnh hội thoại', remembersService,
      remembersService ? 'Remembers previous context' : 'Lost context');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 10: Xử lý lỗi chính tả / Fuzzy Matching
    // ==========================================================================
    logTest(10, 'Xử lý lỗi chính tả/Teencode (Fuzzy Matching)');
    
    logStep(1, 'User: "dặt lịc làm sach răng vs bs Dương"');
    result = await sendMessage('dặt lịc làm sach răng vs bs Dương');
    const handlesMisspelling = result.message.toLowerCase().includes('làm sạch răng') || 
                               result.message.toLowerCase().includes('dương') ||
                               result.message.includes('dịch vụ');
    logResult(handlesMisspelling, handlesMisspelling ? 'Hiểu được lỗi chính tả' : 'Không xử lý được lỗi chính tả');
    
    recordTestResult(10, 'Xử lý lỗi chính tả/Teencode', handlesMisspelling,
      handlesMisspelling ? 'Handles typos correctly' : 'Does not handle typos');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 11: Thời gian đã qua trong ngày hiện tại
    // ==========================================================================
    logTest(11, 'Thời gian đã qua trong ngày hiện tại');
    
    // Giả sử bây giờ là 14:00, user đặt 08:00 sáng nay
    // Note: Test này phụ thuộc vào thời gian thực chạy test. 
    // Nếu chạy vào buổi sáng sớm (< 8h) thì test này có thể fail logic "đã qua".
    // Tuy nhiên với context hiện tại (chiều), 8h sáng là quá khứ.
    
    logStep(1, 'User: "Tôi muốn đặt lịch với bác sĩ Hải vào 8 giờ hôm nay"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hải vào 8 giờ hôm nay');
    
    const rejectsPastTime = result.message.includes('không khả dụng') || 
                            result.message.includes('đã qua') ||
                            result.message.includes('tương lai');
                            
    logResult(rejectsPastTime, rejectsPastTime ? 'Từ chối giờ đã qua' : 'Chấp nhận giờ đã qua (BUG)');
    
    recordTestResult(11, 'Thời gian đã qua trong ngày', rejectsPastTime,
      rejectsPastTime ? 'Rejects past time' : 'Accepts past time');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 12: Xử lý giờ chiều (12h format -> 24h format)
    // ==========================================================================
    logTest(12, 'Xử lý giờ chiều (3 giờ chiều -> 15:00)');
    
    logStep(1, 'User: "Tôi muốn đặt lịch với bác sĩ Hải vào 3 giờ chiều ngày mai"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hải vào 3 giờ chiều ngày mai');
    
    // Expect the system to recognize 15:00
    // The response might be confirmation or asking for service, but should mention 15:00 if it confirms
    // Or if it proceeds to booking, it uses 15:00
    
    const context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    const timeIsCorrect = context.time === '15:00';
    
    logResult(timeIsCorrect, timeIsCorrect ? 'Nhận diện đúng 15:00' : `Nhận diện sai: ${context.time}`);
    
    recordTestResult(12, 'Xử lý giờ chiều (3h chiều -> 15h)', timeIsCorrect,
      timeIsCorrect ? 'Correctly converted to 15:00' : `Failed: got ${context.time}`);
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 13: Cập nhật giờ khi chưa có dịch vụ
    // ==========================================================================
    logTest(13, 'Cập nhật giờ khi chưa có dịch vụ');
    
    // Step 1: Set Doctor and Date (but invalid time to trigger rejection)
    // Note: We use a future date to avoid "past time" error if we want to test flow, 
    // but here we want to simulate the user's flow: 
    // User: "8h hôm nay" -> Error (Past) -> User: "3h chiều"
    
    // We manually set context to simulate the state after the first error
    // (Doctor selected, Date selected, Time rejected/null, Service null)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    await aiBookingService.updateConversationContext(TEST_PATIENT_ID, {
      doctorId: '6920053726c95e310ffd2286', // Bác sĩ Hải
      date: todayStr,
      serviceId: null,
      time: null
    });
    
    logStep(1, 'User: "vậy tôi muốn đặt giờ 3 giờ chiều"');
    result = await sendMessage('vậy tôi muốn đặt giờ 3 giờ chiều');
    
    const context13 = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    const timeIsCorrect13 = context13.time === '15:00';
    
    logResult(timeIsCorrect13, timeIsCorrect13 ? 'Nhận diện đúng 15:00 khi thiếu dịch vụ' : `Nhận diện sai: ${context13.time}`);
    
    recordTestResult(13, 'Cập nhật giờ khi thiếu dịch vụ', timeIsCorrect13,
      timeIsCorrect13 ? 'Correctly captured time' : `Failed: got ${context13.time}`);
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 14: Reject past time ngay cả khi chưa có bác sĩ/dịch vụ
    // ==========================================================================
    logTest(14, 'Từ chối thời gian quá khứ ngay cả khi chưa có bác sĩ/dịch vụ');
    
    // Lấy thời gian hiện tại và tính thời gian quá khứ (2 giờ trước)
    const now = new Date();
    const pastHour = now.getHours() - 2;
    const pastTimeStr = `${pastHour} giờ`;
    
    logStep(1, `User: "Tôi muốn đặt lịch vào ${pastTimeStr} hôm nay"`);
    result = await sendMessage(`Tôi muốn đặt lịch vào ${pastTimeStr} hôm nay`);
    
    const responseText = result.message || result.response || '';
    const rejectsPastTime14 = responseText.includes('đã qua') || 
                            responseText.includes('quá khứ') ||
                            responseText.includes('trong tương lai');
    
    logResult(rejectsPastTime14, rejectsPastTime14 ? 'Từ chối thời gian quá khứ ngay lập tức' : 'Không từ chối (BUG)');
    
    recordTestResult(14, 'Từ chối thời gian quá khứ khi chưa có bác sĩ/dịch vụ', rejectsPastTime14,
      rejectsPastTime14 ? 'Từ chối đúng thời gian quá khứ' : 'Không từ chối thời gian quá khứ');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 15: Filter services khi user nói "khám răng"
    // ==========================================================================
    logTest(15, 'Lọc dịch vụ nha khoa khi user nói "khám răng"');
    
    logStep(1, 'User: "Tôi muốn đặt lịch khám răng với bác sĩ Hải"');
    result = await sendMessage('Tôi muốn đặt lịch khám răng với bác sĩ Hải');
    
    const responseText15 = result.message || result.response || '';
    
    // Nên hiển thị dịch vụ nha khoa (KHÔNG bao gồm "Khám tổng quát")
    const showsDentalServices = responseText15.includes('Làm sạch răng') || 
                                 responseText15.includes('Nhổ răng') ||
                                 responseText15.includes('Bọc răng');
    const excludesGeneralCheckup = !responseText15.includes('Khám tổng quát');
    const correctFiltering = showsDentalServices && excludesGeneralCheckup;
    
    logResult(correctFiltering, correctFiltering ? 
      'Hiển thị dịch vụ nha khoa, loại trừ "Khám tổng quát"' : 
      'Lọc không đúng');
    
    recordTestResult(15, 'Lọc dịch vụ nha khoa cho "khám răng"', correctFiltering,
      correctFiltering ? 'Lọc dịch vụ nha khoa đúng' : 'Lọc dịch vụ thất bại');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 16: Hiển thị "Đã hết chỗ" khi buổi sáng/chiều đã full
    // ==========================================================================
    logTest(16, 'Hiển thị "Đã hết chỗ" khi ca làm việc đã đầy');
    
    // Chuẩn bị: Tạo các lịch hẹn để lấp đầy ca sáng (7:00-11:00 = 240 phút)
    // Sẽ tạo các lịch hẹn tổng cộng 220+ phút để làm đầy ca
    
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1); // Ngày mai
    const dateStr = testDate.toISOString().split('T')[0];
    
    logStep(1, `Chuẩn bị: Tạo lịch làm việc cho ngày mai (${dateStr})`);
    
    // Tìm bác sĩ và dịch vụ test
    const testDoctor = await require('./models/user.model').findOne({ 
      role: 'Doctor', 
      fullName: /Hải/i 
    });
    const testService = await Service.findOne({ serviceName: /Làm sạch/i });
    
    if (!testDoctor || !testService) {
      logResult(false, 'Không tìm thấy bác sĩ hoặc dịch vụ test - bỏ qua test');
      recordTestResult(16, 'Hiển thị "Đã hết chỗ"', false, 'Không tìm thấy dữ liệu test');
    } else {
      // Tạo lịch làm việc
      const schedule = await DoctorSchedule.create({
        doctorUserId: testDoctor._id,
        date: testDate,
        shift: 'Morning',
        status: 'Available',
        workingHours: {
          morningStart: '07:00',
          morningEnd: '11:00',
          afternoonStart: '14:00',
          afternoonEnd: '18:00'
        },
        maxSlots: 10
      });
      
      logStep(2, 'Tạo các lịch hẹn để lấp đầy ca sáng (220 phút)');
      
      // Tạo 4 lịch hẹn, mỗi cái 50 phút = 200 phút
      // + thời lượng dịch vụ 30 phút = 230 > 240 → Đầy
      const appointments = [];
      for (let i = 0; i < 4; i++) {
        const startHour = 7 + Math.floor(i * 50 / 60);
        const startMinute = (i * 50) % 60;
        
        const startTime = new Date(testDate);
        startTime.setHours(startHour, startMinute, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 50);
        
        const timeslot = await Timeslot.create({
          doctorScheduleId: schedule._id,
          doctorUserId: testDoctor._id,
          serviceId: testService._id,
          startTime,
          endTime,
          status: 'Booked',
          breakAfterMinutes: 0
        });
        
        appointments.push(timeslot);
      }
      
      logStep(3, `User: "Tôi muốn đặt lịch với bác sĩ Hải vào ${dateStr}"`);
      result = await sendMessage(`Tôi muốn đặt lịch với bác sĩ Hải vào ${dateStr}`);
      history = [
        { role: 'user', content: `Tôi muốn đặt lịch với bác sĩ Hải vào ${dateStr}` },
        { role: 'assistant', content: result.message }
      ];
      
      logStep(4, 'User: "Làm sạch răng"');
      result = await sendMessage('Làm sạch răng', history);
      
      const responseText16 = result.message || result.response || '';
      
      // Nên hiển thị "Đã hết chỗ" cho ca sáng
      const showsFullMorning = responseText16.includes('Đã hết chỗ') || 
                               responseText16.includes('hết chỗ');
      
      logResult(showsFullMorning, showsFullMorning ? 
        'Hiển thị "Đã hết chỗ" cho buổi sáng' : 
        'Không hiển thị "Đã hết chỗ"');
      
      recordTestResult(16, 'Hiển thị "Đã hết chỗ" khi đã đầy', showsFullMorning,
        showsFullMorning ? 'Hiển thị đúng "Đã hết chỗ"' : 'Không hiển thị đầy chỗ');
      
      // Dọn dẹp
      await Timeslot.deleteMany({ _id: { $in: appointments.map(a => a._id) } });
      await DoctorSchedule.deleteOne({ _id: schedule._id });
      
      aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    }

    // ==========================================================================
    // CASE 17: Hiển thị time range (start-end) thay vì chỉ start time
    // ==========================================================================
    logTest(17, 'Hiển thị khoảng thời gian (17:27-18:00) thay vì chỉ giờ bắt đầu');
    
    logStep(1, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'User: "Làm sạch răng"');
    result = await sendMessage('Làm sạch răng', history);
    
    const responseText17 = result.message || result.response || '';
    // Nên hiển thị khoảng thời gian như "17:27-18:00" không chỉ "17:27"
    const showsTimeRange = /\d{2}:\d{2}-\d{2}:\d{2}/.test(responseText17);
    
    logResult(showsTimeRange, showsTimeRange ? 
      'Hiển thị khoảng thời gian (start-end)' : 
      'Chỉ hiển thị giờ bắt đầu');
    
    recordTestResult(17, 'Hiển thị khoảng thời gian (start-end)', showsTimeRange,
      showsTimeRange ? 'Hiển thị khoảng thời gian đúng' : 'Chỉ hiển thị giờ bắt đầu');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 18: Xác nhận appointment với reservation đã tồn tại
    // ==========================================================================
    logTest(18, 'Xác nhận lịch hẹn với reservation đã tồn tại');
    
    logStep(1, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'User: "Làm sạch răng"');
    result = await sendMessage('Làm sạch răng', history);
    history.push({ role: 'user', content: 'Làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });
    
    logStep(3, 'User chọn giờ (ví dụ: "15:00")');
    result = await sendMessage('15:00', history);
    history.push({ role: 'user', content: '15:00' });
    history.push({ role: 'assistant', content: result.message });
    
    // Kiểm tra xem confirmation message có bao gồm khoảng thời gian không
    const hasConfirmation = result.message.includes('Xác nhận') || result.message.includes('xác nhận');
    const hasTimeRange18 = /\d{2}:\d{2}-\d{2}:\d{2}/.test(result.message);
    
    logStep(4, 'User: "Xác nhận"');
    result = await sendMessage('Xác nhận', history);
    
    const appointmentCreated = result.success && result.appointment;
    const confirmationSuccess = hasConfirmation && appointmentCreated;
    
    logResult(confirmationSuccess, confirmationSuccess ? 
      'Xác nhận thành công với reservation' : 
      'Lỗi khi xác nhận');
    
    recordTestResult(18, 'Xác nhận lịch hẹn với reservation', confirmationSuccess,
      confirmationSuccess ? 'Xác nhận thành công với reservation' : 'Xác nhận thất bại');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 19: Phát hiện không đủ thời gian cho dịch vụ
    // ==========================================================================
    logTest(19, 'Phát hiện không đủ thời gian cho dịch vụ');
    
    // Giả lập chiều muộn (17:45) với dịch vụ 30 phút
    // Nên phát hiện rằng không đủ thời gian đến 18:00
    
    logStep(1, 'Chuẩn bị: Giả lập bây giờ là 17:45, dịch vụ cần 30 phút');
    
    // Sẽ test bằng cách thử đặt dịch vụ dài (90 phút) vào cuối ngày
    logStep(2, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(3, 'User: "Tẩy trắng răng" (90 phút)');
    result = await sendMessage('Tẩy trắng răng', history);
    
    const responseText19 = result.message || result.response || '';
    // Nếu thời gian hiện tại muộn (ví dụ: 17:30+), nên đề xuất chọn ngày khác
    const suggestsAnotherDate = responseText19.includes('ngày khác') || 
                                 responseText19.includes('ngày mai') ||
                                 responseText19.includes('không còn đủ thời gian');
    
    logResult(suggestsAnotherDate, suggestsAnotherDate ? 
      'Phát hiện không đủ thời gian, đề xuất ngày khác' : 
      'Không phát hiện vấn đề thời gian');
    
    recordTestResult(19, 'Phát hiện không đủ thời gian cho dịch vụ', suggestsAnotherDate,
      suggestsAnotherDate ? 'Phát hiện đúng không đủ thời gian' : 'Không phát hiện được');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 20: Clear context khi bắt đầu cuộc hội thoại mới
    // ==========================================================================
    logTest(20, 'Xóa context khi bắt đầu cuộc hội thoại mới');
    
    logStep(1, 'Đặt lịch lần 1 với bác sĩ Dương, dịch vụ Làm sạch răng');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Dương');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Dương' },
      { role: 'assistant', content: result.message }
    ];
    
    result = await sendMessage('Làm sạch răng', history);
    
    // Kiểm tra context có doctor và service
    let context20 = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    const hasOldContext = context20.doctorId && context20.serviceId;
    
    logStep(2, 'Giả lập isNewConversation=true (xóa context)');
    // Xóa context thủ công để giả lập cuộc hội thoại mới
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    logStep(3, 'Bắt đầu cuộc hội thoại mới với bác sĩ Hiếu');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay');
    
    // Nên hiển thị danh sách dịch vụ, không dùng dịch vụ cũ
    const showsServiceList20 = result.message.includes('dịch vụ') || result.message.includes('1.');
    
    context20 = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    const contextCleared = !context20.serviceId || context20.serviceId !== result.serviceId;
    
    logResult(showsServiceList20, showsServiceList20 ? 
      'Context đã được xóa, hiển thị danh sách dịch vụ' : 
      'Context chưa được xóa đúng cách');
    
    recordTestResult(20, 'Xóa context cho cuộc hội thoại mới', showsServiceList20,
      showsServiceList20 ? 'Context đã xóa đúng' : 'Context chưa được xóa');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 21: Hiển thị end time trong confirmation message
    // ==========================================================================
    logTest(21, 'Hiển thị giờ kết thúc trong confirmation message (17:21-17:51)');
    
    logStep(1, 'Hoàn thành flow đặt lịch');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai' },
      { role: 'assistant', content: result.message }
    ];
    
    result = await sendMessage('Làm sạch răng', history);
    history.push({ role: 'user', content: 'Làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });
    
    result = await sendMessage('10:00', history);
    
    const responseText21 = result.message || result.response || '';
    // Confirmation nên hiển thị khoảng thời gian như "10:00-10:30"
    const hasEndTime = /\d{2}:\d{2}-\d{2}:\d{2}/.test(responseText21);
    const hasConfirmation21 = responseText21.includes('Xác nhận') || responseText21.includes('xác nhận');
    
    logResult(hasEndTime && hasConfirmation21, hasEndTime && hasConfirmation21 ? 
      'Confirmation message hiển thị giờ kết thúc' : 
      'Confirmation message không có giờ kết thúc');
    
    
    recordTestResult(21, 'Hiển thị giờ kết thúc trong confirmation', hasEndTime && hasConfirmation21,
      hasEndTime && hasConfirmation21 ? 'Hiển thị giờ kết thúc đúng' : 'Thiếu giờ kết thúc');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 22: Bác sĩ nghỉ phép - Hiển thị danh sách bác sĩ thay thế
    // ==========================================================================
    logTest(22, 'Bác sĩ nghỉ phép - Hiển thị danh sách bác sĩ thay thế');
    
    const LeaveRequest = require('./models/leaveRequest.model');
    const User = require('./models/user.model');
    
    // Tìm bác sĩ để tạo leave request
    const doctorForLeave = await User.findOne({ fullName: { $regex: /hải/i }, role: 'Doctor' });
    
    if (doctorForLeave) {
      // Tạo leave request cho ngày mai
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      tomorrowDate.setHours(0, 0, 0, 0);
      
      const dayAfterTomorrow = new Date(tomorrowDate);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
      
      // Xóa leave request cũ nếu có
      await LeaveRequest.deleteMany({ 
        doctorUserId: doctorForLeave._id,
        startDate: { $gte: tomorrowDate, $lt: dayAfterTomorrow }
      });
      
      // Tạo leave request mới
      await LeaveRequest.create({
        doctorUserId: doctorForLeave._id,
        startDate: tomorrowDate,
        endDate: tomorrowDate,
        reason: 'Test leave request for case 22',
        status: 'Approved'
      });
      
      logStep(1, `Đã tạo leave request cho bác sĩ ${doctorForLeave.fullName} vào ngày mai`);
      
      logStep(2, 'User: "Tôi muốn đặt lịch với bác sĩ Hải vào ngày mai"');
      result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hải vào ngày mai');
      history = [
        { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hải vào ngày mai' },
        { role: 'assistant', content: result.message }
      ];
      
      logStep(3, 'User: "Làm sạch răng"');
      result = await sendMessage('Làm sạch răng', history);
      
      const responseText22 = result.message || result.response || '';
      
      // Kiểm tra xem có thông báo nghỉ phép không
      const showsOnLeaveMessage = responseText22.includes('nghỉ phép') || 
                                   responseText22.includes('Bác sĩ Hải');
      
      // Kiểm tra xem có danh sách bác sĩ thay thế không
      const showsAlternativeDoctors = responseText22.includes('Các bác sĩ khác') ||
                                      responseText22.includes('bác sĩ') && 
                                      (responseText22.includes('Hiếu') || 
                                       responseText22.includes('Dương') ||
                                       responseText22.includes('Thao'));
      
      const testPassed22 = showsOnLeaveMessage && showsAlternativeDoctors;
      
      logResult(testPassed22, testPassed22 ? 
        'Hiển thị message nghỉ phép và danh sách bác sĩ thay thế' : 
        'Không hiển thị đầy đủ thông tin');
      
      if (!testPassed22) {
        log(`  Response: ${responseText22.substring(0, 200)}...`, colors.yellow);
      }
      
      recordTestResult(22, 'Bác sĩ nghỉ phép - Hiển thị bác sĩ thay thế', testPassed22,
        testPassed22 ? 'Shows on-leave message and alternative doctors' : 'Missing information');
      
      // Cleanup: Xóa leave request
      await LeaveRequest.deleteMany({ 
        doctorUserId: doctorForLeave._id,
        startDate: { $gte: tomorrowDate, $lt: dayAfterTomorrow }
      });
      
    } else {
      logResult(false, 'Setup failed: Doctor Hải not found');
      recordTestResult(22, 'Bác sĩ nghỉ phép - Hiển thị bác sĩ thay thế', false, 'Setup failed');
    }
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // SUMMARY
    // ==========================================================================
    console.log('\n' + '='.repeat(80));
    log('📊 TEST SUMMARY', colors.bright + colors.cyan);
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'User: "Làm sạch răng"');
    result = await sendMessage('Làm sạch răng', history);
    
    const responseText17 = result.message || result.response || '';
    // Should show time range like "17:27-18:00" not just "17:27"
    const showsTimeRange = /\d{2}:\d{2}-\d{2}:\d{2}/.test(responseText17);
    
    logResult(showsTimeRange, showsTimeRange ? 
      'Hiển thị time range (start-end)' : 
      'Chỉ hiển thị start time');
    
    recordTestResult(17, 'Display time range (start-end)', showsTimeRange,
      showsTimeRange ? 'Shows time range correctly' : 'Only shows start time');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 18: Xác nhận appointment với reservation đã tồn tại
    // ==========================================================================
    logTest(18, 'Confirm appointment with existing reservation');
    
    logStep(1, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(2, 'User: "Làm sạch răng"');
    result = await sendMessage('Làm sạch răng', history);
    history.push({ role: 'user', content: 'Làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });
    
    logStep(3, 'User chọn giờ (e.g., "15:00")');
    result = await sendMessage('15:00', history);
    history.push({ role: 'user', content: '15:00' });
    history.push({ role: 'assistant', content: result.message });
    
    // Check if confirmation message includes time range
    const hasConfirmation = result.message.includes('Xác nhận') || result.message.includes('xác nhận');
    const hasTimeRange18 = /\d{2}:\d{2}-\d{2}:\d{2}/.test(result.message);
    
    logStep(4, 'User: "Xác nhận"');
    result = await sendMessage('Xác nhận', history);
    
    const appointmentCreated = result.success && result.appointment;
    const confirmationSuccess = hasConfirmation && appointmentCreated;
    
    logResult(confirmationSuccess, confirmationSuccess ? 
      'Xác nhận thành công với reservation' : 
      'Lỗi khi xác nhận');
    
    recordTestResult(18, 'Confirm appointment with reservation', confirmationSuccess,
      confirmationSuccess ? 'Successfully confirmed with reservation' : 'Failed to confirm');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 19: Phát hiện không đủ thời gian cho dịch vụ
    // ==========================================================================
    logTest(19, 'Detect insufficient time for service');
    
    // Simulate late afternoon (17:45) with 30-minute service
    // Should detect that there's not enough time until 18:00
    
    logStep(1, 'Setup: Giả lập bây giờ là 17:45, dịch vụ cần 30 phút');
    
    // We'll test this by trying to book a long service (90 minutes) late in the day
    logStep(2, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay"');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay' },
      { role: 'assistant', content: result.message }
    ];
    
    logStep(3, 'User: "Tẩy trắng răng" (90 phút)');
    result = await sendMessage('Tẩy trắng răng', history);
    
    const responseText19 = result.message || result.response || '';
    // If current time is late (e.g., 17:30+), should suggest choosing another date
    const suggestsAnotherDate = responseText19.includes('ngày khác') || 
                                 responseText19.includes('ngày mai') ||
                                 responseText19.includes('không còn đủ thời gian');
    
    logResult(suggestsAnotherDate, suggestsAnotherDate ? 
      'Phát hiện không đủ thời gian, đề xuất ngày khác' : 
      'Không phát hiện vấn đề thời gian');
    
    recordTestResult(19, 'Detect insufficient time for service', suggestsAnotherDate,
      suggestsAnotherDate ? 'Correctly detected insufficient time' : 'Failed to detect');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 20: Clear context khi bắt đầu cuộc hội thoại mới
    // ==========================================================================
    logTest(20, 'Clear context when starting new conversation');
    
    logStep(1, 'Đặt lịch lần 1 với bác sĩ Dương, dịch vụ Làm sạch răng');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Dương');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Dương' },
      { role: 'assistant', content: result.message }
    ];
    
    result = await sendMessage('Làm sạch răng', history);
    
    // Check context has doctor and service
    let context20 = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    const hasOldContext = context20.doctorId && context20.serviceId;
    
    logStep(2, 'Simulate isNewConversation=true (clear context)');
    // Manually clear context to simulate new conversation
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    logStep(3, 'Bắt đầu cuộc hội thoại mới với bác sĩ Hiếu');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào hôm nay');
    
    // Should show service list, not use old service
    const showsServiceList20 = result.message.includes('dịch vụ') || result.message.includes('1.');
    
    context20 = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    const contextCleared = !context20.serviceId || context20.serviceId !== result.serviceId;
    
    logResult(showsServiceList20, showsServiceList20 ? 
      'Context đã được clear, hiển thị danh sách dịch vụ' : 
      'Context chưa được clear đúng cách');
    
    recordTestResult(20, 'Clear context for new conversation', showsServiceList20,
      showsServiceList20 ? 'Context cleared correctly' : 'Context not cleared');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 21: Hiển thị end time trong confirmation message
    // ==========================================================================
    logTest(21, 'Display end time in confirmation message (17:21-17:51)');
    
    logStep(1, 'Complete booking flow');
    result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai');
    history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai' },
      { role: 'assistant', content: result.message }
    ];
    
    result = await sendMessage('Làm sạch răng', history);
    history.push({ role: 'user', content: 'Làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });
    
    result = await sendMessage('10:00', history);
    
    const responseText21 = result.message || result.response || '';
    // Confirmation should show time range like "10:00-10:30"
    const hasEndTime = /\d{2}:\d{2}-\d{2}:\d{2}/.test(responseText21);
    const hasConfirmation21 = responseText21.includes('Xác nhận') || responseText21.includes('xác nhận');
    
    logResult(hasEndTime && hasConfirmation21, hasEndTime && hasConfirmation21 ? 
      'Confirmation message hiển thị end time' : 
      'Confirmation message không có end time');
    
    recordTestResult(21, 'Display end time in confirmation', hasEndTime && hasConfirmation21,
      hasEndTime && hasConfirmation21 ? 'Shows end time correctly' : 'Missing end time');
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // CASE 23: Hiển thị Available Slots phải exclude Booked Slots (Multi-turn)
    // ==========================================================================
    logTest(23, 'Available Slots display must exclude Booked Slots');
    
    // Setup: Tạo booking cho bác sĩ Hiếu vào ngày mai (08:00-09:00)
    const tomorrow23 = new Date();
    tomorrow23.setDate(tomorrow23.getDate() + 1);
    const dateStr23 = tomorrow23.toISOString().split('T')[0];
    
    // Find doctor and service
    const doctor23 = await User.findOne({ fullName: { $regex: /hiếu/i }, role: 'Doctor' });
    const service23 = await Service.findOne({ name: { $regex: /làm sạch răng/i } });
    
    if (doctor23 && service23) {
      // Create blocking appointment
      const startTime23 = new Date(tomorrow23);
      startTime23.setHours(8, 0, 0, 0);
      const endTime23 = new Date(tomorrow23);
      endTime23.setHours(9, 0, 0, 0);
      
      await Timeslot.create({
        doctorUserId: doctor23._id,
        date: tomorrow23,
        startTime: startTime23,
        endTime: endTime23,
        status: 'Booked'
      });
      
      logStep(1, `Created blocking slot 08:00-09:00 for doctor ${doctor23.fullName}`);
      
      // Step 1: Select doctor and date
      logStep(2, 'User: "Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai"');
      result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai');
      history = [
        { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào ngày mai' },
        { role: 'assistant', content: result.message }
      ];
      
      // Step 2: Select service
      logStep(3, 'User: "Làm sạch răng"');
      result = await sendMessage('Làm sạch răng', history);
      
      const responseText23 = result.message || '';
      
      // Check if response contains gaps (e.g., "07:00-08:00" and "09:00-...")
      // Should NOT show "07:00-12:00" directly if 08:00-09:00 is booked
      
      const showsGapBefore = responseText23.includes('07:00-08:00');
      const showsGapAfter = responseText23.includes('09:00');
      const notFullRange = !responseText23.includes('07:00-12:00'); // Should NOT show full range
      
      const testPassed23 = showsGapBefore && showsGapAfter && notFullRange;
      
      logResult(testPassed23, testPassed23 ? 
        'Hiển thị đúng các khoảng trống (gaps)' : 
        'Vẫn hiển thị full range hoặc sai gaps');
        
      if (!testPassed23) {
        log(`  Response: ${responseText23}`, colors.yellow);
      }
      
      recordTestResult(23, 'Exclude booked slots in display', testPassed23,
        testPassed23 ? 'Correctly shows gaps' : 'Shows full range (incorrect)');
        
      // Cleanup
      await Timeslot.deleteMany({
        doctorUserId: doctor23._id,
        date: { $gte: new Date(dateStr23), $lt: new Date(new Date(dateStr23).getTime() + 86400000) }
      });
      
    } else {
      logResult(false, 'Setup failed: Doctor or Service not found');
      recordTestResult(23, 'Exclude booked slots in display', false, 'Setup failed');
    }
    
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    // ==========================================================================
    // SUMMARY
    // ==========================================================================
    console.log('\n' + '='.repeat(80));
    log('📊 TEST SUMMARY', colors.bright + colors.cyan);
    console.log('='.repeat(80));
    
    // Count results
    const totalTests = testResults.length;
    const passedTests = testResults.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;
    
    // Display table
    console.log('');
    console.log('┌─────┬────────────────────────────────────────────────┬────────┐');
    console.log('│ #   │ Test Case                                      │ Result │');
    console.log('├─────┼────────────────────────────────────────────────┼────────┤');
    
    testResults.forEach(test => {
      const caseNum = test.caseNumber.toString().padEnd(3);
      const title = test.title.padEnd(46).substring(0, 46);
      const result = test.passed ? '  ✅   ' : '  ❌   ';
      console.log(`│ ${caseNum} │ ${title} │ ${result} │`);
    });
    
    console.log('└─────┴────────────────────────────────────────────────┴────────┘');
    console.log('');
    
    // Summary stats
    log(`Total Tests: ${totalTests}`, colors.bright);
    log(`Passed: ${passedTests}`, passedTests === totalTests ? colors.green : colors.yellow);
    log(`Failed: ${failedTests}`, failedTests === 0 ? colors.green : colors.red);
    log(`Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`, 
        passedTests === totalTests ? colors.green : colors.yellow);
    
    console.log('\n' + '='.repeat(80));
    
    // Details for failed tests
    const failedTestDetails = testResults.filter(t => !t.passed);
    if (failedTestDetails.length > 0) {
      log('\n❌ FAILED TEST DETAILS:', colors.red + colors.bright);
      failedTestDetails.forEach(test => {
        console.log(`\nCase ${test.caseNumber}: ${test.title}`);
        console.log(`  Details: ${test.details}`);
      });
      console.log('');
    }
    
    console.log('='.repeat(80));

    await mongoose.disconnect();
    log('\n✅ Tests completed and database disconnected', colors.green);
    process.exit(0);

  } catch (error) {
    console.error('❌ Test suite error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run tests
runTests();

