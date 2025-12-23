// Script to update all test files from 2025 to 2026
const fs = require('fs');
const path = require('path');

const testFiles = [
  'cancelAppointment.test.js',
  'checkInAppointment.test.js',
  'completeAppointment.test.js',
  'confirmPayment.test.js',
  'createFollowUpAppointment.test.js',
  'getOrCreateMedicalRecord.test.js',
  'reviewAppointment.test.js',
  'updateMedicalRecordForDoctor.test.js',
  'assignDoctorToAppointment.test.js',
  'approveMedicalRecordByDoctor.test.js'
];

const testsDir = path.join(__dirname, '__tests__');

testFiles.forEach(file => {
  const filePath = path.join(testsDir, file);
  
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const updated = content.replace(/2025-/g, '2026-');
    
    if (content !== updated) {
      fs.writeFileSync(filePath, updated, 'utf8');
      console.log(`✅ Updated: ${file}`);
    } else {
      console.log(`⏭️  Skipped: ${file} (no changes needed)`);
    }
  } else {
    console.log(`❌ Not found: ${file}`);
  }
});

console.log('\n✅ All test files updated to use 2026 dates!');
