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
      tomorrow.setHours(10, 0, 0, 0);
      const endTime = new Date(tomorrow);
      endTime.setMinutes(endTime.getMinutes() + serviceClean.durationMinutes);
      
      // Delete any existing timeslot at this time for this test
      await Timeslot.deleteMany({
        doctorUserId: doctorHieu._id,
        startTime: tomorrow
      });
      
      // Create a booked timeslot
      await Timeslot.create({
        doctorUserId: doctorHieu._id,
        startTime: tomorrow,
        endTime: endTime,
        status: 'Booked',
        patientUserId: TEST_PATIENT_ID,
        serviceId: serviceClean._id
      });
      
      log('  ✅ Created blocking appointment at 10:00', colors.green);
    }
    
    logStep(2, 'Thử đặt vào slot đã có người (10:00)');
    result = await sendMessage('Đặt lịch với bác sĩ Hiếu làm sạch răng ngày mai 10:00');
    const suggestsAlternative = result.message.includes('khả dụng') || 
                                result.message.includes('khung giờ');
    logResult(suggestsAlternative, suggestsAlternative ? 'Gợi ý khung giờ khác' : 'Không gợi ý (có thể slot trống)');
    
    recordTestResult(5, 'Xử lý trùng lịch - Slot đầy', suggestsAlternative,
      suggestsAlternative ? 'Shows alternative slots' : 'No alternatives shown');
    
    // Clean up the test timeslot
    if (doctorHieu) {
      const tomorrow = new Date(tomorrowStr);
      tomorrow.setHours(10, 0, 0, 0);
      await Timeslot.deleteMany({
        doctorUserId: doctorHieu._id,
        startTime: tomorrow
      });
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

