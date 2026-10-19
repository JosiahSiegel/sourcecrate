// ============================================================================
// API.JS - API client for academic paper search
// ============================================================================

import {
    DEFAULT_RELEVANCE_THRESHOLD,
    papersByKey,
    sourcesCompleted,
    totalSources,
    sourceNotices,
    setSourceNotices,
    renderedPaperKeys,
    setSourcesCompleted,
    setTotalSources,
    setPdfOnlyFilter,
    setRelevanceThreshold,
    setCurrentQuery,
    setBm25ScoringComplete
} from './state.js';
import { searchPapers } from './search-core.js';
import { getPaperKey } from './utils.js';

// Only the active session may publish results or populate the query cache.
let activeSearch = null;

// Query result cache with 5-minute TTL
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let lastSearchKey = null;
let lastSearchTime = 0;
const DEBOUNCE_MS = 300; // Debounce rapid searches within 300ms

/**
 * Update live region for screen readers (accessibility)
 * @param {string} message - Status message
 */
function updateLiveRegion(message) {
    const liveRegion = document.getElementById('searchStatusLive');
    if (liveRegion) {
        liveRegion.textContent = message;
    }
}

/**
 * Generate cache key from search parameters
 */
function getSearchCacheKey(query, limit, pdfOnly) {
    return JSON.stringify([query.trim(), limit, pdfOnly]);
}

/**
 * Search academic papers across multiple databases
 * @param {string} query - Search query
 * @param {number} limit - Max results per source
 * @param {boolean} pdfOnly - Filter for PDF availability
 * @param {number} minRelevance - Minimum relevance threshold
 * @param {Function} renderCallback - Callback to render results
 */
export async function searchWithClient(query, limit, pdfOnly = false, minRelevance = DEFAULT_RELEVANCE_THRESHOLD, renderCallback = () => {}) {
    if (typeof renderCallback !== "function") renderCallback = () => {};
    const cacheKey = getSearchCacheKey(query, limit, pdfOnly);
    const now = Date.now();
    if (cacheKey === lastSearchKey && activeSearch && !activeSearch.done && activeSearch.minRelevance === minRelevance && now - lastSearchTime < DEBOUNCE_MS) return;
    activeSearch?.controller.abort();
    const session = { controller: new AbortController(), done: false, minRelevance };
    activeSearch = session;
    const isActive = () => activeSearch === session && !session.controller.signal.aborted;

    // Check cache FIRST - instant O(1) lookup with no side effects
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        // Use cached results
        papersByKey.clear();
        structuredClone(cached.papers).forEach(paper => {
            const key = getPaperKey(paper);
            papersByKey.set(key, paper);
        });

        renderedPaperKeys.clear();
        setSourcesCompleted(cached.sourcesCompleted);
        setTotalSources(cached.totalSources);
        setSourceNotices(cached.sourceNotices || []);
        setPdfOnlyFilter(pdfOnly);
        setRelevanceThreshold(minRelevance);
        setCurrentQuery(query);
        setBm25ScoringComplete(true);

        lastSearchKey = cacheKey;
        lastSearchTime = now;
        session.done = true;

        // Show cached results
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '';
        document.querySelector('.results-section').classList.add('active');
        updateLiveRegion(`Showing cached results for "${query}"`);
        renderCallback();

        const summaryDiv = document.getElementById('results-summary');
        if (summaryDiv) {
            summaryDiv.className = 'results-summary results-summary-complete';
        }

        return;
    }

    lastSearchKey = cacheKey;
    lastSearchTime = now;

    // Reset state (papersByKey is now the single source of truth)
    papersByKey.clear();
    renderedPaperKeys.clear();
    setSourcesCompleted(0);
    setTotalSources(0);
    setSourceNotices([]);
    setPdfOnlyFilter(pdfOnly);
    setRelevanceThreshold(minRelevance);
    setCurrentQuery(query);
    setBm25ScoringComplete(false); // Reset BM25 scoring flag

    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<p class="loading-message">🔍 Searching across academic databases...</p>';

    // Show results section
    document.querySelector('.results-section').classList.add('active');

    const filterText = pdfOnly ? ' (Direct Download only)' : '';
    updateLiveRegion(`Searching for "${query}"${filterText}...`);

    try {
        // Search with streaming-like callbacks across all sources
        // Filter out semanticscholar: CORS not supported for browser access
        await searchPapers(query, {
            limit,
            signal: session.controller.signal,

            onSourceStart: (data) => {
                if (!isActive()) return;
                updateLiveRegion(`Searching ${data.source}...`);
            },

            onResults: (data) => {
                if (!isActive()) return;
                papersByKey.clear();
                data.papers.forEach(paper => papersByKey.set(getPaperKey(paper), paper));
            },

            onSourceComplete: (data) => {
                if (!isActive()) return;
                if (data.error || data.warning) {
                    setSourceNotices([...sourceNotices, { source: data.source, message: data.error || data.warning }]);
                }
                setSourcesCompleted(data.completed);
                if (data.total && totalSources === 0) {
                    setTotalSources(data.total);
                }
                renderCallback();
            },

            onComplete: async (data) => {
                if (!isActive()) return;
                const papers = Array.from(papersByKey.values());
                session.done = true;
                // Publish rankings computed from the complete corpus.
                setBm25ScoringComplete(true);

                // Cache results for this query
                searchCache.set(cacheKey, {
                    papers: structuredClone(papers),
                    sourcesCompleted: sourcesCompleted,
                    totalSources: totalSources,
                    sourceNotices: structuredClone(sourceNotices),
                    timestamp: Date.now()
                });

                // Limit cache size to 10 queries
                if (searchCache.size > 10) {
                    const oldestKey = searchCache.keys().next().value;
                    searchCache.delete(oldestKey);
                }

                // Mark search as complete in UI
                const summaryDiv = document.getElementById('results-summary');
                if (summaryDiv) {
                    summaryDiv.className = 'results-summary results-summary-complete';
                }

                // Final render
                renderCallback();
            }
        });
    } catch (error) {
        if (!isActive()) return;
        session.done = true;
        console.error('Search error:', error);
        updateLiveRegion(`Error: ${error.message}`);
    }
}

/**
 * Clear cached results and cancel the active search session.
 * @private
 */
export function clearSearchCache() {
    searchCache.clear();
    activeSearch?.controller.abort();
    activeSearch = null;
    lastSearchKey = null;
    lastSearchTime = 0;
}

/**
 * Search by paper title with one click
 * @param {string} title - Paper title to search for
 * @param {Function} renderCallback - Callback to render results
 */
export function searchByTitle(title, renderCallback) {
    if (!title) return;

    // Remove special characters, keep only letters, numbers, and spaces
    const cleanedTitle = title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Update search input
    const searchInput = document.getElementById('searchQuery');
    searchInput.value = cleanedTitle;

    // Trigger search with current settings
    const limit = 25;
    const pdfOnly = document.getElementById('pdfOnly').checked;
    const minRelevance = DEFAULT_RELEVANCE_THRESHOLD;

    // Scroll to top to see results
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Execute search
    searchWithClient(cleanedTitle, limit, pdfOnly, minRelevance, renderCallback);
}
