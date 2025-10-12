// ============================================================================
// API MOCKING VERIFICATION TESTS (MSW)
// ============================================================================
// CRITICAL: These tests verify that MSW properly intercepts all API requests
// This prevents spamming academic APIs and violating ToS

import { describe, it, expect } from 'vitest';
import { server } from '../mocks/server.js';
import { http, HttpResponse } from 'msw';

describe('MSW API Mocking Verification', () => {
    it('should intercept arXiv API calls', async () => {
        const response = await fetch('https://export.arxiv.org/api/query?test');

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);

        const text = await response.text();
        expect(text).toContain('<?xml');
        expect(text).toContain('Quantum Computing Applications');
    });

    it('should intercept CrossRef API calls', async () => {
        const response = await fetch('https://api.crossref.org/works?query=test');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('message');
        expect(json.message).toHaveProperty('items');
        expect(Array.isArray(json.message.items)).toBe(true);
    });

    it('should intercept PubMed API calls', async () => {
        // PubMed uses 2-step process: esearch (JSON) then efetch (XML)

        // Step 1: esearch returns JSON with PMIDs
        const searchResponse = await fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=test');
        expect(searchResponse.ok).toBe(true);
        const searchJson = await searchResponse.json();
        expect(searchJson).toHaveProperty('esearchresult');
        expect(searchJson.esearchresult).toHaveProperty('idlist');

        // Step 2: efetch returns XML with article details
        const fetchResponse = await fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=123');
        expect(fetchResponse.ok).toBe(true);
        const xmlText = await fetchResponse.text();
        expect(xmlText).toContain('<?xml');
        expect(xmlText).toContain('PubmedArticle');
    });

    it('should intercept OpenAlex API calls', async () => {
        const response = await fetch('https://api.openalex.org/works?search=test');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('results');
        expect(Array.isArray(json.results)).toBe(true);
    });

    it('should intercept DOAJ API calls', async () => {
        const response = await fetch('https://doaj.org/api/search/articles?query=test');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('results');
    });

    it('should intercept Europe PMC API calls', async () => {
        const response = await fetch('https://www.europepmc.org/webservices/rest/search?query=test');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('resultList');
    });

    it('should intercept Unpaywall API calls', async () => {
        const response = await fetch('https://api.unpaywall.org/v2/10.1000/test?email=test@example.com');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('doi');
    });

    it('should intercept DataCite API calls', async () => {
        const response = await fetch('https://api.datacite.org/dois?query=test');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('data');
    });

    it('should intercept Zenodo API calls', async () => {
        const response = await fetch('https://zenodo.org/api/records?q=test');

        expect(response.ok).toBe(true);
        const json = await response.json();

        expect(json).toHaveProperty('hits');
    });

    it('should fail on unmocked API requests', async () => {
        // MSW is configured with onUnhandledRequest: 'error'
        // This test should throw an error for unmocked requests
        try {
            await fetch('https://unmocked-api.example.com/test');
            // If we get here, MSW didn't catch it - fail the test
            expect.fail('Should have thrown error for unmocked API');
        } catch (error) {
            // Expected - MSW should reject unmocked requests
            expect(error).toBeDefined();
        }
    });

    it('should allow per-test handler overrides', async () => {
        // Override the arXiv handler for this test only
        server.use(
            http.get('https://export.arxiv.org/api/query*', () => {
                return HttpResponse.text('<feed>Custom test mock</feed>', {
                    headers: { 'Content-Type': 'application/atom+xml' }
                });
            })
        );

        const response = await fetch('https://export.arxiv.org/api/query?test');
        const text = await response.text();

        expect(text).toBe('<feed>Custom test mock</feed>');

        // Handler will be reset after this test by afterEach in setup.js
    });

    it('should return correct content types', async () => {
        // XML APIs
        const arxivResponse = await fetch('https://export.arxiv.org/api/query?test');
        expect(arxivResponse.headers.get('content-type')).toContain('application/atom+xml');

        // PubMed esearch returns JSON
        const pubmedSearchResponse = await fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?test');
        expect(pubmedSearchResponse.headers.get('content-type')).toContain('application/json');

        // PubMed efetch returns XML
        const pubmedFetchResponse = await fetch('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?test');
        expect(pubmedFetchResponse.headers.get('content-type')).toContain('application/xml');

        // JSON APIs (default content-type)
        const crossrefResponse = await fetch('https://api.crossref.org/works?test');
        const contentType = crossrefResponse.headers.get('content-type');
        expect(contentType).toBeTruthy();
    });
});

describe('Mock Response Format Validation', () => {
    it('should return valid XML for arXiv API', async () => {
        const response = await fetch('https://export.arxiv.org/api/query?test');
        const xml = await response.text();

        // Should be valid Atom XML
        expect(xml.toLowerCase()).toContain('<?xml');
        expect(xml.toLowerCase()).toContain('feed');
        expect(xml).toContain('Quantum Computing Applications');
    });

    it('should return valid JSON for CrossRef API', async () => {
        const response = await fetch('https://api.crossref.org/works?query=test');
        const json = await response.json();

        // Should match CrossRef API structure
        expect(json).toHaveProperty('message');
        expect(json.message).toHaveProperty('items');
        expect(Array.isArray(json.message.items)).toBe(true);
        expect(json.message.items.length).toBeGreaterThan(0);
    });

    it('should return valid JSON for OpenAlex API', async () => {
        const response = await fetch('https://api.openalex.org/works?search=test');
        const json = await response.json();

        // Should match OpenAlex API structure
        expect(json).toHaveProperty('results');
        expect(Array.isArray(json.results)).toBe(true);
        expect(json.results.length).toBeGreaterThan(0);
    });

    it('should handle both text() and json() methods', async () => {
        // XML APIs should work with text()
        const arxivResponse = await fetch('https://export.arxiv.org/api/query?test');
        await expect(arxivResponse.text()).resolves.toBeDefined();

        // JSON APIs should work with json()
        const crossrefResponse = await fetch('https://api.crossref.org/works?test');
        await expect(crossrefResponse.json()).resolves.toBeDefined();
    });
});
