// ============================================================================
// STATE HELPERS - State management utilities for tests
// ============================================================================
// Provides functions to reset, initialize, and verify application state
// without duplicating state management code across tests.

import {
    papersByKey,
    renderedPaperKeys,
    setPapersByKey,
    setRenderedPaperKeys,
    setSourcesCompleted,
    setTotalSources,
    setPdfOnlyFilter,
    setRelevanceThreshold,
    setCurrentQuery,
    setBm25ScoringComplete,
    setPreviousSortOrder,
    setPreviousFilterQuery
} from '../../js/state.js';
import { clearSearchCache } from '../../js/api.js';

/**
 * Reset all search-related state to initial values
 * Call this in beforeEach to ensure clean state between tests
 *
 * @example
 * beforeEach(() => {
 *     resetSearchState();
 * });
 */
export function resetSearchState() {
    // Clear maps and sets
    papersByKey.clear();
    renderedPaperKeys.clear();

    // Reset counters
    setSourcesCompleted(0);
    setTotalSources(0);

    // Reset flags
    setBm25ScoringComplete(false);

    // Reset filters
    setPdfOnlyFilter(false);
    setRelevanceThreshold(35);
    setCurrentQuery('');

    // Reset sort/filter tracking
    setPreviousSortOrder('relevance-desc');
    setPreviousFilterQuery('');

    // Clear search cache and debounce state (allows cache tests to work)
    clearSearchCache();
}

/**
 * Create mock search state for testing
 * @param {Object} options - State options
 * @param {Array} options.papers - Papers to add to papersByKey
 * @param {number} options.sourcesCompleted - Number of completed sources
 * @param {number} options.totalSources - Total number of sources
 * @param {boolean} options.bm25Complete - Whether BM25 scoring is complete
 * @param {string} options.currentQuery - Current search query
 * @returns {Object} Created state
 *
 * @example
 * const state = createMockSearchState({
 *     papers: [paper1, paper2],
 *     sourcesCompleted: 5,
 *     totalSources: 9
 * });
 */
export function createMockSearchState(options = {}) {
    const {
        papers = [],
        sourcesCompleted = 0,
        totalSources = 0,
        bm25Complete = false,
        currentQuery = 'test query',
        pdfOnly = false,
        relevanceThreshold = 35
    } = options;

    // Reset first
    resetSearchState();

    // Add papers to state
    papers.forEach(paper => {
        const key = paper.doi || paper.title;
        papersByKey.set(key, paper);
    });

    // Set counters
    setSourcesCompleted(sourcesCompleted);
    setTotalSources(totalSources);

    // Set flags
    setBm25ScoringComplete(bm25Complete);
    setCurrentQuery(currentQuery);
    setPdfOnlyFilter(pdfOnly);
    setRelevanceThreshold(relevanceThreshold);

    return {
        papersByKey,
        renderedPaperKeys,
        sourcesCompleted,
        totalSources,
        bm25Complete,
        currentQuery,
        pdfOnly,
        relevanceThreshold
    };
}

/**
 * Assert that search state has been properly reset
 * Throws if state is not clean
 *
 * @example
 * afterEach(() => {
 *     assertStateClean();
 * });
 */
export function assertStateClean() {
    if (papersByKey.size !== 0) {
        throw new Error(`papersByKey should be empty, but has ${papersByKey.size} entries`);
    }

    if (renderedPaperKeys.size !== 0) {
        throw new Error(`renderedPaperKeys should be empty, but has ${renderedPaperKeys.size} entries`);
    }

    // Note: We don't check numeric values as they may be set during search
}

/**
 * Get current state snapshot for assertions
 * @returns {Object} Current state values
 *
 * @example
 * const stateBefore = getStateSnapshot();
 * // ... perform operation ...
 * const stateAfter = getStateSnapshot();
 * expect(stateAfter.papersByKey.size).toBeGreaterThan(stateBefore.papersByKey.size);
 */
export function getStateSnapshot() {
    return {
        papersCount: papersByKey.size,
        renderedCount: renderedPaperKeys.size,
        papers: Array.from(papersByKey.values()),
        renderedKeys: Array.from(renderedPaperKeys)
    };
}

/**
 * Add papers to papersByKey state
 * @param {Array} papers - Papers to add
 *
 * @example
 * addPapersToState([paper1, paper2, paper3]);
 */
export function addPapersToState(papers) {
    papers.forEach(paper => {
        const key = paper.doi || paper.title || paper.url;
        papersByKey.set(key, paper);
    });
}

/**
 * Mark papers as rendered
 * @param {Array} papers - Papers to mark as rendered
 *
 * @example
 * markPapersAsRendered([paper1, paper2]);
 */
export function markPapersAsRendered(papers) {
    papers.forEach(paper => {
        const key = paper.doi || paper.title || paper.url;
        renderedPaperKeys.add(key);
    });
}

/**
 * Simulate search in progress
 * @param {Object} options - Progress options
 * @param {number} options.completed - Completed sources
 * @param {number} options.total - Total sources
 * @param {boolean} options.bm25Complete - BM25 complete
 *
 * @example
 * simulateSearchProgress({ completed: 5, total: 9 });
 */
export function simulateSearchProgress(options = {}) {
    const {
        completed = 0,
        total = 9,
        bm25Complete = false
    } = options;

    setSourcesCompleted(completed);
    setTotalSources(total);
    setBm25ScoringComplete(bm25Complete);
}

/**
 * Simulate search completion
 * @param {Array} papers - Papers to add to state
 *
 * @example
 * simulateSearchComplete([paper1, paper2, paper3]);
 */
export function simulateSearchComplete(papers = []) {
    addPapersToState(papers);
    setSourcesCompleted(9);
    setTotalSources(9);
    setBm25ScoringComplete(true);
}

/**
 * Check if search is complete
 * @returns {boolean} True if all sources are complete
 */
export function isSearchComplete() {
    return papersByKey.size > 0 &&
           renderedPaperKeys.size > 0;
}

/**
 * Get papers from state
 * @returns {Array} Array of papers
 */
export function getPapersFromState() {
    return Array.from(papersByKey.values());
}

/**
 * Get rendered paper keys
 * @returns {Array} Array of rendered keys
 */
export function getRenderedKeys() {
    return Array.from(renderedPaperKeys);
}
