/**
 * Generate Excel Test Matrix for createConsultationAppointment
 * Based on detailed test documentation with 17 test cases
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['UTC01', 'UTC02', 'UTC03', 'UTC04', 'UTC05', 'UTC06', 'UTC07', 'UTC08', 
                     'UTC09', 'UTC10', 'UTC11', 'UTC12', 'UTC13', 'UTC14', 'UTC15', 'UTC16', 'UTC17'];
  
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
  data.push({ '': 'Method', ' ': '', 'Field': 'CREATE CONSULTATION' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': 'Passed', 'UTC02': 'Failed', 'UTC03': 'Untested', 'UTC04': 'N/A/B', 'UTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '17', 'UTC02': '0', 'UTC03': '0', 'UTC04': '0', 'UTC05': '17' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // Section labels
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '--- VALID ---', 'UTC06': '--- MISSING FIELDS ---', 'UTC12': '--- INVALID TIME ---', 'UTC13': '--- MISSING CUSTOMER ---', 'UTC16': '--- EDGE CASES ---' });
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid patient exists', ['O','O','O','O','O','','','','','','','','','','','O','O']));
  data.push(createRow('Valid doctor exists', ['O','O','O','O','O','','O','','','','','','','','','O','O']));
  data.push(createRow('Valid service exists', ['O','O','O','O','O','','','O','','','','','','','','O','O']));
  data.push(createRow('Valid schedule exists', ['O','O','O','O','O','','','','O','','','','','','','O','O']));
  data.push(createRow('Valid time slot', ['O','O','O','O','O','','','','','O','O','','','','','O','O']));
  data.push(createRow('appointmentFor = "self"', ['O','O','','','','','','','','','','','','','','O','O']));
  data.push(createRow('appointmentFor = "other"', ['','','O','','O','','','','','','','','O','O','O','','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // patientUserId
  data.push(createRow('patientUserId', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  691fe21b4b0b8b308033efab (Trần Trung Hiếu)', ['O','O','O','O','O','','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('  null', ['','','','','','O','','','','','','','','','','','']));
  
  // doctorUserId
  data.push(createRow('doctorUserId', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  691fe0184b0b8b308033eeec (Doctor Hiếu)', ['O','O','O','','','O','','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('  691fe06a4b0b8b308033eefc (Doctor Dương)', ['','','','O','O','','','','','','','','','','','','']));
  data.push(createRow('  null', ['','','','','','','O','','','','','','','','','','']));
  
  // serviceId
  data.push(createRow('serviceId', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  68f99f4fa83a29b32e8abdb6 (Làm sạch răng)', ['O','','O','O','O','O','O','','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('  69042a1627a9b33ef7ab42a1 (Khám tổng quát)', ['','O','','','','','','','','','','','','','','','']));
  data.push(createRow('  null', ['','','','','','','','O','','','','','','','','','']));
  
  // doctorScheduleId
  data.push(createRow('doctorScheduleId', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  6925be88b026e4db50c30f22', ['O','O','O','O','O','O','O','O','','O','O','O','O','O','O','O','O']));
  data.push(createRow('  null', ['','','','','','','','','O','','','','','','','','']));
  
  // selectedSlot
  data.push(createRow('selectedSlot.startTime', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08T01:00:00.000Z (8:00 VN)', ['O','O','O','O','O','O','O','O','O','','O','','O','O','O','O','O']));
  data.push(createRow('  Past date', ['','','','','','','','','','','','O','','','','','']));
  data.push(createRow('  null', ['','','','','','','','','','O','','','','','','','']));
  
  data.push(createRow('selectedSlot.endTime', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  2025-12-08T01:10:00.000Z (8:10 VN)', ['O','O','O','O','O','O','O','O','O','O','','O','O','O','O','O','O']));
  data.push(createRow('  null', ['','','','','','','','','','','O','','','','','','']));
  
  // appointmentFor
  data.push(createRow('appointmentFor', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  "self"', ['O','O','','','','O','O','O','O','O','O','O','','','','O','O']));
  data.push(createRow('  "other"', ['','','O','','O','','','','','','','','O','O','O','','']));
  
  // Customer info (for "other")
  data.push(createRow('fullName', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  "Đỗ Minh Đức" / "Nguyễn Văn Thao"', ['O','O','O','O','O','O','O','O','O','O','O','O','','O','O','O','O']));
  data.push(createRow('  null (for "other")', ['','','','','','','','','','','','','O','','','','']));
  
  data.push(createRow('email', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  "ddomin142@gmail.com" / "thao.test@gmail.com"', ['O','O','O','O','O','O','O','O','O','O','O','O','O','','O','O','O']));
  data.push(createRow('  null (for "other")', ['','','','','','','','','','','','','','O','','','']));
  
  data.push(createRow('phoneNumber', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  "0901234567" / "0901234568"', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O','','O','O']));
  data.push(createRow('  null (for "other")', ['','','','','','','','','','','','','','','O','','']));
  
  // notes (optional)
  data.push(createRow('notes', ['','','','','','','','','','','','','','','','','']));
  data.push(createRow('  String value', ['O','','O','','O','','','','','','','','','','','','']));
  data.push(createRow('  null (optional)', ['','O','','','','','','','','','','','','','','O','']));
  data.push(createRow('  Empty string', ['','','','','','','','','','','','','','','','','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + Appointment object', ['O','O','O','O','O','','','','','','','','','','','O','O']));
  data.push(createRow('status = "Pending"', ['O','','O','O','O','','','','','','','','','','','O','O']));
  data.push(createRow('status = "PendingPayment"', ['','O','','','','','','','','','','','','','','','']));
  data.push(createRow('mode = "Offline"', ['O','','O','O','O','','','','','','','','','','','O','O']));
  data.push(createRow('mode = "Online"', ['','O','','','','','','','','','','','','','','','']));
  data.push(createRow('requirePayment = false', ['O','','O','O','O','','','','','','','','','','','O','O']));
  data.push(createRow('requirePayment = true', ['','O','','','','','','','','','','','','','','','']));
  data.push(createRow('payment.QRurl exists', ['','O','','','','','','','','','','','','','','','']));
  data.push(createRow('customerId created (for "other")', ['','','O','','O','','','','','','','','','','','','']));
  data.push(createRow('appointmentId returned', ['O','O','O','O','O','','','','','','','','','','','O','O']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','','O','O','O','O','O','O','O','O','O','O','','']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Messages
  data.push(createRow('✅ Appointment created successfully', ['O','O','O','O','O','','','','','','','','','','','O','O']));
  data.push(createRow('✅ Payment QR generated', ['','O','','','','','','','','','','','','','','','']));
  
  // Error Messages
  data.push(createRow('❌ "đầy đủ thông tin" (missing required)', ['','','','','','O','O','O','O','','','','','','','','']));
  data.push(createRow('❌ "khung giờ không hợp lệ"', ['','','','','','','','','','O','O','','','','','','']));
  data.push(createRow('❌ "không có lịch làm việc|quá khứ"', ['','','','','','','','','','','','O','','','','','']));
  data.push(createRow('❌ "họ tên|customer" (missing name)', ['','','','','','','','','','','','','O','','','','']));
  data.push(createRow('❌ "email|customer" (missing email)', ['','','','','','','','','','','','','','O','','','']));
  data.push(createRow('❌ "số điện thoại|phoneNumber|customer"', ['','','','','','','','','','','','','','','O','','']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','N','N','A','A','A','A','A','A','A','A','A','A','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','','','','','','','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_createConsultationAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 17/17`);
  console.log(`📅 Test execution date: 5/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  VALID APPOINTMENTS (UTC01-UTC05):');
  console.log('    UTC01: Valid Appointment Self (Examination)');
  console.log('    UTC02: Valid Appointment Self (Consultation with Payment)');
  console.log('    UTC03: Valid Appointment for Other Person');
  console.log('    UTC04: Different Doctor and Time');
  console.log('    UTC05: Multiple Appointments Same Day');
  console.log('');
  console.log('  MISSING REQUIRED FIELDS (UTC06-UTC11):');
  console.log('    UTC06: Missing patientUserId');
  console.log('    UTC07: Missing doctorUserId');
  console.log('    UTC08: Missing serviceId');
  console.log('    UTC09: Missing doctorScheduleId');
  console.log('    UTC10: Missing selectedSlot.startTime');
  console.log('    UTC11: Missing selectedSlot.endTime');
  console.log('');
  console.log('  INVALID TIME SLOTS (UTC12):');
  console.log('    UTC12: Past Time Slot');
  console.log('');
  console.log('  MISSING CUSTOMER INFO (UTC13-UTC15):');
  console.log('    UTC13: Missing fullName for Other');
  console.log('    UTC14: Missing email for Other');
  console.log('    UTC15: Missing phoneNumber for Other');
  console.log('');
  console.log('  EDGE CASES (UTC16-UTC17):');
  console.log('    UTC16: Notes as Optional Field (null)');
  console.log('    UTC17: Empty Notes String');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Appointment creation for self and others');
  console.log('  ✓ Payment integration (prepaid services)');
  console.log('  ✓ Time slot validation (future dates only)');
  console.log('  ✓ Customer information validation');
  console.log('  ✓ Required field validation');
  console.log('  ✓ Optional field handling (notes)');
  console.log('  ✓ Multiple appointments same day');
  console.log('  ✓ Mode selection (Offline/Online)');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Examination services: mode=Offline, status=Pending, no payment');
  console.log('  - Consultation services: mode=Online, status=PendingPayment, requires payment');
  console.log('  - appointmentFor="other" requires fullName, email, phoneNumber');
  console.log('  - Time slots must be in the future');
  console.log('  - System auto-generates SePay QR for prepaid services');
}

createTestMatrix();
