/**
 * Debug script for Case 39: Minimal prompt flow
 * Run this to see detailed output at each step
 */

require('dotenv').config();
const mongoose = require('mongoose');
const aiBookingService = require('./services/aiBookingLangchain.service');

// ⭐ Import Payment model to avoid MissingSchemaError
require('./models/payment.model');

const TEST_PATIENT_ID = '691fe21b4b0b8b308033efab'; // Existing patient

async function debugCase39() {
  try {
    console.log('🔍 Debugging Case 39: Minimal Prompt Flow\n');
    
    // Connect to DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Clear context
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    let history = [];
    let result;
    
    // Step 1: Minimal prompt with specific date in 2026
    console.log('================================================================================');
    console.log('STEP 1: User says "Tôi muốn đặt lịch khám vào ngày 10/12/2026"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Tôi muốn đặt lịch khám vào ngày 10/12/2026',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Checks:');
    console.log(`   - Asks for service: ${result.response?.toLowerCase().includes('dịch vụ') ? 'YES' : 'NO'}`);
    
    // Step 2: Choose service
    console.log('\n================================================================================');
    console.log('STEP 2: User chooses "Làm sạch răng"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Làm sạch răng',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Checks:');
    console.log(`   - Asks for doctor: ${result.response?.toLowerCase().includes('bác sĩ') ? 'YES' : 'NO'}`);
    console.log(`   - Shows doctor list: ${result.response?.includes('1.') ? 'YES' : 'NO'}`);
    
    // Step 3: Choose doctor
    console.log('\n================================================================================');
    console.log('STEP 3: User chooses "Bác sĩ Dương"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Bác sĩ Dương',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Checks:');
    console.log(`   - Shows time slots: ${result.response?.includes('khung giờ') || /\d{2}:\d{2}/.test(result.response) ? 'YES' : 'NO'}`);
    
    // Step 4: Choose time - Use an available slot from the afternoon range
    console.log('\n================================================================================');
    console.log('STEP 4: User chooses "14:15" (available time)');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      '14:15',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Checks:');
    console.log(`   - Shows confirmation: ${result.response?.toLowerCase().includes('xác nhận') ? 'YES' : 'NO'}`);
    
    // Step 5: Confirm
    console.log('\n================================================================================');
    console.log('STEP 5: User confirms "Có"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Có',
      TEST_PATIENT_ID,
      'self',
      history
    );
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Full Result Object:');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n📊 Final Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Final Checks:');
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Booking success message: ${result.response?.includes('thành công') ? 'YES' : 'NO'}`);
    console.log(`   - Appointment created: ${result.appointment ? 'YES' : 'NO'}`);
    
    // Cleanup
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    await mongoose.disconnect();
    console.log('\n✅ Test complete and database disconnected');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

debugCase39();
