/**
 * Debug script for Case 43: Weekday parsing after "tuần sau"
 * Run this to see detailed output at each step
 */

require('dotenv').config();
const mongoose = require('mongoose');
const aiBookingService = require('./services/aiBookingLangchain.service');

// ⭐ Import models to avoid MissingSchemaError
require('./models/payment.model');

const TEST_PATIENT_ID = '691fe21b4b0b8b308033efab'; // Existing patient

async function debugCase43() {
  try {
    console.log('🔍 Debugging Case 43: Weekday Parsing\n');
    
    // Connect to DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Clear context
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    let history = [];
    let result;
    
    // Step 1: User says "tuần sau"
    console.log('\n================================================================================');
    console.log('STEP 1: User says "Tôi muốn đặt lịch vào tuần sau"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Tôi muốn đặt lịch vào tuần sau',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Checks:');
    console.log(`   - Asks which day OR shows services: ${result.response?.toLowerCase().includes('thứ') || result.response?.includes('dịch vụ') ? 'YES' : 'NO'}`);
    console.log(`   - needsSpecificDayOfWeek flag: ${aiBookingService.getConversationContext(TEST_PATIENT_ID).needsSpecificDayOfWeek ? 'SET' : 'NOT SET'}`);
    
    // Step 2: User chooses service
    console.log('\n================================================================================');
    console.log('STEP 2: User chooses "làm sạch răng"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'làm sạch răng',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    console.log('\n✅ Checks:');
    console.log(`   - Confirms service: ${result.response?.includes('Làm sạch răng') ? 'YES' : 'NO'}`);
    console.log(`   - Asks for day OR doctor OR time: ${result.response?.toLowerCase().includes('thứ') || result.response?.toLowerCase().includes('bác sĩ') || result.response?.includes('khung giờ') ? 'YES' : 'NO'}`);
    
    // Step 3: User says "thứ 2" (THE KEY TEST!)
    console.log('\n================================================================================');
    console.log('STEP 3: User says "thứ 2" (Monday)');
    console.log('================================================================================');
    console.log('⭐ KEY TEST: AI should parse "thứ 2" and continue, NOT ask "thứ mấy" again');
    result = await aiBookingService.createAppointmentFromAI(
      'thứ 2',
      TEST_PATIENT_ID,
      'self',
      history
    );
    history = result.conversationHistory || result.parsedData?.conversationHistory || [];
    console.log('\n📦 AI Response:');
    console.log(result.response || result.message);
    console.log('\n📊 Context:', aiBookingService.getConversationContext(TEST_PATIENT_ID));
    
    const asksAgain = result.response?.toLowerCase().includes('thứ mấy') || 
                      result.response?.toLowerCase().includes('chọn thứ');
    const hasDate = aiBookingService.getConversationContext(TEST_PATIENT_ID).date;
    const flagCleared = !aiBookingService.getConversationContext(TEST_PATIENT_ID).needsSpecificDayOfWeek;
    const progressedToNext = result.response?.toLowerCase().includes('bác sĩ') || 
                             result.response?.includes('khung giờ');
    
    console.log('\n✅ Final Checks:');
    console.log(`   - Asks "thứ mấy" again: ${asksAgain ? '❌ YES (BUG!)' : '✅ NO'}`);
    console.log(`   - Date calculated: ${hasDate ? `✅ YES (${hasDate})` : '❌ NO'}`);
    console.log(`   - Flag cleared: ${flagCleared ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Progressed to next step: ${progressedToNext ? '✅ YES' : '❌ NO'}`);
    
    if (!asksAgain && hasDate && flagCleared && progressedToNext) {
      console.log('\n🎉 ✅ TEST PASSED! Weekday parsing works correctly!');
    } else {
      console.log('\n❌ TEST FAILED! There are issues:');
      if (asksAgain) console.log('   - AI asks "thứ mấy" again (should not)');
      if (!hasDate) console.log('   - Date not calculated from "thứ 2"');
      if (!flagCleared) console.log('   - needsSpecificDayOfWeek flag not cleared');
      if (!progressedToNext) console.log('   - Did not progress to doctor/time selection');
    }
    
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

debugCase43();
