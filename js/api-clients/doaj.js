// ============================================================================
// DOAJ.JS - Directory of Open Access Journals API client (CORS-enabled)
// ============================================================================
// API Docs: https://doaj.org/api/v4/docs

import BaseAPIClient from './base.js';

export class DOAJClient extends BaseAPIClient {
    constructor() {
        super('DOAJ');
        this.baseUrl = 'https://doaj.org/api/v4/search/articles/_search';
    }

    /**
     * Search DOAJ papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                q: query,
                pageSize: limit
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                console.warn(`[DOAJ] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseDOAJResponse(data);
        } catch (error) {
            console.error(`[DOAJ] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse DOAJ JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseDOAJResponse(data) {
        if (!data.results) return [];

        return data.results.map(item => {
            try {
                const bibjson = item.bibjson || {};

                // Authors
                const authors = bibjson.author?.map(a => a.name).filter(Boolean) || [];

                // DOI
                const doiObj = bibjson.identifier?.find(id => id.type === 'doi');
                const doi = doiObj?.id;

                // PDF URL - check links for PDF
                const pdfLink = bibjson.link?.find(link =>
                    link.type === 'fulltext' || link.content_type === 'PDF'
                );

                return {
                    title: bibjson.title,
                    authors,
                    abstract: bibjson.abstract,
                    year: bibjson.year ? parseInt(bibjson.year) : null,
                    doi,
                    url: bibjson.link?.[0]?.url || null,
                    pdf_url: pdfLink?.url || null,
                    open_access_pdf: pdfLink?.url || null,
                    source: 'DOAJ',
                    is_open_access: true, // All DOAJ articles are open access
                    citation_count: 0,
                    journal: bibjson.journal?.title
                };
            } catch (err) {
                console.warn('[DOAJ] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default DOAJClient;
