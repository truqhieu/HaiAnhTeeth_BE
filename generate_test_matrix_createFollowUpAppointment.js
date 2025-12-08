/**
 * Generate Excel Test Matrix for createFollowUpAppointment
 * Based on test execution results - 14 test cases (13 active + 1 skipped)
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['FTC01', 'FTC02', 'FTC03', 'FTC04', 'FTC05', 'FTC06', 
                     'FTC07', 'FTC08', 'FTC09', 'FTC10', 'FTC11', 'FTC12', 
                     'FTC13', 'FTC14'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'createFollowUpAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'POST' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'FTC01': 'Passed', 'FTC02': 'Failed', 'FTC03': 'Untested', 'FTC04': 'N/A/B', 'FTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'FTC01': '13', 'FTC02': '0', 'FTC03': '0', 'FTC04': '1', 'FTC05': '14' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid doctor exists', ['O','O','O','O','','','','','','','','O','O','O']));
  data.push(createRow('Valid patient exists', ['O','','','O','','','','','','','','','','']));
  data.push(createRow('Valid service exists', ['O','O','O','O','','','','','','','','O','O','O']));
  data.push(createRow('Completed appointment exists', ['O','O','O','O','','','','','','','','O','O','O']));
  data.push(createRow('Medical record exists', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('Walk-in customer exists', ['','O','','','','','','','','','','','','']));
  data.push(createRow('Time is in the past', ['','','','','','','','O','','','','','','']));
  data.push(createRow('Time slot already booked', ['','','','','','','','','','','','','O','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // originalAppointmentId
  data.push(createRow('originalAppointmentId', ['','','','','','','','','','','','','','']));
  data.push(createRow('  Valid patient appointment', ['O','','','O','','O','O','O','','O','','O','O','O']));
  data.push(createRow('  Valid walk-in appointment', ['','O','','','','','','','','','','','','']));
  data.push(createRow('  Valid appointment (multiple services)', ['','','O','','','','','','','','','','','']));
  data.push(createRow('  000000000000000000000000', ['','','','','','','','','O','','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','','','','']));
  
  // followUpDate
  data.push(createRow('followUpDate', ['','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-20 08:00 VN', ['O','','','','O','','','','','','','','','']));
  data.push(createRow('  2025-12-20 09:00 VN', ['','O','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-20 10:00 VN', ['','','O','','','','','','','','','','','']));
  data.push(createRow('  2025-12-21 08:00 VN', ['','','','O','','','','','','','','','','']));
  data.push(createRow('  2026-12-01 08:00 VN', ['','','','','','','','','','','','O','','']));
  data.push(createRow('  2025-12-22 08:00 VN', ['','','','','','','','','','','','','O','']));
  data.push(createRow('  2025-12-20 21:00 VN (outside hours)', ['','','','','','','','','','','','','','O']));
  data.push(createRow('  Yesterday (past)', ['','','','','','','','O','','','','','','']));
  data.push(createRow('  "invalid-date"', ['','','','','','','O','','','','','','','']));
  data.push(createRow('  null', ['','','','','','O','','','','','','','','']));
  
  // followUpNote
  data.push(createRow('followUpNote', ['','','','','','','','','','','','','','']));
  data.push(createRow('  "Tái khám sau 1 tuần"', ['O','','','','','','','','','','','','','']));
  data.push(createRow('  "Kiểm tra lại sau điều trị"', ['','O','','','','','','','','','','','','']));
  data.push(createRow('  "Điều trị bổ sung"', ['','','O','','','','','','','','','','','']));
  data.push(createRow('  Custom long note', ['','','','O','','','','','','','','','','']));
  data.push(createRow('  null/empty', ['','','','','O','O','O','O','O','O','O','O','O','O']));
  
  // actingDoctorId
  data.push(createRow('actingDoctorId', ['','','','','','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  
  // serviceId / serviceIds
  data.push(createRow('serviceId', ['','','','','','','','','','','','','','']));
  data.push(createRow('  68f99f4fa83a29b32e8abdb6 (Examination)', ['O','O','','','O','O','O','O','O','','','O','O','O']));
  data.push(createRow('  000000000000000000000000', ['','','','','','','','','','O','','','','']));
  data.push(createRow('  null (use original)', ['','','','O','','','','','','','','','','']));
  
  data.push(createRow('serviceIds (array)', ['','','','','','','','','','','','','','']));
  data.push(createRow('  [Examination]', ['','','O','','','','','','','','','','','']));
  data.push(createRow('  null', ['O','O','','O','O','O','O','O','O','O','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + Appointment object', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('status = "Approved"', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('mode = "Offline"', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('type = "FollowUp"', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('_id exists', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('patientUserId linked', ['O','','','O','','','','','','','','','','']));
  data.push(createRow('customerId linked', ['','O','','','','','','','','','','','','']));
  data.push(createRow('followUpOfAppointmentId set', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('Medical record created', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('Timeslot created', ['O','O','O','O','','','','','','','','','','']));
  data.push(createRow('Email sent', ['O','O','O','O','','','','','','','','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','O','O','O','O','O','O','O','','O','O']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ "Đã lưu và duyệt hồ sơ khám bệnh"', ['O','O','O','O','','','','','','','','','','']));
  
  // Error Messages
  data.push(createRow('❌ "Thiếu thông tin ca khám gốc..."', ['','','','','O','','','','','','','','','']));
  data.push(createRow('❌ "Vui lòng chọn thời gian tái khám"', ['','','','','','O','','','','','','','','']));
  data.push(createRow('❌ "Thời gian tái khám không hợp lệ"', ['','','','','','','O','','','','','','','']));
  data.push(createRow('❌ "Không thể đặt thời gian ở quá khứ"', ['','','','','','','','O','','','','','','']));
  data.push(createRow('❌ "Không tìm thấy ca khám gốc"', ['','','','','','','','','O','','','','','']));
  data.push(createRow('❌ "Dịch vụ của ca khám không tồn tại"', ['','','','','','','','','','O','','','','']));
  data.push(createRow('❌ "Không tìm thấy dịch vụ để tạo tái khám"', ['','','','','','','','','','','O','','','']));
  data.push(createRow('❌ "Khung giờ tái khám bị trùng..."', ['','','','','','','','','','','','','O','']));
  data.push(createRow('❌ "Thời gian tái khám không nằm trong ca làm việc..."', ['','','','','','','','','','','','','','O']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','N','A','A','A','A','A','A','A','B','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P','P','S','P','P']));
  data.push(createRow('Executed Date', ['6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','','','N/A','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_createFollowUpAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 13/14 (1 skipped)`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (FTC01-FTC04):');
  console.log('    FTC01: Valid Follow-up for Patient Appointment');
  console.log('    FTC02: Valid Follow-up for Walk-in Customer (Examination)');
  console.log('    FTC03: Follow-up with Multiple Examination Services');
  console.log('    FTC04: Follow-up with Custom Note');
  console.log('');
  console.log('  VALIDATION ERROR CASES (FTC05-FTC11):');
  console.log('    FTC05: Missing Original Appointment ID');
  console.log('    FTC06: Missing Follow-up Date');
  console.log('    FTC07: Invalid Follow-up Date');
  console.log('    FTC08: Past Follow-up Time');
  console.log('    FTC09: Original Appointment Not Found');
  console.log('    FTC10: Service Not Found');
  console.log('    FTC11: No Service Available');
  console.log('');
  console.log('  CONFLICT CASES (FTC12-FTC14):');
  console.log('    FTC12: Doctor Has No Schedule (SKIPPED - auto-creates)');
  console.log('    FTC13: Time Slot Already Booked');
  console.log('    FTC14: Time Outside Working Hours');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Doctor-initiated follow-up appointments');
  console.log('  ✓ Auto-approved status (no review needed)');
  console.log('  ✓ Patient and walk-in customer support');
  console.log('  ✓ Only Examination services allowed (not Consultation)');
  console.log('  ✓ Multiple services handling');
  console.log('  ✓ Medical record creation from original');
  console.log('  ✓ Email notifications');
  console.log('  ✓ Time validation and conflict detection');
  console.log('');
  console.log('⚠️  Note: FTC12 skipped - system auto-creates schedules');
}

createTestMatrix();
