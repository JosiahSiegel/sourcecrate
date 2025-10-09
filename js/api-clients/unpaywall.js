// ============================================================================
// UNPAYWALL.JS - Unpaywall API client (CORS-enabled)
// ============================================================================
// API Docs: https://unpaywall.org/products/api
// Rate Limits: 100,000 requests per day (free tier)

import BaseAPIClient from './base.js';

export class UnpaywallClient extends BaseAPIClient {
    constructor() {
        super('Unpaywall');
        this.baseUrl = 'https://api.unpaywall.org/v2/search';
    }

    /**
     * Search Unpaywall papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            // Unpaywall requires page parameter and returns 50 results per page
            const params = new URLSearchParams({
                query: query,
                is_oa: 'true', // Only return open access papers
                page: '1',
                email: 'research@sourcecrate.org' // Required by Unpaywall (must be real email)
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url, 30000); // 30s timeout

            if (!response.ok) {
                console.warn(`[Unpaywall] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseUnpaywallResponse(data, limit);
        } catch (error) {
            console.error(`[Unpaywall] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse Unpaywall JSON response
     * @param {Object} data - JSON response
     * @param {number} limit - Max results to return
     * @returns {Array} Normalized papers
     */
    parseUnpaywallResponse(data, limit) {
        if (!data.results) return [];

        return data.results.slice(0, limit).map(item => {
            try {
                const response = item.response || {};

                // Authors
                const authors = response.z_authors?.map(a => a.family
                    ? `${a.given || ''} ${a.family}`.trim()
                    : a.given || ''
                ).filter(Boolean) || [];

                // Best OA location for PDF
                const bestOA = response.best_oa_location;
                const pdfUrl = bestOA?.url_for_pdf || bestOA?.url;

                return {
                    title: response.title,
                    authors,
                    abstract: response.abstract,
                    year: response.year ? parseInt(response.year) : null,
                    doi: response.doi,
                    url: response.doi_url || `https://doi.org/${response.doi}`,
                    pdf_url: pdfUrl || null,
                    open_access_pdf: pdfUrl || null,
                    source: 'Unpaywall',
                    is_open_access: response.is_oa === true,
                    citation_count: 0, // Unpaywall doesn't provide citation counts
                    journal: response.journal_name
                };
            } catch (err) {
                console.warn('[Unpaywall] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default UnpaywallClient;
