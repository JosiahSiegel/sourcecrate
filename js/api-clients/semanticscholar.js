// ============================================================================
// SEMANTICSCHOLAR.JS - Semantic Scholar API client (CORS-enabled)
// ============================================================================
// API Docs: https://api.semanticscholar.org/api-docs/graph
// Rate Limits: 1 request per second (recommended), 5000 requests per 5 minutes (shared pool)

import BaseAPIClient from './base.js';

export class SemanticScholarClient extends BaseAPIClient {
    constructor() {
        super('Semantic Scholar');
        this.baseUrl = 'https://api.semanticscholar.org/graph/v1/paper/search';
        this.lastRequestTime = 0;
        this.minRequestInterval = 1100; // 1.1 seconds (conservative rate limiting)
    }

    /**
     * Rate limit requests to respect 1 RPS limit
     */
    async rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            const delay = this.minRequestInterval - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Search Semantic Scholar papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            // Respect rate limits
            await this.rateLimit();

            const params = new URLSearchParams({
                query: query,
                limit: Math.min(limit, 100), // API max is 100
                fields: 'paperId,title,authors,year,abstract,venue,citationCount,url,openAccessPdf,externalIds'
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url, 60000); // 60s timeout

            if (!response.ok) {
                console.warn(`[Semantic Scholar] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseSemanticScholarResponse(data);
        } catch (error) {
            console.error(`[Semantic Scholar] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse Semantic Scholar JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseSemanticScholarResponse(data) {
        if (!data.data) return [];

        return data.data.map(item => {
            try {
                // Authors
                const authors = item.authors?.map(a => a.name).filter(Boolean) || [];

                // DOI from externalIds
                const doi = item.externalIds?.DOI;

                // PDF URL
                const pdfUrl = item.openAccessPdf?.url;

                return {
                    title: item.title,
                    authors,
                    abstract: item.abstract,
                    year: item.year,
                    doi,
                    url: item.url || `https://www.semanticscholar.org/paper/${item.paperId}`,
                    pdf_url: pdfUrl || null,
                    open_access_pdf: pdfUrl || null,
                    source: 'Semantic Scholar',
                    is_open_access: !!pdfUrl,
                    citation_count: item.citationCount || 0,
                    journal: item.venue
                };
            } catch (err) {
                console.warn('[Semantic Scholar] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default SemanticScholarClient;
