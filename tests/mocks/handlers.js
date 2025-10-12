// ============================================================================
// MSW REQUEST HANDLERS
// ============================================================================
// Defines mocked responses for all 9 academic API sources
// See: https://mswjs.io/docs/network-behavior/rest

import { http, HttpResponse } from 'msw';
import mockApiResponses from '../fixtures/mock-api-responses.json' with { type: 'json' };

export const handlers = [
  // ========================================================================
  // arXiv API - Returns XML (Atom feed format)
  // ========================================================================
  http.get('https://export.arxiv.org/api/query*', () => {
    return HttpResponse.text(mockApiResponses.arxiv.xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8'
      }
    });
  }),

  // ========================================================================
  // CrossRef API - Returns JSON
  // ========================================================================
  http.get('https://api.crossref.org/works*', () => {
    return HttpResponse.json(mockApiResponses.crossref, {
      status: 200
    });
  }),

  // ========================================================================
  // PubMed API - Returns JSON for search, XML for fetch
  // ========================================================================
  // Step 1: esearch.fcgi returns JSON with PMIDs
  http.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi*', () => {
    return HttpResponse.json(mockApiResponses.pubmed.json, {
      status: 200
    });
  }),

  // Step 2: efetch.fcgi returns XML with article details
  http.get('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi*', () => {
    return HttpResponse.text(mockApiResponses.pubmed.xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8'
      }
    });
  }),

  // ========================================================================
  // OpenAlex API - Returns JSON
  // ========================================================================
  http.get('https://api.openalex.org/works*', () => {
    return HttpResponse.json(mockApiResponses.openalex, {
      status: 200
    });
  }),

  // ========================================================================
  // DOAJ (Directory of Open Access Journals) API - Returns JSON
  // ========================================================================
  http.get('https://doaj.org/api/*', () => {
    return HttpResponse.json(mockApiResponses.doaj, {
      status: 200
    });
  }),

  // ========================================================================
  // Europe PMC API - Returns JSON
  // ========================================================================
  // Note: Matches both old and new domains (www.europepmc.org and www.ebi.ac.uk)
  http.get('https://www.europepmc.org/webservices/rest/*', () => {
    return HttpResponse.json(mockApiResponses.europepmc, {
      status: 200
    });
  }),

  http.get('https://www.ebi.ac.uk/europepmc/webservices/rest/*', () => {
    return HttpResponse.json(mockApiResponses.europepmc, {
      status: 200
    });
  }),

  // ========================================================================
  // Unpaywall API - Returns JSON
  // ========================================================================
  http.get('https://api.unpaywall.org/*', () => {
    return HttpResponse.json(mockApiResponses.unpaywall, {
      status: 200
    });
  }),

  // ========================================================================
  // DataCite API - Returns JSON
  // ========================================================================
  http.get('https://api.datacite.org/dois*', () => {
    return HttpResponse.json(mockApiResponses.datacite, {
      status: 200
    });
  }),

  // ========================================================================
  // Zenodo API - Returns JSON
  // ========================================================================
  http.get('https://zenodo.org/api/records*', () => {
    return HttpResponse.json(mockApiResponses.zenodo, {
      status: 200
    });
  })
];

// ============================================================================
// USAGE NOTES
// ============================================================================
// - Handlers use wildcard patterns (*) to match any query parameters
// - All responses return appropriate Content-Type headers
// - Mock data comes from tests/fixtures/mock-api-responses.json
// - Handlers are automatically loaded by tests/mocks/server.js
// - For per-test overrides, use: server.use(http.get(...)) in your test
