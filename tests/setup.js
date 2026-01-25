/**
 * Jest Test Setup
 *
 * Configures the test environment with Chrome API mocks and global setup.
 */

const { chromeMock, clearMockStorage } = require('./mocks/chrome');

// Install Chrome API mock globally
global.chrome = chromeMock;

// Install globalThis mock (used by extension modules)
global.globalThis = global;

// Mock fetch for network tests
global.fetch = jest.fn();

// Mock setTimeout/setInterval for timing tests
jest.useFakeTimers({ advanceTimers: true });

// Reset mocks before each test
beforeEach(() => {
  // Clear Chrome storage mock
  clearMockStorage();

  // Reset fetch mock
  global.fetch.mockReset();

  // Reset all Jest mocks
  jest.clearAllMocks();

  // Clear any timers
  jest.clearAllTimers();

  // Reset globalThis properties that modules may have set
  delete global.SCPW_StoreUrls;
  delete global.SCPW_Icons;
  delete global.SCPW_PlatformInfo;
  delete global.SCPW_StatusInfo;
  delete global.SCPW_Cache;
  delete global.SCPW_WikidataClient;
  delete global.SCPW_Resolver;
});

// Restore real timers after each test if needed
afterEach(() => {
  jest.useRealTimers();
  jest.useFakeTimers({ advanceTimers: true });
});

// Console warning suppression for expected errors in tests
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  // Suppress expected console warnings in tests
  console.warn = (...args) => {
    if (args[0]?.includes?.('[SCPW')) {
      return; // Suppress extension logs during tests
    }
    originalWarn(...args);
  };

  console.error = (...args) => {
    if (args[0]?.includes?.('[SCPW')) {
      return; // Suppress extension logs during tests
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// DOMParser mock for SVG parsing
if (typeof DOMParser === 'undefined') {
  global.DOMParser = class DOMParser {
    parseFromString(str, type) {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(str, { contentType: type });
      return dom.window.document;
    }
  };
}
