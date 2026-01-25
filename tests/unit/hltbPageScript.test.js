/**
 * Unit tests for hltbPageScript.js
 */

describe('hltbPageScript.js', () => {
  let messageHandlers;
  let originalAddEventListener;

  const flushPromises = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    jest.resetModules();
    messageHandlers = [];

    originalAddEventListener = window.addEventListener;
    jest.spyOn(window, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'message') {
        messageHandlers.push(handler);
      }
      return originalAddEventListener.call(window, type, handler, options);
    });

    window.postMessage = jest.fn();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    messageHandlers.forEach(handler => window.removeEventListener('message', handler));
    window.addEventListener.mockRestore();
    jest.clearAllMocks();
  });

  it('should post ready message on load', () => {
    require('../../dist/hltbPageScript.js');

    expect(window.postMessage).toHaveBeenCalledWith({ type: 'SCPW_HLTB_READY' }, '*');
  });

  it('should ignore messages from non-window sources', () => {
    require('../../dist/hltbPageScript.js');

    window.postMessage.mockClear();
    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-non-window',
        gameName: 'Test Game'
      },
      source: {}
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(window.postMessage).not.toHaveBeenCalled();
  });

  it('should ignore non-request message types', () => {
    require('../../dist/hltbPageScript.js');

    window.postMessage.mockClear();
    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: { type: 'NOT_A_REQUEST' },
      source: window
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(window.postMessage).not.toHaveBeenCalled();
  });

  it('should respond with exact Steam ID match', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 1,
              game_name: 'Test Game',
              comp_main: 3600,
              comp_plus: 7200,
              comp_100: 0,
              comp_all: 10800,
              profile_steam: 123
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-1',
        gameName: 'Test Game',
        steamAppId: '123'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-1');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0]).toMatchObject({
      success: true,
      data: {
        hltbId: 1,
        gameName: 'Test Game',
        mainStory: 1,
        mainExtra: 2,
        completionist: 0,
        allStyles: 3,
        steamId: 123
      }
    });
  });

  it('should return exact match with null steamId when profile is zero', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 11,
              game_name: 'Zero Steam ID',
              comp_main: 3600,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-zero-steam',
        gameName: 'Zero Steam ID',
        steamAppId: '0'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-zero-steam');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toMatchObject({
      hltbId: 11,
      steamId: null
    });
  });

  it('should return null when best match is too dissimilar', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 2,
              game_name: 'Completely Different',
              comp_main: 3600,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-2',
        gameName: 'Halo'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-2');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });

  it('should return null when auth token fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-auth-fail',
        gameName: 'Test Game'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-auth-fail');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });

  it('should return null when auth token is missing', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-no-token',
        gameName: 'Test Game'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-no-token');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should return null when search response is not ok', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-search-fail',
        gameName: 'Test Game'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-search-fail');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });

  it('should return null when search results are empty', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-empty',
        gameName: 'Test Game'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-empty');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });

  it('should return null when game name normalizes to empty', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 15,
              game_name: 'Test Game',
              comp_main: 0,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-empty-name',
        gameName: ''
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-empty-name');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });

  it('should score substring matches in both length directions', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 12,
              game_name: 'Halo',
              comp_main: 3600,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            },
            {
              game_id: 13,
              game_name: 'Halo 2 Legendary',
              comp_main: 7200,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-substring',
        gameName: 'Halo 2'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-substring');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toMatchObject({
      hltbId: 12,
      gameName: 'Halo'
    });
  });

  it('should use n-gram similarity when names overlap without containment', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 16,
              game_name: 'ABCE',
              comp_main: 3600,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 456
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-ngram',
        gameName: 'ABCD'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-ngram');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toMatchObject({
      hltbId: 16,
      gameName: 'ABCE',
      steamId: 456
    });
  });

  it('should return fuzzy match when no exact Steam ID match', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 9,
              game_name: 'Halo',
              comp_main: 3600,
              comp_plus: 7200,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-fuzzy',
        gameName: 'Halo',
        steamAppId: '123'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-fuzzy');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toMatchObject({
      hltbId: 9,
      gameName: 'Halo',
      mainStory: 1,
      mainExtra: 2,
      steamId: null
    });
  });

  it('should return null when names are too short for n-grams', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              game_id: 14,
              game_name: 'B',
              comp_main: 0,
              comp_plus: 0,
              comp_100: 0,
              comp_all: 0,
              profile_steam: 0
            }
          ]
        })
      });

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-short-names',
        gameName: 'A'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-short-names');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });

  it('should send error response when search throws', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockRejectedValueOnce(new Error('Boom'));

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-error',
        gameName: 'Test Game'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-error');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].success).toBe(false);
    expect(responseCalls[0].error).toContain('Boom');
  });

  it('should coerce non-Error exceptions into strings', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'token' }) })
      .mockRejectedValueOnce('BoomString');

    require('../../dist/hltbPageScript.js');

    const handler = messageHandlers[messageHandlers.length - 1];
    handler({
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-string-error',
        gameName: 'Test Game'
      },
      source: window
    });

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-string-error');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].success).toBe(false);
    expect(responseCalls[0].error).toContain('BoomString');
  });
});
