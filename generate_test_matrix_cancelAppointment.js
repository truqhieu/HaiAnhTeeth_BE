/**
 * Generate Excel Test Matrix for cancelAppointment
 * Based on test execution results - 12 test cases
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['CA01', 'CA02', 'CA03', 'CA04', 'CA05', 'CA06', 
                     'CA07', 'CA08', 'CA09', 'CA10', 'CA11', 'CA12'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'cancelAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'CANCEL' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'CA01': 'Passed', 'CA02': 'Failed', 'CA03': 'Untested', 'CA04': 'N/A/B', 'CA05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'CA01': '12', 'CA02': '0', 'CA03': '0', 'CA04': '0', 'CA05': '12' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid appointment exists', ['O','O','O','O','','','O','O','O','O','O','O']));
  data.push(createRow('Appointment is Pending', ['O','','','','','','','','','','','']));
  data.push(createRow('Appointment is Approved', ['','O','','O','','','','','O','','O','O']));
  data.push(createRow('Appointment is PendingPayment', ['','','O','','','','','','','','','']));
  data.push(createRow('Appointment has Payment', ['','','O','','','','','','','','','']));
  data.push(createRow('Appointment is Completed', ['','','','','','','O','','','','','']));
  data.push(createRow('Appointment is CheckedIn', ['','','','','','','','O','','','','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','','','','','']));
  data.push(createRow('  Valid (Pending)', ['O','','','','','','','','','','','']));
  data.push(createRow('  Valid (Approved)', ['','O','','O','','','','','O','','O','O']));
  data.push(createRow('  Valid (PendingPayment)', ['','','O','','','','','','','','','']));
  data.push(createRow('  Valid (Completed)', ['','','','','','','O','','','','','']));
  data.push(createRow('  Valid (CheckedIn)', ['','','','','','','','O','','','','']));
  data.push(createRow('  Valid (no timeslot)', ['','','','','','','','','','O','','']));
  data.push(createRow('  000000000000000000000000', ['','','','','','O','','','','','','']));
  data.push(createRow('  null', ['','','','','O','','','','','','','']));
  
  // userId
  data.push(createRow('userId', ['','','','','','','','','','','','']));
  data.push(createRow('  691fe21b4b0b8b308033efab (patient1)', ['O','O','O','O','O','O','O','O','O','O','O','O']));
  
  // cancelReason
  data.push(createRow('cancelReason', ['','','','','','','','','','','','']));
  data.push(createRow('  "Bận việc đột xuất"', ['O','','','','','','','','','','','']));
  data.push(createRow('  "Không thể đến được"', ['','O','','','','','','','','','','']));
  data.push(createRow('  "Không muốn thanh toán online"', ['','','O','','','','','','','','','']));
  data.push(createRow('  "Yêu cầu hoàn tiền"', ['','','','O','','','','','','','','']));
  data.push(createRow('  undefined (uses default)', ['','','','','','','','','O','','','']));
  
  // bankInfo
  data.push(createRow('bankInfo', ['','','','','','','','','','','','']));
  data.push(createRow('  { accountHolderName, accountNumber, bankName }', ['','','','O','','','','','','','','']));
  data.push(createRow('  null', ['O','O','O','','','','','','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + { success, message, data }', ['O','O','O','O','','','','','O','O','O','O']));
  data.push(createRow('success = true', ['O','O','O','O','','','','','O','O','O','O']));
  data.push(createRow('message = "Hủy lịch hẹn thành công"', ['O','O','O','O','','','','','O','O','O','O']));
  data.push(createRow('data.status = "Cancelled"', ['O','O','O','O','','','','','O','O','O','O']));
  data.push(createRow('data.cancelReason saved', ['O','O','O','O','','','','','O','O','O','O']));
  data.push(createRow('data.cancelledAt timestamp set', ['O','O','O','O','','','','','O','O','O','O']));
  data.push(createRow('Timeslot status = "Available"', ['O','O','O','O','','','','','O','','O','O']));
  data.push(createRow('Timeslot.appointmentId = null', ['O','O','O','O','','','','','O','','O','O']));
  data.push(createRow('Payment status = "Cancelled"', ['','','O','','','','','','','','','']));
  data.push(createRow('bankInfo saved in appointment', ['','','','O','','','','','','','','']));
  data.push(createRow('Default cancelReason used', ['','','','','','','','','O','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','O','O','O','O','','','','']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Message
  data.push(createRow('✅ "Hủy lịch hẹn thành công"', ['O','O','O','O','','','','','O','O','O','O']));
  
  // Error Messages
  data.push(createRow('❌ "Không tìm thấy lịch hẹn"', ['','','','','O','O','','','','','','']));
  data.push(createRow('❌ "Lịch hẹn này không thể hủy được"', ['','','','','','','O','O','','','','']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','N','N','A','A','A','A','B','B','B','B']));
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_cancelAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 12/12`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  SUCCESS CASES (CA01-CA04):');
  console.log('    CA01: Cancel Pending Appointment');
  console.log('    CA02: Cancel Approved Appointment');
  console.log('    CA03: Cancel PendingPayment Appointment (with Payment cancellation)');
  console.log('    CA04: Cancel with Bank Info (Refund processing)');
  console.log('');
  console.log('  VALIDATION ERROR CASES (CA05-CA09):');
  console.log('    CA05: Missing Appointment ID');
  console.log('    CA06: Appointment Not Found');
  console.log('    CA07: Cannot Cancel Completed Appointment');
  console.log('    CA08: Cannot Cancel CheckedIn Appointment');
  console.log('    CA09: Cancel Without Reason (Uses Default)');
  console.log('');
  console.log('  EDGE CASES (CA10-CA12):');
  console.log('    CA10: Cancel Appointment Without Timeslot');
  console.log('    CA11: Cancel Appointment Without Payment');
  console.log('    CA12: Verify Timestamps After Cancellation');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Status validation (only Pending/Approved/PendingPayment can cancel)');
  console.log('  ✓ Timeslot release (status → Available, appointmentId → null)');
  console.log('  ✓ Payment cancellation (status → Cancelled)');
  console.log('  ✓ Bank info storage for refund processing');
  console.log('  ✓ Default cancel reason handling');
  console.log('  ✓ Timestamp management (cancelledAt, updatedAt)');
  console.log('  ✓ Edge cases (missing timeslot, missing payment)');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Only Pending/Approved/PendingPayment appointments can be cancelled');
  console.log('  - Timeslot is automatically released back to Available');
  console.log('  - Payment status updated to Cancelled if exists');
  console.log('  - Bank info saved for refund processing (online payments)');
}

createTestMatrix();
