/**
 * Unit tests for steamDeckClient.js
 */

describe('steamDeckClient.js', () => {
    beforeEach(() => {
        jest.resetModules();

        // Clear any existing data element
        const existingEl = document.getElementById('scpw-steamdeck-data');
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
        require('../../dist/steamDeckClient.js');
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete globalThis.SCPW_SteamDeck;
    });

    describe('exports', () => {
        it('should export SCPW_SteamDeck to globalThis', () => {
            expect(globalThis.SCPW_SteamDeck).toBeDefined();
            expect(typeof globalThis.SCPW_SteamDeck).toBe('object');
        });

        it('should export all required functions', () => {
            const SteamDeck = globalThis.SCPW_SteamDeck;
            expect(typeof SteamDeck.extractDeckDataFromPage).toBe('function');
            expect(typeof SteamDeck.waitForDeckData).toBe('function');
            expect(typeof SteamDeck.getDeckStatus).toBe('function');
            expect(typeof SteamDeck.statusToDisplayStatus).toBe('function');
        });

        it('should export CATEGORY_MAP', () => {
            expect(globalThis.SCPW_SteamDeck.CATEGORY_MAP).toBeDefined();
            expect(globalThis.SCPW_SteamDeck.CATEGORY_MAP[3]).toBe('verified');
            expect(globalThis.SCPW_SteamDeck.CATEGORY_MAP[2]).toBe('playable');
            expect(globalThis.SCPW_SteamDeck.CATEGORY_MAP[1]).toBe('unsupported');
            expect(globalThis.SCPW_SteamDeck.CATEGORY_MAP[0]).toBe('unknown');
        });
    });

    describe('extractDeckDataFromPage', () => {
        it('should return empty Map when data element does not exist', () => {
            const SteamDeck = globalThis.SCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });

        it('should extract data from DOM element', () => {
            // Create the data element that steamDeckPageScript.js would create
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'scpw-steamdeck-data';
            dataEl.textContent = JSON.stringify({ '12345': 3, '67890': 2 });
            document.documentElement.appendChild(dataEl);

            const SteamDeck = globalThis.SCPW_SteamDeck;
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
            dataEl.id = 'scpw-steamdeck-data';
            dataEl.textContent = 'invalid json';
            document.documentElement.appendChild(dataEl);

            const SteamDeck = globalThis.SCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);

            dataEl.remove();
        });

        it('should handle empty textContent', () => {
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'scpw-steamdeck-data';
            dataEl.textContent = '';
            document.documentElement.appendChild(dataEl);

            const SteamDeck = globalThis.SCPW_SteamDeck;
            const result = SteamDeck.extractDeckDataFromPage();

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);

            dataEl.remove();
        });
    });

    describe('getDeckStatus', () => {
        it('should return found=true for existing appId', () => {
            const SteamDeck = globalThis.SCPW_SteamDeck;
            const deckData = new Map([['12345', 3]]);

            const result = SteamDeck.getDeckStatus(deckData, '12345');

            expect(result.found).toBe(true);
            expect(result.status).toBe('verified');
            expect(result.category).toBe(3);
        });

        it('should return found=false for missing appId', () => {
            const SteamDeck = globalThis.SCPW_SteamDeck;
            const deckData = new Map();

            const result = SteamDeck.getDeckStatus(deckData, '99999');

            expect(result.found).toBe(false);
            expect(result.status).toBe('unknown');
            expect(result.category).toBe(0);
        });

        it.each([
            [3, 'verified'],
            [2, 'playable'],
            [1, 'unsupported'],
            [0, 'unknown'],
            [99, 'unknown']
        ])('should map category %i to %s', (category, expectedStatus) => {
            const SteamDeck = globalThis.SCPW_SteamDeck;
            const deckData = new Map([['123', category]]);
            expect(SteamDeck.getDeckStatus(deckData, '123').status).toBe(expectedStatus);
        });
    });

    describe('statusToDisplayStatus', () => {
        it.each([
            ['verified', 'available'],
            ['playable', 'unavailable'],
            ['unsupported', 'unknown'],
            ['unknown', 'unknown'],
            ['invalid', 'unknown'],
            [null, 'unknown'],
            [undefined, 'unknown']
        ])('should convert %s to %s', (input, expected) => {
            const SteamDeck = globalThis.SCPW_SteamDeck;
            expect(SteamDeck.statusToDisplayStatus(input)).toBe(expected);
        });
    });

    describe('waitForDeckData', () => {
        it('should return data when DOM element is already populated', async () => {
            const SteamDeck = globalThis.SCPW_SteamDeck;

            // Create the data element before calling waitForDeckData
            const dataEl = document.createElement('script');
            dataEl.type = 'application/json';
            dataEl.id = 'scpw-steamdeck-data';
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
            const SteamDeck = globalThis.SCPW_SteamDeck;

            // Don't create the data element - should timeout
            const promise = SteamDeck.waitForDeckData(100);

            // Advance timers past the timeout
            await jest.advanceTimersByTimeAsync(150);

            const result = await promise;

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });

        it('should return empty Map when script injection fails', async () => {
            jest.resetModules();

            // Mock script element to trigger onerror instead of onload
            const originalCreateElement = document.createElement.bind(document);
            jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
                const element = originalCreateElement(tagName);
                if (tagName === 'script') {
                    // Trigger onerror immediately after append to simulate load failure
                    setTimeout(() => {
                        element.onerror && element.onerror();
                    }, 0);
                }
                return element;
            });

            // Reload the module with new mock
            require('../../dist/steamDeckClient.js');
            const SteamDeck = globalThis.SCPW_SteamDeck;

            const promise = SteamDeck.waitForDeckData(100);
            await jest.advanceTimersByTimeAsync(10);
            const result = await promise;

            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(0);
        });
    });
});
