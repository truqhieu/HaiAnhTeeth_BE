/**
 * Test case to verify the fix for "Đã qua thời gian làm việc" bug
 * This should now show correct available slots for tomorrow
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testCase() {
  try {
    console.log('🧪 Testing AI Booking - Fix for "Đã qua thời gian làm việc" bug\n');

    // Test data
    const patientUserId = '691fe21b4b0b8b308033efab'; // User from the log
    const messages = [
      'Tôi muốn đặt lịch làm sạch răng vào ngày mai',
      'bác sĩ Hải'
    ];

    console.log('📋 Test Setup:');
    console.log(`  Patient: ${patientUserId}`);
    console.log(`  Messages: ${messages.join(' → ')}\n`);

    // Send first message
    console.log('📤 Message 1: "Tôi muốn đặt lịch làm sạch răng vào ngày mai"');
    let response = await axios.post(`${BASE_URL}/api/appointments/ai-create`, {
      patientUserId,
      userMessage: messages[0]
    });

    console.log('📥 Response 1:');
    console.log(`  Message: ${response.data.message}`);
    console.log(`  Context: serviceId=${!!response.data.context.serviceId}, doctorId=${!!response.data.context.doctorId}, date=${response.data.context.date}\n`);

    // Send second message
    console.log('📤 Message 2: "bác sĩ Hải"');
    response = await axios.post(`${BASE_URL}/api/appointments/ai-create`, {
      patientUserId,
      userMessage: messages[1]
    });

    console.log('📥 Response 2:');
    console.log(`  Message:\n${response.data.message}\n`);
    console.log(`  Context: serviceId=${!!response.data.context.serviceId}, doctorId=${!!response.data.context.doctorId}, date=${response.data.context.date}, time=${response.data.context.time}\n`);

    // Check for the bug
    if (response.data.message.includes('Đã qua thời gian làm việc')) {
      console.log('❌ BUG STILL EXISTS: Message contains "Đã qua thời gian làm việc"');
      console.log('   This should NOT happen for tomorrow\'s date!');
    } else if (response.data.message.includes('08:00') || response.data.message.includes('14:00')) {
      console.log('✅ BUG FIXED: Message shows actual available time slots');
      console.log('   Morning and afternoon slots are correctly displayed!');
    } else {
      console.log('⚠️  UNEXPECTED: Message does not match expected patterns');
      console.log('   Please review the response manually.');
    }

  } catch (error) {
    console.error('❌ Test Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCase();
