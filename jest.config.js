module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  collectCoverageFrom: [
    'services/**/*.js',
    'controllers/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  testTimeout: 30000, // 30 seconds for database operations
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
