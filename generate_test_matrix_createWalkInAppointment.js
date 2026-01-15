/**
 * Generate Excel Test Matrix for createWalkInAppointment
 * Based on test execution results - 11 test cases all passed
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['WTC01', 'WTC02', 'WTC03', 'WTC04', 'WTC05', 'WTC06', 
                     'WTC07', 'WTC08', 'WTC09', 'WTC10', 'WTC11'];
  
  const createRow = (label, values) => {
    const row = { '': '', ' ': '', 'Field': label };
    testCases.forEach((tc, idx) => {
      row[tc] = values[idx] || '';
    });
    return row;
  };
  
  const data = [];
  
  // Header rows
  data.push({ '': 'Code Module', ' ': '', 'Field': 'Appointment Service' });
  data.push({ '': 'Created By', ' ': '', 'Field': 'Developer Team' });
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'createWalkInAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'POST' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'WTC01': 'Passed', 'WTC02': 'Failed', 'WTC03': 'Untested', 'WTC04': 'N/A/B', 'WTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'WTC01': '11', 'WTC02': '0', 'WTC03': '0', 'WTC04': '0', 'WTC05': '11' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid staff user exists', ['O','','','','','','','','','','']));
  data.push(createRow('Valid doctor user exists', ['O','O','O','O','O','O','O','','O','O','O']));
  data.push(createRow('Valid service exists', ['O','O','O','O','O','O','O','','O','O','O']));
  data.push(createRow('Valid doctor schedule exists', ['O','O','O','O','O','O','O','O','','O','O']));
  data.push(createRow('Timeslot is available', ['O','','O','','','','','','','','']));
  data.push(createRow('Timeslot is reserved by staff', ['','O','','','','','','','','','']));
  data.push(createRow('Time is in the past', ['','','','','','','','','','','O']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // staffUserId
  data.push(createRow('staffUserId', ['','','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec', ['O','O','O','','O','O','O','O','O','O','O']));
  data.push(createRow('  null', ['','','','O','','','','','','','']));
  
  // doctorUserId
  data.push(createRow('doctorUserId', ['','','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec', ['O','O','O','O','','O','O','O','','O','O']));
  data.push(createRow('  000000000000000000000000', ['','','','','','','','','O','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','']));
  
  // serviceId
  data.push(createRow('serviceId', ['','','','','','','','','','','']));
  data.push(createRow('  68f99f4fa83a29b32e8abdb6 (Examination)', ['O','O','','O','','O','O','','O','O','O']));
  data.push(createRow('  69042a1627a9b33ef7ab42a1 (Consultation)', ['','','O','','','','','','','','']));
  data.push(createRow('  000000000000000000000000', ['','','','','','','','O','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','']));
  
  // selectedSlot times
  data.push(createRow('selectedSlot.startTime', ['','','','','','','','','','','']));
  data.push(createRow('  2025-12-15 08:00 VN', ['O','','','O','O','O','O','O','O','','']));
  data.push(createRow('  2025-12-15 09:00 VN', ['','O','','','','','','','','','']));
  data.push(createRow('  2025-12-15 10:00 VN', ['','','O','','','','','','','','']));
  data.push(createRow('  2025-12-16 08:00 VN', ['','','','','','','','','','O','']));
  data.push(createRow('  2025-01-01 08:00 VN (past)', ['','','','','','','','','','','O']));
  data.push(createRow('  invalid-date', ['','','','','','','O','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','']));
  
  // Patient information
  data.push(createRow('fullName', ['','','','','','','','','','','']));
  data.push(createRow('  "Nguyễn Văn A"', ['O','','','O','','O','O','O','O','O','O']));
  data.push(createRow('  "Trần Thị B"', ['','O','','','','','','','','','']));
  data.push(createRow('  "Lê Văn C"', ['','','O','','','','','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','']));
  
  data.push(createRow('email', ['','','','','','','','','','','']));
  data.push(createRow('  "walkin.test1@test.com"', ['O','','','O','','O','O','O','O','O','O']));
  data.push(createRow('  "walkin.test2@test.com"', ['','O','','','','','','','','','']));
  data.push(createRow('  "walkin.test3@test.com"', ['','','O','','','','','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','']));
  
  data.push(createRow('phoneNumber', ['','','','','','','','','','','']));
  data.push(createRow('  "0901234567"', ['O','','','O','','O','O','O','O','O','O']));
  data.push(createRow('  "0902345678"', ['','O','','','','','','','','','']));
  data.push(createRow('  "0903456789"', ['','','O','','','','','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','']));
  
  // notes
  data.push(createRow('notes', ['','','','','','','','','','','']));
  data.push(createRow('  "Walk-in patient test"', ['O','','','','','','','','','','']));
  data.push(createRow('  null', ['','O','O','O','O','O','O','O','O','O','O']));
  
  // reservedTimeslotId
  data.push(createRow('reservedTimeslotId', ['','','','','','','','','','','']));
  data.push(createRow('  Valid reserved slot ID', ['','O','','','','','','','','','']));
  data.push(createRow('  null', ['O','','O','O','O','O','O','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + responsePayload', ['O','O','O','','','','','','','','']));
  data.push(createRow('success = true', ['O','O','O','','','','','','','','']));
  data.push(createRow('data.status = "Approved"', ['O','O','O','','','','','','','','']));
  data.push(createRow('data.mode = "Offline"', ['O','O','O','','','','','','','','']));
  data.push(createRow('data.appointmentId exists', ['O','O','O','','','','','','','','']));
  data.push(createRow('data.patientName correct', ['O','O','O','','','','','','','','']));
  data.push(createRow('Customer created in DB', ['O','O','O','','','','','','','','']));
  data.push(createRow('Timeslot created/reused', ['O','O','O','','','','','','','','']));
  data.push(createRow('Pricing calculated', ['O','O','O','','','','','','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','O','O','O','O','O','O','O','O']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ \"Đặt lịch thành công\"', ['O','O','O','','','','','','','','']));
  
  // Error Messages
  data.push(createRow('❌ \"Thiếu thông tin người tạo (staffUserId)\"', ['','','','O','','','','','','','']));
  data.push(createRow('❌ \"Vui lòng cung cấp đủ: dịch vụ, bác sĩ và khung giờ\"', ['','','','','O','','','','','','']));
  data.push(createRow('❌ \"Vui lòng nhập đầy đủ họ tên, email và số điện thoại...\"', ['','','','','','O','','','','','']));
  data.push(createRow('❌ \"Thời gian khung giờ không hợp lệ\"', ['','','','','','','O','','','','']));
  data.push(createRow('❌ \"Dịch vụ không tồn tại\"', ['','','','','','','','O','','','']));
  data.push(createRow('❌ \"Bác sĩ không hợp lệ\"', ['','','','','','','','','O','','']));
  data.push(createRow('❌ \"Bác sĩ đã có lịch khám vào thời gian này...\"', ['','','','','','','','','','O','']));
  data.push(createRow('❌ \"...chưa có lịch làm việc...\" (Past date)', ['','','','','','','','','','','O']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','A','A','A','A','A','A','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','','']));
  
  // Convert to worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 15 },
    { wch: 3 },
    { wch: 60 },
    ...testCases.map(() => ({ wch: 8 }))
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Test Matrix');
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_createWalkInAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ All tests passed: 11/11`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (WTC01-WTC03):');
  console.log('    WTC01: Valid Walk-in Appointment (Examination)');
  console.log('    WTC02: Walk-in with Reserved Timeslot');
  console.log('    WTC03: Walk-in with Consultation Service');
  console.log('');
  console.log('  VALIDATION ERROR CASES (WTC04-WTC09):');
  console.log('    WTC04: Missing Staff User ID');
  console.log('    WTC05: Missing Required Fields');
  console.log('    WTC06: Missing Patient Information');
  console.log('    WTC07: Invalid Time Slot');
  console.log('    WTC08: Invalid Service');
  console.log('    WTC09: Invalid Doctor');
  console.log('');
  console.log('  CONFLICT CASES (WTC10-WTC11):');
  console.log('    WTC10: Time Slot Already Booked');
  console.log('    WTC11: Past Time Slot');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Walk-in appointment creation by staff');
  console.log('  ✓ Reserved timeslot reuse');
  console.log('  ✓ Customer creation and linking');
  console.log('  ✓ Pricing calculation');
  console.log('  ✓ Status and mode validation (Approved, Offline)');
  console.log('  ✓ Input validation (staff, doctor, service, patient info)');
  console.log('  ✓ Conflict detection (time slot, past time)');
}

createTestMatrix();
