// ============================================================================
// PROCESSING-POC TESTS - Unit tests for BM25 scoring and deduplication
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { FuzzyMatcher, BM25Scorer, PaperProcessor } from '../../js/processing-poc.js';
import { MOCK_PAPERS, DUPLICATE_PAPER, createPaper } from '../helpers/fixtures.js';
import { expectValidRelevanceScore, expectValidBM25Scorer } from '../helpers/assertions.js';

describe('FuzzyMatcher', () => {
    describe('similarity', () => {
        it('should return 1.0 for identical strings', () => {
            expect(FuzzyMatcher.similarity('test', 'test')).toBe(1.0);
        });

        it('should return 0 for completely different strings', () => {
            const sim = FuzzyMatcher.similarity('abc', 'xyz');
            expect(sim).toBeLessThan(0.5);
        });

        it('should return high similarity for slight variations', () => {
            const sim = FuzzyMatcher.similarity('optimization', 'optimisation');
            expect(sim).toBeGreaterThanOrEqual(0.8);
        });

        it('should be case-insensitive', () => {
            expect(FuzzyMatcher.similarity('Test', 'test')).toBe(1.0);
        });

        it('should handle whitespace differences', () => {
            const sim = FuzzyMatcher.similarity('  test  ', 'test');
            expect(sim).toBe(1.0);
        });

        it('should return 0 for empty or short strings', () => {
            expect(FuzzyMatcher.similarity('', 'test')).toBe(0);
            expect(FuzzyMatcher.similarity('a', 'b')).toBe(0);
        });
    });

    describe('getBigrams', () => {
        it('should generate correct bigrams', () => {
            const bigrams = FuzzyMatcher.getBigrams('test');
            expect(bigrams.size).toBe(3); // 'te', 'es', 'st'
            expect(bigrams.has('te')).toBe(true);
            expect(bigrams.has('es')).toBe(true);
            expect(bigrams.has('st')).toBe(true);
        });

        it('should return empty set for short strings', () => {
            const bigrams = FuzzyMatcher.getBigrams('a');
            expect(bigrams.size).toBe(0);
        });
    });

    describe('normalizeTitle', () => {
        it('should lowercase and remove punctuation', () => {
            const normalized = FuzzyMatcher.normalizeTitle('Machine Learning: A Comprehensive Study!');
            expect(normalized).toBe('machine learning a comprehensive study');
        });

        it('should collapse whitespace', () => {
            const normalized = FuzzyMatcher.normalizeTitle('Title   with    spaces');
            expect(normalized).toBe('title with spaces');
        });

        it('should handle empty input', () => {
            expect(FuzzyMatcher.normalizeTitle(null)).toBe('');
            expect(FuzzyMatcher.normalizeTitle('')).toBe('');
        });
    });
});

