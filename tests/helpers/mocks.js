// ============================================================================
// MOCK HELPERS - Mock creation utilities for tests
// ============================================================================
// Provides factory functions for creating mocks, spies, and stubs
// to reduce boilerplate in test files.

import { vi } from 'vitest';

/**
 * Create a mock callback function with optional behavior
 * Replaces repetitive `const mockCallback = vi.fn()` pattern
 *
 * @param {Function} implementation - Optional implementation function
 * @returns {Function} Mock function
 *
 * @example
 * const callback = createMockCallback();
 * const callbackWithImpl = createMockCallback((result) => console.log(result));
 */
export function createMockCallback(implementation = null) {
    return implementation ? vi.fn(implementation) : vi.fn();
}

/**
 * Create a mock search client with configurable behavior
 * @param {Object} options - Client options
 * @param {Function} options.search - Search implementation
 * @param {string} options.name - Client name
 * @returns {Object} Mock client
 *
 * @example
 * const client = createMockSearchClient({
 *     search: () => Promise.resolve([paper1, paper2]),
 *     name: 'MockAPI'
 * });
 */
export function createMockSearchClient(options = {}) {
    const {
        search = vi.fn(() => Promise.resolve([])),
        name = 'MockClient'
    } = options;

    return {
        search,
        name,
        baseUrl: 'https://mock-api.example.com',
        timeout: 15000
    };
}

/**
 * Create a mock BM25 scorer
 * @param {Object} options - Scorer options
 * @returns {Object} Mock scorer
 */
export function createMockBM25Scorer(options = {}) {
    const {
        score = vi.fn((paper, query) => 0.5),
        updateCorpusStats = vi.fn(),
        reset = vi.fn()
    } = options;

    return {
        score,
        updateCorpusStats,
        reset,
        k1: 1.5,
        b: 0.75,
        documentFrequency: new Map(),
        totalDocs: 0,
        processedDocIds: new Set()
    };
}

/**
 * Create a mock paper processor
 * @param {Object} options - Processor options
 * @returns {Object} Mock processor
 */
export function createMockPaperProcessor(options = {}) {
    const {
        processPapers = vi.fn((papers) => papers),
        deduplicatePapers = vi.fn((papers) => papers),
        calculateRelevance = vi.fn((papers) => papers),
        sortPapers = vi.fn((papers) => papers)
    } = options;

    return {
        processPapers,
        deduplicatePapers,
        calculateRelevance,
        sortPapers,
        bm25: createMockBM25Scorer(),
        dedupeThreshold: 0.85
    };
}

/**
 * Create mock localStorage
 * @returns {Object} Mock localStorage implementation
 *
 * @example
 * global.localStorage = createMockLocalStorage();
 */
export function createMockLocalStorage() {
    let store = {};

    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        get length() {
            return Object.keys(store).length;
        },
        key: vi.fn((index) => {
            const keys = Object.keys(store);
            return keys[index] || null;
        }),
        // Helper to get internal store
        _getStore: () => store
    };
}

/**
 * Create mock console for capturing logs
 * @returns {Object} Mock console
 *
 * @example
 * const mockConsole = createMockConsole();
 * global.console = mockConsole;
 * // ... test code that logs ...
 * expect(mockConsole.log).toHaveBeenCalledWith('expected message');
 */
export function createMockConsole() {
    return {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn()
    };
}

/**
 * Create a mock Response object for fetch
 * @param {Object} data - Response data
 * @param {Object} options - Response options
 * @param {number} options.status - HTTP status
 * @param {boolean} options.ok - OK status
 * @param {string} options.contentType - Content type
 * @returns {Object} Mock Response
 *
 * @example
 * const response = createMockResponse({ message: 'Success' });
 * const errorResponse = createMockResponse({}, { status: 404, ok: false });
 */
export function createMockResponse(data = {}, options = {}) {
    const {
        status = 200,
        ok = true,
        contentType = 'application/json'
    } = options;

    const isJson = contentType.includes('json');
    const isXml = contentType.includes('xml');

    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Error',
        headers: new Map([['content-type', contentType]]),
        json: vi.fn(() => isJson ? Promise.resolve(data) : Promise.reject(new Error('Not JSON'))),
        text: vi.fn(() => isXml ? Promise.resolve(data) : Promise.resolve(JSON.stringify(data))),
        blob: vi.fn(() => Promise.resolve(new Blob([JSON.stringify(data)]))),
        arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0)))
    };
}

/**
 * Create a mock fetch function
 * @param {Object} responseMap - Map of URL patterns to responses
 * @returns {Function} Mock fetch function
 *
 * @example
 * const mockFetch = createMockFetch({
 *     'api.example.com': { data: [1, 2, 3] },
 *     'api.error.com': createMockResponse({}, { status: 500, ok: false })
 * });
 * global.fetch = mockFetch;
 */
export function createMockFetch(responseMap = {}) {
    return vi.fn((url) => {
        const urlStr = url.toString();

        // Check if URL matches any pattern in responseMap
        for (const [pattern, response] of Object.entries(responseMap)) {
            if (urlStr.includes(pattern)) {
                // If response is already a mock Response, return it
                if (response.json && response.text) {
                    return Promise.resolve(response);
                }
                // Otherwise, wrap in mock Response
                return Promise.resolve(createMockResponse(response));
            }
        }

        // Default: reject with error
        return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });
}

/**
 * Create spy on console method
 * @param {string} method - Console method name (log, warn, error, etc.)
 * @returns {Object} Spy object
 *
 * @example
 * const spy = spyOnConsole('error');
 * // ... code that logs errors ...
 * expect(spy).toHaveBeenCalled();
 * spy.mockRestore();
 */
export function spyOnConsole(method = 'log') {
    return vi.spyOn(console, method).mockImplementation(() => {});
}

/**
 * Restore all mocks
 * Convenience function for cleanup
 */
export function restoreAllMocks() {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
}

/**
 * Clear all mocks
 * Convenience function to reset mock call history
 */
export function clearAllMocks() {
    vi.clearAllMocks();
}

/**
 * Create a mock timer for testing time-dependent code
 * @returns {Object} Timer controls
 *
 * @example
 * const timer = useMockTimer();
 * // ... code with setTimeout ...
 * timer.advanceBy(1000);
 * timer.restore();
 */
export function useMockTimer() {
    vi.useFakeTimers();

    return {
        advanceBy: (ms) => vi.advanceTimersByTime(ms),
        advanceToNext: () => vi.advanceTimersToNextTimer(),
        runAll: () => vi.runAllTimers(),
        restore: () => vi.useRealTimers()
    };
}

/**
 * Create a deferred promise for testing async code
 * @returns {Object} Promise with resolve/reject
 *
 * @example
 * const deferred = createDeferred();
 * someAsyncFunction().then(deferred.resolve);
 * await deferred.promise;
 */
export function createDeferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}
