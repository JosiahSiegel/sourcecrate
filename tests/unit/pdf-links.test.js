import { describe, it, expect } from 'vitest';
import OpenAlexClient from '../../js/api-clients/openalex.js';
import DOAJClient from '../../js/api-clients/doaj.js';
import { getAccessLinks } from '../../js/access-links.js';

describe('provider PDF metadata is distinct from landing pages and content verification', () => {
    const openalex = new OpenAlexClient();
    it.each([
        ['Sentient Sketchbook', 'https://www.um.edu.mt/library/oar//handle/123456789/29607'],
        ['Character-driven game design', 'https://aaltodoc.aalto.fi/handle/123456789/11446']
    ])('keeps the %s repository page accessible without calling it a PDF', (title, url) => {
        const [paper] = openalex.parseOpenAlexResponse({ results: [{ title, open_access: { is_oa: true, oa_url: url } }] });
        expect(paper.pdf_url).toBeNull();
        expect(paper.open_access_pdf).toBeNull();
        expect(getAccessLinks(paper).pdfs).toEqual([]);
        expect(getAccessLinks(paper).firstUrl).toBe(url);
    });
    it('uses explicit PDF fields across locations and marks the link unverified even with a .pdf suffix', () => {
        const url = 'https://rshare.library.torontomu.ca/articles/thesis/Storytelling_with_Music_Adaptive_Music_in_Video_Games_and_Beyond/25164551/1/files/44450306.pdf';
        for (const fields of [{ best_oa_location: { pdf_url: url } }, { primary_location: { pdf_url: url } },
            { locations: [{ is_oa: true, pdf_url: url }] }]) {
            const [paper] = openalex.parseOpenAlexResponse({ results: [{ title: 'Storytelling with Music', ...fields }] });
            expect(paper.pdf_url).toBe(url);
            expect(getAccessLinks(paper).pdfs[0].verification).toBe('unverified');
            expect(getAccessLinks(paper).pdfs[0].label).toContain('PDF link');
        }
    });
    it('requires DOAJ PDF content type; fulltext alone may mean HTML', () => {
        const client = new DOAJClient();
        for (const content_type of ['HTML', undefined, 'PDF', 'application/pdf']) {
            const [paper] = client.parseDOAJResponse({ results: [{ bibjson: { title: 'Example',
                link: [{ type: 'fulltext', content_type, url: 'https://example.org/content' }] } }] });
            expect(Boolean(paper.pdf_url)).toBe(['PDF', 'application/pdf'].includes(content_type));
            expect(paper.url).toBe('https://example.org/content');
        }
    });
    it('retains the entire OpenAlex abstract for ranking', () => {
        const prefix = 'background '.repeat(100).trim().split(' ');
        expect(openalex.reconstructAbstract({ background: prefix.map((_, i) => i), believability: [100] })).toMatch(/believability$/);
    });
});
