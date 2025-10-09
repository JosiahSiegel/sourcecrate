// ============================================================================
// DATACITE.JS - DataCite API client (CORS-enabled)
// ============================================================================
// API Docs: https://support.datacite.org/docs/api
// Rate Limits: Unlimited with reasonable use

import BaseAPIClient from './base.js';

export class DataCiteClient extends BaseAPIClient {
    constructor() {
        super('DataCite');
        this.baseUrl = 'https://api.datacite.org/dois';
    }

    /**
     * Search DataCite DOIs
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                query: query,
                'page[size]': limit,
                'page[number]': 1
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                console.warn(`[DataCite] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseDataCiteResponse(data);
        } catch (error) {
            console.error(`[DataCite] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse DataCite JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseDataCiteResponse(data) {
        if (!data.data) return [];

        return data.data.map(item => {
            try {
                const attributes = item.attributes || {};

                // Authors/Creators
                const authors = attributes.creators?.map(c =>
                    c.name || `${c.givenName || ''} ${c.familyName || ''}`.trim()
                ).filter(Boolean) || [];

                // Title
                const title = attributes.titles?.[0]?.title;

                // Abstract/Description
                const abstract = attributes.descriptions?.find(d =>
                    d.descriptionType === 'Abstract'
                )?.description;

                return {
                    title,
                    authors,
                    abstract,
                    year: attributes.publicationYear ? parseInt(attributes.publicationYear) : null,
                    doi: attributes.doi,
                    url: attributes.url || `https://doi.org/${attributes.doi}`,
                    pdf_url: null, // DataCite focuses on metadata, not PDFs
                    open_access_pdf: null,
                    source: 'DataCite',
                    is_open_access: false,
                    citation_count: parseInt(item.meta?.citationCount) || 0,
                    journal: attributes.publisher
                };
            } catch (err) {
                console.warn('[DataCite] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default DataCiteClient;
