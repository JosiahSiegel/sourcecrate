// ============================================================================
// UTILS TESTS - Unit tests for pure utility functions
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createPapersWithCitations } from '../helpers/fixtures.js';
import {
    isValidUrl,
    isValidPdfUrl,
    isKnownBrokenUrl,
    normalizeDoi,
    getFullDoiUrl,
    normalizeTitle,
    getPaperKey,
    sanitizeFilename,
    stripHtmlTags,
    truncateText,
    formatAuthors,
    calculateCitationImpact,
    applyFilters,
    sortByRelevance,
    filterBookmarksByQuery,
    sortBookmarks,
    sortSearchResults
} from '../../js/utils.js';

describe('URL validation', () => {
    describe('isValidUrl', () => {
        it('should accept valid HTTP URLs', () => {
            expect(isValidUrl('http://example.com')).toBe(true);
            expect(isValidUrl('http://example.com/path')).toBe(true);
        });

        it('should accept valid HTTPS URLs', () => {
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('https://arxiv.org/pdf/1234.5678.pdf')).toBe(true);
        });

        it('should reject URLs without protocol', () => {
            expect(isValidUrl('example.com')).toBe(false);
            expect(isValidUrl('www.example.com')).toBe(false);
        });

        it('should reject non-string inputs', () => {
            expect(isValidUrl(null)).toBe(false);
            expect(isValidUrl(undefined)).toBe(false);
            expect(isValidUrl(123)).toBe(false);
            expect(isValidUrl({})).toBe(false);
        });

        it('should reject malformed URLs', () => {
            expect(isValidUrl('http://')).toBe(false);
            expect(isValidUrl('https://')).toBe(false);
        });
    });

    describe('isValidPdfUrl', () => {
        it('should accept valid PDF URLs', () => {
            expect(isValidPdfUrl('https://arxiv.org/pdf/1234.pdf')).toBe(true);
            expect(isValidPdfUrl('http://example.com/paper.pdf')).toBe(true);
        });

        it('should reject DOI URLs', () => {
            expect(isValidPdfUrl('https://doi.org/10.1234/test')).toBe(false);
            expect(isValidPdfUrl('https://doi.apa.org/10.1037/test')).toBe(false);
        });

        it('should reject invalid URLs', () => {
            expect(isValidPdfUrl('not-a-url')).toBe(false);
            expect(isValidPdfUrl(null)).toBe(false);
        });
    });

    describe('isKnownBrokenUrl', () => {
        it('should identify broken Cambridge Core URLs', () => {
            const brokenUrl = 'https://cambridge.org/aop-cambridge-core/content/view/123';
            expect(isKnownBrokenUrl(brokenUrl)).toBe(true);
        });

        it('should not flag valid URLs', () => {
            expect(isKnownBrokenUrl('https://arxiv.org/pdf/1234.pdf')).toBe(false);
            expect(isKnownBrokenUrl('https://example.com')).toBe(false);
        });
    });
});

describe('DOI normalization', () => {
    describe('normalizeDoi', () => {
        it('should normalize DOI URLs to bare DOIs', () => {
            expect(normalizeDoi('https://doi.org/10.1234/test')).toBe('10.1234/test');
            expect(normalizeDoi('http://doi.org/10.5678/paper')).toBe('10.5678/paper');
        });

        it('should remove doi: prefix', () => {
            expect(normalizeDoi('doi:10.1234/test')).toBe('10.1234/test');
        });

        it('should convert to lowercase', () => {
            expect(normalizeDoi('10.1234/TEST')).toBe('10.1234/test');
        });

        it('should trim whitespace', () => {
            expect(normalizeDoi('  10.1234/test  ')).toBe('10.1234/test');
        });

        it('should return null for empty input', () => {
            expect(normalizeDoi(null)).toBe(null);
            expect(normalizeDoi('')).toBe(null);
        });
    });

    describe('getFullDoiUrl', () => {
        it('should convert bare DOI to full URL', () => {
            expect(getFullDoiUrl('10.1234/test')).toBe('https://doi.org/10.1234/test');
        });

        it('should ensure HTTPS for HTTP URLs', () => {
            expect(getFullDoiUrl('http://doi.org/10.1234/test')).toBe('https://doi.org/10.1234/test');
        });

        it('should handle doi: prefix', () => {
            expect(getFullDoiUrl('doi:10.1234/test')).toBe('https://doi.org/10.1234/test');
        });

        it('should return null for empty input', () => {
            expect(getFullDoiUrl(null)).toBe(null);
            expect(getFullDoiUrl('')).toBe(null);
        });
    });
});

