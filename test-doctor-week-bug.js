/**
 * Test Case: Bug - "Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau" + "thứ 2"
 * 
 * Bug: Khi user nói "Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau" (có CẢ doctor VÀ "tuần sau"),
 * sau đó trả lời "thứ 2", hệ thống KHÔNG nhận diện được và trả về empty response.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { AIBookingLangchainService } = require('./services/aiBookingLangchain.service');

const TEST_PATIENT_ID = '691fe21b4b0b8b308033efab';
const aiBookingService = new AIBookingLangchainService();

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function sendMessage(prompt, conversationHistory = []) {
  try {
    log(`  💬 User: "${prompt}"`, colors.cyan);
    
    const result = await aiBookingService.createAppointmentFromAI(
      prompt,
      TEST_PATIENT_ID,
      'self',
      conversationHistory
    );
    
    const message = result.response || result.message || result.followUpQuestion || 'No response';
    log(`  🤖 Bot: "${message.substring(0, 250)}..."`, colors.yellow);
    
    return { ...result, message };
  } catch (error) {
    log(`  ❌ Error: ${error.message}`, colors.red);
    return { success: false, message: error.message, response: error.message };
  }
}

async function runTest() {
  try {
    // Connect to database
    log('📡 Connecting to MongoDB...', colors.yellow);
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    log('✅ Connected to MongoDB\n', colors.green);

    log('================================================================================', colors.cyan);
    log('🧪 TEST: "Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau" → "thứ 2"', colors.cyan);
    log('================================================================================\n', colors.cyan);

    // Step 1: User nói cả doctor VÀ "tuần sau" trong cùng prompt
    log('BƯỚC 1: User nói "Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau"', colors.yellow);
    let result = await sendMessage('Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau');
    let history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau' },
      { role: 'assistant', content: result.message }
    ];

    // Check context after step 1
    let context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    log(`\n  📅 Context after step 1:`, colors.cyan);
    log(`     doctorId: ${context.doctorId}`, colors.cyan);
    log(`     date: ${context.date}`, colors.cyan);
    log(`     needsSpecificDayOfWeek: ${context.needsSpecificDayOfWeek}`, colors.cyan);

    // Check if asks for weekday
    const asksForWeekday = result.message.includes('thứ mấy') || 
                           result.message.includes('thứ 2') ||
                           result.message.includes('chủ nhật');
    log(`\n  ${asksForWeekday ? '✅' : '❌'} Bot hỏi thứ mấy`, 
      asksForWeekday ? colors.green : colors.red);

    const doctorSet = context.doctorId && context.doctorId.length > 0;
    log(`  ${doctorSet ? '✅' : '❌'} Doctor ID đã được set`, 
      doctorSet ? colors.green : colors.red);

    if (!asksForWeekday) {
      log('❌ TEST FAILED: Bot không hỏi thứ mấy', colors.red);
      aiBookingService.clearConversationContext(TEST_PATIENT_ID);
      await mongoose.disconnect();
      return;
    }

    // Step 2: User chọn "thứ 2"
    log('\nBƯỚC 2: User trả lời "thứ 2"', colors.yellow);
    result = await sendMessage('thứ 2', history);
    history.push({ role: 'user', content: 'thứ 2' });
    history.push({ role: 'assistant', content: result.message });

    // Check context after step 2
    context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    log(`\n  📅 Context after step 2:`, colors.cyan);
    log(`     doctorId: ${context.doctorId}`, colors.cyan);
    log(`     date: ${context.date}`, colors.cyan);
    log(`     needsSpecificDayOfWeek: ${context.needsSpecificDayOfWeek}`, colors.cyan);

    // Calculate expected date (next Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilNextMonday);
    const expectedDate = nextMonday.toISOString().split('T')[0];
    log(`  📆 Expected date (next Monday): ${expectedDate}`, colors.cyan);

    const dateUpdated = context.date === expectedDate;
    log(`\n  ${dateUpdated ? '✅' : '❌'} Context date updated correctly (${context.date})`, 
      dateUpdated ? colors.green : colors.red);

    const doctorStillSet = context.doctorId && context.doctorId.length > 0;
    log(`  ${doctorStillSet ? '✅' : '❌'} Doctor ID vẫn được giữ`, 
      doctorStillSet ? colors.green : colors.red);

    // Check response
    const showsServices = result.message.includes('dịch vụ') || 
                          result.message.includes('1.') ||
                          result.message.includes('Làm sạch răng');
    
    const showsDate = result.message.includes(expectedDate) || 
                      result.message.includes('2025-12-');
    
    const isEmptyOrGeneric = result.message.includes('Vui lòng cung cấp thêm thông tin') ||
                              result.message.length < 50;

    log(`  ${showsServices ? '✅' : '❌'} Response shows services`, 
      showsServices ? colors.green : colors.red);
    log(`  ${showsDate ? '✅' : '❌'} Response mentions date`, 
      showsDate ? colors.green : colors.red);
    log(`  ${!isEmptyOrGeneric ? '✅' : '❌'} Response is NOT empty/generic`, 
      !isEmptyOrGeneric ? colors.green : colors.red);

    // Final result
    log('\n================================================================================', colors.cyan);
    const testPassed = dateUpdated && doctorStillSet && (showsServices || showsDate) && !isEmptyOrGeneric;
    
    if (testPassed) {
      log('✅ TEST PASSED: Flow hoạt động đúng!', colors.green);
      log('   - Doctor Hiếu được set', colors.green);
      log(`   - Date updated to ${expectedDate}`, colors.green);
      log('   - System shows services or proceeds with booking', colors.green);
    } else {
      log('❌ TEST FAILED: Bug phát hiện!', colors.red);
      log(`   - Doctor set: ${doctorStillSet}`, colors.red);
      log(`   - Date updated: ${dateUpdated} (expected: ${expectedDate}, got: ${context.date})`, colors.red);
      log(`   - Shows services/date: ${showsServices || showsDate}`, colors.red);
      log(`   - Empty/generic response: ${isEmptyOrGeneric}`, colors.red);
      
      log('\n📋 Bug Details:', colors.yellow);
      log(`   Step 1: "Tôi muốn đặt lịch với bác sĩ Hiếu vào tuần sau"`, colors.yellow);
      log(`   Step 2: "thứ 2"`, colors.yellow);
      log(`   Context doctorId: ${context.doctorId}`, colors.yellow);
      log(`   Context date: ${context.date}`, colors.yellow);
      log(`   Expected date: ${expectedDate}`, colors.yellow);
      log(`   Response preview: ${result.message.substring(0, 200)}...`, colors.yellow);
    }
    log('================================================================================\n', colors.cyan);

    // Cleanup
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    await mongoose.disconnect();
    log('✅ Test completed and database disconnected', colors.green);

  } catch (error) {
    console.error('❌ Test Error:', error);
    await mongoose.disconnect();
  }
}

runTest();
