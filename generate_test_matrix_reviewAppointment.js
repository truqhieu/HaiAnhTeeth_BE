/**
 * Generate Excel Test Matrix for reviewAppointment
 * Based on ACTUAL error messages from implementation
 */

const XLSX = require('xlsx');

function createTestMatrix() {
  const wb = XLSX.utils.book_new();
  
  const testCases = ['UTC01', 'UTC02', 'UTC03', 'UTC04', 'UTC05', 'UTC06', 'UTC07', 
                     'UTC08', 'UTC09', 'UTC10', 'UTC11', 'UTC12', 'UTC13', 'UTC14'];
  
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
  data.push({ '': 'Test Case Execution', ' ': '', 'Field': 'reviewAppointment' });
  data.push({ '': 'Method', ' ': '', 'Field': 'POST' });
  data.push({ '': '', ' ': '', 'Field': '' });
  
  // Status summary
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': 'Passed', 'UTC02': 'Failed', 'UTC03': 'Untested', 'UTC04': 'N/A/B', 'UTC05': 'Total Test Cases' });
  data.push({ '': '', ' ': '', 'Field': '', 'UTC01': '14', 'UTC02': '0', 'UTC03': '0', 'UTC04': '0', 'UTC05': '14' });
  
  // Test case headers
  const headerRow = { '': '', ' ': '', 'Field': '' };
  testCases.forEach(tc => { headerRow[tc] = tc; });
  data.push(headerRow);
  
  // ========== CONDITION SECTION ==========
  data.push({ '': 'Condition', ' ': '', 'Field': 'Precondition' });
  data.push(createRow('Can connect with server', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Valid appointment exists', ['O','O','O','O','O','O','','O','O','O','O','O','O','O']));
  data.push(createRow('Valid staff user exists', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  data.push(createRow('Appointment status = Pending', ['O','O','O','','O','O','','','','','','','','']));
  data.push(createRow('Appointment status = Approved', ['','','','O','','','','','','','','','','']));
  data.push(createRow('Appointment mode = Online', ['','O','','','','','','','','','','','','O']));
  data.push(createRow('Appointment mode = Offline', ['O','','O','O','O','O','','','','','','','','']));
  
  // ========== INPUT SECTION ==========
  data.push({ '': 'Input', ' ': '', 'Field': '' });
  
  // appointmentId
  data.push(createRow('appointmentId', ['','','','','','','','','','','','','','']));
  data.push(createRow('  Valid ID (Pending)', ['O','O','O','','O','O','','','','','','','','']));
  data.push(createRow('  Valid ID (Approved)', ['','','','O','','','','','','','','','','']));
  data.push(createRow('  Valid ID (Completed)', ['','','','','','','','','O','','','','','']));
  data.push(createRow('  Valid ID (Cancelled)', ['','','','','','','','','','O','','','','']));
  data.push(createRow('  Valid ID (CheckedIn)', ['','','','','','','','','','','O','','','']));
  data.push(createRow('  Valid ID (InProgress)', ['','','','','','','','','','','','O','','']));
  data.push(createRow('  Valid ID (No-Show)', ['','','','','','','','','','','','','O','']));
  data.push(createRow('  Valid ID (PendingPayment)', ['','','','','','','','','','','','','','O']));
  data.push(createRow('  Invalid ID', ['','','','','','','O','','','','','','','']));
  
  // staffUserId
  data.push(createRow('staffUserId', ['','','','','','','','','','','','','','']));
  data.push(createRow('  Valid staff ID (691fe2e932cd8d0dfd9052bf)', ['O','O','O','O','O','O','O','O','O','O','O','O','O','O']));
  
  // action
  data.push(createRow('action', ['','','','','','','','','','','','','','']));
  data.push(createRow('  "approve"', ['O','O','','','','','','','O','O','O','O','O','O']));
  data.push(createRow('  "cancel"', ['','','O','O','O','O','','','','','','','','']));
  data.push(createRow('  Invalid action', ['','','','','','','','O','','','','','','']));
  
  // cancelReason
  data.push(createRow('cancelReason', ['','','','','','','','','','','','','','']));
  data.push(createRow('  Custom reason', ['','','O','O','O','','','','','','','','','']));
  data.push(createRow('  null (default)', ['O','O','','','','O','O','O','O','O','O','O','O','O']));
  
  // ========== OUTPUT - CONFIRM SECTION ==========
  data.push({ '': 'Confirm', ' ': '', 'Field': 'Return' });
  data.push(createRow('success = true', ['O','O','O','O','O','O','','','','','','','','']));
  data.push(createRow('status = "Approved"', ['O','O','','','','','','','','','','','','']));
  data.push(createRow('status = "Cancelled"', ['','','O','O','O','O','','','','','','','','']));
  data.push(createRow('approvedByUserId set', ['O','O','O','O','O','O','','','','','','','','']));
  data.push(createRow('cancelReason saved', ['','','O','O','O','O','','','','','','','','']));
  data.push(createRow('Timeslot released', ['','','O','','','','','','','','','','','']));
  data.push(createRow('Google Meet link created', ['','O','','','','','','','','','','','','']));
  
  // ========== EXCEPTION SECTION ==========
  data.push({ '': 'Exception', ' ': '', 'Field': '' });
  data.push(createRow('Error thrown', ['','','','','','','O','O','O','O','O','O','O','O']));
  
  // ========== LOG MESSAGES ==========
  data.push({ '': 'Log Messages', ' ': '', 'Field': '(Error/Success Messages)' });
  
  // Success Messages
  data.push(createRow('✅ "Lịch hẹn đã được duyệt. Email xác nhận sẽ được gửi trong vài giây"', ['O','O','','','','','','','','','','','','']));
  data.push(createRow('✅ "Lịch hẹn đã bị hủy. Email thông báo sẽ được gửi trong vài giây"', ['','','O','O','O','O','','','','','','','','']));
  
  // Error Messages
  data.push(createRow('❌ "Không tìm thấy lịch hẹn"', ['','','','','','','O','','','','','','','']));
  data.push(createRow('❌ "Action phải là \\"approve\\" hoặc \\"cancel\\""', ['','','','','','','','O','','','','','','']));
  data.push(createRow('❌ "Không thể xử lý lịch hẹn ở trạng thái [status]"', ['','','','','','','','','O','O','O','O','O','O']));
  
  // ========== RESULT SECTION ==========
  data.push({ '': 'Result', ' ': '', 'Field': '' });
  data.push(createRow('Type(N: Normal, A: Abnormal)', ['N','N','N','N','N','N','A','A','A','A','A','A','A','A']));
  data.push(createRow('Passed/Failed', ['P','P','P','P','P','P','P','P','P','P','P','P','P','P']));
  data.push(createRow('Executed Date', ['5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025','5/12/2025']));
  data.push(createRow('Defect ID', ['','','','','','','','','','','','','','']));
  
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
  
  const outputPath = 'E:\\Workspace\\Đồ án\\Test_Matrix_reviewAppointment.xlsx';
  XLSX.writeFile(wb, outputPath);
  
  console.log('✅ Excel file created successfully!');
  console.log(`📁 File location: ${outputPath}`);
  console.log(`📊 Total test cases: ${testCases.length}`);
  console.log(`✅ All tests passed: 14/14`);
  console.log(`📅 Test execution date: 5/12/2025`);
  console.log('');
  console.log('📋 Log Messages Included in Matrix:');
  console.log('  SUCCESS:');
  console.log('    ✅ "Lịch hẹn đã được duyệt. Email xác nhận sẽ được gửi trong vài giây" (UTC01-02)');
  console.log('    ✅ "Lịch hẹn đã bị hủy. Email thông báo sẽ được gửi trong vài giây" (UTC03-06)');
  console.log('');
  console.log('  ERRORS:');
  console.log('    1. ❌ "Không tìm thấy lịch hẹn" (UTC07)');
  console.log('    2. ❌ "Action phải là \\"approve\\" hoặc \\"cancel\\"" (UTC08)');
  console.log('    3. ❌ "Không thể xử lý lịch hẹn ở trạng thái [status]" (UTC09-14)');
  console.log('');
  console.log('⚠️  Note: [status] is replaced with actual status like "Completed", "Cancelled", etc.');
}

createTestMatrix();
