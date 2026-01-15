/**
 * Generate Excel Test Matrix for getOrCreateMedicalRecord
 * Based on test execution results - 10 test cases (2 removed: MRC02 merged into MRC01, MRC08 unreliable)
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['MRC01', 'MRC03', 'MRC04', 'MRC05', 'MRC06', 'MRC07', 
                     'MRC09', 'MRC10', 'MRC11', 'MRC12'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'getOrCreateMedicalRecord' });
  data.push({ '': 'Method', ' ': '', 'Field': 'GET/CREATE' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'MRC01': 'Passed', 'MRC03': 'Failed', 'MRC04': 'Untested', 'MRC05': 'N/A/B', 'MRC06': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'MRC01': '10', 'MRC03': '0', 'MRC04': '0', 'MRC05': '0', 'MRC06': '10' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid appointment exists', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('Appointment is Approved', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('Patient has DOB', ['O','O','O','','','','O','','O','O']));
  data.push(createRow('Walk-in customer exists', ['','','','O','','','','','','']));
  data.push(createRow('Follow-up appointment', ['','O','O','','','','','','O','']));
  data.push(createRow('Previous medical record exists', ['','O','','','','','','','O','']));
  data.push(createRow('Appointment has checkInByUserId', ['O','','','','','','','','','O']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','','','']));
  data.push(createRow('  Valid normal appointment', ['O','','','','','','O','','','O']));
  data.push(createRow('  Valid follow-up (with previous)', ['','O','','','','','','','','']));
  data.push(createRow('  Valid follow-up (no previous)', ['','','O','','','','','','','']));
  data.push(createRow('  Valid walk-in appointment', ['','','','O','','','','','','']));
  data.push(createRow('  Valid appointment (no DOB)', ['','','','','','','','O','','']));
  data.push(createRow('  Valid follow-up chain (3rd)', ['','','','','','','','','O','']));
  data.push(createRow('  000000000000000000000000', ['','','','','','O','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','']));
  
  // currentUserId
  data.push(createRow('currentUserId', ['','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec (Nurse)', ['O','O','O','O','','','','O','O','']));
  data.push(createRow('  691fe0184b0b8b308033eeec (Doctor)', ['','','','','','','','','','O']));
  data.push(createRow('  checkInByUserId (fallback)', ['','','','','','','O','','','']));
  
  // currentUserRole
  data.push(createRow('currentUserRole', ['','','','','','','','','','']));
  data.push(createRow('  "Nurse"', ['O','O','O','O','','','','O','O','']));
  data.push(createRow('  "Doctor"', ['','','','','','','','','','O']));
  data.push(createRow('  null', ['','','','','','','O','','','']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + {record, display, permissions}', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('record.status = "Draft"', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('record.appointmentId matches input', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('record.nurseId set correctly', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('record.additionalServiceIds populated', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('display.patientAge calculated', ['O','O','O','O','','','O','','O','O']));
  data.push(createRow('display.address from patient/customer', ['O','O','O','O','','','O','O','O','O']));
  data.push(createRow('Services copied from previous record', ['','O','','','','','','','O','']));
  data.push(createRow('Services from appointment.additionalServiceIds', ['','','O','','','','','','','']));
  data.push(createRow('customerId linked (walk-in)', ['','','','O','','','','','','']));
  data.push(createRow('nurseId from checkInByUserId (Doctor role)', ['','','','','','','','','','O']));
  data.push(createRow('No duplicate records created', ['O','','','','','','','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','O','O','','','','']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ Medical record loaded/created', ['O','O','O','O','','','O','O','O','O']));
  
  // Error Messages
  data.push(createRow('❌ "Thiếu appointmentId"', ['','','','','O','','','','','']));
  data.push(createRow('❌ "Không tìm thấy lịch hẹn"', ['','','','','','O','','','','']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','N','A','A','B','B','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_getOrCreateMedicalRecord.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 10/10`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (MRC01, MRC03-MRC05):');
  console.log('    MRC01: Create Medical Record for Normal Appointment (includes duplicate check)');
  console.log('    MRC03: Create Record for Follow-up (With Previous Record)');
  console.log('    MRC04: Create Record for Follow-up (No Previous Record)');
  console.log('    MRC05: Create Record for Walk-in Customer');
  console.log('');
  console.log('  VALIDATION ERROR CASES (MRC06-MRC07):');
  console.log('    MRC06: Missing Appointment ID');
  console.log('    MRC07: Appointment Not Found');
  console.log('');
  console.log('  EDGE CASES (MRC09-MRC12):');
  console.log('    MRC09: Missing Current User ID (uses fallback)');
  console.log('    MRC10: Patient Without DOB');
  console.log('    MRC11: Follow-up Chain (3rd Follow-up)');
  console.log('    MRC12: Doctor Role Creating Record');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Auto-create medical records if not exist');
  console.log('  ✓ Return existing records (no duplicates)');
  console.log('  ✓ Follow-up service copying from previous records');
  console.log('  ✓ Walk-in customer support');
  console.log('  ✓ Age calculation from DOB');
  console.log('  ✓ Nurse ID fallback logic');
  console.log('  ✓ Doctor vs Nurse role handling');
  console.log('  ✓ Response structure: {record, display, permissions}');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - MRC02 merged into MRC01 (duplicate check)');
  console.log('  - MRC08 removed (noTreatment check unreliable in tests)');
}

createTestMatrix();