describe('Text processing', () => {
    describe('normalizeTitle', () => {
        it('should lowercase title', () => {
            expect(normalizeTitle('Machine Learning')).toBe('machine learning');
        });

        it('should remove punctuation', () => {
            expect(normalizeTitle('Title: A Study!')).toBe('title a study');
        });

        it('should collapse whitespace', () => {
            expect(normalizeTitle('Title   with    spaces')).toBe('title with spaces');
        });

        it('should trim edges', () => {
            expect(normalizeTitle('  Title  ')).toBe('title');
        });

        it('should handle empty input', () => {
            expect(normalizeTitle('')).toBe('');
            expect(normalizeTitle(null)).toBe('');
        });
    });

    describe('stripHtmlTags', () => {
        it('should remove HTML tags', () => {
            expect(stripHtmlTags('<p>Text</p>')).toBe('Text');
            expect(stripHtmlTags('<strong>Bold</strong> text')).toBe('Bold text');
        });

        it('should handle nested tags', () => {
            expect(stripHtmlTags('<div><p>Nested</p></div>')).toBe('Nested');
        });

        it('should handle empty input', () => {
            expect(stripHtmlTags('')).toBe('');
            expect(stripHtmlTags(null)).toBe('');
        });
    });

    describe('truncateText', () => {
        it('should truncate long text', () => {
            expect(truncateText('This is a long text', 10)).toBe('This is a ...');
        });

        it('should not truncate short text', () => {
            expect(truncateText('Short', 10)).toBe('Short');
        });

        it('should handle empty input', () => {
            expect(truncateText('', 10)).toBe('');
            expect(truncateText(null, 10)).toBe('');
        });
    });

    describe('sanitizeFilename', () => {
        it('should replace special characters with underscores', () => {
            expect(sanitizeFilename('File: Name!')).toContain('file_name');
        });

        it('should limit length to 100 characters', () => {
            const longTitle = 'a'.repeat(200);
            const result = sanitizeFilename(longTitle);
            expect(result.length).toBeLessThanOrEqual(100);
        });

        it('should handle empty input', () => {
            expect(sanitizeFilename('')).toBe('paper');
            expect(sanitizeFilename(null)).toBe('paper');
        });
    });
});

describe('Formatting', () => {
    describe('formatAuthors', () => {
        it('should join array of authors', () => {
            expect(formatAuthors(['John Smith', 'Jane Doe'])).toBe('John Smith, Jane Doe');
        });

        it('should return string directly', () => {
            expect(formatAuthors('Single Author')).toBe('Single Author');
        });

        it('should handle empty input', () => {
            expect(formatAuthors(null)).toBe('Unknown');
            expect(formatAuthors([])).toBe('');
        });
    });

    describe('calculateCitationImpact', () => {
        it('should return 0 for no citations', () => {
            expect(calculateCitationImpact(0)).toBe(0);
            expect(calculateCitationImpact(null)).toBe(0);
        });

        it('should return values between 0 and 1', () => {
            expect(calculateCitationImpact(10)).toBeGreaterThan(0);
            expect(calculateCitationImpact(10)).toBeLessThan(1);
        });

        it('should increase with more citations', () => {
            const impact10 = calculateCitationImpact(10);
            const impact100 = calculateCitationImpact(100);
            const impact1000 = calculateCitationImpact(1000);

            expect(impact100).toBeGreaterThan(impact10);
            expect(impact1000).toBeGreaterThan(impact100);
        });
    });
});

