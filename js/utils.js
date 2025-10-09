// ============================================================================
// UTILS.JS - Pure utility functions
// ============================================================================
// URL validation, normalization, filtering, sorting, deduplication,
// relevance calculation, and formatting utilities

/**
 * Validate if string is a proper URL
 * @param {string} url - URL string to validate
 * @returns {boolean} True if valid URL
 */
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // Must start with http:// or https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return false;
    }

    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Helper function to check if a PDF URL is valid (not a DOI redirect)
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid PDF URL
 */
export function isValidPdfUrl(url) {
    if (!url) return false;

    // Must be a valid URL first
    if (!isValidUrl(url)) return false;

    // Filter out DOI URLs - they redirect to publisher pages, not direct PDFs
    if (url.includes('doi.org/') || url.startsWith('https://doi.apa.org/')) {
        return false;
    }
    return true;
}

/**
 * Check if URL is known to be broken
 * @param {string} url - URL to check
 * @returns {boolean} True if URL is known broken
 */
export function isKnownBrokenUrl(url) {
    if (!url) return false;

    // Cambridge Core legacy URLs (known to be broken)
    if (url.includes('/aop-cambridge-core/content/view/')) {
        return true;
    }

    return false;
}

/**
 * Normalize DOI for comparison
 * @param {string} doi - DOI string
 * @returns {string|null} Normalized DOI or null
 */
export function normalizeDoi(doi) {
    if (!doi) return null;
    return doi.toLowerCase()
        .replace('https://doi.org/', '')
        .replace('http://doi.org/', '')
        .replace('doi:', '')
        .trim();
}

/**
 * Get full DOI URL from DOI string
 * Converts any DOI format to full https://doi.org/ URL
 * @param {string} doi - DOI string (may be partial or full URL)
 * @returns {string|null} Full DOI URL or null
 */
export function getFullDoiUrl(doi) {
    if (!doi) return null;

    // If already a canonical doi.org URL, ensure https
    if (doi.startsWith('https://doi.org/') || doi.startsWith('http://doi.org/')) {
        return doi.replace('http://', 'https://');
    }

    // Check if it's a DOI URL with alternative resolver (dx.doi.org, hdl.handle.net, etc.)
    // Extract just the DOI identifier and rebuild with canonical doi.org
    const doiUrlPatterns = [
        /^https?:\/\/dx\.doi\.org\/(.+)$/i,
        /^https?:\/\/doi\.org\/(.+)$/i,
        /^https?:\/\/hdl\.handle\.net\/(.+)$/i
    ];

    for (const pattern of doiUrlPatterns) {
        const match = doi.match(pattern);
        if (match) {
            // Extract DOI identifier (everything after the domain)
            return `https://doi.org/${match[1]}`;
        }
    }

    // Remove 'doi:' prefix if present
    const cleanDoi = doi.replace(/^doi:\s*/i, '').trim();

    // Build full URL
    return `https://doi.org/${cleanDoi}`;
}

/**
 * Normalize title for fuzzy matching
 * @param {string} title - Paper title
 * @returns {string} Normalized title
 */
export function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate unique key for paper (DOI preferred, else title)
 * @param {Object} paper - Paper object
 * @returns {string} Unique key for deduplication
 */
export function getPaperKey(paper) {
    const doi = normalizeDoi(paper.doi);
    if (doi) return `doi:${doi}`;

    const title = normalizeTitle(paper.title);
    if (title) return `title:${title}`;

    // Fallback to source + URL if available
    if (paper.url) return `url:${paper.url}`;

    return `id:${Math.random()}`; // last resort
}

/**
 * Sanitize filename for download
 * @param {string} title - Paper title
 * @returns {string} Safe filename
 */
export function sanitizeFilename(title) {
    if (!title) return 'paper';
    return title
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_')
        .substring(0, 100)
        .toLowerCase();
}

/**
 * Strip HTML tags from text
 * @param {string} text - Text with HTML
 * @returns {string} Plain text
 */
export function stripHtmlTags(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '');
}

/**
 * Truncate text to max length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text with ellipsis
 */
export function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.substring(0, maxLength) + '...';
}

/**
 * Format author names
 * @param {Array|string} authors - Author names
 * @returns {string} Formatted author string
 */
export function formatAuthors(authors) {
    if (!authors) return 'Unknown';
    if (Array.isArray(authors)) {
        return authors.join(', ');
    }
    return authors;
}

/**
 * Format journal name
 * @param {string} journal - Journal name
 * @returns {string} Formatted journal
 */
export function formatJournal(journal) {
    if (!journal || typeof journal !== 'string') return '';

    // Remove redundant prefixes
    const cleaned = journal
        .replace(/^Journal of /i, 'J. ')
        .replace(/^Proceedings of /i, 'Proc. ')
        .replace(/^Transactions on /i, 'Trans. ');

    return cleaned;
}

/**
 * Calculate citation impact using logarithmic scaling
 * @param {number} citations - Citation count
 * @returns {number} Citation impact score (0-1 scale)
 */
