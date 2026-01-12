/** @type {import('jest').Config} */
module.exports = {
  // Test environment
  testEnvironment: 'jsdom',

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Coverage configuration
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!tests/**',
    '!coverage/**'
  ],

  // Coverage thresholds
  // Note: Global thresholds accommodate DOM-heavy content.js (many fallback branches)
  // Per-file thresholds ensure critical modules maintain high coverage
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 90,
      lines: 65,
      statements: 65
    },
    // Stricter thresholds for well-tested modules
    './cache.js': {
      branches: 85,
      functions: 100,
      lines: 95,
      statements: 95
    },
    './types.js': {
      branches: 25,
      functions: 100,
      lines: 75,
      statements: 75
    },
    './icons.js': {
      branches: 50,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './resolver.js': {
      branches: 70,
      functions: 100,
      lines: 90,
      statements: 90
    },
    './wikidataClient.js': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './background.js': {
      branches: 85,
      functions: 80,
      lines: 90,
      statements: 90
    },
    './options.js': {
      branches: 85,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Test timeout
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Module paths for imports
  moduleDirectories: ['node_modules', '<rootDir>'],

  // Transform settings (no transformation needed for vanilla JS)
  transform: {},

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration-test-data.js',
    '/tests/integration-test-results.json'
  ]
};
