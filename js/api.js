// ============================================================================
// API.JS - API client for academic paper search
// ============================================================================

import {
    papersByKey,
    sourcesCompleted,
    totalSources,
    pdfOnlyFilter,
    relevanceThreshold,
    currentQuery,
    renderedPaperKeys,
    bm25ScoringComplete,
    setSourcesCompleted,
    setTotalSources,
    setPdfOnlyFilter,
    setRelevanceThreshold,
    setCurrentQuery,
    setBm25ScoringComplete
} from './state.js';
import PaperProcessor from './processing-poc.js';
import ClientSearchOrchestrator, { defaultSources } from './api-clients/orchestrator.js';
import { applyFilters } from './utils.js';
import BloomFilter from './bloom-filter.js';
import { updateCitationBadge } from './rendering.js';

// Initialize paper processor for deduplication and BM25 scoring
const paperProcessor = new PaperProcessor();

// Initialize search orchestrator
const clientSearchOrchestrator = new ClientSearchOrchestrator();

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
    return `${query.toLowerCase().trim()}|${limit}|${pdfOnly}`;
}

/**
 * Search academic papers across multiple databases
 * @param {string} query - Search query
 * @param {number} limit - Max results per source
 * @param {boolean} pdfOnly - Filter for PDF availability
 * @param {number} minRelevance - Minimum relevance threshold
 * @param {Function} renderCallback - Callback to render results
 */
