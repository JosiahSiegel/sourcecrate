import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { searchWithClient, clearSearchCache } from '../../js/api.js';
import ClientSearchOrchestrator from '../../js/api-clients/orchestrator.js';
import BaseAPIClient from '../../js/api-clients/base.js';
import PaperProcessor from '../../js/processing-poc.js';
import { buildPaperCard, renderStreamingResults } from '../../js/rendering.js';
import { populateSearchHistory, renderCollectionsInline } from '../../js/ui.js';
import { applyFilters, getPaperKey } from '../../js/utils.js';
import * as state from '../../js/state.js';
import { setupSearchDOM } from '../helpers/dom.js';
import contract from '../fixtures/paper-contract.json';

beforeEach(() => {
    clearSearchCache();
    state.papersByKey.clear();
    state.renderedPaperKeys.clear();
    state.setPdfOnlyFilter(false);
    state.setRelevanceThreshold(35);
    state.setBm25ScoringComplete(false);
    setupSearchDOM();
});

describe('result title destinations', () => {
    const cases = [
        ['PDF before publisher', { pdf_url: 'https://example.org/paper.pdf', url: 'https://example.org/paper' }, 'https://example.org/paper.pdf'],
        ['publisher before DOI', { url: 'https://example.org/paper', doi: '10.1234/paper' }, 'https://example.org/paper'],
        ['DOI fallback', { doi: '10.1234/paper' }, 'https://doi.org/10.1234/paper'],
        ['merged source order', { _source_links: [
            { source: 'First', url: 'https://example.org/first', citation_count: 1 },
            { source: 'Second', url: 'https://example.org/second', citation_count: 10 }
        ] }, 'https://example.org/second'],
        ['merged PDF before pages', { _source_links: [
            { source: 'First', url: 'https://example.org/first' },
            { source: 'Second', has_pdf: true, pdf_url: 'https://example.org/second.pdf' }
        ] }, 'https://example.org/second.pdf'],
        ['unsafe URLs', { url: 'javascript:alert(1)', pdf_url: 'javascript:alert(2)' }, null],
        ['missing URLs', {}, null]
    ];
    for (const [name, fields, expected] of cases) it(name, () => {
        document.getElementById('results').innerHTML = buildPaperCard({ title: 'A result', ...fields }, 0);
        const titleLink = document.querySelector('.paper-title-link');
        if (!expected) {
            expect(titleLink).toBeNull();
            expect(document.querySelector('h3').textContent).toContain('A result');
        } else {
            expect(titleLink.getAttribute('href')).toBe(expected);
            expect(titleLink.getAttribute('href')).toBe(document.querySelector('.source-access-container a').getAttribute('href'));
            expect(titleLink.getAttribute('rel')).toBe('noopener noreferrer');
            expect(titleLink.textContent).toBe('A result');
        }
        expect(document.querySelector('.title-search-icon')).not.toBeNull();
    });
});
afterEach(() => { clearSearchCache(); vi.restoreAllMocks(); });

it('ignores late callbacks from a previous query and keeps cache copies separate', async () => {
    let finishOld;
    vi.spyOn(ClientSearchOrchestrator.prototype, 'searchWithCallbacks').mockImplementation(async (query, callbacks) => {
        if (query === 'galaxies') await new Promise(resolve => { finishOld = resolve; });
        callbacks.onResults({ papers: [{title: query, doi: `10.1234/${query}`, source: 'mock'}] });
        callbacks.onSourceComplete({ completed: 1, total: 1 });
        await callbacks.onComplete({});
    });
    const first = searchWithClient('galaxies', 5);
    await searchWithClient('diabetes', 5);
    finishOld();
    await first;
    expect([...state.papersByKey.values()].map(p => p.title)).toEqual(['diabetes']);
    state.papersByKey.values().next().value.title = 'edited locally';
    await searchWithClient('diabetes', 5, false, 80);
    expect([...state.papersByKey.values()].map(p => p.title)).toEqual(['diabetes']);
    expect(state.relevanceThreshold).toBe(80);
});

