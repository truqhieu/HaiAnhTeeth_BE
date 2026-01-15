/**
 * Test Case: Bug - Changing date during confirmation step
 * 
 * Bug: When user is at confirmation step and says "à không tôi muốn đổi thành ngày mai":
 * 1. System parses new date correctly
 * 2. BUT clears serviceId from context
 * 3. Returns "Bạn muốn đặt dịch vụ nào?" (incorrect - service was already selected!)
 * 4. When user re-selects service, gets issues
 * 
 * Expected: Should keep serviceId and show updated confirmation with new date
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
    log(`  🤖 Bot: "${message.substring(0, 200)}..."`, colors.yellow);
    
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
    log('🧪 TEST: Change date during confirmation step', colors.cyan);
    log('================================================================================\n', colors.cyan);

    // Step 1: Book with specific date (22/12/2025)
    log('BƯỚC 1: User books with date 22/12/2025', colors.yellow);
    let result = await sendMessage('Tôi muốn đặt lịch với bác sĩ hiếu vào 22/12/2025');
    let history = [
      { role: 'user', content: 'Tôi muốn đặt lịch với bác sĩ hiếu vào 22/12/2025' },
      { role: 'assistant', content: result.message }
    ];

    // Check context after step 1
    let context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    log(`\n  📅 Context after step 1:`, colors.cyan);
    log(`     doctorId: ${context.doctorId}`, colors.cyan);
    log(`     date: ${context.date}`, colors.cyan);
    log(`     serviceId: ${context.serviceId}`, colors.cyan);

    const step1Pass = context.doctorId && context.date === '2025-12-22' && !context.serviceId;
    log(`  ${step1Pass ? '✅' : '❌'} Doctor + Date set, no service yet`, 
      step1Pass ? colors.green : colors.red);

    // Step 2: Select service
    log('\nBƯỚC 2: User selects "làm sạch răng"', colors.yellow);
    result = await sendMessage('làm sạch răng', history);
    history.push({ role: 'user', content: 'làm sạch răng' });
    history.push({ role: 'assistant', content: result.message });

    context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    log(`\n  📅 Context after step 2:`, colors.cyan);
    log(`     serviceId: ${context.serviceId}`, colors.cyan);
    log(`     date: ${context.date}`, colors.cyan);

    const step2Pass = context.serviceId && context.date === '2025-12-22';
    log(`  ${step2Pass ? '✅' : '❌'} Service selected, date still 2025-12-22`, 
      step2Pass ? colors.green : colors.red);

    // Step 3: Select time
    log('\nBƯỚC 3: User selects time "9 giờ"', colors.yellow);
    result = await sendMessage('9 giờ', history);
    history.push({ role: 'user', content: '9 giờ' });
    history.push({ role: 'assistant', content: result.message });

    context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    log(`\n  📅 Context after step 3:`, colors.cyan);
    log(`     time: ${context.time}`, colors.cyan);
    log(`     serviceId: ${context.serviceId}`, colors.cyan);
    log(`     date: ${context.date}`, colors.cyan);

    const showsConfirmation = result.message.includes('Xác nhận lịch hẹn') ||
                               result.message.includes('xác nhận đặt lịch');
    const step3Pass = context.time === '09:00' && showsConfirmation;
    log(`  ${step3Pass ? '✅' : '❌'} Time selected, shows confirmation`, 
      step3Pass ? colors.green : colors.red);

    // Step 4: CRITICAL - Change date during confirmation
    log('\nBƯỚC 4: User changes date to "ngày mai" during confirmation', colors.yellow);
    result = await sendMessage('à không tôi muốn đổi thành ngày mai', history);
    history.push({ role: 'user', content: 'à không tôi muốn đổi thành ngày mai' });
    history.push({ role: 'assistant', content: result.message });

    context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    log(`\n  📅 Context after step 4 (date change):`, colors.cyan);
    log(`     date: ${context.date}`, colors.cyan);
    log(`     serviceId: ${context.serviceId}`, colors.cyan);
    log(`     doctorId: ${context.doctorId}`, colors.cyan);
    log(`     time: ${context.time}`, colors.cyan);

    // Expected: 2025-12-19 (tomorrow from 2025-12-18)
    const expectedDate = '2025-12-19';
    const dateUpdated = context.date === expectedDate;
    const serviceKept = context.serviceId && context.serviceId.length > 0;
    const doctorKept = context.doctorId && context.doctorId.length > 0;
    
    // Check response
    const asksForService = result.message.includes('Bạn muốn đặt dịch vụ nào') ||
                           result.message.includes('chọn dịch vụ');
    const showsNewConfirmation = result.message.includes('Xác nhận lịch hẹn') &&
                                  result.message.includes(expectedDate);

    log(`\n  ${dateUpdated ? '✅' : '❌'} Date updated to ${expectedDate} (got: ${context.date})`, 
      dateUpdated ? colors.green : colors.red);
    log(`  ${serviceKept ? '✅' : '❌'} ServiceId preserved (${context.serviceId})`, 
      serviceKept ? colors.green : colors.red);
    log(`  ${doctorKept ? '✅' : '❌'} DoctorId preserved (${context.doctorId})`, 
      doctorKept ? colors.green : colors.red);
    log(`  ${!asksForService ? '✅' : '❌'} Does NOT ask for service again`, 
      !asksForService ? colors.green : colors.red);
    log(`  ${showsNewConfirmation ? '✅' : '❌'} Shows new confirmation with updated date`, 
      showsNewConfirmation ? colors.green : colors.red);

    // Final result
    log('\n================================================================================', colors.cyan);
    const testPassed = dateUpdated && serviceKept && doctorKept && !asksForService;
    
    if (testPassed) {
      log('✅ TEST PASSED: Date change handled correctly!', colors.green);
      log('   - Date updated to tomorrow', colors.green);
      log('   - Service and doctor preserved', colors.green);
      log('   - Shows updated confirmation', colors.green);
    } else {
      log('❌ TEST FAILED: Bug detected!', colors.red);
      log(`   - Date updated: ${dateUpdated} (expected: ${expectedDate}, got: ${context.date})`, colors.red);
      log(`   - Service kept: ${serviceKept} (serviceId: ${context.serviceId})`, colors.red);
      log(`   - Doctor kept: ${doctorKept} (doctorId: ${context.doctorId})`, colors.red);
      log(`   - Asks for service: ${asksForService}`, colors.red);
      
      log('\n📋 Bug Details:', colors.yellow);
      log(`   Original date: 2025-12-22`, colors.yellow);
      log(`   User input: "à không tôi muốn đổi thành ngày mai"`, colors.yellow);
      log(`   Expected: Keep service, show new confirmation with 2025-12-19`, colors.yellow);
      log(`   Actual: ${asksForService ? 'Asks for service again (BUG!)' : 'Correct'}`, colors.yellow);
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
