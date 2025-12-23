/**
 * Generate Excel Test Matrix for checkInAppointment
 * Total: 8 test cases
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['CI01', 'CI02', 'CI03', 'CI04', 'CI05', 'CI06', 'CI07', 'CI08'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'checkInAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'CHECK-IN' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'CI01': 'Passed', 'CI02': 'Failed', 'CI03': 'Untested', 'CI04': 'N/A/B', 'CI05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'CI01': '8', 'CI02': '0', 'CI03': '0', 'CI04': '0', 'CI05': '8' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O']));
  data.push(createRow('Appointment exists', ['O','O','O','O','','','O','O']));
  data.push(createRow('Appointment is Approved', ['O','','','','','','','']));
  data.push(createRow('Appointment is No-Show', ['','O','','','','','','']));
  data.push(createRow('Appointment is Pending', ['','','O','','','','','']));
  data.push(createRow('Appointment is CheckedIn', ['','','','O','','','','']));
  data.push(createRow('Appointment is Completed', ['','','','','','','','O']));
  data.push(createRow('Appointment is today', ['O','O','O','O','','','','O']));
  data.push(createRow('Appointment is future', ['','','','','','','O','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','']));
  data.push(createRow('  Valid (Approved)', ['O','','','','','','','']));
  data.push(createRow('  Valid (No-Show)', ['','O','','','','','','']));
  data.push(createRow('  Valid (Pending)', ['','','O','','','','','']));
  data.push(createRow('  Valid (CheckedIn)', ['','','','O','','','','']));
  data.push(createRow('  Valid (Completed)', ['','','','','','','','O']));
  data.push(createRow('  Valid (Future)', ['','','','','','','O','']));
  data.push(createRow('  000000000000000000000000', ['','','','','','O','','']));
  data.push(createRow('  null', ['','','','','O','','','']));
  
  // newStatus
  data.push(createRow('newStatus', ['','','','','','','','']));
  data.push(createRow('  "CheckedIn"', ['O','O','O','O','O','O','O','O']));
  
  // userId
  data.push(createRow('userId', ['','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec (nurse)', ['O','O','O','O','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + Appointment object', ['O','O','','','','','','']));
  data.push(createRow('status = "CheckedIn"', ['O','O','','','','','','']));
  data.push(createRow('checkedInAt timestamp set', ['O','O','','','','','','']));
  data.push(createRow('checkInByUserId saved', ['O','O','','','','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','O','O','O','O','O','O']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ Check-in successful', ['O','O','','','','','','']));
  
  // Error Messages
  data.push(createRow('❌ "Không thể check-in" (wrong status)', ['','','O','O','','','','O']));
  data.push(createRow('❌ "Không thể check-in sớm" (future)', ['','','','','','','O','']));
  data.push(createRow('❌ "Không tìm thấy lịch hẹn"', ['','','','','','O','','']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','B','A','A','A','A','B','A']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_checkInAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 8/8`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (CI01-CI02):');
  console.log('    CI01: Check-in Approved Appointment');
  console.log('    CI02: Check-in No-Show Appointment');
  console.log('');
  console.log('  VALIDATION ERROR CASES (CI03-CI06):');
  console.log('    CI03: Check-in Pending Appointment (Error)');
  console.log('    CI04: Check-in Already CheckedIn (Error)');
  console.log('    CI05: Missing Appointment ID');
  console.log('    CI06: Appointment Not Found');
  console.log('');
  console.log('  EDGE CASES (CI07-CI08):');
  console.log('    CI07: Check-in Future Appointment (Error)');
  console.log('    CI08: Check-in Completed Appointment (Error)');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Status transition (Approved/No-Show → CheckedIn)');
  console.log('  ✓ Date validation (cannot check-in future appointments)');
  console.log('  ✓ Timestamp management (checkedInAt, checkInByUserId)');
  console.log('  ✓ Permission checks');
  console.log('  ✓ No-Show recovery');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Only Approved or No-Show appointments can be checked in');
  console.log('  - Check-in only allowed on appointment day (not future)');
  console.log('  - Timestamps automatically set on check-in');
}

createTestMatrix();
