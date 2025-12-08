/**
 * Generate Excel Test Matrix for updateMedicalRecordForDoctor
 * Based on test execution results - 12 test cases
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['UMRD01', 'UMRD02', 'UMRD03', 'UMRD04', 'UMRD05', 'UMRD06', 
                     'UMRD07', 'UMRD08', 'UMRD09', 'UMRD10', 'UMRD11', 'UMRD12'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'updateMedicalRecordForDoctor' });
  data.push({ '': 'Method', ' ': '', 'Field': 'UPDATE' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'UMRD01': 'Passed', 'UMRD02': 'Failed', 'UMRD03': 'Untested', 'UMRD04': 'N/A/B', 'UMRD05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'UMRD01': '12', 'UMRD02': '0', 'UMRD03': '0', 'UMRD04': '0', 'UMRD05': '12' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid appointment exists', ['O','O','O','','','O','O','O','O','O','O','O']));
  data.push(createRow('Medical record exists (Draft)', ['O','O','O','','','O','O','O','O','O','O','O']));
  data.push(createRow('Appointment is Approved', ['O','O','O','','','','O','O','O','O','O','O']));
  data.push(createRow('Doctor owns the appointment', ['O','O','O','','','','','','O','O','O','O']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','','','','','']));
  data.push(createRow('  Valid (normal appointment)', ['O','O','O','','','','','O','O','O','O','O']));
  data.push(createRow('  Valid (completed appointment)', ['','','','','','O','','','','','','']));
  data.push(createRow('  Valid (different doctor)', ['','','','','','','O','','','','','']));
  data.push(createRow('  000000000000000000000000', ['','','','','O','','','','','','','']));
  data.push(createRow('  null', ['','','','O','','','','','','','','']));
  
  // updateData
  data.push(createRow('updateData', ['','','','','','','','','','','','']));
  
  // diagnosis & conclusion
  data.push(createRow('  diagnosis', ['','','','','','','','','','','','']));
  data.push(createRow('    "Sâu răng hàm dưới"', ['O','','','','','','','','','','','']));
  data.push(createRow('    "Viêm nướu"', ['','O','','','','','','','','','','']));
  data.push(createRow('    "Nhiễm trùng răng"', ['','','O','','','','','','','','','']));
  data.push(createRow('    "" (empty string)', ['','','','','','','','O','','','','']));
  data.push(createRow('  conclusion', ['','','','','','','','','','','','']));
  data.push(createRow('    Valid conclusion text', ['O','O','O','','','','','','','','','']));
  
  // prescription
  data.push(createRow('  prescription', ['','','','','','','','','','','','']));
  data.push(createRow('    Object (single)', ['','O','','','','','','','','','','']));
  data.push(createRow('    Array (multiple)', ['','','O','','','','','','','','','']));
  
  // followUpRequired
  data.push(createRow('  followUpRequired', ['','','','','','','','','','','','']));
  data.push(createRow('    true', ['','','','','','','','','O','','O','O']));
  data.push(createRow('    false', ['','','','','','','','','','O','','']));
  
  // followUpDate
  data.push(createRow('  followUpDate', ['','','','','','','','','','','','']));
  data.push(createRow('    2026-01-15T14:00:00.000Z (future)', ['','','','','','','','','O','','','']));
  data.push(createRow('    null (when required)', ['','','','','','','','','','','O','']));
  data.push(createRow('    2020-01-01T14:00:00.000Z (past)', ['','','','','','','','','','','','O']));
  
  // followUpNote
  data.push(createRow('  followUpNote', ['','','','','','','','','','','','']));
  data.push(createRow('    "Tái khám sau 1 tháng để kiểm tra"', ['','','','','','','','','O','','','']));
  
  // doctorUserId
  data.push(createRow('doctorUserId', ['','','','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec (doctor1)', ['O','O','O','','','','O','','O','O','O','O']));
  data.push(createRow('  691fe77f8604b35e222a6a12 (doctor2)', ['','','','','','','','','','','','']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + MedicalRecord object', ['O','O','O','','','','','','O','O','','']));
  data.push(createRow('diagnosis updated', ['O','O','O','','','','','','','','','']));
  data.push(createRow('conclusion updated', ['O','O','O','','','','','','','','','']));
  data.push(createRow('status = "Draft"', ['O','O','O','','','','','','O','O','','']));
  data.push(createRow('prescriptions saved as array', ['','O','O','','','','','','','','','']));
  data.push(createRow('Single prescription → array[1]', ['','O','','','','','','','','','','']));
  data.push(createRow('Multiple prescriptions → array[2]', ['','','O','','','','','','','','','']));
  data.push(createRow('followUpRequired = true', ['','','','','','','','','O','','','']));
  data.push(createRow('followUpDate saved', ['','','','','','','','','O','','','']));
  data.push(createRow('followUpNote saved', ['','','','','','','','','O','','','']));
  data.push(createRow('followUpAppointmentId = null/undefined', ['','','','','','','','','O','','','']));
  data.push(createRow('followUpRequired = false', ['','','','','','','','','','O','','']));
  data.push(createRow('followUpDate = null', ['','','','','','','','','','O','','']));
  data.push(createRow('followUpNote = ""', ['','','','','','','','','','O','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','O','O','O','O','O','','','O','O']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ Medical record updated successfully', ['O','O','O','','','','','','O','O','','']));
  
  // Error Messages
  data.push(createRow('❌ "Thiếu appointmentId"', ['','','','O','','','','','','','','']));
  data.push(createRow('❌ "Không tìm thấy lịch hẹn"', ['','','','','O','','','','','','','']));
  data.push(createRow('❌ "Ca khám đã hoàn thành, không thể chỉnh sửa hồ sơ."', ['','','','','','O','','','','','','']));
  data.push(createRow('❌ "Bạn không có quyền cập nhật hồ sơ của ca khám này."', ['','','','','','','O','','','','','']));
  data.push(createRow('❌ "Chẩn đoán là bắt buộc. Vui lòng nhập chẩn đoán."', ['','','','','','','','O','','','','']));
  data.push(createRow('❌ "Vui lòng chọn ngày và giờ tái khám."', ['','','','','','','','','','','O','']));
  data.push(createRow('❌ "Ngày tái khám phải ở trong tương lai."', ['','','','','','','','','','','','O']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','A','A','A','A','A','B','B','B','B']));
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_updateMedicalRecordForDoctor.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 12/12`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (UMRD01-UMRD03):');
  console.log('    UMRD01: Update Diagnosis and Conclusion');
  console.log('    UMRD02: Update with Prescription (Object Format - Backward Compatibility)');
  console.log('    UMRD03: Update with Multiple Prescriptions (Array Format)');
  console.log('');
  console.log('  VALIDATION ERROR CASES (UMRD04-UMRD08):');
  console.log('    UMRD04: Missing Appointment ID');
  console.log('    UMRD05: Appointment Not Found');
  console.log('    UMRD06: Appointment Already Completed');
  console.log('    UMRD07: Wrong Doctor (Permission Denied)');
  console.log('    UMRD08: Empty Diagnosis (Required Field)');
  console.log('');
  console.log('  FOLLOW-UP LOGIC (UMRD09-UMRD12):');
  console.log('    UMRD09: Enable Follow-up with Valid Date');
  console.log('    UMRD10: Disable Follow-up');
  console.log('    UMRD11: Missing Follow-up Date When Required');
  console.log('    UMRD12: Past Follow-up Date');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Diagnosis and conclusion updates');
  console.log('  ✓ Prescription handling (object/array backward compatibility)');
  console.log('  ✓ Permission checks (doctor ownership)');
  console.log('  ✓ Status validation (cannot edit completed/finalized)');
  console.log('  ✓ Required field validation');
  console.log('  ✓ Follow-up logic (enable/disable/validation)');
  console.log('  ✓ Follow-up date validation (future dates only)');
  console.log('  ✓ Status management (Draft when saving)');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Follow-up appointments are created only when approving (separate function)');
  console.log('  - Prescription backward compatibility: object → array[1]');
  console.log('  - Status stays "Draft" when saving (not approving)');
}

createTestMatrix();