export function calculateCitationImpact(citations) {
    if (!citations || citations <= 0) return 0;

    // Logarithmic scaling: log10(citations + 1) / log10(10000)
    // 1 citation = 0.0, 100 citations = 0.5, 1000 = 0.75, 10000 = 1.0
    return Math.log10(citations + 1) / Math.log10(10000);
}

/**
 * Calculate title match boost based on query terms
 * @param {string} title - Paper title
 * @param {string} query - Search query
 * @returns {number} Title match score (0-1 scale)
 */
export function calculateTitleMatchBoost(title, query) {
    if (!title || !query) return 0;

    // Normalize both to lowercase and remove punctuation
    const normalizedTitle = title.toLowerCase().replace(/[^\w\s]/g, ' ');
    const normalizedQuery = query.toLowerCase().replace(/[^\w\s]/g, ' ');

    // Split query into terms
    const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 2);
    if (queryTerms.length === 0) return 0;

    // Count how many query terms appear in title
    const matchingTerms = queryTerms.filter(term =>
        normalizedTitle.includes(term)
    ).length;

    // Return ratio of matching terms
    return matchingTerms / queryTerms.length;
}

/**
 * Calculate recency factor with exponential decay
 * @param {number} year - Publication year
 * @returns {number} Recency score (0-1 scale)
 */
export function calculateRecencyFactor(year) {
    if (!year) return 0.5; // Default for unknown year

    const currentYear = new Date().getFullYear();
    const yearsOld = currentYear - year;

    if (yearsOld < 0) return 1.0; // Future papers (edge case)

    // Exponential decay with 5-year half-life
    return Math.exp(-0.1386 * yearsOld);
}

/**
 * Calculate quality signals (multi-source + open access)
 * @param {Object} paper - Paper with metadata
 * @returns {number} Quality score (0-1 scale)
 */
export function calculateQualitySignals(paper) {
    let qualityScore = 0;

    // Multi-source bonus
    const mergedCount = paper._merged_count || 1;
    const multiSourceBonus = Math.min(0.1 * mergedCount, 0.5);
    qualityScore += multiSourceBonus;

    // Open access bonus
    if (paper.is_open_access) {
        qualityScore += 0.5;
    }

    return Math.min(1.0, qualityScore);
}

/**
 * Calculate optimal relevance score using multi-signal weighted combination
 * @param {Object} paper - Paper with metadata
 * @param {string} currentQuery - Current search query
 * @returns {number} Optimal relevance score (0-1 scale)
 */
export function calculateOptimalRelevance(paper, currentQuery) {
    // Get base text relevance from backend
    const baseScore = paper.relevance_score !== undefined ? paper.relevance_score : 0.5;

    // Find highest citation count among all sources
    let maxCitations = 0;
    if (paper._source_links && paper._source_links.length > 0) {
        maxCitations = Math.max(...paper._source_links.map(link => parseInt(link.citation_count) || 0));
    } else {
        maxCitations = parseInt(paper.citation_count) || 0;
    }

    // Calculate individual signal scores
    const citationImpact = calculateCitationImpact(maxCitations);
    const titleMatch = calculateTitleMatchBoost(paper.title, currentQuery);
    const recency = calculateRecencyFactor(paper.year);
    const quality = calculateQualitySignals(paper);

    // Weighted combination
    const finalScore = (
        baseScore * 0.40 +
        citationImpact * 0.35 +
        titleMatch * 0.15 +
        recency * 0.05 +
        quality * 0.05
    );

    return Math.min(1.0, Math.max(0.0, finalScore));
}

/**
 * Merge two paper objects (combine resources from multiple sources)
 * @param {Object} existing - Existing paper object
 * @param {Object} newPaper - New paper to merge
 * @returns {Object} Merged paper object
 */
