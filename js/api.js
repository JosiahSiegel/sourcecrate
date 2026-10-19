// ============================================================================
// API.JS - API client for academic paper search
// ============================================================================

import {
    DEFAULT_RELEVANCE_THRESHOLD,
    papersByKey,
    sourcesCompleted,
    totalSources,
    renderedPaperKeys,
    setSourcesCompleted,
    setTotalSources,
    setPdfOnlyFilter,
    setRelevanceThreshold,
    setCurrentQuery,
    setBm25ScoringComplete
} from './state.js';
import PaperProcessor from './processing-poc.js';
import ClientSearchOrchestrator, { defaultSources } from './api-clients/orchestrator.js';
import { normalizeDoi } from './utils.js';
import BloomFilter from './bloom-filter.js';

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
    const paperProcessor = new PaperProcessor();
    const clientSearchOrchestrator = new ClientSearchOrchestrator({ signal: session.controller.signal });

    // Check cache FIRST - instant O(1) lookup with no side effects
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        // Use cached results
        papersByKey.clear();
        structuredClone(cached.papers).forEach(paper => {
            const key = paperProcessor.getPaperKey(paper);
            papersByKey.set(key, paper);
        });

        renderedPaperKeys.clear();
        setSourcesCompleted(cached.sourcesCompleted);
        setTotalSources(cached.totalSources);
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
                if (!isActive()) return;
                updateLiveRegion(`Searching ${data.source}...`);
            },

            onResults: (data) => {
                if (!isActive()) return;
                // Deduplicate, merge, and score incrementally with current corpus stats
                const newPapers = [];

                data.papers.forEach(paper => {
                    let foundDuplicate = false;
                    let matchKey = null;

                    // Ultra-fast path: Bloom filter check first (O(1) probabilistic)
                    if (paper.doi) {
                        const normalizedDoi = normalizeDoi(paper.doi);

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
                            const mergedKey = paperProcessor.getPaperKey(merged);
                            papersByKey.delete(matchKey);
                            papersByKey.set(mergedKey, merged);
                            if (merged.doi) {
                                const doi = normalizeDoi(merged.doi);
                                doiIndex.set(doi, mergedKey);
                                doiBloom.add(doi);
                            }
                            newPapers.push(merged);

                        } else {
                            // Key was found but paper was removed - treat as new paper
                            const key = paperProcessor.getPaperKey(paper);
                            papersByKey.set(key, paper);
                            newPapers.push(paper);
                        }
                    } else {
                        // Add new paper
                        const key = paperProcessor.getPaperKey(paper);

                        // FIXED: Create _source_links for single-source papers too
                        // This ensures consistent rendering and filtering behavior
                        if (!paper._source_links) {
                            const pdfUrl = paper.pdf_url || paper.open_access_pdf;
                            paper._source_links = [{
                                source: paper.source,
                                pdf_url: pdfUrl || null,
                                url: paper.url || null,
                                // CRITICAL: has_pdf should ONLY be true if pdf_url is valid AND not null
                                has_pdf: !!(pdfUrl && paperProcessor.isValidPdfUrl(pdfUrl)),
                                is_open_access: paper.is_open_access || false,
                                citation_count: parseInt(paper.citation_count) || 0
                            }];
                        }

                        papersByKey.set(key, paper);
                        newPapers.push(paper);

                        // Index by DOI for fast future lookups (also add to bloom if not already)
                        if (paper.doi) {
                            const normalizedDoi = normalizeDoi(paper.doi);
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
                    paper.relevance_score = paperProcessor.bm25.score(paper, query, avgLength);
                });

                // No need to update anything - papersByKey is the source of truth
                // renderCallback will read directly from papersByKey
            },

            onSourceComplete: (data) => {
                if (!isActive()) return;
                setSourcesCompleted(data.completed);
                if (data.total && totalSources === 0) {
                    setTotalSources(data.total);
                }
                renderCallback();
            },

            onComplete: async (data) => {
                if (!isActive()) return;
                const papers = Array.from(papersByKey.values());
                paperProcessor.bm25.reset();
                paperProcessor.bm25.updateCorpusStats(papers);
                const avgLength = papers.reduce((sum, p) => sum + paperProcessor.bm25.getPaperText(p)
                    .toLowerCase().split(/\s+/).filter(t => t.length > 2).length, 0) / Math.max(papers.length, 1);
                papers.forEach(p => { p.relevance_score = paperProcessor.bm25.score(p, query, avgLength); });
                session.done = true;
                // Publish rankings computed from the complete corpus.
                setBm25ScoringComplete(true);

                // Cache results for this query
                searchCache.set(cacheKey, {
                    papers: structuredClone(papers),
                    sourcesCompleted: sourcesCompleted,
                    totalSources: totalSources,
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
