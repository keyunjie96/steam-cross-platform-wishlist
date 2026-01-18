/**
 * Unit tests for steamDeckPageScript.js
 * 
 * Note: This script runs in the page's main world and accesses window.SSR.
 * We mock window.SSR for testing.
 */

describe('steamDeckPageScript.js', () => {
    beforeEach(() => {
        jest.resetModules();

        // Clean up any existing data element
        const existingEl = document.getElementById('xcpw-steamdeck-data');
        if (existingEl) {
            existingEl.remove();
        }

        // Reset window.SSR
        delete window.SSR;
    });

    afterEach(() => {
        delete window.SSR;
        const el = document.getElementById('xcpw-steamdeck-data');
        if (el) el.remove();
    });

    describe('data extraction', () => {
        it('should create data element in DOM', () => {
            // Set up mock SSR data
            window.SSR = {
                renderContext: {
                    queryData: JSON.stringify({
                        queries: [
                            {
                                queryKey: ['StoreItem', 'app_12345', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 3 } }
                            }
                        ]
                    })
                }
            };

            // Load the script
            require('../../dist/steamDeckPageScript.js');

            // Check that data element was created
            const dataEl = document.getElementById('xcpw-steamdeck-data');
            expect(dataEl).not.toBeNull();
            expect(dataEl.type).toBe('application/json');
        });

        it('should extract Steam Deck data from SSR.renderContext.queryData', () => {
            window.SSR = {
                renderContext: {
                    queryData: JSON.stringify({
                        queries: [
                            {
                                queryKey: ['StoreItem', 'app_12345', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 3 } }
                            },
                            {
                                queryKey: ['StoreItem', 'app_67890', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 2 } }
                            }
                        ]
                    })
                }
            };

            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(data['12345']).toBe(3);
            expect(data['67890']).toBe(2);
        });

        it('should skip queries without steam_deck_compat_category', () => {
            window.SSR = {
                renderContext: {
                    queryData: JSON.stringify({
                        queries: [
                            {
                                queryKey: ['StoreItem', 'app_12345', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 3 } }
                            },
                            {
                                queryKey: ['StoreItem', 'app_67890', 'include_platforms'],
                                state: { data: { name: 'Some Game' } }  // No deck category
                            }
                        ]
                    })
                }
            };

            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(data['12345']).toBe(3);
            expect(data['67890']).toBeUndefined();
        });

        it('should skip queries that are not StoreItem', () => {
            window.SSR = {
                renderContext: {
                    queryData: JSON.stringify({
                        queries: [
                            {
                                queryKey: ['OtherType', 'app_12345', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 3 } }
                            },
                            {
                                queryKey: ['StoreItem', 'app_67890', 'wrong_key'],
                                state: { data: { steam_deck_compat_category: 2 } }
                            }
                        ]
                    })
                }
            };

            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(data['12345']).toBeUndefined();
            expect(data['67890']).toBe(2);
        });

        it('should handle missing SSR gracefully', () => {
            // No window.SSR set
            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(Object.keys(data).length).toBe(0);
        });

        it('should handle invalid queryData JSON gracefully', () => {
            window.SSR = {
                renderContext: {
                    queryData: 'not valid json'
                }
            };

            // Should not throw
            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(Object.keys(data).length).toBe(0);
        });

        it('should use loaderData fallback when queryData is empty', () => {
            window.SSR = {
                renderContext: { queryData: '{"queries":[]}' },
                loaderData: [
                    JSON.stringify({
                        queries: [
                            {
                                queryKey: ['StoreItem', 'app_99999', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 1 } }
                            }
                        ]
                    })
                ]
            };

            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(data['99999']).toBe(1);
        });

        it('should replace existing data element', () => {
            // Create an existing element
            const existingEl = document.createElement('script');
            existingEl.type = 'application/json';
            existingEl.id = 'xcpw-steamdeck-data';
            existingEl.textContent = '{"old": "data"}';
            document.documentElement.appendChild(existingEl);

            window.SSR = {
                renderContext: {
                    queryData: JSON.stringify({
                        queries: [
                            {
                                queryKey: ['StoreItem', 'app_11111', 'include_platforms'],
                                state: { data: { steam_deck_compat_category: 2 } }
                            }
                        ]
                    })
                }
            };

            require('../../dist/steamDeckPageScript.js');

            const dataEl = document.getElementById('xcpw-steamdeck-data');
            const data = JSON.parse(dataEl.textContent);

            expect(data['11111']).toBe(2);
            expect(data['old']).toBeUndefined();
        });
    });
});