describe('Filtering and sorting', () => {
    const mockPapers = [
        {
            title: 'Paper A',
            relevance_score: 0.9,
            pdf_url: 'http://example.com/a.pdf',
            citation_count: 100,
            year: 2024
        },
        {
            title: 'Paper B',
            relevance_score: 0.3,
            pdf_url: null,
            citation_count: 50,
            year: 2023
        },
        {
            title: 'Paper C',
            relevance_score: 0.7,
            pdf_url: 'http://example.com/c.pdf',
            citation_count: 150,
            year: 2022
        }
    ];

    describe('applyFilters', () => {
        it('should filter by PDF availability', () => {
            const filtered = applyFilters(mockPapers, true, 0, true);
            expect(filtered.length).toBe(2);
            expect(filtered.every(p => p.pdf_url)).toBe(true);
        });

        it('should filter by relevance threshold', () => {
            const filtered = applyFilters(mockPapers, false, 50, true);
            expect(filtered.length).toBe(2);
            expect(filtered.every(p => (p.relevance_score * 100) >= 50)).toBe(true);
        });

        it('should apply both filters', () => {
            const filtered = applyFilters(mockPapers, true, 50, true);
            expect(filtered.length).toBe(2);
        });

        it('should not filter by relevance when search incomplete', () => {
            const filtered = applyFilters(mockPapers, false, 50, false);
            expect(filtered.length).toBe(3);
        });
    });

    describe('sortByRelevance', () => {
        it('should sort by relevance score descending', () => {
            const sorted = sortByRelevance([...mockPapers]);
            expect(sorted[0].relevance_score).toBe(0.9);
            expect(sorted[1].relevance_score).toBe(0.7);
            expect(sorted[2].relevance_score).toBe(0.3);
        });
    });

    describe('sortSearchResults', () => {
        it('should sort by relevance by default', () => {
            const sorted = sortSearchResults(mockPapers, 'relevance-desc');
            expect(sorted[0].relevance_score).toBe(0.9);
        });

        it('should sort by citations descending', () => {
            const sorted = sortSearchResults(mockPapers, 'citations-desc');
            expect(sorted[0].citation_count).toBe(150);
        });

        it('should sort by year descending', () => {
            const sorted = sortSearchResults(mockPapers, 'year-desc');
            expect(sorted[0].year).toBe(2024);
        });

        it('should not mutate original array', () => {
            const original = [...mockPapers];
            sortSearchResults(mockPapers, 'citations-desc');
            expect(mockPapers).toEqual(original);
        });
    });

    describe('filterBookmarksByQuery', () => {
        const bookmarks = [
            { title: 'Machine Learning', authors: ['John Smith'], abstract: 'AI research' },
            { title: 'Deep Learning', authors: ['Jane Doe'], abstract: 'Neural networks' },
            { title: 'Data Science', authors: ['Bob Wilson'], abstract: 'Analytics' }
        ];

        it('should filter by title', () => {
            const filtered = filterBookmarksByQuery(bookmarks, 'Machine');
            expect(filtered.length).toBe(1);
            expect(filtered[0].title).toBe('Machine Learning');
        });

        it('should filter by author', () => {
            const filtered = filterBookmarksByQuery(bookmarks, 'Jane');
            expect(filtered.length).toBe(1);
            expect(filtered[0].authors[0]).toBe('Jane Doe');
        });

        it('should be case-insensitive', () => {
            const filtered = filterBookmarksByQuery(bookmarks, 'MACHINE');
            expect(filtered.length).toBe(1);
        });

        it('should return all papers for empty query', () => {
            const filtered = filterBookmarksByQuery(bookmarks, '');
            expect(filtered.length).toBe(3);
        });
    });

    describe('sortBookmarks', () => {
        const bookmarks = [
            { title: 'Zebra', year: 2020, _bookmarked_at: 3000 },
            { title: 'Apple', year: 2022, _bookmarked_at: 1000 },
            { title: 'Mango', year: 2021, _bookmarked_at: 2000 }
        ];

        it('should sort by title ascending', () => {
            const sorted = sortBookmarks(bookmarks, 'title-asc');
            expect(sorted[0].title).toBe('Apple');
            expect(sorted[2].title).toBe('Zebra');
        });

        it('should sort by year descending', () => {
            const sorted = sortBookmarks(bookmarks, 'year-desc');
            expect(sorted[0].year).toBe(2022);
        });

        it('should sort by date descending', () => {
            const sorted = sortBookmarks(bookmarks, 'date-desc');
            expect(sorted[0]._bookmarked_at).toBe(3000);
        });

        it('should not mutate original array', () => {
            const original = [...bookmarks];
            sortBookmarks(bookmarks, 'title-asc');
            expect(bookmarks).toEqual(original);
        });
    });
});

describe('getPaperKey', () => {
    it('should prefer DOI for key generation', () => {
        const paper = { doi: '10.1234/test', title: 'Test Paper' };
        expect(getPaperKey(paper)).toBe('doi:10.1234/test');
    });

    it('should fall back to title if no DOI', () => {
        const paper = { title: 'Test Paper: A Study!' };
        expect(getPaperKey(paper)).toBe('title:test paper a study');
    });

    it('should fall back to URL if no DOI or title', () => {
        const paper = { url: 'https://example.com/paper' };
        expect(getPaperKey(paper)).toContain('url:');
    });
});
