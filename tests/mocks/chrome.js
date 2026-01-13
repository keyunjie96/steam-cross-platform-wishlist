/**
 * Chrome Extension API Mocks for Jest
 *
 * Provides mock implementations of Chrome APIs used by the extension.
 */

// In-memory storage for chrome.storage.local
const storageData = new Map();

/**
 * Mock chrome.storage.local API
 */
const storageMock = {
  get: jest.fn((keys) => {
    return new Promise((resolve) => {
      if (keys === null) {
        // Return all data
        const result = {};
        storageData.forEach((value, key) => {
          result[key] = value;
        });
        resolve(result);
      } else if (typeof keys === 'string') {
        resolve({ [keys]: storageData.get(keys) });
      } else if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(key => {
          if (storageData.has(key)) {
            result[key] = storageData.get(key);
          }
        });
        resolve(result);
      } else if (typeof keys === 'object') {
        const result = {};
        Object.keys(keys).forEach(key => {
          result[key] = storageData.has(key) ? storageData.get(key) : keys[key];
        });
        resolve(result);
      } else {
        resolve({});
      }
    });
  }),

  set: jest.fn((items) => {
    return new Promise((resolve) => {
      Object.entries(items).forEach(([key, value]) => {
        storageData.set(key, value);
      });
      resolve();
    });
  }),

  remove: jest.fn((keys) => {
    return new Promise((resolve) => {
      if (typeof keys === 'string') {
        storageData.delete(keys);
      } else if (Array.isArray(keys)) {
        keys.forEach(key => storageData.delete(key));
      }
      resolve();
    });
  }),

  clear: jest.fn(() => {
    return new Promise((resolve) => {
      storageData.clear();
      resolve();
    });
  })
};

/**
 * Mock chrome.runtime API
 */
const runtimeMock = {
  sendMessage: jest.fn((message) => {
    return new Promise((resolve) => {
      // Default mock - can be overridden in tests
      resolve({ success: true });
    });
  }),

  getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),

  onMessage: {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    hasListener: jest.fn(() => false)
  },

  lastError: null
};

/**
 * Mock chrome.storage.sync API (same implementation as local for testing)
 */
const syncStorageData = new Map();

const syncStorageMock = {
  get: jest.fn((keys) => {
    return new Promise((resolve) => {
      if (keys === null) {
        const result = {};
        syncStorageData.forEach((value, key) => {
          result[key] = value;
        });
        resolve(result);
      } else if (typeof keys === 'string') {
        resolve({ [keys]: syncStorageData.get(keys) });
      } else if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(key => {
          if (syncStorageData.has(key)) {
            result[key] = syncStorageData.get(key);
          }
        });
        resolve(result);
      } else if (typeof keys === 'object') {
        const result = {};
        Object.keys(keys).forEach(key => {
          result[key] = syncStorageData.has(key) ? syncStorageData.get(key) : keys[key];
        });
        resolve(result);
      } else {
        resolve({});
      }
    });
  }),

  set: jest.fn((items) => {
    return new Promise((resolve) => {
      Object.entries(items).forEach(([key, value]) => {
        syncStorageData.set(key, value);
      });
      resolve();
    });
  }),

  remove: jest.fn((keys) => {
    return new Promise((resolve) => {
      if (typeof keys === 'string') {
        syncStorageData.delete(keys);
      } else if (Array.isArray(keys)) {
        keys.forEach(key => syncStorageData.delete(key));
      }
      resolve();
    });
  }),

  clear: jest.fn(() => {
    return new Promise((resolve) => {
      syncStorageData.clear();
      resolve();
    });
  })
};

/**
 * Full chrome mock object
 */
const chromeMock = {
  storage: {
    local: storageMock,
    sync: syncStorageMock
  },
  runtime: runtimeMock
};

/**
 * Helper to clear storage between tests
 */
function clearMockStorage() {
  storageData.clear();
  storageMock.get.mockClear();
  storageMock.set.mockClear();
  storageMock.remove.mockClear();
  storageMock.clear.mockClear();

  syncStorageData.clear();
  syncStorageMock.get.mockClear();
  syncStorageMock.set.mockClear();
  syncStorageMock.remove.mockClear();
  syncStorageMock.clear.mockClear();
}

/**
 * Helper to set initial storage data for tests
 * @param {Object} data - Key-value pairs to populate storage
 */
function setMockStorageData(data) {
  Object.entries(data).forEach(([key, value]) => {
    storageData.set(key, value);
  });
}

/**
 * Helper to get current storage data
 * @returns {Object} Current storage contents
 */
function getMockStorageData() {
  const result = {};
  storageData.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

module.exports = {
  chromeMock,
  storageMock,
  syncStorageMock,
  runtimeMock,
  clearMockStorage,
  setMockStorageData,
  getMockStorageData
};
