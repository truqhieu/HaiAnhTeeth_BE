/**
 * Generate Excel Test Matrix for assignDoctorToAppointment
 * Tests doctor assignment/replacement flow for appointments
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['UTC01', 'UTC02', 'UTC03', 'UTC04', 'UTC05', 'UTC06', 'UTC07', 'UTC08', 'UTC09', 'UTC10'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'assignDoctorToAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'ASSIGN DOCTOR' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': 'Passed', 'UTC02': 'Failed', 'UTC03': 'Untested', 'UTC04': 'N/A/B', 'UTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '10', 'UTC02': '0', 'UTC03': '0', 'UTC04': '0', 'UTC05': '10' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // Section labels
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '--- VALID ---', 'UTC04': '--- INVALID STATUS ---', 'UTC07': '--- INVALID DATA ---' });
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid appointment exists', ['O','O','O','','','','O','O','O','O']));
  data.push(createRow('Appointment status = Pending', ['O','','','','','','','','','']));
  data.push(createRow('Appointment status = Approved', ['','O','','','','','','','','']));
  data.push(createRow('Appointment status = CheckedIn', ['','','O','','','','','','','']));
  data.push(createRow('Appointment status = Completed', ['','','','O','','','','','','']));
  data.push(createRow('Appointment status = Cancelled', ['','','','','O','','','','','']));
  data.push(createRow('Appointment status = InProgress', ['','','','','','O','','','','']));
  data.push(createRow('Valid new doctor exists', ['O','O','O','O','O','O','','O','O','O']));
  data.push(createRow('Valid staff user exists', ['O','O','O','O','O','O','O','O','O','O']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','','','']));
  data.push(createRow('  Valid ID (Pending)', ['O','','','','','','','','','']));
  data.push(createRow('  Valid ID (Approved)', ['','O','','','','','','','','']));
  data.push(createRow('  Valid ID (CheckedIn)', ['','','O','','','','','','','']));
  data.push(createRow('  Valid ID (Completed)', ['','','','O','','','','','','']));
  data.push(createRow('  Valid ID (Cancelled)', ['','','','','O','','','','','']));
  data.push(createRow('  Valid ID (InProgress)', ['','','','','','O','','','','']));
  data.push(createRow('  507f1f77bcf86cd799439011 (Invalid)', ['','','','','','','O','','','']));
  data.push(createRow('  null', ['','','','','','','','O','','']));
  data.push(createRow('  undefined', ['','','','','','','','','O','']));
  
  // newDoctorId
  data.push(createRow('newDoctorId', ['','','','','','','','','','']));
  data.push(createRow('  691fe06a4b0b8b308033eefc (Bác sĩ Dương)', ['O','O','O','O','O','O','O','O','O','']));
  data.push(createRow('  507f1f77bcf86cd799439011 (Invalid)', ['','','','','','','','','','O']));
  
  // userId (staff performing action)
  data.push(createRow('userId (Staff)', ['','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec (Staff Hiếu)', ['O','O','O','O','O','O','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + Updated appointment', ['O','O','O','','','','','','','']));
  data.push(createRow('replacedDoctorUserId updated', ['O','O','O','','','','','','','']));
  data.push(createRow('confirmDeadline set (24h)', ['O','O','O','','','','','','','']));
  data.push(createRow('Email sent to patient', ['O','O','O','','','','','','','']));
  data.push(createRow('Notification created', ['O','O','O','','','','','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','O','O','O','O','O','O','O']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Messages (from FE)
  data.push(createRow('✅ "Đã gán bác sĩ mới...thành công!"', ['O','O','O','','','','','','','']));
  data.push(createRow('✅ Email sent to patient (async)', ['O','O','O','','','','','','','']));
  data.push(createRow('✅ Notification created (async)', ['O','O','O','','','','','','','']));
  data.push(createRow('✅ confirmDeadline set (24h)', ['O','O','O','','','','','','','']));
  
  // Error Messages (from BE)
  data.push(createRow('❌ "Lịch khám không tồn tại"', ['','','','','','','O','','','']));
  data.push(createRow('❌ "Trạng thái lịch khám...không khả dụng"', ['','','','O','O','O','','','','']));
  data.push(createRow('❌ "Bác sĩ không tồn tại"', ['','','','','','','','','','O']));
  data.push(createRow('❌ Invalid appointment ID (BE error)', ['','','','','','','','O','O','']));
  
  // FE Validation Messages
  data.push(createRow('❌ "Vui lòng chọn bác sĩ mới!" (FE)', ['','','','','','','','','','']));
  data.push(createRow('❌ "Vui lòng nhập lý do gán lại bác sĩ!" (FE)', ['','','','','','','','','','']));
  data.push(createRow('❌ "Không thể gán bác sĩ" (generic FE)', ['','','','','','','','','','']));
  data.push(createRow('❌ "Có lỗi xảy ra khi gán bác sĩ" (FE)', ['','','','','','','','','','']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','A','A','A','A','A','A','A']));
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
    ...testCases.map(() => ({ wch: 6 }))
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Test Matrix');
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_assignDoctorToAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 10/10`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  VALID DOCTOR ASSIGNMENT (UTC01-UTC03):');
  console.log('    UTC01: Assign Doctor to Pending Appointment');
  console.log('    UTC02: Assign Doctor to Approved Appointment');
  console.log('    UTC03: Assign Doctor to CheckedIn Appointment');
  console.log('');
  console.log('  INVALID STATUS (UTC04-UTC06):');
  console.log('    UTC04: Reject Completed Appointment');
  console.log('    UTC05: Reject Cancelled Appointment');
  console.log('    UTC06: Reject InProgress Appointment');
  console.log('');
  console.log('  INVALID DATA (UTC07-UTC10):');
  console.log('    UTC07: Invalid Appointment ID');
  console.log('    UTC08: Null Appointment ID');
  console.log('    UTC09: Undefined Appointment ID');
  console.log('    UTC10: Invalid Doctor ID');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Doctor assignment for valid statuses (Pending, Approved, CheckedIn)');
  console.log('  ✓ Status validation (reject Completed, Cancelled, InProgress)');
  console.log('  ✓ Doctor validation (must exist)');
  console.log('  ✓ Appointment validation (must exist)');
  console.log('  ✓ replacedDoctorUserId update');
  console.log('  ✓ confirmDeadline set to 24 hours');
  console.log('  ✓ Email notification to patient');
  console.log('  ✓ In-app notification creation');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Only Pending, Approved, CheckedIn appointments can have doctor reassigned');
  console.log('  - Patient has 24 hours to confirm the doctor change');
  console.log('  - Email and notification are sent asynchronously (non-blocking)');
  console.log('  - replacedDoctorUserId stores the new doctor ID');
  console.log('  - Original doctorUserId remains unchanged');
}

createTestMatrix();
