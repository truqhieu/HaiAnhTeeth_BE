/**
 * Simple test file for policyHelper.extractTimeFromPolicyDescription
 * Run with: node utils/policyHelper.test.js
 */

const policyHelper = require('./policyHelper');

console.log('🧪 Testing policyHelper.extractTimeFromPolicyDescription\n');

const testCases = [
  // Valid cases
  { input: 'Hủy lịch hẹn trước 1h sẽ không được hoàn tiền', expected: 1 },
  { input: 'Hủy trước 24 giờ để được hoàn tiền', expected: 24 },
  { input: 'Phải hủy trước 2 tiếng', expected: 2 },
  { input: 'Hủy trước 1.5h', expected: 1.5 },
  { input: 'Hủy trước 2.5 giờ để được hoàn tiền', expected: 2.5 },
  { input: 'Hủy lịch hẹn trước 48h sẽ không được hoàn tiền', expected: 48 },
  { input: 'Hủy trước 3 tiếng để được hoàn tiền', expected: 3 },
  
  // Edge cases
  { input: 'Không hoàn tiền', expected: null },
  { input: 'Hủy trước 1h hoặc 2h', expected: 1 }, // First match
  { input: '', expected: null },
  { input: null, expected: null },
  { input: undefined, expected: null },
  { input: 'Hủy trước 0h', expected: null }, // Invalid: 0 hours
  { input: 'Hủy trước 200h', expected: null }, // Invalid: > 168 hours (1 week)
];

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = policyHelper.extractTimeFromPolicyDescription(testCase.input);
  const isPass = result === testCase.expected;
  
  if (isPass) {
    console.log(`✅ Test ${index + 1}: PASS`);
    passed++;
  } else {
    console.log(`❌ Test ${index + 1}: FAIL`);
    console.log(`   Input: "${testCase.input}"`);
    console.log(`   Expected: ${testCase.expected}`);
    console.log(`   Got: ${result}`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('⚠️ Some tests failed!');
  process.exit(1);
}
