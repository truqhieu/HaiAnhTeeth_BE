/**
 * Generate Excel Test Matrix for approveMedicalRecordByDoctor
 * Based on test execution results - 12 test cases
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['AMRD01', 'AMRD02', 'AMRD03', 'AMRD04', 'AMRD05', 'AMRD06', 
                     'AMRD07', 'AMRD08', 'AMRD09', 'AMRD10', 'AMRD11', 'AMRD12'];
  
  const createRow = (label, values) => {
    const row = { '': '', ' ': '', 'Field': label };
    testCases.forEach((tc, idx) => {
      row[tc] = values[idx] || '';
    });
    return row;
  };
  
  const data = [];
  
  // Header rows
  data.push({ '': 'Code Module', ' ': '', 'Field': 'Medical Record Service' });
  data.push({ '': 'Created By', ' ': '', 'Field': 'Developer Team' });
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'approveMedicalRecordByDoctor' });
  data.push({ '': 'Method', ' ': '', 'Field': 'APPROVE' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'AMRD01': 'Passed', 'AMRD02': 'Failed', 'AMRD03': 'Untested', 'AMRD04': 'N/A/B', 'AMRD05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'AMRD01': '12', 'AMRD02': '0', 'AMRD03': '0', 'AMRD04': '0', 'AMRD05': '12' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid appointment exists', ['O','O','O','O','','','O','','O','O','O','O']));
  data.push(createRow('Medical record exists (Draft)', ['O','O','','O','','','','','O','O','O','O']));
  data.push(createRow('Medical record is Finalized', ['','','O','','','','','','','','','']));
  data.push(createRow('Appointment is InProgress', ['O','O','','O','','','','','','O','O','O']));
  data.push(createRow('Appointment is Completed', ['','','','','','','O','','','','','']));
  data.push(createRow('Follow-up required', ['','O','','O','','','','','','O','O','']));
  data.push(createRow('Follow-up already exists', ['','','','','','','','','','','O','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','','','','','']));
  data.push(createRow('  Valid (no follow-up)', ['O','','','','','','','','','','','']));
  data.push(createRow('  Valid (with follow-up)', ['','O','','O','','','','','O','O','O','']));
  data.push(createRow('  Valid (already finalized)', ['','','O','','','','','','','','','']));
  data.push(createRow('  Valid (completed)', ['','','','','','','O','','','','','']));
  data.push(createRow('  Valid (no record)', ['','','','','','','','O','','','','']));
  data.push(createRow('  Valid (multiple services)', ['','','','O','','','','','','','','']));
  data.push(createRow('  Valid (populated test)', ['','','','','','','','','','','','O']));
  data.push(createRow('  000000000000000000000000', ['','','','','','O','','','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','','']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + MedicalRecord object', ['O','O','O','O','','','','','','O','O','O']));
  data.push(createRow('status = "Finalized"', ['O','O','O','O','','','','','','O','O','O']));
  data.push(createRow('diagnosis and conclusion preserved', ['O','O','O','O','','','','','','O','O','O']));
  data.push(createRow('followUpAppointmentId = null', ['O','','','','','','','','','O','','']));
  data.push(createRow('followUpAppointmentId created', ['','O','','O','','','','','','','','']));
  data.push(createRow('Follow-up appointment type = "FollowUp"', ['','O','','O','','','','','','','','']));
  data.push(createRow('Follow-up has correct followUpOfAppointmentId', ['','O','','O','','','','','','','','']));
  data.push(createRow('Follow-up copies all services', ['','','','O','','','','','','','','']));
  data.push(createRow('Idempotent (returns existing finalized)', ['','','O','','','','','','','','','']));
  data.push(createRow('No duplicate follow-up created', ['','','','','','','','','','','O','']));
  data.push(createRow('additionalServiceIds populated', ['','','','','','','','','','','','O']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','O','O','O','O','O','','','']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ Medical record approved successfully', ['O','O','O','O','','','','','','O','O','O']));
  
  // Error Messages
  data.push(createRow('❌ "Thiếu appointmentId"', ['','','','','O','','','','','','','']));
  data.push(createRow('❌ "Không tìm thấy lịch hẹn"', ['','','','','','O','','','','','','']));
  data.push(createRow('❌ "Ca khám đã hoàn thành, không thể duyệt hồ sơ."', ['','','','','','','O','','','','','']));
  data.push(createRow('❌ "Không tìm thấy hồ sơ khám bệnh"', ['','','','','','','','O','','','','']));
  data.push(createRow('❌ "Ngày tái khám phải ở trong tương lai."', ['','','','','','','','','O','','','']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','N','A','A','A','A','A','B','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_approveMedicalRecordByDoctor.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 12/12`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (AMRD01-AMRD04):');
  console.log('    AMRD01: Approve Medical Record Without Follow-up');
  console.log('    AMRD02: Approve Medical Record With Follow-up (Auto-create)');
  console.log('    AMRD03: Approve Already Finalized Record (Idempotent)');
  console.log('    AMRD04: Approve Record with Multiple Services');
  console.log('');
  console.log('  VALIDATION ERROR CASES (AMRD05-AMRD09):');
  console.log('    AMRD05: Missing Appointment ID');
  console.log('    AMRD06: Appointment Not Found');
  console.log('    AMRD07: Appointment Already Completed');
  console.log('    AMRD08: Medical Record Not Found');
  console.log('    AMRD09: Invalid Follow-up Date (Past date)');
  console.log('');
  console.log('  EDGE CASES (AMRD10-AMRD12):');
  console.log('    AMRD10: Follow-up Required But No Date');
  console.log('    AMRD11: Follow-up Already Exists (No duplicate)');
  console.log('    AMRD12: Verify Record Populated After Approval');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Medical record finalization (status → Finalized)');
  console.log('  ✓ Auto-create follow-up appointment when required');
  console.log('  ✓ Follow-up date validation (must be future)');
  console.log('  ✓ Service copying to follow-up appointment');
  console.log('  ✓ Idempotent approval (safe to call multiple times)');
  console.log('  ✓ No duplicate follow-up creation');
  console.log('  ✓ Populated data verification');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Follow-up appointment created only when followUpRequired = true AND followUpDate is set');
  console.log('  - All services from additionalServiceIds are copied to follow-up');
  console.log('  - Idempotent: calling approve on already finalized record returns existing record');
  console.log('  - Follow-up date must be in the future');
}

createTestMatrix();
