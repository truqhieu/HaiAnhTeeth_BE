/**
 * Debug script for Case 38: Online consultation with payment
 * Run this to see detailed output at each step
 */

require('dotenv').config();
const mongoose = require('mongoose');
const aiBookingService = require('./services/aiBookingLangchain.service');
const Service = require('./models/service.model');

// ⭐ Import Payment model to avoid MissingSchemaError
require('./models/payment.model');

const TEST_PATIENT_ID = '691fe21b4b0b8b308033efab'; // Existing patient

async function debugCase38() {
  try {
    console.log('🔍 Debugging Case 38: Online Consultation with Payment\n');
    
    // Connect to DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    // Step 0: Check if "Khám tổng quát" service exists
    console.log('================================================================================');
    console.log('STEP 0: Checking "Khám tổng quát" service');
    console.log('================================================================================');
    let khamTongQuatService = await Service.findOne({
      serviceName: 'Khám tổng quát',
      status: 'Active'
    });
    
    if (!khamTongQuatService) {
      console.log('⚠️ Service not found, creating test service...');
      khamTongQuatService = await Service.create({
        serviceName: 'Khám tổng quát',
        description: 'Khám tổng quát nha khoa trực tuyến',
        price: 200000,
        isPrepaid: true,
        durationMinutes: 30,
        status: 'Active',
        category: 'Consultation'
      });
      console.log('✅ Created test service:', {
        name: khamTongQuatService.serviceName,
        price: khamTongQuatService.price,
        isPrepaid: khamTongQuatService.isPrepaid,
        category: khamTongQuatService.category
      });
    } else {
      console.log('✅ Found service:', {
        name: khamTongQuatService.serviceName,
        price: khamTongQuatService.price,
        isPrepaid: khamTongQuatService.isPrepaid,
        category: khamTongQuatService.category
      });
    }
    
    // Clear context
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);
    
    let history = [];
    let result;
    
    // Step 1: User requests appointment with doctor for tomorrow
    console.log('\n================================================================================');
    console.log('STEP 1: User says "Tôi muốn đặt lịch với bác sĩ Dương vào ngày mai"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Tôi muốn đặt lịch với bác sĩ Dương vào ngày mai',
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
    
    // Step 2: Choose online service "Khám tổng quát"
    console.log('\n================================================================================');
    console.log('STEP 2: User chooses "Khám tổng quát" (online, prepaid)');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Khám tổng quát',
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
    
    // Step 3: Choose time
    console.log('\n================================================================================');
    console.log('STEP 3: User chooses "15:00"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      '15:00',
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
    
    // Step 4: Confirm
    console.log('\n================================================================================');
    console.log('STEP 4: User confirms "Có, tôi xác nhận"');
    console.log('================================================================================');
    result = await aiBookingService.createAppointmentFromAI(
      'Có, tôi xác nhận',
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
    console.log(`   - Mentions payment: ${result.response?.includes('thanh toán') || result.response?.includes('QR') ? 'YES' : 'NO'}`);
    console.log(`   - Has requirePayment flag: ${result.requirePayment ? 'YES' : 'NO'}`);
    console.log(`   - Has payment object: ${result.payment ? 'YES' : 'NO'}`);
    if (result.payment) {
      console.log(`   - Payment details:`, result.payment);
    }
    console.log(`   - No appointment code: ${!result.response?.includes('Mã lịch') && !result.response?.includes('#') ? 'YES' : 'NO'}`);
    
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

debugCase38();