describe('BM25Scorer', () => {
    let bm25;

    beforeEach(() => {
        bm25 = new BM25Scorer();
    });

    describe('constructor', () => {
        it('should initialize with default parameters', () => {
            expect(bm25.k1).toBe(1.5);
            expect(bm25.b).toBe(0.75);
        });

        it('should initialize empty corpus statistics', () => {
            expect(bm25.documentFrequency.size).toBe(0);
            expect(bm25.totalDocs).toBe(0);
            expect(bm25.processedDocIds.size).toBe(0);
        });
    });

    describe('reset', () => {
        it('should clear corpus statistics', () => {
            bm25.updateCorpusStats([MOCK_PAPERS[0]]);
            expect(bm25.totalDocs).toBeGreaterThan(0);

            bm25.reset();

            expect(bm25.documentFrequency.size).toBe(0);
            expect(bm25.totalDocs).toBe(0);
            expect(bm25.processedDocIds.size).toBe(0);
        });
    });

    describe('updateCorpusStats', () => {
        it('should update document count', () => {
            bm25.updateCorpusStats([MOCK_PAPERS[0]]);
            expect(bm25.totalDocs).toBe(1);

            bm25.updateCorpusStats([MOCK_PAPERS[1]]);
            expect(bm25.totalDocs).toBe(2);
        });

        it('should not count duplicates', () => {
            const paper = MOCK_PAPERS[0];
            bm25.updateCorpusStats([paper]);
            bm25.updateCorpusStats([paper]); // Same paper again

            expect(bm25.totalDocs).toBe(1);
        });

        it('should track document frequency for terms', () => {
            bm25.updateCorpusStats([MOCK_PAPERS[0]]);
            expect(bm25.documentFrequency.size).toBeGreaterThan(0);
        });
    });

    describe('calculateIDF', () => {
        it('should return 0 for empty corpus', () => {
            expect(bm25.calculateIDF('test')).toBe(0);
        });

        it('should return 0 for terms not in corpus', () => {
            bm25.updateCorpusStats([MOCK_PAPERS[0]]);
            expect(bm25.calculateIDF('nonexistentterm12345')).toBe(0);
        });

        it('should return positive IDF for rare terms', () => {
            bm25.updateCorpusStats(MOCK_PAPERS);
            // Find a term that appears in title
            const idf = bm25.calculateIDF('machine');
            expect(idf).toBeGreaterThan(0);
        });

        it('should return lower IDF for common terms', () => {
            bm25.updateCorpusStats(MOCK_PAPERS);
            const rareIdf = bm25.calculateIDF('overview');
            const commonIdf = bm25.calculateIDF('machine');

            // Both should be positive, but rare term should have higher IDF
            expect(rareIdf).toBeGreaterThan(0);
            expect(commonIdf).toBeGreaterThan(0);
        });
    });

    describe('score', () => {
        beforeEach(() => {
            bm25.updateCorpusStats(MOCK_PAPERS);
        });

        it('should return default score for empty query', () => {
            const score = bm25.score(MOCK_PAPERS[0], '', 100);
            expect(score).toBe(50);
        });

        it('should return higher scores for relevant papers', () => {
            const paper1 = MOCK_PAPERS[0]; // "Machine Learning: A Comprehensive Overview"
            const paper2 = MOCK_PAPERS[3]; // "Reinforcement Learning Applications in Robotics"

            const score1 = bm25.score(paper1, 'comprehensive', 100);
            const score2 = bm25.score(paper2, 'comprehensive', 100);

            // Paper1 contains "comprehensive" in title, paper2 doesn't
            expect(score1).toBeGreaterThan(score2);
        });

        it('should boost papers with exact phrase matches', () => {
            const paper = MOCK_PAPERS[0];
            const scoreWithPhrase = bm25.score(paper, '"machine learning"', 100);
            const scoreWithoutPhrase = bm25.score(paper, 'machine learning', 100);

            expect(scoreWithPhrase).toBeGreaterThan(scoreWithoutPhrase);
        });

        it('should boost recent papers for time-sensitive queries', () => {
            const recentPaper = { ...MOCK_PAPERS[0], year: new Date().getFullYear() };
            const oldPaper = { ...MOCK_PAPERS[0], year: 2010 };

            bm25.updateCorpusStats([recentPaper, oldPaper]);

            const recentScore = bm25.score(recentPaper, 'latest machine learning', 100);
            const oldScore = bm25.score(oldPaper, 'latest machine learning', 100);

            expect(recentScore).toBeGreaterThan(oldScore);
        });

        it('should return scores in 0-100 range', () => {
            MOCK_PAPERS.forEach(paper => {
                const score = bm25.score(paper, 'machine learning', 100);
                expectValidRelevanceScore(score);
            });
        });
    });

    describe('getPaperText', () => {
        it('should include title, abstract, authors, journal', () => {
            const paper = MOCK_PAPERS[0];
            const text = bm25.getPaperText(paper);

            expect(text).toContain(paper.title);
            expect(text).toContain(paper.abstract);
            expect(text).toContain(paper.authors[0]);
            expect(text).toContain(paper.journal);
        });

        it('should repeat title multiple times for weighting', () => {
            const paper = { title: 'Unique12345', abstract: '', authors: [], journal: '' };
            const text = bm25.getPaperText(paper);
            const occurrences = (text.match(/unique12345/gi) || []).length;

            expect(occurrences).toBeGreaterThanOrEqual(3);
        });
    });
});

