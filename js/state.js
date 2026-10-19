import { DEFAULT_MIN_RELEVANCE } from './search-core.js';
// ============================================================================
// STATE.JS - Global state management and localStorage utilities
// ============================================================================

// ============================================================================
// Download Reliability Tracking (Client-Side localStorage)
// ============================================================================

/**
 * Client-side download reliability tracker using localStorage.
 * Learns which domains work/fail for THIS specific browser/network.
 * Scales to infinite users - zero server load.
 */
export const DownloadReliability = {
    PREFIX: 'sourcecrate_reliability_',
    TTL: 24 * 60 * 60 * 1000, // 24 hours
    MAX_ENTRIES: 1000, // Prevent localStorage bloat

    getDomain(url) {
        try {
            return new URL(url).hostname.toLowerCase();
        } catch {
            return null;
        }
    },

    getStats(url) {
        const domain = this.getDomain(url);
        if (!domain) return null;

        const key = this.PREFIX + domain;
        const stored = localStorage.getItem(key);
        if (!stored) return { attempts: 0, successes: 0, success_rate: 0.0 };

        try {
            const data = JSON.parse(stored);
            // Check TTL
            if (Date.now() - data.timestamp > this.TTL) {
                localStorage.removeItem(key);
                return { attempts: 0, successes: 0, success_rate: 0.0 };
            }
            return data.stats;
        } catch {
            return { attempts: 0, successes: 0, success_rate: 0.0 };
        }
    },

    recordAttempt(url, success) {
        const domain = this.getDomain(url);
        if (!domain) return;

        const key = this.PREFIX + domain;
        const stats = this.getStats(url);

        stats.attempts += 1;
        if (success) stats.successes += 1;
        stats.success_rate = stats.attempts > 0 ? stats.successes / stats.attempts : 0.0;

        try {
            localStorage.setItem(key, JSON.stringify({
                stats: stats,
                timestamp: Date.now()
            }));
            this.enforceLimit();
        } catch (e) {
            console.warn('Failed to save reliability stats:', e);
        }
    },

    enforceLimit() {
        // Prevent localStorage from growing unbounded
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.PREFIX)) {
                keys.push(key);
            }
        }

        if (keys.length > this.MAX_ENTRIES) {
            // Remove oldest entries
            const entries = keys.map(key => {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    return { key, timestamp: data.timestamp || 0 };
                } catch {
                    return { key, timestamp: 0 };
                }
            });
            entries.sort((a, b) => a.timestamp - b.timestamp);
            const toRemove = entries.slice(0, keys.length - this.MAX_ENTRIES);
            toRemove.forEach(entry => localStorage.removeItem(entry.key));
        }
    },

    getReliability(url) {
        const stats = this.getStats(url);
        if (!stats) return 'downloadable';

        const { attempts, success_rate } = stats;

        if (success_rate < 0.2 && attempts >= 5) {
            return 'browser_required';
        } else if (success_rate < 0.5 && attempts >= 10) {
            return 'unreliable';
        } else {
            return 'downloadable';
        }
    }
};

// ============================================================================
// Global State Variables
// ============================================================================

// Removed streamingResults - redundant with papersByKey.values()
export let papersByKey = new Map(); // Deduplication map: key → merged paper (SOURCE OF TRUTH)
export let sourcesCompleted = 0;
export let totalSources = 0;
export let sourceNotices = [];
export let pdfOnlyFilter = false;
// Visible, reversible default shared with MCP. Selecting All relevance uses zero.
export const DEFAULT_RELEVANCE_THRESHOLD = DEFAULT_MIN_RELEVANCE;
export let relevanceThreshold = DEFAULT_RELEVANCE_THRESHOLD;
export let currentQuery = ''; // Store current search query for title matching
export let renderedPaperKeys = new Set(); // Track which papers are already rendered
export let bm25ScoringComplete = false; // Track whether BM25 scoring has finished
export let previousSortOrder = 'relevance-desc'; // Track previous sort order to detect changes
export let previousFilterQuery = ''; // Track previous filter query to detect changes

// State setters (for modules to update state)

// setStreamingResults removed - use papersByKey directly

export function setPapersByKey(value) {
    papersByKey = value;
}

export function setSourcesCompleted(value) {
    sourcesCompleted = value;
}

export function setTotalSources(value) {
    totalSources = value;
}

export function setSourceNotices(value) {
    sourceNotices = value;
}

export function setPdfOnlyFilter(value) {
    pdfOnlyFilter = value;
}

export function setRelevanceThreshold(value) {
    relevanceThreshold = value;
}

export function setCurrentQuery(value) {
    currentQuery = value;
}

export function setBm25ScoringComplete(value) {
    bm25ScoringComplete = value;
}

export function setRenderedPaperKeys(value) {
    renderedPaperKeys = value;
}

export function setPreviousSortOrder(value) {
    previousSortOrder = value;
}

export function setPreviousFilterQuery(value) {
    previousFilterQuery = value;
}
