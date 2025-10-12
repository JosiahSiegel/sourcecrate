// ============================================================================
// TEST FIXTURES - Centralized test data access and factory functions
// ============================================================================
// Provides convenient access to mock data and factory functions for creating
// test papers with custom properties.

import mockPapersData from '../fixtures/mock-papers.json';

// Named exports for common test data
export const MOCK_PAPERS = mockPapersData.mockPapers;
export const DUPLICATE_PAPER = mockPapersData.duplicatePaper;
export const LOW_QUALITY_PAPER = mockPapersData.lowQualityPaper;
export const PDF_AVAILABLE_PAPERS = mockPapersData.pdfAvailablePapers;

// Default paper template
const DEFAULT_PAPER = {
    title: 'Test Paper',
    authors: ['Test Author'],
    abstract: 'Test abstract for paper.',
    doi: '10.1234/test.001',
    year: 2024,
    journal: 'Test Journal',
    url: 'https://example.com/test',
    pdf_url: 'https://example.com/test.pdf',
    source: 'Test Source',
    citation_count: 10,
    is_open_access: true,
    relevance_score: 0.5
};

/**
 * Create a test paper with custom properties
 * @param {Object} overrides - Properties to override in default paper
 * @returns {Object} Paper object
 *
 * @example
 * const paper = createPaper({ title: 'My Custom Paper', citation_count: 100 });
 */
export function createPaper(overrides = {}) {
    return {
        ...DEFAULT_PAPER,
        ...overrides
    };
}

/**
 * Create multiple test papers with optional customization
 * @param {number} count - Number of papers to create
 * @param {Object} baseOverrides - Base overrides applied to all papers
 * @param {Function} modifier - Function to modify each paper (receives index)
 * @returns {Array} Array of paper objects
 *
 * @example
 * // Create 5 papers with different titles
 * const papers = createPaperSet(5, {}, (paper, index) => ({
 *     ...paper,
 *     title: `Paper ${index + 1}`,
 *     doi: `10.1234/test.${index + 1}`
 * }));
 */
export function createPaperSet(count, baseOverrides = {}, modifier = null) {
    return Array.from({ length: count }, (_, index) => {
        const basePaper = createPaper({
            ...baseOverrides,
            title: `${baseOverrides.title || 'Test Paper'} ${index + 1}`,
            doi: `10.1234/test.${String(index + 1).padStart(3, '0')}`
        });

        return modifier ? modifier(basePaper, index) : basePaper;
    });
}

/**
 * Create a paper with high relevance score
 * @param {Object} overrides - Additional overrides
 * @returns {Object} Paper object
 */
export function createHighRelevancePaper(overrides = {}) {
    return createPaper({
        relevance_score: 0.95,
        citation_count: 150,
        is_open_access: true,
        year: new Date().getFullYear(),
        ...overrides
    });
}

/**
 * Create a paper with low relevance score
 * @param {Object} overrides - Additional overrides
 * @returns {Object} Paper object
 */
export function createLowRelevancePaper(overrides = {}) {
    return createPaper({
        relevance_score: 0.15,
        citation_count: 0,
        is_open_access: false,
        year: 2010,
        ...overrides
    });
}

/**
 * Create a paper without PDF
 * @param {Object} overrides - Additional overrides
 * @returns {Object} Paper object
 */
export function createPaperWithoutPdf(overrides = {}) {
    return createPaper({
        pdf_url: null,
        is_open_access: false,
        ...overrides
    });
}

/**
 * Create duplicate papers (same DOI, different sources)
 * @param {Object} baseOverrides - Base paper properties
 * @param {string[]} sources - Array of source names
 * @returns {Array} Array of duplicate papers
 *
 * @example
 * const duplicates = createDuplicates(
 *     { title: 'My Paper', doi: '10.1234/test' },
 *     ['arXiv', 'CrossRef', 'PubMed']
 * );
 */
export function createDuplicates(baseOverrides = {}, sources = ['arXiv', 'CrossRef']) {
    const baseDoi = baseOverrides.doi || '10.1234/duplicate.001';

    return sources.map((source, index) => createPaper({
        ...baseOverrides,
        doi: baseDoi,
        source,
        url: `https://${source.toLowerCase()}.com/paper-${index}`,
        citation_count: (baseOverrides.citation_count || 10) + index * 5
    }));
}

/**
 * Create papers with varied relevance scores for sorting tests
 * @param {number} count - Number of papers to create
 * @returns {Array} Array of papers with scores from 0.1 to 0.9
 */
export function createPapersWithVariedRelevance(count = 5) {
    return createPaperSet(count, {}, (paper, index) => ({
        ...paper,
        relevance_score: 0.1 + (index * 0.2),
        title: `Paper with relevance ${(0.1 + index * 0.2).toFixed(1)}`
    }));
}

/**
 * Create papers with specific citation counts for sorting tests
 * @param {number[]} citationCounts - Array of citation counts
 * @returns {Array} Array of papers
 *
 * @example
 * const papers = createPapersWithCitations([100, 50, 200, 10]);
 */
export function createPapersWithCitations(citationCounts) {
    return citationCounts.map((count, index) => createPaper({
        title: `Paper with ${count} citations`,
        citation_count: count,
        doi: `10.1234/citations.${String(index + 1).padStart(3, '0')}`
    }));
}
