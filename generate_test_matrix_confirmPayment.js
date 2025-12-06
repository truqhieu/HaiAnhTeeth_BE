/**
 * Generate Excel Test Matrix for confirmPayment
 * Tests payment confirmation flow including status updates and notifications
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['UTC01', 'UTC02', 'UTC03', 'UTC04', 'UTC05', 'UTC06', 'UTC07', 'UTC08', 'UTC09'];
  
  const createRow = (label, values) => {
    const row = { '': '', ' ': '', 'Field': label };
    testCases.forEach((tc, idx) => {
      row[tc] = values[idx] || '';
    });
    return row;
  };
  
  const data = [];
  
  // Header rows
  data.push({ '': 'Code Module', ' ': '', 'Field': 'Payment Service' });
  data.push({ '': 'Created By', ' ': '', 'Field': 'Developer Team' });
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'confirmPayment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'CONFIRM PAYMENT' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': 'Passed', 'UTC02': 'Failed', 'UTC03': 'Untested', 'UTC04': 'N/A/B', 'UTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '9', 'UTC02': '0', 'UTC03': '0', 'UTC04': '0', 'UTC05': '9' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // Section labels
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '--- VALID ---', 'UTC03': '--- INVALID PAYMENT ---', 'UTC06': '--- EDGE CASES ---' });
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid payment exists', ['O','O','','','','O','O','O','O']));
  data.push(createRow('Payment status = Pending', ['O','','','','','O','O','O','O']));
  data.push(createRow('Payment status = Completed', ['','O','','','','','','','']));
  data.push(createRow('Valid appointment exists', ['O','O','','','','O','','O','O']));
  data.push(createRow('Valid timeslot exists', ['O','O','','','','O','','O','O']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // paymentId
  data.push(createRow('paymentId', ['','','','','','','','','']));
  data.push(createRow('  Valid ObjectId (Pending)', ['O','','','','','O','O','O','O']));
  data.push(createRow('  Valid ObjectId (Completed)', ['','O','','','','','','','']));
  data.push(createRow('  Invalid ObjectId', ['','','O','','','','','','']));
  data.push(createRow('  null', ['','','','O','','','','','']));
  data.push(createRow('  undefined', ['','','','','O','','','','']));
  
  // transactionData (optional)
  data.push(createRow('transactionData', ['','','','','','','','','']));
  data.push(createRow('  Valid transaction object', ['O','O','','','','','','','']));
  data.push(createRow('  null (optional)', ['','','','','','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('HTTP 200 + Result object', ['O','O','','','','','','O','O']));
  data.push(createRow('payment.status = \"Completed\"', ['O','O','','','','','','O','O']));
  data.push(createRow('appointment.status = \"Pending\"', ['O','','','','','','','O','O']));
  data.push(createRow('timeslot.status = \"Booked\"', ['O','','','','','','','O','O']));
  data.push(createRow('alreadyConfirmed = true', ['','O','','','','','','','']));
  data.push(createRow('Email sent to patient/customer', ['O','','','','','','','O','']));
  data.push(createRow('Email sending skipped (error)', ['','','','','','','','','O']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','O','O','O','','','','']));
  
  // ========== UI ERROR MESSAGES ==========
  data.push({ '': 'UI Error Messages', ' ': '', 'Field': '(Displayed on UI)' });
  
  // Success Messages
  data.push(createRow('✅ Payment confirmed successfully', ['O','','','','','','','O','O']));
  data.push(createRow('⚠️ Payment already confirmed', ['','O','','','','','','','']));
  data.push(createRow('✅ Appointment status updated', ['O','','','','','','','O','O']));
  data.push(createRow('✅ Timeslot status updated', ['O','','','','','','','O','O']));
  data.push(createRow('📧 Confirmation email sent', ['O','','','','','','','O','']));
  
  // Error Messages
  data.push(createRow('❌ \"Payment không tồn tại\"', ['','','O','','','','','','']));
  data.push(createRow('❌ \"Invalid payment ID\"', ['','','','O','O','','','','']));
  data.push(createRow('❌ \"Appointment not found\"', ['','','','','','O','','','']));
  data.push(createRow('❌ \"Timeslot not found\"', ['','','','','','','O','','']));
  data.push(createRow('⚠️ \"Email sending failed\"', ['','','','','','','','','O']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal, B: Boundary)', ['N','N','A','A','A','A','A','B','B']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025','6/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_confirmPayment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ Tests passed: 9/9`);
  console.log(`📅 Test execution date: 6/12/2025`);
  console.log('');
  console.log('📋 Test Cases Summary:');
  console.log('  VALID PAYMENT CONFIRMATION (UTC01-UTC02):');
  console.log('    UTC01: First-time Payment Confirmation');
  console.log('    UTC02: Already Confirmed Payment (Idempotent)');
  console.log('');
  console.log('  INVALID PAYMENT (UTC03-UTC05):');
  console.log('    UTC03: Invalid Payment ID');
  console.log('    UTC04: Null Payment ID');
  console.log('    UTC05: Undefined Payment ID');
  console.log('');
  console.log('  EDGE CASES (UTC06-UTC09):');
  console.log('    UTC06: Appointment Not Found');
  console.log('    UTC07: Timeslot Not Found');
  console.log('    UTC08: Email Sent Successfully');
  console.log('    UTC09: Email Sending Failed (Non-blocking)');
  console.log('');
  console.log('🎯 Key Features Tested:');
  console.log('  ✓ Payment status update (Pending → Completed)');
  console.log('  ✓ Appointment status update (PendingPayment → Pending)');
  console.log('  ✓ Timeslot status update (Reserved → Booked)');
  console.log('  ✓ Idempotent confirmation (already confirmed)');
  console.log('  ✓ Email notification (async, non-blocking)');
  console.log('  ✓ Error handling (missing payment/appointment/timeslot)');
  console.log('  ✓ Transaction data handling (optional)');
  console.log('');
  console.log('⚠️  Notes:');
  console.log('  - Payment must exist and be in Pending status');
  console.log('  - If already Completed, returns early with alreadyConfirmed flag');
  console.log('  - Email sending is async and non-blocking (errors logged only)');
  console.log('  - Timeslot status changes: Reserved → Booked');
  console.log('  - Appointment status changes: PendingPayment → Pending');
  console.log('  - Email sent to customerId if exists, otherwise to patientUserId');
}

createTestMatrix();