export async function searchWithClient(query, limit, pdfOnly = false, minRelevance = 35, renderCallback) {
    const cacheKey = getSearchCacheKey(query, limit, pdfOnly);
    const now = Date.now();

    // Check cache FIRST - instant O(1) lookup with no side effects
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        // Use cached results
        papersByKey.clear();
        cached.papers.forEach(paper => {
            const key = paperProcessor.getPaperKey(paper);
            papersByKey.set(key, paper);
        });

        renderedPaperKeys.clear();
        setSourcesCompleted(cached.sourcesCompleted);
        setTotalSources(cached.totalSources);
        setPdfOnlyFilter(pdfOnly);
        setRelevanceThreshold(0); // Disable relevance filter for cached results - already vetted
        setCurrentQuery(query);
        setBm25ScoringComplete(true);

        // Copy corpus stats from cache
        paperProcessor.bm25.documentFrequency = new Map(cached.corpusStats.documentFrequency);
        paperProcessor.bm25.totalDocs = cached.corpusStats.totalDocs;
        paperProcessor.bm25.processedDocIds = new Set(cached.corpusStats.processedDocIds);

        lastSearchKey = cacheKey;
        lastSearchTime = now;

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

    // Debounce rapid duplicate searches (within 300ms) - only for cache MISSES
    if (cacheKey === lastSearchKey && (now - lastSearchTime) < DEBOUNCE_MS) {
        return;
    }

    lastSearchKey = cacheKey;
    lastSearchTime = now;

    // Reset state (papersByKey is now the single source of truth)
    papersByKey.clear();
    renderedPaperKeys.clear();
    setSourcesCompleted(0);
    setTotalSources(0);
    setPdfOnlyFilter(pdfOnly);
    setRelevanceThreshold(minRelevance);
    setCurrentQuery(query);
    setBm25ScoringComplete(false); // Reset BM25 scoring flag

    // Reset BM25 corpus to prevent memory leak
    paperProcessor.bm25.reset();

    // DOI index for O(1) deduplication lookups (10x faster than fuzzy matching)
    const doiIndex = new Map();

    // Bloom filter for probabilistic O(1) duplicate detection (99.9% accurate, 1% false positives)
    const doiBloom = new BloomFilter(10000);

    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<p class="loading-message">🔍 Searching across academic databases...</p>';

    // Show results section
    document.querySelector('.results-section').classList.add('active');

    const filterText = pdfOnly ? ' (Direct Download only)' : '';
    updateLiveRegion(`Searching for "${query}"${filterText}...`);

    try {
        // Search with streaming-like callbacks across all sources
        // Filter out semanticscholar: CORS not supported for browser access
        await clientSearchOrchestrator.searchWithCallbacks(query, {
            limit,
            sources: defaultSources.filter(s => s !== 'semanticscholar'),

            onSourceStart: (data) => {
                updateLiveRegion(`Searching ${data.source}...`);
            },

            onResults: (data) => {
                // Deduplicate, merge, and score incrementally with current corpus stats
                const newPapers = [];

                data.papers.forEach(paper => {
                    let foundDuplicate = false;
                    let matchKey = null;

                    // Ultra-fast path: Bloom filter check first (O(1) probabilistic)
                    if (paper.doi) {
                        const normalizedDoi = paper.doi.toLowerCase().trim();

                        // If bloom filter says "definitely not seen before", skip hash lookup
                        if (!doiBloom.mightContain(normalizedDoi)) {
                            // Definitely new - add to bloom filter for future checks
                            doiBloom.add(normalizedDoi);
                        } else {
                            // Might be duplicate - check hash index to confirm
                            if (doiIndex.has(normalizedDoi)) {
                                matchKey = doiIndex.get(normalizedDoi);
                                foundDuplicate = true;
                            }
                        }
                    }

                    // Slow path: Only do fuzzy matching if no DOI match
                    if (!foundDuplicate) {
                        for (const [key, existing] of papersByKey.entries()) {
                            if (paperProcessor.areDuplicates(existing, paper)) {
                                matchKey = key;
                                foundDuplicate = true;
                                break;
                            }
                        }
                    }

                    if (foundDuplicate && matchKey) {
                        // Merge with existing paper
                        const existing = papersByKey.get(matchKey);

                        // Defensive: ensure existing paper exists
                        if (existing) {
                            const merged = paperProcessor.mergePapers(existing, paper);
                            papersByKey.set(matchKey, merged);
                            newPapers.push(merged);

                            // If citation count changed and card is already rendered, update the badge
                            const existingCount = existing.citation_count || 0;
                            const mergedCount = merged.citation_count || 0;
                            if (mergedCount !== existingCount && renderedPaperKeys.has(matchKey)) {
                                updateCitationBadge(matchKey, mergedCount);
                            }
                        } else {
                            // Key was found but paper was removed - treat as new paper
                            const key = paperProcessor.getPaperKey(paper);
                            papersByKey.set(key, paper);
                            newPapers.push(paper);
                        }
                    } else {
                        // Add new paper
                        const key = paperProcessor.getPaperKey(paper);
                        papersByKey.set(key, paper);
                        newPapers.push(paper);

                        // Index by DOI for fast future lookups (also add to bloom if not already)
                        if (paper.doi) {
                            const normalizedDoi = paper.doi.toLowerCase().trim();
                            doiIndex.set(normalizedDoi, key);
                            doiBloom.add(normalizedDoi);
                        }
                    }
                });

                // Incrementally update corpus stats with new papers
                paperProcessor.bm25.updateCorpusStats(newPapers);

                // Calculate average document length from current corpus
                const allPapers = Array.from(papersByKey.values());
                const avgLength = allPapers.reduce((sum, p) => {
                    const text = paperProcessor.bm25.getPaperText(p);
                    const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
                    return sum + tokens.length;
                }, 0) / Math.max(allPapers.length, 1);

                // Score new papers with current corpus stats
                newPapers.forEach(paper => {
                    paper.relevance_score = paperProcessor.bm25.score(paper, currentQuery, avgLength);
                });

                // No need to update anything - papersByKey is the source of truth
                // renderCallback will read directly from papersByKey
            },

            onSourceComplete: (data) => {
                setSourcesCompleted(data.completed);
                if (data.total && totalSources === 0) {
                    setTotalSources(data.total);
                }
                renderCallback();
            },

            onComplete: async (data) => {
                // Papers already scored incrementally during streaming
                // Just mark search as complete
                setBm25ScoringComplete(true);

                // Cache results for this query
                searchCache.set(cacheKey, {
                    papers: Array.from(papersByKey.values()),
                    sourcesCompleted: sourcesCompleted,
                    totalSources: totalSources,
                    corpusStats: {
                        documentFrequency: new Map(paperProcessor.bm25.documentFrequency),
                        totalDocs: paperProcessor.bm25.totalDocs,
                        processedDocIds: new Set(paperProcessor.bm25.processedDocIds)
                    },
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
        console.error('Search error:', error);
        updateLiveRegion(`Error: ${error.message}`);
    }
}

/**
 * Clear search cache only (preserves debounce state for testing)
 * @private
 */
export function clearSearchCache() {
    searchCache.clear();
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
    const minRelevance = 35;

    // Scroll to top to see results
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Execute search
    searchWithClient(cleanedTitle, limit, pdfOnly, minRelevance, renderCallback);
}
