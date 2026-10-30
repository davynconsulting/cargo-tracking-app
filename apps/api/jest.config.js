/** Unit tests need nothing; integration tests (test/*.int.test.ts) need DATABASE_URL. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['reflect-metadata'],
};