it('removes filtered cards, updates merged metadata, and retains unchanged cards', () => {
    for (const paper of contract.filter_cases) state.papersByKey.set(getPaperKey(paper), {...paper});
    renderStreamingResults();
    expect(document.querySelectorAll('.paper-card')).toHaveLength(2);
    state.setBm25ScoringComplete(true);
    renderStreamingResults();
    expect(document.querySelectorAll('.paper-card')).toHaveLength(1);
    expect(document.querySelector('.paper-card').textContent).toContain('Strong match');
    const paper = state.papersByKey.get('title:strong match');
    paper.abstract = 'New abstract from another source';
    renderStreamingResults();
    expect(document.querySelector('.paper-abstract').textContent).toContain('New abstract');
    const unchanged = document.querySelector('.paper-card');
    renderStreamingResults();
    expect(document.querySelector('.paper-card')).toBe(unchanged);
    state.setRelevanceThreshold(99);
    renderStreamingResults();
    expect(document.querySelectorAll('.paper-card')).toHaveLength(0);
    expect(document.getElementById('results').textContent).toContain('No papers match');
});

it('treats paper fields, source labels and URL quotes as text', () => {
    const payload = '\"><img src=x onerror="window.injected=true">';
    document.getElementById('results').innerHTML = buildPaperCard({
        title: payload, authors: [payload], journal: payload, year: payload,
        abstract: '&lt;img src=x onerror=alert(1)&gt;', doi: "10.1234/');window.injected=true;//",
        source: payload, pdf_url: `https://example.org/file.pdf?q=${payload}`
    }, 0);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('.paper-card h3').textContent).toContain(payload);
    expect(document.querySelector('[onerror]')).toBeNull();
    expect(document.querySelector('.badge-doi').getAttribute('onclick')).not.toContain('window.injected');
});

it('renders history and collection text safely while keeping history selection working', () => {
    const query = '\"><img src=x onerror="window.injected=true">';
    document.body.innerHTML = '<ul id="searchHistoryList"></ul><div id="collectionsInline"></div>';
    localStorage.setItem('sourcecrate_search_history', JSON.stringify([{query, timestamp: Date.now()}]));
    localStorage.setItem('sourcecrate_collections', JSON.stringify({custom: {id: query, name: query, papers: []}}));
    const select = vi.fn();
    populateSearchHistory(select);
    renderCollectionsInline('all');
    expect(document.querySelector('img')).toBeNull();
    document.querySelector('#searchHistoryList li').click();
    expect(select).toHaveBeenCalledWith(query);
});

describe('shared paper contract', () => {
    const processor = new PaperProcessor();
    for (const entry of contract.identity_cases) it(entry.name, () => {
        expect(processor.areDuplicates(entry.a, entry.b)).toBe(entry.duplicate);
    });
    it('filters percent scores without multiplying them again', () => {
        expect(applyFilters(contract.filter_cases, false, 35, true).map(p => p.title)).toEqual(['Strong match']);
    });
});

it('cancels the underlying fetch when a search is superseded', async () => {
    const controller = new AbortController();
    const client = new BaseAPIClient('test');
    client.signal = controller.signal;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, {signal}) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
    }));
    const request = client.fetchWithTimeout('https://example.org/papers');
    controller.abort();
    await expect(request).rejects.toMatchObject({name: 'AbortError'});
});

it('computes the same final scores regardless of source arrival order', async () => {
    const papers = [
        {title: 'Quantum transport', doi: '10.1234/one', abstract: 'Quantum particle transport in conductors.'},
        {title: 'Transport measurements', doi: '10.1234/two', abstract: 'Measurements of quantum conductors and classical samples.'}
    ];
    let reverse = false;
    vi.spyOn(ClientSearchOrchestrator.prototype, 'searchWithCallbacks').mockImplementation(async (query, callbacks) => {
        for (const paper of reverse ? [...papers].reverse() : papers) callbacks.onResults({papers: [structuredClone(paper)]});
        await callbacks.onComplete({});
    });
    const scores = () => Object.fromEntries([...state.papersByKey.values()].map(p => [p.doi, p.relevance_score]));
    await searchWithClient('quantum transport', 5);
    const first = scores();
    clearSearchCache();
    reverse = true;
    await searchWithClient('quantum transport', 5);
    expect(scores()).toEqual(first);
});
