# Unit Tests for createConsultationAppointment

## Overview

Comprehensive Jest test suite for the `createConsultationAppointment` function with **15+ test cases** covering:

- ✅ Valid appointments (self & other)
- ✅ Payment requirements (Consultation vs Examination)
- ✅ Missing required fields validation
- ✅ Invalid time slots (past dates)
- ✅ Customer information validation

## Test Data

All tests use **real database IDs** from your MongoDB:

### Patients
- `691fe21b4b0b8b308033efab`
- `691fe7486044b35e223a5b12`
- `691fe8f6cff92d275b09d3aa5`

### Doctors
- `691fe0194b0b8b308033eeee`
- `691fe6e64b0b8b308033eefc`

### Services
- `68f99fefa83a2b532e8abd6b` - Làm sạch răng (Examination, Offline)
- `68f9a0cca83a2b532e8abd6b` - AerGan (Consultation, Online, Prepaid)

### Doctor Schedules
- `6920be88b626e4db50c38f24`
- `6925be88b626e4db50c38f25`
- `6925be88b626e4db50c38f23`

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (auto-rerun on file changes)
```bash
npm run test:watch
```

### Run tests with coverage report
```bash
npm run test:coverage
```

### Run specific test file
```bash
npx jest __tests__/createConsultationAppointment.test.js
```

### Run specific test case
```bash
npx jest -t "should create appointment successfully"
```

## Test Cases

### Valid Cases (UTC01-UTC05)
1. **UTC01** - Valid appointment for self (Examination)
2. **UTC02** - Valid appointment for self (Consultation with payment)
3. **UTC03** - Valid appointment for other person
4. **UTC04** - Different doctor and time slot
5. **UTC05** - Multiple appointments same day

### Error Cases
6. Missing `patientUserId`
7. Missing `doctorUserId`
8. Missing `serviceId`
9. Missing `selectedSlot.startTime`
10. Missing `selectedSlot.endTime`
11. Past time slot
12. Missing `fullName` when `appointmentFor='other'`
13. Missing `email` when `appointmentFor='other'`
14. Missing `phoneNumber` when `appointmentFor='other'`

## Expected Results

### Successful Appointment (Examination)
```javascript
{
  appointmentId: "...",
  status: "Pending",
  mode: "Offline",
  requirePayment: false
}
```

### Successful Appointment (Consultation)
```javascript
{
  appointmentId: "...",
  status: "PendingPayment",
  mode: "Online",
  requirePayment: true,
  payment: {
    paymentId: "...",
    QRurl: "...",
    expiresAt: "..."
  }
}
```

## Troubleshooting

### MongoDB Connection Error
Make sure your `.env` file has the correct `MONGO_URI`:
```

### Test Timeout
If tests timeout, increase timeout in `jest.config.js`:
```javascript
testTimeout: 60000 // 60 seconds
```

### Clear Test Data
If you need to clean up test appointments:
```javascript
// In MongoDB shell or Compass
db.appointments.deleteMany({ notes: /test/i })
```

## Files Created

- `__tests__/createConsultationAppointment.test.js` - Main test file
- `jest.config.js` - Jest configuration
- `jest.setup.js` - Global test setup
- `package.json` - Updated with test scripts

## Next Steps

1. Run `npm test` to execute all tests
2. Review test results and fix any failures
3. Add more test cases as needed
4. Run `npm run test:coverage` to see code coverage
