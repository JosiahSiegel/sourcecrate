// ============================================================================
// BASE.JS - Base API client for academic databases
// ============================================================================

/**
 * Base class for browser-side academic API clients
 * Provides common functionality for direct CORS-enabled API calls
 */
export class BaseAPIClient {
    constructor(name) {
        this.name = name;
        this.timeout = 15000; // 15 second timeout (increased for reliability)
    }

    /**
     * Make HTTP request with timeout and priority
     * @param {string} url - URL to fetch
     * @param {Object} options - Fetch options
     * @param {string} priority - Request priority: 'high', 'low', 'auto' (default)
     * @returns {Promise<Response>} Response object
     */
    async fetchWithTimeout(url, options = {}, priority = 'auto') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                mode: 'cors',
                priority // Priority Hints API for faster critical requests
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`${this.name} request timeout after ${this.timeout}ms`);
            }
            throw error;
        }
    }

    /**
     * Normalize paper object to standard format
     * @param {Object} rawPaper - Raw paper from API
     * @returns {Object} Normalized paper
     */
    normalizePaper(rawPaper) {
        // Override in subclasses
        return rawPaper;
    }

    /**
     * Search papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of normalized papers
     */
    async search(query, limit = 10) {
        throw new Error('search() must be implemented by subclass');
    }

    /**
     * Get display name for source
     * @returns {string} Display name
     */
    getDisplayName() {
        return this.name;
    }
}

export default BaseAPIClient;
