/**
 * Unit tests for hltbPageScript.js
 */

describe('hltbPageScript.js', () => {
  let messageHandlers;
  let originalAddEventListener;

  const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
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

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-1',
        gameName: 'Test Game',
        steamAppId: '123'
      },
      source: window
    }));

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

    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: 'SCPW_HLTB_REQUEST',
        requestId: 'req-2',
        gameName: 'Halo'
      },
      source: window
    }));

    await flushPromises();

    const responseCalls = window.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === 'SCPW_HLTB_RESPONSE' && message.requestId === 'req-2');

    expect(responseCalls).toHaveLength(1);
    expect(responseCalls[0].data).toBeNull();
  });
});
