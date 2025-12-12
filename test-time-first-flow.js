/**
 * Test Case: User selects time first, then doctor, then service
 * Expected: System should show confirmation with the selected time, not ask to choose time again
 * 
 * Flow:
 * 1. User: "Tôi muốn đặt lịch vào 9h ngày mai"
 *    - AI should show list of available doctors at 9h
 * 2. User: "bác sĩ hiếu"
 *    - AI should show list of services
 * 3. User: "làm sạch răng"
 *    - AI should show CONFIRMATION with time 09:00, NOT ask to choose time again
 */

const aiBookingService = require('../services/aiBookingLangchain.service');
const User = require('../models/user.model');
const Service = require('../models/service.model');

const TEST_PATIENT_ID = '693b1f59868fd0cfcd5c9a90'; // Replace with actual test patient ID

async function testTimeFirstFlow() {
  console.log('='.repeat(80));
  console.log('TEST: User selects TIME first, then DOCTOR, then SERVICE');
  console.log('='.repeat(80));
  
  try {
    // Clear context before test
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    let history = [];
    let result;
    
    // Step 1: User provides time and date
    console.log('\\n📍 Step 1: User says "Tôi muốn đặt lịch vào 9h ngày mai"');
    result = await aiBookingService.chatWithAI(
      'Tôi muốn đặt lịch vào 9h ngày mai',
      TEST_PATIENT_ID,
      history,
      true // isNewConversation
    );
    console.log('AI Response:', result.response);
    
    // Verify: Should show list of doctors available at 9h
    const showsDoctorList = result.response.includes('bác sĩ') && 
                           (result.response.includes('1.') || result.response.includes('2.'));
    console.log('✓ Shows doctor list:', showsDoctorList ? 'YES' : 'NO');
    
    if (!showsDoctorList) {
      console.error('❌ TEST FAILED: Should show doctor list');
      return false;
    }
    
    history.push({ role: 'user', content: 'Tôi muốn đặt lịch vào 9h ngày mai' });
    history.push({ role: 'assistant', content: result.response });
    
    // Step 2: User selects doctor
    console.log('\\n📍 Step 2: User says "bác sĩ hiếu"');
    result = await aiBookingService.chatWithAI(
      'bác sĩ hiếu',
      TEST_PATIENT_ID,
      history
    );
    console.log('AI Response:', result.response);
    
    // Verify: Should show list of services
    const showsServiceList = result.response.includes('dịch vụ') && 
                            (result.response.includes('1.') || result.response.includes('Làm sạch răng'));
    console.log('✓ Shows service list:', showsServiceList ? 'YES' : 'NO');
    
    if (!showsServiceList) {
      console.error('❌ TEST FAILED: Should show service list');
      return false;
    }
    
    history.push({ role: 'user', content: 'bác sĩ hiếu' });
    history.push({ role: 'assistant', content: result.response });
    
    // Step 3: User selects service
    console.log('\\n📍 Step 3: User says "làm sạch răng"');
    result = await aiBookingService.chatWithAI(
      'làm sạch răng',
      TEST_PATIENT_ID,
      history
    );
    console.log('AI Response:', result.response);
    
    // ⭐ CRITICAL CHECK: Should show CONFIRMATION with 09:00, NOT ask to choose time again
    const showsConfirmation = result.response.includes('Xác nhận') || result.response.includes('xác nhận');
    const showsTime09 = result.response.includes('09:00') || result.response.includes('9:00');
    const asksForTime = result.response.includes('Bạn muốn chọn giờ nào') || 
                       result.response.includes('chọn giờ');
    
    console.log('✓ Shows confirmation:', showsConfirmation ? 'YES' : 'NO');
    console.log('✓ Shows time 09:00:', showsTime09 ? 'YES' : 'NO');
    console.log('✓ Asks for time (should be NO):', asksForTime ? 'YES ❌' : 'NO ✅');
    
    const testPassed = showsConfirmation && showsTime09 && !asksForTime;
    
    if (testPassed) {
      console.log('\\n✅ TEST PASSED: System correctly shows confirmation with selected time');
    } else {
      console.log('\\n❌ TEST FAILED:');
      if (!showsConfirmation) console.log('  - Missing confirmation message');
      if (!showsTime09) console.log('  - Missing time 09:00 in response');
      if (asksForTime) console.log('  - Incorrectly asks user to choose time again');
    }
    
    // Cleanup
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    return testPassed;
    
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    console.error(error.stack);
    return false;
  }
}

// Run test
if (require.main === module) {
  testTimeFirstFlow()
    .then(passed => {
      console.log('\\n' + '='.repeat(80));
      console.log(passed ? '✅ ALL TESTS PASSED' : '❌ TESTS FAILED');
      console.log('='.repeat(80));
      process.exit(passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testTimeFirstFlow };
