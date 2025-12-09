/**
 * Debug script to test availableSlot.service.getDoctorScheduleRange for TOMORROW
 * AND test AI service's get_available_slots tool
 * To verify the "Đã qua thời gian làm việc" bug
 */

require('dotenv').config();
const mongoose = require('mongoose');
const availableSlotService = require('./services/availableSlot.service');
const AIBookingLangchainService = require('./services/aiBookingLangchain.service');

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Test data from user's log
    const patientUserId = '691fe21b4b0b8b308033efab';
    const doctorId = '6920053726c95e310ffd2286'; // Bác sĩ Hải
    const serviceId = '68f99f4fa83a29b32e8abdb6'; // Làm sạch răng
    const date = '2025-12-10'; // Tomorrow

    console.log('📋 Test Parameters:');
    console.log(`  Patient: ${patientUserId}`);
    console.log(`  Doctor ID: ${doctorId}`);
    console.log(`  Service ID: ${serviceId}`);
    console.log(`  Date: ${date}`);
    console.log('');

    // ========== TEST 1: availableSlotService.getDoctorScheduleRange ==========
    console.log('='.repeat(80));
    console.log('TEST 1: availableSlotService.getDoctorScheduleRange');
    console.log('='.repeat(80));
    
    const result = await availableSlotService.getDoctorScheduleRange({
      doctorUserId: doctorId,
      serviceId: serviceId,
      date: date,
      patientUserId: null,
      appointmentFor: 'self'
    });

    console.log('\n✅ Result from availableSlotService:');
    result.scheduleRanges?.forEach(range => {
      console.log(`  ${range.shiftDisplay}: ${range.displayRange} (${range.availableGaps?.length || 0} gaps)`);
    });

    // ========== TEST 2: AI Service get_available_slots tool ==========
    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: AI Service get_available_slots tool');
    console.log('='.repeat(80));

    // AIBookingLangchainService is exported as a singleton instance
    const tools = AIBookingLangchainService.createTools(patientUserId);
    
    // Find get_available_slots tool (index 4)
    const getAvailableSlotsFunc = tools[4].func;
    
    console.log('\n🔧 Calling AI Service get_available_slots tool...');
    const toolResult = await getAvailableSlotsFunc({
      doctorId: doctorId,
      date: date,
      serviceId: serviceId
    });

    const toolResultParsed = JSON.parse(toolResult);
    console.log('\n✅ Tool Result:');
    console.log(`  Success: ${toolResultParsed.success}`);
    console.log(`  Morning Display: "${toolResultParsed.morningDisplay}"`);
    console.log(`  Afternoon Display: "${toolResultParsed.afternoonDisplay}"`);
    console.log(`  Has scheduleRanges: ${!!toolResultParsed.scheduleRanges}`);
    
    if (toolResultParsed.scheduleRanges) {
      console.log('\n  Schedule Ranges from tool:');
      toolResultParsed.scheduleRanges.forEach(range => {
        console.log(`    ${range.shiftDisplay}: ${range.displayRange} (${range.availableGaps?.length || 0} gaps)`);
      });
    }

    // ========== TEST 3: Simulate Fallback Code (NEW format check) ==========
    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: Simulate Fallback Code (NEW format)');
    console.log('='.repeat(80));

    const slots = toolResultParsed;
    let finalResponse = `Các khung giờ khả dụng ngày ${date}:`;
    
    if (slots.scheduleRanges && Array.isArray(slots.scheduleRanges)) {
      console.log('\n✅ Using NEW format (scheduleRanges)');
      
      for (const range of slots.scheduleRanges) {
        if (range.shift === 'Morning') {
          if (range.availableGaps && range.availableGaps.length > 0) {
            finalResponse += `\n- Buổi sáng: ${range.displayRange}`;
          } else {
            finalResponse += `\n- Buổi sáng: Đã qua thời gian làm việc`;
          }
        } else if (range.shift === 'Afternoon') {
          if (range.availableGaps && range.availableGaps.length > 0) {
            finalResponse += `\n- Buổi chiều: ${range.displayRange}`;
          } else {
            finalResponse += `\n- Buổi chiều: Không có thời gian khả dụng`;
          }
        }
      }
    } else {
      console.log('\n⚠️ Using LEGACY format (morning/afternoon)');
      finalResponse += `\n- Buổi sáng: ${slots.morningDisplay}`;
      finalResponse += `\n- Buổi chiều: ${slots.afternoonDisplay}`;
    }
    
    finalResponse += '\n\nBạn muốn chọn giờ nào?';

    console.log('\n📝 Final Response (as shown to user):');
    console.log(finalResponse);

    // ========== VERIFICATION ==========
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION');
    console.log('='.repeat(80));

    let bugFound = false;
    
    if (finalResponse.includes('Đã qua thời gian làm việc')) {
      console.log('\n❌ BUG FOUND: Response contains "Đã qua thời gian làm việc" for TOMORROW!');
      console.log('   This should NOT happen for future dates.');
      bugFound = true;
    }
    
    if (finalResponse.includes('08:00') && finalResponse.includes('14:00')) {
      console.log('\n✅ FIX VERIFIED: Response shows actual time slots (08:00, 14:00)');
    }
    
    if (!bugFound) {
      console.log('\n✅ ALL TESTS PASSED: No bugs detected!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

main();
