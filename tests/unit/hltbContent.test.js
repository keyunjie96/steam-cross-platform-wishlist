/**
 * Unit tests for hltbContent.js
 */

describe('hltbContent.js', () => {
  let messageHandlers;
  let originalAddEventListener;
  let runtimeMessageHandler;

  const flushPromises = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  const cleanupInjectedScripts = () => {
    document.querySelectorAll('script[data-scpw-hltb]').forEach(el => el.remove());
  };

  beforeEach(() => {
    jest.resetModules();
    messageHandlers = [];

    cleanupInjectedScripts();

    originalAddEventListener = window.addEventListener;
    jest.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'message') {
        messageHandlers.push(handler);
      }
      return originalAddEventListener.call(window, type, handler, options);
    });

    window.postMessage = jest.fn();
    chrome.runtime.onMessage.addListener.mockClear();

    require('../../dist/hltbContent.js');

    runtimeMessageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  });

  afterEach(() => {
    messageHandlers.forEach(handler => window.removeEventListener('message', handler));
    window.addEventListener.mockRestore();
    cleanupInjectedScripts();
    jest.clearAllMocks();
  });

  it('should inject the HLTB page script on load', () => {
    const script = document.querySelector('script[data-scpw-hltb]');
    expect(script).not.toBeNull();
    expect(script.src).toContain('dist/hltbPageScript.js');
  });

  it('should append script to documentElement when head is missing', () => {
    cleanupInjectedScripts();

    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'head');
    Object.defineProperty(document, 'head', {
      configurable: true,
      get: () => null
    });

    jest.resetModules();
    require('../../dist/hltbContent.js');

    const script = document.documentElement.querySelector('script[data-scpw-hltb]');
    expect(script).not.toBeNull();

    if (originalDescriptor) {
      Object.defineProperty(document, 'head', originalDescriptor);
    }
  });

  it('should forward HLTB_QUERY messages to the page script', async () => {
    const sendResponse = jest.fn();

    const result = runtimeMessageHandler({
      type: 'HLTB_QUERY',
      requestId: 'req-1',
      gameName: 'Test Game',
      steamAppId: '123'
    }, {}, sendResponse);

    expect(result).toBe(true);

    await flushPromises();

    expect(window.postMessage).toHaveBeenCalledWith({
      type: 'SCPW_HLTB_REQUEST',
      requestId: 'req-1',
      gameName: 'Test Game',
      steamAppId: '123'
    }, '*');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_RESPONSE',
        requestId: 'req-1',
        success: true,
        data: {
          hltbId: 10,
          gameName: 'Test Game',
          mainStory: 12,
          mainExtra: 20,
          completionist: 30,
          allStyles: 25,
          steamId: 123
        }
      },
      source: window
    });

    expect(sendResponse).toHaveBeenCalledWith({
      type: 'HLTB_QUERY_RESPONSE',
      requestId: 'req-1',
      success: true,
      data: {
        hltbId: 10,
        gameName: 'Test Game',
        mainStory: 12,
        mainExtra: 20,
        completionist: 30,
        allStyles: 25,
        steamId: 123
      },
      error: undefined
    });

    jest.advanceTimersByTime(10000);
    expect(sendResponse).toHaveBeenCalledTimes(1);
  });

  it('should timeout when no response is received', async () => {
    const sendResponse = jest.fn();

    runtimeMessageHandler({
      type: 'HLTB_QUERY',
      requestId: 'req-timeout',
      gameName: 'Slow Game'
    }, {}, sendResponse);

    await flushPromises();
    jest.advanceTimersByTime(10000);

    expect(sendResponse).toHaveBeenCalledWith({
      type: 'HLTB_QUERY_RESPONSE',
      requestId: 'req-timeout',
      success: false,
      error: 'Request timed out'
    });
  });

  it('should ignore non-HLTB_QUERY messages', () => {
    const sendResponse = jest.fn();

    const result = runtimeMessageHandler({
      type: 'NOT_HLTB_QUERY'
    }, {}, sendResponse);

    expect(result).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('should not reinject page script when already present', async () => {
    const initialScripts = document.querySelectorAll('script[data-scpw-hltb]').length;

    const sendResponse = jest.fn();
    runtimeMessageHandler({
      type: 'HLTB_QUERY',
      requestId: 'req-2',
      gameName: 'Test Game 2'
    }, {}, sendResponse);

    await flushPromises();

    const afterScripts = document.querySelectorAll('script[data-scpw-hltb]').length;
    expect(afterScripts).toBe(initialScripts);
  });

  it('should ignore messages not from window', () => {
    const handler = messageHandlers[messageHandlers.length - 1];
    const sendResponse = jest.fn();

    runtimeMessageHandler({
      type: 'HLTB_QUERY',
      requestId: 'req-ignore',
      gameName: 'Test Game'
    }, {}, sendResponse);

    handler({
      data: {
        type: 'SCPW_HLTB_RESPONSE',
        requestId: 'req-ignore',
        success: true,
        data: null
      },
      source: {}
    });

    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('should ignore ready message without errors', () => {
    const handler = messageHandlers[messageHandlers.length - 1];

    handler({
      data: { type: 'SCPW_HLTB_READY' },
      source: window
    });

    expect(true).toBe(true);
  });

  it('should ignore unrelated message types', () => {
    const handler = messageHandlers[messageHandlers.length - 1];

    handler({
      data: { type: 'SCPW_OTHER_EVENT' },
      source: window
    });

    expect(true).toBe(true);
  });

  it('should ignore responses without a matching request', () => {
    const handler = messageHandlers[messageHandlers.length - 1];

    handler({
      data: {
        type: 'SCPW_HLTB_RESPONSE',
        requestId: 'req-missing',
        success: true,
        data: null
      },
      source: window
    });

    expect(true).toBe(true);
  });
});
