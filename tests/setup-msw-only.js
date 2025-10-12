// ============================================================================
// MSW-ONLY SETUP - For API mocking tests in Node.js environment
// ============================================================================
// This setup file is used specifically for API mocking verification tests
// that run in a pure Node.js environment (no DOM simulation).
// MSW works best with Node.js's native fetch without DOM environment overhead.

import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server.js';

// ============================================================================
// MSW (Mock Service Worker) Setup
// ============================================================================

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
