import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPapers, rankPapers, sources } from '../../js/search-core.js';
import { getAccessLinks } from '../../js/access-links.js';
import ClientSearchOrchestrator from '../../js/api-clients/orchestrator.js';

afterEach(() => vi.restoreAllMocks());
const query = 'game programming patterns Robert Nystrom';
const exact = { title: 'Game Programming Patterns', authors: ['Robert Nystrom'], doi: '10.1234/book', source: 'CrossRef', url: 'https://example.org/book' };

describe('shared website and agent search', () => {
    it('keeps the same ranking and merged links regardless of source arrival order', () => {
        const papers = [exact,
            { ...exact, source: 'OpenAlex', abstract: 'Book description', pdf_url: 'https://example.org/book.pdf' },
            { ...exact, doi: '10.1234/other', authors: ['Other Author'] },
            { title: 'Numerical methods', authors: exact.authors, abstract: query }];
        const ranked = rankPapers(papers, query);
        expect(rankPapers([...papers].reverse(), query)).toEqual(ranked);
        expect(ranked[0].doi).toBe(exact.doi);
        expect(ranked).toHaveLength(3);
        expect(getAccessLinks(ranked[0]).firstUrl).toBe('https://example.org/book.pdf');
    });
    it('returns the same final snapshot it sends to the website, including partial-source failures', async () => {
        vi.spyOn(ClientSearchOrchestrator.prototype, 'searchWithCallbacks').mockImplementation(async (_, options) => {
            options.onResults({ source: 'crossref', papers: [exact] });
            options.onSourceComplete({ source: 'crossref', count: 1 });
            options.onSourceComplete({ source: 'arxiv', count: 0, error: 'Timed out' });
            await options.onComplete({ total_results: 1 });
            return { total_results: 1 };
        });
        let snapshot;
        const result = await searchPapers(query, { onResults: data => { snapshot = data.papers; } });
        expect(result.papers).toEqual(snapshot);
        expect(result.partial).toBe(true);
        expect(result.source_status[1].error).toBe('Timed out');
        expect(result.papers[0].relevance_score).toBeGreaterThan(60);
    });
    it('rejects unsupported inputs and propagates caller cancellation', async () => {
        await expect(searchPapers(' ')).rejects.toThrow('query');
        await expect(searchPapers(query, { limit: 0 })).rejects.toThrow('Limit');
        await expect(searchPapers(query, { sources: ['invented'] })).rejects.toThrow('sources');
        const controller = new AbortController();
        controller.abort(new Error('Cancelled by caller'));
        vi.spyOn(ClientSearchOrchestrator.prototype, 'searchWithCallbacks').mockResolvedValue({});
        await expect(searchPapers(query, { signal: controller.signal })).rejects.toThrow('Cancelled by caller');
        expect(sources).toHaveLength(8);
    });
});