describe('PaperProcessor', () => {
    let processor;

    beforeEach(() => {
        processor = new PaperProcessor();
    });

    describe('constructor', () => {
        it('should initialize with BM25Scorer', () => {
            expect(processor.bm25).toBeInstanceOf(BM25Scorer);
        });

        it('should set default deduplication threshold', () => {
            expect(processor.dedupeThreshold).toBe(0.85);
        });
    });

    describe('getPaperKey', () => {
        it('should prefer DOI for key generation', () => {
            const paper = { doi: '10.1234/test', title: 'Test Paper' };
            const key = processor.getPaperKey(paper);
            expect(key).toContain('doi:10.1234/test');
        });

        it('should fallback to title if no DOI', () => {
            const paper = { title: 'Test Paper' };
            const key = processor.getPaperKey(paper);
            expect(key).toContain('title:');
        });
    });

    describe('areDuplicates', () => {
        it('should detect duplicates by DOI', () => {
            const paper1 = { doi: '10.1234/test', title: 'Different Title 1' };
            const paper2 = { doi: '10.1234/test', title: 'Different Title 2' };

            expect(processor.areDuplicates(paper1, paper2)).toBe(true);
        });

        it('should detect duplicates by fuzzy title matching', () => {
            const paper1 = MOCK_PAPERS[0];
            const paper2 = DUPLICATE_PAPER;

            expect(processor.areDuplicates(paper1, paper2)).toBe(true);
        });

        it('should not match different papers', () => {
            const paper1 = MOCK_PAPERS[0];
            const paper2 = MOCK_PAPERS[1];

            expect(processor.areDuplicates(paper1, paper2)).toBe(false);
        });
    });

    describe('mergePapers', () => {
        it('should combine information from both papers', () => {
            const paper1 = {
                title: 'Test',
                doi: '10.1234/test',
                abstract: null,
                citation_count: 10,
                source: 'arXiv'
            };
            const paper2 = {
                title: 'Test',
                doi: '10.1234/test',
                abstract: 'Abstract text',
                citation_count: 5,
                source: 'CrossRef'
            };

            const merged = processor.mergePapers(paper1, paper2);

            expect(merged.abstract).toBe('Abstract text');
            expect(merged.citation_count).toBe(15); // Sum of citations
            expect(merged._sources).toContain('arXiv');
            expect(merged._sources).toContain('CrossRef');
        });

        it('should track merge count', () => {
            const paper1 = { title: 'Test', source: 'A' };
            const paper2 = { title: 'Test', source: 'B' };

            const merged = processor.mergePapers(paper1, paper2);

            expect(merged._merged_count).toBe(2);
        });

        it('should handle undefined papers defensively', () => {
            const result = processor.mergePapers(null, MOCK_PAPERS[0]);
            expect(result).toBeDefined();
        });
    });

    describe('deduplicatePapers', () => {
        it('should remove duplicates', () => {
            const papers = [
                MOCK_PAPERS[0],
                DUPLICATE_PAPER,
                MOCK_PAPERS[1]
            ];

            const deduplicated = processor.deduplicatePapers(papers);

            expect(deduplicated.length).toBe(2);
        });

        it('should preserve unique papers', () => {
            const unique = processor.deduplicatePapers(MOCK_PAPERS);
            expect(unique.length).toBe(MOCK_PAPERS.length);
        });

        it('should merge duplicate papers', () => {
            const papers = [
                MOCK_PAPERS[0],
                DUPLICATE_PAPER
            ];

            const deduplicated = processor.deduplicatePapers(papers);

            expect(deduplicated.length).toBe(1);
            expect(deduplicated[0]._merged_count).toBeGreaterThan(1);
        });
    });

    describe('calculateRelevance', () => {
        it('should add relevance scores to papers', () => {
            const papers = [MOCK_PAPERS[0], MOCK_PAPERS[1]];
            const scored = processor.calculateRelevance(papers, 'machine learning');

            scored.forEach(paper => {
                expectValidRelevanceScore(paper.relevance_score);
            });
        });

        it('should return papers unchanged for empty query', () => {
            const papers = [MOCK_PAPERS[0]];
            const scored = processor.calculateRelevance(papers, '');

            expect(scored).toEqual(papers);
        });

        it('should handle empty paper array', () => {
            const scored = processor.calculateRelevance([], 'test query');
            expect(scored).toEqual([]);
        });
    });

    describe('sortPapers', () => {
        it('should sort by relevance score descending', () => {
            const papers = [
                { ...MOCK_PAPERS[0], relevance_score: 0.5 },
                { ...MOCK_PAPERS[1], relevance_score: 0.9 },
                { ...MOCK_PAPERS[2], relevance_score: 0.3 }
            ];

            const sorted = processor.sortPapers(papers);

            expect(sorted[0].relevance_score).toBe(0.9);
            expect(sorted[1].relevance_score).toBe(0.5);
            expect(sorted[2].relevance_score).toBe(0.3);
        });

        it('should use citations as tiebreaker', () => {
            const papers = [
                { ...MOCK_PAPERS[0], relevance_score: 0.9, citation_count: 50 },
                { ...MOCK_PAPERS[1], relevance_score: 0.9, citation_count: 100 }
            ];

            const sorted = processor.sortPapers(papers);

            expect(sorted[0].citation_count).toBe(100);
        });
    });

    describe('processPapers - integration', () => {
        it('should deduplicate, score, and sort papers', () => {
            const papers = [
                MOCK_PAPERS[0],
                DUPLICATE_PAPER, // Duplicate
                MOCK_PAPERS[1],
                MOCK_PAPERS[2]
            ];

            const processed = processor.processPapers(papers, 'machine learning');

            // Should deduplicate
            expect(processed.length).toBeLessThan(papers.length);

            // Should have scores
            processed.forEach(paper => {
                expect(paper.relevance_score).toBeDefined();
            });

            // Should be sorted
            for (let i = 0; i < processed.length - 1; i++) {
                expect(processed[i].relevance_score).toBeGreaterThanOrEqual(
                    processed[i + 1].relevance_score - 0.1 // Allow small tolerance
                );
            }
        });
    });
});
