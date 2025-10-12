// ============================================================================
// ASSERTION HELPERS - Custom assertion functions for tests
// ============================================================================
// Provides reusable assertion functions for common validation patterns
// to make tests more readable and maintainable.

import { expect } from 'vitest';

/**
 * Assert that a value is a valid relevance score (0-100)
 * @param {number} score - Score to validate
 * @param {string} message - Optional error message
 *
 * @example
 * expectValidRelevanceScore(paper.relevance_score);
 */
export function expectValidRelevanceScore(score, message = '') {
    const prefix = message ? `${message}: ` : '';

    expect(score, `${prefix}Score should be a number`).toBeTypeOf('number');
    expect(score, `${prefix}Score should be >= 0`).toBeGreaterThanOrEqual(0);
    expect(score, `${prefix}Score should be <= 100`).toBeLessThanOrEqual(100);
}

/**
 * Assert that a paper object has valid structure
 * @param {Object} paper - Paper to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireDoi - Require DOI field
 * @param {boolean} options.requirePdf - Require PDF URL
 * @param {boolean} options.requireAbstract - Require abstract
 *
 * @example
 * expectValidPaper(paper, { requireDoi: true });
 */
export function expectValidPaper(paper, options = {}) {
    const {
        requireDoi = false,
        requirePdf = false,
        requireAbstract = false
    } = options;

    // Required fields
    expect(paper, 'Paper should be an object').toBeTypeOf('object');
    expect(paper.title, 'Paper should have a title').toBeTruthy();
    expect(paper.authors, 'Paper should have authors array').toBeInstanceOf(Array);
    expect(paper.source, 'Paper should have a source').toBeTruthy();

    // Optional required fields
    if (requireDoi) {
        expect(paper.doi, 'Paper should have a DOI').toBeTruthy();
    }

    if (requirePdf) {
        expect(paper.pdf_url, 'Paper should have a PDF URL').toBeTruthy();
    }

    if (requireAbstract) {
        expect(paper.abstract, 'Paper should have an abstract').toBeTruthy();
    }

    // Type validation for common fields
    if (paper.year !== null && paper.year !== undefined) {
        expect(paper.year).toBeTypeOf('number');
    }

    if (paper.citation_count !== null && paper.citation_count !== undefined) {
        expect(paper.citation_count).toBeTypeOf('number');
        expect(paper.citation_count).toBeGreaterThanOrEqual(0);
    }

    if (paper.relevance_score !== null && paper.relevance_score !== undefined) {
        expectValidRelevanceScore(paper.relevance_score, 'Paper relevance score');
    }
}

/**
 * Assert that papers are sorted by a field
 * @param {Array} papers - Papers to validate
 * @param {string} field - Field to check (e.g., 'relevance_score')
 * @param {string} order - Sort order ('asc' or 'desc')
 *
 * @example
 * expectPapersSorted(papers, 'relevance_score', 'desc');
 * expectPapersSorted(papers, 'year', 'asc');
 */
export function expectPapersSorted(papers, field, order = 'desc') {
    if (papers.length < 2) {
        return; // Nothing to check
    }

    for (let i = 0; i < papers.length - 1; i++) {
        const current = papers[i][field];
        const next = papers[i + 1][field];

        if (current === null || current === undefined || next === null || next === undefined) {
            continue; // Skip null/undefined comparisons
        }

        if (order === 'desc') {
            expect(
                current,
                `Paper ${i} ${field} (${current}) should be >= paper ${i + 1} ${field} (${next})`
            ).toBeGreaterThanOrEqual(next);
        } else {
            expect(
                current,
                `Paper ${i} ${field} (${current}) should be <= paper ${i + 1} ${field} (${next})`
            ).toBeLessThanOrEqual(next);
        }
    }
}

/**
 * Assert that papers array contains no duplicates based on key
 * @param {Array} papers - Papers to validate
 * @param {string} keyField - Field to use for deduplication (default: 'doi')
 *
 * @example
 * expectNoDuplicates(papers);
 * expectNoDuplicates(papers, 'title');
 */
export function expectNoDuplicates(papers, keyField = 'doi') {
    const seen = new Set();
    const duplicates = [];

    papers.forEach((paper, index) => {
        const key = paper[keyField];
        if (!key) return; // Skip papers without key

        if (seen.has(key)) {
            duplicates.push({ index, key, paper });
        }
        seen.add(key);
    });

    expect(
        duplicates,
        `Found duplicate ${keyField} values: ${duplicates.map(d => d.key).join(', ')}`
    ).toHaveLength(0);
}

/**
 * Assert that all papers match a filter condition
 * @param {Array} papers - Papers to validate
 * @param {Function} predicate - Filter function
 * @param {string} message - Error message
 *
 * @example
 * expectAllPapersMatch(papers, p => p.pdf_url, 'All papers should have PDF');
 * expectAllPapersMatch(papers, p => p.year >= 2020, 'All papers from 2020+');
 */
