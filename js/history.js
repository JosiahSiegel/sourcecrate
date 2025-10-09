// ============================================================================
// HISTORY.JS - Search history tracking (client-side localStorage)
// ============================================================================

const STORAGE_KEY = 'sourcecrate_search_history';
const MAX_HISTORY = 50; // Keep last 50 searches

/**
 * Get search history from localStorage
 * @returns {Array} Array of search history objects
 */
export function getSearchHistory() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('Failed to load search history:', e);
        return [];
    }
}

/**
 * Save search history to localStorage
 * @param {Array} history - History array
 */
function saveSearchHistory(history) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save search history:', e);
    }
}

/**
 * Add search to history
 * @param {string} query - Search query
 * @param {number} resultCount - Number of results
 * @param {Object} filters - Applied filters (pdfOnly, relevanceThreshold)
 */
export function addToHistory(query, resultCount = 0, filters = {}) {
    if (!query || !query.trim()) {
        return;
    }

    const history = getSearchHistory();

    // Check if this exact query already exists
    const existingIndex = history.findIndex(item =>
        item.query.toLowerCase().trim() === query.toLowerCase().trim()
    );

    const historyItem = {
        query: query.trim(),
        timestamp: Date.now(),
        resultCount,
        filters: {
            pdfOnly: filters.pdfOnly || false,
            relevanceThreshold: filters.relevanceThreshold || 35
        }
    };

    if (existingIndex >= 0) {
        // Update existing entry and move to front
        history.splice(existingIndex, 1);
    }

    // Add to front of array
    history.unshift(historyItem);

    // Limit history size
    if (history.length > MAX_HISTORY) {
        history.splice(MAX_HISTORY);
    }

    saveSearchHistory(history);
}

/**
 * Remove specific search from history
 * @param {number} index - Index of history item to remove
 * @returns {boolean} Success status
 */
export function removeFromHistory(index) {
    const history = getSearchHistory();

    if (index >= 0 && index < history.length) {
        history.splice(index, 1);
        saveSearchHistory(history);
        return true;
    }

    return false;
}

/**
 * Clear all search history
 * @returns {boolean} Success status
 */
export function clearHistory() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (e) {
        console.error('Failed to clear history:', e);
        return false;
    }
}

/**
 * Get recent unique searches (deduplicated)
 * @param {number} limit - Maximum number of results
 * @returns {Array} Array of unique search queries
 */
export function getRecentSearches(limit = 10) {
    const history = getSearchHistory();
    return history.slice(0, limit);
}

/**
 * Search history by query text
 * @param {string} searchText - Text to search for
 * @returns {Array} Matching history items
 */
export function searchHistory(searchText) {
    if (!searchText || !searchText.trim()) {
        return getSearchHistory();
    }

    const history = getSearchHistory();
    const lowerSearch = searchText.toLowerCase().trim();

    return history.filter(item =>
        item.query.toLowerCase().includes(lowerSearch)
    );
}

/**
 * Get search statistics
 * @returns {Object} Statistics object
 */
export function getHistoryStats() {
    const history = getSearchHistory();

    if (history.length === 0) {
        return {
            totalSearches: 0,
            uniqueQueries: 0,
            avgResultCount: 0,
            mostRecent: null,
            oldest: null
        };
    }

    // Get unique queries
    const uniqueQueries = new Set(history.map(item => item.query.toLowerCase()));

    // Calculate average result count
    const totalResults = history.reduce((sum, item) => sum + (item.resultCount || 0), 0);
    const avgResultCount = Math.round(totalResults / history.length);

    // Get timestamp range
    const timestamps = history.map(item => item.timestamp).filter(Boolean);
    const mostRecent = timestamps.length > 0 ? Math.max(...timestamps) : null;
    const oldest = timestamps.length > 0 ? Math.min(...timestamps) : null;

    return {
        totalSearches: history.length,
        uniqueQueries: uniqueQueries.size,
        avgResultCount,
        mostRecent,
        oldest
    };
}

/**
 * Get popular search terms (most frequently searched)
 * @param {number} limit - Number of results
 * @returns {Array} Array of {query, count} objects
 */
export function getPopularSearches(limit = 5) {
    const history = getSearchHistory();
    const queryCounts = {};

    // Count occurrences of each query (case-insensitive)
    history.forEach(item => {
        const normalizedQuery = item.query.toLowerCase().trim();
        queryCounts[normalizedQuery] = (queryCounts[normalizedQuery] || 0) + 1;
    });

    // Convert to array and sort by count
    const sorted = Object.entries(queryCounts)
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count);

    return sorted.slice(0, limit);
}

/**
 * Export search history (for backup)
 * @returns {Object} History data
 */
export function exportHistory() {
    return {
        history: getSearchHistory(),
        exportedAt: Date.now(),
        version: 1
    };
}

/**
 * Import search history (from backup)
 * @param {Object} data - Exported history data
 * @returns {boolean} Success status
 */
export function importHistory(data) {
    try {
        if (data.history && Array.isArray(data.history)) {
            saveSearchHistory(data.history);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Failed to import history:', e);
        return false;
    }
}
