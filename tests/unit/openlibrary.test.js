import { it, expect, vi, afterEach } from 'vitest';
import OpenLibraryClient from '../../js/api-clients/openlibrary.js';
import { rankPapers } from '../../js/search-core.js';
afterEach(() => vi.unstubAllGlobals());

it('finds a book by title and author and exposes its catalog page without inventing a PDF', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ docs: [
        { key: '/works/OL19650342W', title: 'Game Programming Patterns', author_name: ['Robert Nystrom'], first_publish_year: 2011 },
        { key: 'https://evil.example', title: 'Invalid destination' }
    ] })));
    const query = 'game programming patterns Robert Nystrom';
    const books = await new OpenLibraryClient().search(query, 25);
    expect(books).toHaveLength(1);
    expect(books[0].url).toBe('https://openlibrary.org/works/OL19650342W');
    expect(books[0].pdf_url).toBeNull();
    const ranked = rankPapers([{ title: 'Game patterns: patterns for game programming', authors: ['Other Author'], source: 'CrossRef' }, ...books], query);
    expect(ranked[0].title).toBe('Game Programming Patterns');
    expect(ranked[0].authors).toEqual(['Robert Nystrom']);
});

it('reports rate limits and malformed provider responses without losing other sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const client = new OpenLibraryClient();
    expect(await client.search('book')).toEqual([]);
    expect(client.lastError).toBe('HTTP 429');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not JSON')));
    expect(await client.search('book')).toEqual([]);
    expect(client.lastError).toBeTruthy();
});