export function expectAllPapersMatch(papers, predicate, message = 'All papers should match condition') {
    const failing = papers.filter((paper, index) => !predicate(paper, index));

    if (failing.length > 0) {
        const failingTitles = failing.map(p => p.title).join(', ');
        throw new Error(`${message}. Failing papers: ${failingTitles}`);
    }
}

/**
 * Assert that papers have consistent structure
 * @param {Array} papers - Papers to validate
 *
 * @example
 * expectConsistentPaperStructure([paper1, paper2, paper3]);
 */
export function expectConsistentPaperStructure(papers) {
    if (papers.length === 0) return;

    const firstKeys = new Set(Object.keys(papers[0]));

    papers.forEach((paper, index) => {
        const paperKeys = new Set(Object.keys(paper));

        // Check that all keys from first paper exist in this paper
        for (const key of firstKeys) {
            expect(
                paperKeys.has(key),
                `Paper ${index} missing key '${key}' that exists in paper 0`
            ).toBe(true);
        }
    });
}

/**
 * Assert that a paper key is valid format
 * @param {string} key - Paper key to validate
 *
 * @example
 * expectValidPaperKey('doi:10.1234/test');
 * expectValidPaperKey('title:machine learning overview');
 */
export function expectValidPaperKey(key) {
    expect(key).toBeTypeOf('string');
    expect(key.length).toBeGreaterThan(0);

    // Should have format 'type:value'
    expect(key).toMatch(/^(doi|title|url):/);
}

/**
 * Assert that URL is valid
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireHttps - Require HTTPS
 * @param {boolean} options.requirePdf - Require .pdf extension
 *
 * @example
 * expectValidUrl('https://example.com/paper.pdf', { requireHttps: true, requirePdf: true });
 */
export function expectValidUrl(url, options = {}) {
    const { requireHttps = false, requirePdf = false } = options;

    expect(url).toBeTypeOf('string');
    expect(url).toMatch(/^https?:\/\//);

    if (requireHttps) {
        expect(url).toMatch(/^https:\/\//);
    }

    if (requirePdf) {
        expect(url).toMatch(/\.pdf$/i);
    }
}

/**
 * Assert that BM25 scorer has valid state
 * @param {Object} scorer - BM25 scorer instance
 *
 * @example
 * expectValidBM25Scorer(bm25Scorer);
 */
export function expectValidBM25Scorer(scorer) {
    expect(scorer).toHaveProperty('k1');
    expect(scorer).toHaveProperty('b');
    expect(scorer).toHaveProperty('documentFrequency');
    expect(scorer).toHaveProperty('totalDocs');

    expect(scorer.k1).toBeTypeOf('number');
    expect(scorer.b).toBeTypeOf('number');
    expect(scorer.documentFrequency).toBeInstanceOf(Map);
    expect(scorer.totalDocs).toBeTypeOf('number');
    expect(scorer.totalDocs).toBeGreaterThanOrEqual(0);
}

/**
 * Assert that array length matches expected count
 * @param {Array} array - Array to check
 * @param {number} expected - Expected length
 * @param {string} itemName - Name of items for error message
 *
 * @example
 * expectArrayLength(papers, 5, 'papers');
 */
export function expectArrayLength(array, expected, itemName = 'items') {
    expect(
        array,
        `Expected ${expected} ${itemName}, got ${array.length}`
    ).toHaveLength(expected);
}

/**
 * Assert that value is in range
 * @param {number} value - Value to check
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {string} label - Label for error message
 *
 * @example
 * expectInRange(score, 0, 100, 'Score');
 */
export function expectInRange(value, min, max, label = 'Value') {
    expect(
        value,
        `${label} (${value}) should be >= ${min}`
    ).toBeGreaterThanOrEqual(min);
    expect(
        value,
        `${label} (${value}) should be <= ${max}`
    ).toBeLessThanOrEqual(max);
}

/**
 * Assert that two objects are deeply similar (ignoring extra fields)
 * @param {Object} actual - Actual object
 * @param {Object} expected - Expected object structure
 *
 * @example
 * expectObjectContains(paper, { title: 'Test', doi: '10.1234/test' });
 */
export function expectObjectContains(actual, expected) {
    for (const [key, value] of Object.entries(expected)) {
        expect(actual).toHaveProperty(key);
        expect(actual[key], `Field '${key}' does not match`).toEqual(value);
    }
}

/**
 * Assert that async function throws error
 * @param {Function} fn - Async function to test
 * @param {string|RegExp} errorMatch - Expected error message pattern
 *
 * @example
 * await expectAsyncThrows(() => fetchInvalidUrl(), 'Network error');
 */
export async function expectAsyncThrows(fn, errorMatch = null) {
    let threw = false;
    let error = null;

    try {
        await fn();
    } catch (e) {
        threw = true;
        error = e;
    }

    expect(threw, 'Expected function to throw error').toBe(true);

    if (errorMatch) {
        if (typeof errorMatch === 'string') {
            expect(error.message).toContain(errorMatch);
        } else if (errorMatch instanceof RegExp) {
            expect(error.message).toMatch(errorMatch);
        }
    }
}
