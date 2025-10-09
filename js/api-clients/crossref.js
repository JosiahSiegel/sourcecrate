// ============================================================================
// CROSSREF.JS - CrossRef API client (CORS-enabled)
// ============================================================================
// API Docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/

import BaseAPIClient from './base.js';

export class CrossRefClient extends BaseAPIClient {
    constructor() {
        super('CrossRef');
        this.baseUrl = 'https://api.crossref.org/works';
        this.timeout = 30000; // CrossRef can be slow, increase to 30s
    }

    /**
     * Search CrossRef papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                query: query,
                rows: limit,
                select: 'DOI,title,author,published,abstract,container-title,is-referenced-by-count,URL,link',
                mailto: 'sourcecrate@example.com' // Polite pool for better performance
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url, {}, 'high'); // High priority: fast, reliable source

            if (!response.ok) {
                console.warn(`[CrossRef] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseCrossRefResponse(data);
        } catch (error) {
            console.error(`[CrossRef] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse CrossRef JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseCrossRefResponse(data) {
        if (!data.message?.items) return [];

        return data.message.items.map(item => {
            try {
                // Extract year from published date
                const published = item.published || item['published-print'] || item['published-online'];
                const year = published?.['date-parts']?.[0]?.[0];

                // Format authors
                const authors = item.author?.map(a =>
                    `${a.given || ''} ${a.family || ''}`.trim()
                ) || [];

                // Find PDF link
                let pdfUrl = null;
                if (item.link) {
                    const pdfLink = item.link.find(l =>
                        l['content-type'] === 'application/pdf'
                    );
                    pdfUrl = pdfLink?.URL;
                }

                return {
                    title: item.title?.[0],
                    authors,
                    abstract: item.abstract,
                    year,
                    doi: item.DOI,
                    url: item.URL,
                    pdf_url: pdfUrl,
                    source: 'CrossRef',
                    is_open_access: false, // CrossRef doesn't reliably indicate OA
                    citation_count: item['is-referenced-by-count'] || 0,
                    journal: item['container-title']?.[0]
                };
            } catch (err) {
                console.warn('[CrossRef] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default CrossRefClient;
