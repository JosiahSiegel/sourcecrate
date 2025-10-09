// ============================================================================
// ZENODO.JS - Zenodo API client (CORS-enabled)
// ============================================================================
// API Docs: https://developers.zenodo.org/
// Rate Limits: Guest users: 60 req/min, 2000 req/hour

import BaseAPIClient from './base.js';

export class ZenodoClient extends BaseAPIClient {
    constructor() {
        super('Zenodo');
        this.baseUrl = 'https://zenodo.org/api/records/';
    }

    /**
     * Search Zenodo records
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                q: query,
                size: limit,
                page: 1,
                sort: 'bestmatch'
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                console.warn(`[Zenodo] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseZenodoResponse(data);
        } catch (error) {
            console.error(`[Zenodo] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse Zenodo JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseZenodoResponse(data) {
        if (!data.hits?.hits) return [];

        return data.hits.hits.map(item => {
            try {
                const metadata = item.metadata || {};

                // Authors/Creators
                const authors = metadata.creators?.map(c =>
                    c.name || `${c.given || ''} ${c.family || ''}`.trim()
                ).filter(Boolean) || [];

                // PDF URL from files
                const pdfFile = item.files?.find(f =>
                    f.type === 'pdf' || f.key?.endsWith('.pdf')
                );
                const pdfUrl = pdfFile?.links?.self;

                // Publication date year
                const year = metadata.publication_date
                    ? new Date(metadata.publication_date).getFullYear()
                    : null;

                return {
                    title: metadata.title,
                    authors,
                    abstract: metadata.description,
                    year,
                    doi: item.doi,
                    url: item.links?.html || `https://zenodo.org/record/${item.id}`,
                    pdf_url: pdfUrl || null,
                    open_access_pdf: pdfUrl || null,
                    source: 'Zenodo',
                    is_open_access: true, // Zenodo is open access repository
                    citation_count: 0, // Zenodo doesn't provide citation counts in API
                    journal: metadata.journal?.title
                };
            } catch (err) {
                console.warn('[Zenodo] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default ZenodoClient;
