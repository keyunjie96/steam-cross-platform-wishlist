/**
 * Unit tests for steamDeckClient.js
 */

describe('steamDeckClient.js', () => {
    beforeEach(() => {
        jest.resetModules();

        // Clear any existing data element
        const existingEl = document.getElementById('xcpw-steamdeck-data');
        if (existingEl) {
            existingEl.remove();
        }

        // Clear runtime getURL mock
        chrome.runtime.getURL.mockClear();

        // Mock script element creation to simulate onload
        const originalCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
            const element = originalCreateElement(tagName);
            if (tagName === 'script') {
                // Trigger onload immediately after append
                setTimeout(() => {
                    element.onload && element.onload();
                }, 0);
            }
            return element;
        });

        // Load the module
        require('../../src/steamDeckClient.js');
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete globalThis.XCPW_SteamDeck;
    });

    describe('exports', () => {
        it('should export XCPW_SteamDeck to globalThis', () => {
            expect(globalThis.XCPW_SteamDeck).toBeDefined();
            expect(typeof globalThis.XCPW_SteamDeck).toBe('object');
        });

        it('should export all required functions', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            expect(typeof SteamDeck.extractDeckDataFromPage).toBe('function');
            expect(typeof SteamDeck.waitForDeckData).toBe('function');
            expect(typeof SteamDeck.getDeckStatus).toBe('function');
            expect(typeof SteamDeck.statusToDisplayStatus).toBe('function');
        });

        it('should export CATEGORY_MAP', () => {
            expect(globalThis.XCPW_SteamDeck.CATEGORY_MAP).toBeDefined();
            expect(globalThis.XCPW_SteamDeck.CATEGORY_MAP[3]).toBe('verified');
            expect(globalThis.XCPW_SteamDeck.CATEGORY_MAP[2]).toBe('playable');
            expect(globalThis.XCPW_SteamDeck.CATEGORY_MAP[1]).toBe('unsupported');
            expect(globalThis.XCPW_SteamDeck.CATEGORY_MAP[0]).toBe('unknown');
        });
    });

    describe('extractDeckDataFromPage', () => {
        it('should return empty Map when data element does not exist', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });

        it('should extract data from DOM element', () => {
            // Create the data element that steamDeckPageScript.js would create
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'xcpw-steamdeck-data';
            dataEl.textContent = JSON.stringify({ '12345': 3, '67890': 2 });
            document.documentElement.appendChild(dataEl);

            const SteamDeck = globalThis.XCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(2);
            expect(result.get('12345')).toBe(3);
            expect(result.get('67890')).toBe(2);

            dataEl.remove();
        });

        it('should handle invalid JSON gracefully', () => {
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'xcpw-steamdeck-data';
            dataEl.textContent = 'invalid json';
            document.documentElement.appendChild(dataEl);

            const SteamDeck = globalThis.XCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);

            dataEl.remove();
        });

        it('should handle empty textContent', () => {
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'xcpw-steamdeck-data';
            dataEl.textContent = '';
            document.documentElement.appendChild(dataEl);

            const SteamDeck = globalThis.XCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);

            dataEl.remove();
        });
    });

    describe('getDeckStatus', () => {
        it('should return found=true for existing appId', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map([['12345', 3]]);

            const result = SteamDeck.getDeckStatus(deckData, '12345');

            expect(result.found).toBe(true);
            expect(result.status).toBe('verified');
            expect(result.category).toBe(3);
        });

        it('should return found=false for missing appId', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map();

            const result = SteamDeck.getDeckStatus(deckData, '99999');

            expect(result.found).toBe(false);
            expect(result.status).toBe('unknown');
            expect(result.category).toBe(0);
        });

        it('should map category 3 to verified', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map([['123', 3]]);
            expect(SteamDeck.getDeckStatus(deckData, '123').status).toBe('verified');
        });

        it('should map category 2 to playable', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map([['123', 2]]);
            expect(SteamDeck.getDeckStatus(deckData, '123').status).toBe('playable');
        });

        it('should map category 1 to unsupported', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map([['123', 1]]);
            expect(SteamDeck.getDeckStatus(deckData, '123').status).toBe('unsupported');
        });

        it('should map category 0 to unknown', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map([['123', 0]]);
            expect(SteamDeck.getDeckStatus(deckData, '123').status).toBe('unknown');
        });

        it('should handle unknown category values', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            const deckData = new Map([['123', 99]]);
            expect(SteamDeck.getDeckStatus(deckData, '123').status).toBe('unknown');
        });
    });

    describe('statusToDisplayStatus', () => {
        it('should convert verified to available', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            expect(SteamDeck.statusToDisplayStatus('verified')).toBe('available');
        });

        it('should convert playable to unavailable', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            expect(SteamDeck.statusToDisplayStatus('playable')).toBe('unavailable');
        });

        it('should convert unsupported to unknown', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            expect(SteamDeck.statusToDisplayStatus('unsupported')).toBe('unknown');
        });

        it('should convert unknown to unknown', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            expect(SteamDeck.statusToDisplayStatus('unknown')).toBe('unknown');
        });

        it('should handle unexpected values', () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;
            expect(SteamDeck.statusToDisplayStatus('invalid')).toBe('unknown');
        });
    });

    describe('waitForDeckData', () => {
        it('should return data when DOM element is already populated', async () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;

            // Create the data element before calling waitForDeckData
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'xcpw-steamdeck-data';
            dataEl.textContent = JSON.stringify({ '12345': 3 });
            document.documentElement.appendChild(dataEl);

            // Since data is already there, it should return immediately
            const promise = SteamDeck.waitForDeckData(100);
            await jest.advanceTimersByTimeAsync(10);
            const result = await promise;

            expect(result).toBeInstanceOf(Map);
            expect(result.get('12345')).toBe(3);

            dataEl.remove();
        });

        it.skip('should return empty Map on timeout when no data element', async () => {
            const SteamDeck = globalThis.XCPW_SteamDeck;

            // Don't create the data element - should timeout
            const promise = SteamDeck.waitForDeckData(100);

            // Advance timers past the timeout
            await jest.advanceTimersByTimeAsync(150);

            const result = await promise;

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });
    });
});
