import { describe, it, expect } from 'vitest';
import { BM25Scorer } from '../../js/processing-poc.js';

const query = 'game programming patterns Robert Nystrom';
const exact = { title: 'Game Programming Patterns', authors: ['Robert Nystrom'] };
function rank(papers, search = query) {
    const scorer = new BM25Scorer();
    scorer.updateCorpusStats(papers);
    return papers.map(paper => ({ ...paper, score: scorer.score(paper, search) }))
        .sort((a, b) => b.score - a.score);
}

describe('title and author ranking', () => {
    it('puts a complete title and author ahead of partial, author-only and abstract matches', () => {
        const ranked = rank([
            { title: 'Numerical methods', authors: ['Robert Nystrom'], abstract: query },
            { title: exact.title, authors: ['Another Writer'] },
            { title: 'Game Programming', authors: exact.authors },
            { title: 'Game patterns: patterns for game programming', authors: ['Other Author'] },
            exact
        ]);
        expect(ranked[0].authors).toEqual(exact.authors);
        expect(ranked[0].title).toBe(exact.title);
        expect(ranked[0].score).toBeGreaterThan(ranked[1].score + 5);
        expect(ranked.at(-1).title).toBe('Numerical methods');
    });

    it('prefers the exact title phrase to scattered words and longer titles', () => {
        const ranked = rank([
            { ...exact, title: 'Patterns for programming a game' },
            { ...exact, title: 'A practical guide to Game Programming Patterns for beginners' },
            exact
        ]);
        expect(ranked[0].title).toBe(exact.title);
    });

    it('handles author-first queries, punctuation, case and accented names consistently', () => {
        const scorer = new BM25Scorer();
        const accented = { ...exact, authors: [{ name: 'Nyström, Robert' }] };
        const scores = [query, query.toUpperCase(), 'Robert Nystrom "Game Programming Patterns"',
            'game-programming patterns, Robert Nyström'].map(search => scorer.score(accented, search));
        scores.forEach(score => expect(score).toBeCloseTo(scores[0], 8));
        expect(scores[0]).toBeGreaterThan(scorer.score({ ...exact, authors: [] }, query));
    });

    it('matches whole words instead of surname substrings', () => {
        const ranked = rank([
            { title: 'Nystromformer for neural networks' },
            { title: 'A study of Nystrom methods' }
        ], 'Nystrom');
        expect(ranked[0].title).toBe('A study of Nystrom methods');
        expect(ranked[1].score).toBe(0);
    });

    it('keeps title-only queries ahead of incidental surnames and abstract mentions', () => {
        const ranked = rank([
            { title: 'Confectionery research', authors: ['Patrick Corn'], abstract: 'candy corn' },
            { title: 'Candy Corn', authors: ['Other Writer'] },
            { title: 'Corn production', authors: ['Candy Smith'] }
        ], 'candy corn');
        expect(ranked[0].title).toBe('Candy Corn');
    });

    it('supports missing fields, author-only queries and non-Latin titles with bounded scores', () => {
        const papers = [{}, { title: '物理学 研究' }, { authors: ['Robert Nystrom'] }];
        expect(rank(papers, 'Robert Nystrom')[0].authors).toEqual(['Robert Nystrom']);
        expect(rank(papers, '物理学')[0].title).toBe('物理学 研究');
        for (const paper of papers) {
            const score = new BM25Scorer().score(paper, query, 0);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
        }
    });
});