export function mergePapers(existing, newPaper) {
    const merged = { ...existing };

    // Merge sources
    const existingSources = existing._merged_sources || [existing.source];
    const newSources = newPaper._merged_sources || [newPaper.source];
    merged._merged_sources = [...new Set([...existingSources, ...newSources])];
    merged._merged_count = merged._merged_sources.length;

    // Track source-attributed links
    const sourceLinks = existing._source_links || [];

    // Add existing paper's links if not already tracked
    if (!existing._source_links) {
        const existingPdf = existing.pdf_url || existing.open_access_pdf;
        sourceLinks.push({
            source: existing.source,
            pdf_url: existingPdf && isValidPdfUrl(existingPdf) ? existingPdf : null,
            url: existing.url || null,
            has_pdf: isValidPdfUrl(existingPdf),
            is_open_access: existing.is_open_access || false,
            citation_count: parseInt(existing.citation_count) || 0
        });
    }

    // Add new paper's links
    const newPdf = newPaper.pdf_url || newPaper.open_access_pdf;
    sourceLinks.push({
        source: newPaper.source,
        pdf_url: newPdf && isValidPdfUrl(newPdf) ? newPdf : null,
        url: newPaper.url || null,
        has_pdf: isValidPdfUrl(newPdf),
        is_open_access: newPaper.is_open_access || false,
        citation_count: parseInt(newPaper.citation_count) || 0
    });

    merged._source_links = sourceLinks;

    // Keep backward compatibility arrays
    const allPdfUrls = [...new Set([
        existing.pdf_url,
        existing.open_access_pdf,
        newPaper.pdf_url,
        newPaper.open_access_pdf
    ].filter(Boolean))];

    const allUrls = [...new Set([existing.url, newPaper.url].filter(Boolean))];

    merged.pdf_url = allPdfUrls[0] || null;
    merged.open_access_pdf = allPdfUrls[1] || allPdfUrls[0] || null;
    merged.url = allUrls[0] || null;

    // Prefer non-null values for other fields
    merged.doi = existing.doi || newPaper.doi;
    merged.abstract = existing.abstract || newPaper.abstract;
    merged.journal = existing.journal || newPaper.journal;
    merged.year = existing.year || newPaper.year;

    // Merge authors (keep existing if available)
    if (!existing.authors && newPaper.authors) {
        merged.authors = newPaper.authors;
    }

    // Use highest citation count
    const existingCitations = parseInt(existing.citation_count) || 0;
    const newCitations = parseInt(newPaper.citation_count) || 0;
    merged.citation_count = Math.max(existingCitations, newCitations);

    // Open access if ANY source is open access
    merged.is_open_access = existing.is_open_access || newPaper.is_open_access;

    return merged;
}

/**
 * Deduplicate source links using two-step process
 * @param {Array} sourceLinks - Array of source link objects
 * @returns {Array} Deduplicated source links
 */
export function deduplicateSourceLinks(sourceLinks) {
    // STEP 1: Deduplicate by URL
    const urlMap = new Map();

    sourceLinks.forEach(link => {
        let url = null;

        if (link.has_pdf && link.pdf_url) {
            url = link.pdf_url;
        } else if (link.url) {
            url = link.url;
        }

        if (!url) return;

        if (!urlMap.has(url)) {
            urlMap.set(url, link);
        } else {
            const existing = urlMap.get(url);
            const existingCitations = parseInt(existing.citation_count) || 0;
            const currentCitations = parseInt(link.citation_count) || 0;

            if (currentCitations > existingCitations) {
                urlMap.set(url, link);
            }
        }
    });

    // STEP 2: Deduplicate by source
    const sourceMap = new Map();

    Array.from(urlMap.values()).forEach(link => {
        const source = link.source;
        if (!sourceMap.has(source)) {
            sourceMap.set(source, link);
        } else {
            const existing = sourceMap.get(source);
            const existingCitations = parseInt(existing.citation_count) || 0;
            const currentCitations = parseInt(link.citation_count) || 0;

            if (currentCitations > existingCitations) {
                sourceMap.set(source, link);
            }
        }
    });

    return Array.from(sourceMap.values());
}

/**
 * Apply filters to results
 * @param {Array} results - Paper results
 * @param {boolean} pdfOnlyFilter - Filter for PDF availability
 * @param {number} relevanceThreshold - Minimum relevance percentage
 * @param {boolean} searchComplete - Whether search is complete (only filter by relevance after scoring)
 * @returns {Array} Filtered results
 */
export function applyFilters(results, pdfOnlyFilter, relevanceThreshold, searchComplete = true) {
    let filtered = results;

    // Filter by PDF availability
    if (pdfOnlyFilter) {
        filtered = filtered.filter(paper => {
            // Check _source_links for actual PDF entries
            if (paper._source_links && paper._source_links.length > 0) {
                return paper._source_links.some(link =>
                    link.has_pdf && isValidPdfUrl(link.pdf_url)
                );
            }
            // Fallback to legacy fields
            return isValidPdfUrl(paper.pdf_url) || isValidPdfUrl(paper.open_access_pdf);
        });
    }

    // Filter by relevance threshold - ONLY if search is complete
    // This prevents count fluctuation during streaming (papers without scores would pass, then fail after scoring)
    if (searchComplete) {
        filtered = filtered.filter(paper => {
            if (paper.relevance_score === undefined || paper.relevance_score === null) {
                return true;
            }
            const percentage = Math.round(paper.relevance_score * 100);
            return percentage >= relevanceThreshold;
        });
    }

    return filtered;
}

/**
 * Sort results by relevance score (descending), then by title (ascending)
 * @param {Array} results - Paper results
 * @returns {Array} Sorted results
 */
export function sortByRelevance(results) {
    return results.sort((a, b) => {
        const scoreA = a.relevance_score !== undefined ? a.relevance_score : 0;
        const scoreB = b.relevance_score !== undefined ? b.relevance_score : 0;

        // Primary sort: relevance score descending
        // Use tolerance of 0.1 to handle floating point precision issues
        const scoreDiff = scoreB - scoreA;
        if (Math.abs(scoreDiff) > 0.1) {
            return scoreDiff;
        }

        // Secondary sort: title ascending (for papers with similar scores)
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        return titleA.localeCompare(titleB);
    });
}
