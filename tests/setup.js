// ============================================================================
// TEST SETUP - Mock browser APIs for unit/integration tests (Vitest 3)
// ============================================================================

import { beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { server } from './mocks/server.js';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};

    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index) => {
            const keys = Object.keys(store);
            return keys[index] || null;
        }
    };
})();

// Mock window.location
const locationMock = {
    href: 'http://localhost:3000',
    protocol: 'http:',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
    assign: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn()
};

// Store original console methods
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
};

// ============================================================================
// MSW (Mock Service Worker) Setup
// ============================================================================
// MSW intercepts HTTP requests at the network level - more reliable than
// mocking global.fetch, and works consistently across all environments.
// See: https://mswjs.io/docs/integrations/node

// Start MSW server before all tests
beforeAll(() => {
    server.listen({
        // Fail tests immediately if an unmocked request is made
        // This prevents accidental real API calls
        onUnhandledRequest: 'error'
    });
});

// Reset handlers after each test for test isolation
afterEach(() => {
    server.resetHandlers();
});

// Close MSW server after all tests
afterAll(() => {
    server.close();
});

// ============================================================================
// Test Environment Setup (runs before each test)
// ============================================================================
beforeEach(() => {
    // Reset localStorage
    localStorageMock.clear();
    global.localStorage = localStorageMock;

    // Reset window.location
    global.window = global.window || {};
    global.window.location = { ...locationMock };

    // Mock console methods (optional - prevents test output pollution)
    // Only mock in test environment, not in beforeEach hooks
    if (process.env.NODE_ENV === 'test') {
        global.console = {
            ...console,
            log: vi.fn(originalConsole.log),
            warn: vi.fn(originalConsole.warn),
            error: vi.fn(originalConsole.error)
        };
    }

    // Reset all mocks (Vitest 3 best practice)
    vi.clearAllMocks();
});
