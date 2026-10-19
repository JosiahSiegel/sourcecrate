import { it, expect, vi, afterEach } from 'vitest';
import DataCiteClient from '../../js/api-clients/datacite.js';
import ZenodoClient from '../../js/api-clients/zenodo.js';
import { searchPapers } from '../../js/search-core.js';

const record = { id: '10.5281/zenodo.123', attributes: {
    doi: '10.5281/zenodo.123', titles: [{ title: 'Climate observations' }],
    creators: [{ name: 'Researcher, A' }], publicationYear: 2025,
    url: 'https://zenodo.org/records/123', publisher: 'Zenodo'
} };
const records = () => Response.json({ data: [record] });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('retries a transient DataCite HTTP failure once and clears the error on recovery', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockImplementation(records);
    vi.stubGlobal('fetch', fetch);
    const client = new DataCiteClient();
    const papers = await client.search('climate', 3);
    expect(papers[0].doi).toBe(record.id);
    expect(client.lastError).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('page[size]')).toBe('3');
    expect(url.searchParams.get('fields[dois]')).toContain('titles');
    expect(url.searchParams.has('client-id')).toBe(false);
});

it('recovers from a real aborted DataCite request within a bounded second attempt', async () => {
    const fetch = vi.fn().mockImplementationOnce((url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })).mockImplementation(records);
    vi.stubGlobal('fetch', fetch);
    const client = new DataCiteClient();
    client.timeout = 15;
    expect(await client.search('climate')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(client.lastError).toBeNull();
});

it('bounds repeated network failures to two attempts', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    const client = new DataCiteClient();
    expect(await client.search('climate')).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(client.lastError).toBe('Failed to fetch');
});

it.each([400, 401, 403])('does not retry DataCite HTTP %s', async status => {
    const fetch = vi.fn(async () => new Response('', { status }));
    vi.stubGlobal('fetch', fetch);
    const client = new DataCiteClient();
    expect(await client.search('climate')).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.lastError).toBe(`HTTP ${status}`);
});

it.each(['30', new Date(Date.now() + 60000).toUTCString()])('honors long Retry-After %s without retrying early', async retryAfter => {
    const fetch = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': retryAfter } }));
    vi.stubGlobal('fetch', fetch);
    const client = new DataCiteClient();
    expect(await client.search('climate')).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.lastError).toBe('HTTP 429');
});

it('honors short Retry-After and allows cancellation during backoff', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '1' } }));
    vi.stubGlobal('fetch', fetch);
    const client = new DataCiteClient();
    const controller = new AbortController();
    client.signal = controller.signal;
    const search = client.search('climate');
    await vi.advanceTimersByTimeAsync(900);
    expect(fetch).toHaveBeenCalledTimes(1);
    controller.abort(new Error('Cancelled by caller'));
    expect(await search).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.lastError).toBe('Cancelled by caller');
});

it.each([403, 429, 503, 'network'])('uses only indexed Zenodo records when direct search fails with %s', async failure => {
    const fetch = vi.fn(async url => {
        if (String(url).includes('zenodo.org/api')) {
            if (failure === 'network') throw new TypeError('Failed to fetch');
            return new Response('', { status: failure });
        }
        expect(new URL(url).searchParams.get('client-id')).toBe('cern.zenodo');
        return records();
    });
    vi.stubGlobal('fetch', fetch);
    const result = await searchPapers('climate', { sources: ['zenodo'] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.papers[0]).toMatchObject({ source: 'Zenodo', metadata_source: 'DataCite',
        url: 'https://zenodo.org/records/123', pdf_url: null, is_open_access: false });
    expect(result.source_status[0]).toMatchObject({ source: 'zenodo', error: null, via: 'datacite', count: 1 });
    expect(result.source_status[0].warning).toContain('direct file links are unavailable');
    expect(result.partial).toBe(true);
});

it('reports both failures when the Zenodo metadata fallback also fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
    const result = await searchPapers('climate', { sources: ['zenodo'] });
    expect(result.papers).toEqual([]);
    expect(result.source_status[0].error).toBe('Zenodo: HTTP 403; DataCite fallback: HTTP 403');
    expect(result.source_status[0].via).toBeUndefined();
});

it('does not use the fallback for a successful empty Zenodo response and resets previous warnings', async () => {
    const fetch = vi.fn(async () => Response.json({ hits: { hits: [] } }));
    vi.stubGlobal('fetch', fetch);
    const client = new ZenodoClient();
    client.lastWarning = 'previous fallback';
    client.lastVia = 'datacite';
    expect(await client.search('climate')).toEqual([]);
    expect(client.lastWarning).toBeNull();
    expect(client.lastVia).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
});

it('cancels Zenodo without starting an unrequested fallback', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => {
        controller.abort(new Error('New query started'));
        throw controller.signal.reason;
    });
    vi.stubGlobal('fetch', fetch);
    const client = new ZenodoClient();
    client.signal = controller.signal;
    expect(await client.search('climate')).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.lastError).toBe('New query started');
});
