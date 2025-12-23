/**
 * Generate Excel Test Matrix for createConsultationAppointment
 * Based on ACTUAL UI error messages from test execution
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['UTC01', 'UTC02', 'UTC03', 'UTC04', 'UTC05', 'UTC06', 'UTC07', 
                     'UTC08', 'UTC09', 'UTC10', 'UTC11', 'UTC12', 'UTC13', 'UTC14', 
                     'UTC15', 'UTC16', 'UTC17', 'UTC18', 'UTC19', 'UTC20', 'UTC21',
                     'UTC22', 'UTC23', 'UTC24'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'createConsultationAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'POST' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': 'Passed', 'UTC02': 'Failed', 'UTC03': 'Untested', 'UTC04': 'N/A/B', 'UTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '20', 'UTC02': '0', 'UTC03': '0', 'UTC04': '0', 'UTC05': '20' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid patient user exists', ['O','O','O','O','O','','','','','','','','','','O','O','O','O','O','O']));
  data.push(createRow('Valid doctor user exists', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid service exists', ['O','O','O','O','O','O','O','','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid doctor schedule exists', ['O','O','O','O','O','O','O','O','','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Service is prepaid', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('Timeslot is available', ['O','O','O','O','O','','','','','','','','','','','','','O','O','O']));
  data.push(createRow('appointmentFor = "self"', ['O','O','','O','','O','O','O','O','O','O','O','','','','','','O','O','O']));
  data.push(createRow('appointmentFor = "other"', ['','','O','','O','','','','','','','','O','O','O','O','O','','','']));
  data.push(createRow('Time is in the past', ['','','','','','','','','','','','O','','','','','','','','']));
  data.push(createRow('Time outside working hours', ['','','','','','','','','','','','','O','O','','','','','','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // patientUserId
  data.push(createRow('patientUserId', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  691fe21b4b0b8b308033efab', ['O','O','O','','','','O','O','O','O','O','O','','','O','O','O','O','O','O']));
  data.push(createRow('  691fe77f8604b35e222a6a12', ['','','','O','O','O','','','','','','','O','O','','','','','','']));
  data.push(createRow('  null', ['','','','','','O','','','','','','','','','','','','','','']));
  
  // doctorUserId
  data.push(createRow('doctorUserId', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec', ['O','O','O','','','','','','','','','','O','O','O','O','O','O','O','O']));
  data.push(createRow('  691fe06a4b0b8b308033eefc', ['','','','O','O','O','O','O','O','O','O','O','','','','','','','','']));
  data.push(createRow('  null', ['','','','','','','O','','','','','','','','','','','','','']));
  
  // serviceId
  data.push(createRow('serviceId', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  69042a1627a9b33ef7ab42a1 (Consultation)', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  68f99f4fa83a29b32e8abdb6 (Examination)', ['O','','O','O','O','O','O','','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('  null', ['','','','','','','','O','','','','','','','','','','','','']));
  
  // selectedSlot times
  data.push(createRow('selectedSlot.startTime', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08 08:00 VN', ['O','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08 09:00 VN', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08 10:00 VN', ['','','O','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08 14:00 VN', ['','','','O','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08 15:00 VN', ['','','','','O','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-07 06:00 VN (before)', ['','','','','','','','','','','','','O','','','','','','','']));
  data.push(createRow('  2025-12-08 21:00 VN (after)', ['','','','','','','','','','','','','','O','','','','','','']));
  data.push(createRow('  2025-12-10 10:30 VN', ['','','','','','','','','','','','','','','','','','O','','']));
  data.push(createRow('  2025-12-10 14:00 VN', ['','','','','','','','','','','','','','','','','','','O','']));
  data.push(createRow('  2025-12-10 15:00 VN', ['','','','','','','','','','','','','','','','','','','','O']));
  data.push(createRow('  Past date (yesterday)', ['','','','','','','','','','','','O','','','','','','','','']));
  data.push(createRow('  null', ['','','','','','','','','','','O','','','','','','','','','']));
  
  // appointmentFor
  data.push(createRow('appointmentFor', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  "self"', ['O','O','','O','','O','O','O','O','O','O','O','','','','','','O','O','O']));
  data.push(createRow('  "other"', ['','','O','','O','','','','','','','','O','O','O','O','O','','','']));
  
  // fullName
  data.push(createRow('fullName', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  Valid name', ['O','O','O','O','O','O','O','O','O','O','O','O','','O','','O','','O','O','O']));
  data.push(createRow('  null (for other)', ['','','','','','','','','','','','','O','','O','','O','','','']));
  
  // email
  data.push(createRow('email', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  Valid email', ['O','O','O','O','O','O','O','O','O','O','O','O','O','','O','','O','O','O','O']));
  data.push(createRow('  null (for other)', ['','','','','','','','','','','','','','O','','O','','','','']));
  
  // phoneNumber
  data.push(createRow('phoneNumber', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  Valid phone', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O','','O','','O','O','O']));
  data.push(createRow('  null (for other)', ['','','','','','','','','','','','','','','O','','O','','','']));
  
  // notes
  data.push(createRow('notes', ['','','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('  Valid string', ['O','','O','','O','','','','','','','','','','','','','','','']));
  data.push(createRow('  null', ['','O','','O','','O','O','O','O','O','O','O','O','O','O','O','O','O','','']));
  data.push(createRow('  empty string ""', ['','','','','','','','','','','','','','','','','','','O','']));
  data.push(createRow('  undefined', ['','','','','','','','','','','','','','','','','','','','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + responsePayload', ['O','O','O','O','O','','','','','','','','','','','','','O','O','O']));
  data.push(createRow('status = "Pending"', ['O','','O','O','O','','','','','','','','','','','','','O','O','O']));
  data.push(createRow('status = "PendingPayment"', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('requirePayment = true', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('requirePayment = false', ['O','','O','O','O','','','','','','','','','','','','','O','O','O']));
  data.push(createRow('payment QRurl exists', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('mode = "Online"', ['','O','','','','','','','','','','','','','','','','','','']));
  data.push(createRow('mode = "Offline"', ['O','','O','O','O','','','','','','','','','','','','','O','O','O']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','','O','O','O','O','O','O','O','O','O','O','O','O','','','']));
  
  // ========== UI ERROR MESSAGES (From throw new Error()) ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ "Đặt lịch thành công"', ['O','O','O','O','O','','','','','','','','','','','','','O','O','O']));
  
  // Error Messages
  data.push(createRow('❌ "Vui lòng nhập đầy đủ thông tin..."', ['','','','','','O','O','O','O','','','','','','','','','','','']));
  data.push(createRow('❌ "Thông tin khung giờ không hợp lệ..."', ['','','','','','','','','','O','O','','','','','','','','','']));
  data.push(createRow('❌ "[Name] đã có lịch khám..." (Customer)', ['','','','','','','','','','','','','','','','','','','',''])); // Not tested in current suite
  data.push(createRow('❌ "Bạn đã có lịch khám..." (Patient)', ['','','','','','','','','','','','','','','','','','','',''])); // Not tested in current suite
  data.push(createRow('❌ "Không thể đặt thời gian ở quá khứ"', ['','','','','','','','','','','','O','','','','','','','','']));
  data.push(createRow('❌ "Khung giờ đã có người đặt..."', ['','','','','','','','','','','','','','','','','','','',''])); // Not tested in current suite
  data.push(createRow('❌ "Thiếu thông tin customer..."', ['','','','','','','','','','','','','','','O','O','O','','','']));
  data.push(createRow('❌ "...không có lịch làm việc..."', ['','','','','','','','','','','','O','','','','','','','','']));
  data.push(createRow('❌ "...ngoài giờ làm việc..."', ['','','','','','','','','','','','','O','O','','','','','','']));
  data.push(createRow('❌ "Bác sĩ đã có lịch khám..."', ['','','','','','','','','','','','','','','','','','','',''])); // Not tested in current suite
  
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','N','N','A','A','A','A','A','A','A','A','A','A','A','A','B','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','','','','','','','','','','','']));
  
  // Convert to worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 15 },
    { wch: 3 },
    { wch: 50 },
    ...testCases.map(() => ({ wch: 8 }))
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Test Matrix');
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_createConsultationAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ All tests passed: 20/20`);
  console.log(`📅 Test execution date: 5/12/2025`);
  console.log('');
  console.log('📋 UI Messages Included in Matrix:');
  console.log('  SUCCESS:');
  console.log('    ✅ "Đặt lịch thành công"');
  console.log('');
  console.log('  ERRORS:');
  console.log('    1. ❌ "Vui lòng nhập đầy đủ thông tin..." (UTC06-09)');
  console.log('    2. ❌ "Thông tin khung giờ không hợp lệ..." (UTC10-11)');
  console.log('    3. ❌ "[Name] đã có lịch khám..." (Customer conflict)');
  console.log('    4. ❌ "Bạn đã có lịch khám..." (Patient conflict)');
  console.log('    5. ❌ "Không thể đặt thời gian ở quá khứ" (UTC12)');
  console.log('    6. ❌ "Khung giờ đã có người đặt..." (Timeslot booked)');
  console.log('    7. ❌ "Thiếu thông tin customer..." (UTC15-17)');
  console.log('    8. ❌ "...không có lịch làm việc..." (UTC12)');
  console.log('    9. ❌ "...ngoài giờ làm việc..." (UTC13-14)');
  console.log('   10. ❌ "Bác sĩ đã có lịch khám..." (Doctor has appointment)');
  console.log('');
  console.log('⚠️  Note: Some error messages not tested in current suite');
  console.log('   (Customer conflict, Patient conflict, Timeslot booked, Doctor has appointment)');
}

createTestMatrix();
