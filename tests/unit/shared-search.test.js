import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchPapers, rankPapers, sources } from '../../js/search-core.js';
import { getAccessLinks } from '../../js/access-links.js';
import { getPaperKey } from '../../js/utils.js';
import ClientSearchOrchestrator from '../../js/api-clients/orchestrator.js';

afterEach(() => vi.restoreAllMocks());
const query = 'game programming patterns Robert Nystrom';
const exact = { title: 'Game Programming Patterns', authors: ['Robert Nystrom'], doi: '10.1234/book', source: 'CrossRef', url: 'https://example.org/book' };

describe('shared website and agent search', () => {
    it('filters weak matches consistently in snapshots and final results, with an explicit opt-out and final cap', async () => {
        const candidates = [exact, { title: 'Game Programming Patterns', authors: ['Other Writer'] },
            { title: 'The Story of The Committee of 300' }];
        vi.spyOn(ClientSearchOrchestrator.prototype, 'searchWithCallbacks').mockImplementation(async (_, options) => {
            options.onResults({ source: 'crossref', papers: candidates });
            return { total_results: candidates.length };
        });
        let snapshot;
        const filtered = await searchPapers(query, { onResults: data => { snapshot = data.papers; } });
        expect(filtered.papers).toEqual(snapshot);
        expect(filtered.papers).toHaveLength(2);
        expect(filtered.filtered_out).toBe(1);
        expect(filtered.filters.min_relevance).toBe(25);
        const all = await searchPapers(query, { minRelevance: 0 });
        expect(all.papers).toHaveLength(3);
        const capped = await searchPapers(query, { maxResults: 1 });
        expect(capped.papers[0].title).toBe(exact.title);
        expect(capped.total_matching).toBe(2);
        expect(capped.total_ranked).toBe(3);
        expect(capped.total_results).toBe(1);
        expect(capped.truncated).toBe(true);
        for (const minRelevance of [-1, 101, NaN]) await expect(searchPapers(query, { minRelevance })).rejects.toThrow('Minimum relevance');
        for (const maxResults of [0, 1001, 1.5]) await expect(searchPapers(query, { maxResults })).rejects.toThrow('Maximum results');
    });
    it('retains same-title works by different authors, including distinct UI identities', () => {
        const papers = [{ title: exact.title, authors: ['Other Writer'] },
            { title: exact.title, authors: exact.authors }];
        const ranked = rankPapers(papers, query);
        expect(ranked).toHaveLength(2);
        expect(rankPapers([...papers].reverse(), query)).toEqual(ranked);
        expect(ranked[0].authors).toEqual(exact.authors);
        expect(new Set(ranked.map(getPaperKey)).size).toBe(2);
    });
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
        expect(sources).toHaveLength(9);
    });
});
