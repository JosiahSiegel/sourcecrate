import { describe, it, expect } from 'vitest';
import { addToHistory, getSearchHistory } from '../../js/history.js';

describe('search history relevance settings', () => {
    it('uses the visible default cutoff and allows explicitly including all results', () => {
        addToHistory('game programming patterns Robert Nystrom', 94);
        expect(getSearchHistory()[0].filters.relevanceThreshold).toBe(25);
        addToHistory('game programming patterns Robert Nystrom', 94, { relevanceThreshold: 0 });
        const history = getSearchHistory();
        expect(history).toHaveLength(1);
        expect(history[0].filters.relevanceThreshold).toBe(0);
        expect(history[0].resultCount).toBe(94);
    });

    it('preserves an explicitly supplied relevance filter', () => {
        addToHistory('filtered query', 2, { relevanceThreshold: 70, pdfOnly: true });
        expect(getSearchHistory()[0].filters).toEqual({ relevanceThreshold: 70, pdfOnly: true });
    });
});
