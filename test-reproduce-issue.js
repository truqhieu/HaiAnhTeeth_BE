require('dotenv').config();
const mongoose = require('mongoose');
const { AIBookingLangchainService } = require('./services/aiBookingLangchain.service');

const TEST_PATIENT_ID = '691fe21b4b0b8b308033efab';
const aiBookingService = new AIBookingLangchainService();

async function runTest() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/healingmedicine';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Clear context
    aiBookingService.clearConversationContext(TEST_PATIENT_ID);

    const prompt = "Tôi muốn đặt lịch với bác sĩ Hải vào 8 giờ hôm nay";
    console.log(`\nUser: "${prompt}"`);

    const result = await aiBookingService.createAppointmentFromAI(
      prompt,
      TEST_PATIENT_ID,
      'self',
      []
    );

    console.log(`\nBot: "${result.response || result.message}"`);
    
    // Check context to see what happened
    const context = aiBookingService.getConversationContext(TEST_PATIENT_ID);
    console.log('\nFinal Context:', context);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
