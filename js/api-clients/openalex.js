// ============================================================================
// OPENALEX.JS - OpenAlex API client (CORS-enabled)
// ============================================================================
// API Docs: https://docs.openalex.org/

import BaseAPIClient from './base.js';

export class OpenAlexClient extends BaseAPIClient {
    constructor() {
        super('OpenAlex');
        this.baseUrl = 'https://api.openalex.org/works';
    }

    /**
     * Search OpenAlex papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                search: query,
                'per-page': limit,
                mailto: 'research@sourcecrate.org' // Polite pool requires email
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                console.warn(`[OpenAlex] HTTP ${response.status}`);
                return [];
            }

            const data = await response.json();
            return this.parseOpenAlexResponse(data);
        } catch (error) {
            console.error(`[OpenAlex] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse OpenAlex JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseOpenAlexResponse(data) {
        if (!data.results) return [];

        return data.results.map(item => {
            try {
                // Authors
                const authors = item.authorships?.map(a => a.author?.display_name).filter(Boolean) || [];

                // Year
                const year = item.publication_year;

                // DOI
                const doi = item.doi?.replace('https://doi.org/', '');

                // PDF URL
                const pdfUrl = item.open_access?.oa_url || item.primary_location?.pdf_url;

                // Journal
                const journal = item.primary_location?.source?.display_name;

                return {
                    title: item.title,
                    authors,
                    abstract: item.abstract_inverted_index ? this.reconstructAbstract(item.abstract_inverted_index) : null,
                    year,
                    doi,
                    url: item.id,
                    pdf_url: pdfUrl,
                    open_access_pdf: pdfUrl,
                    source: 'OpenAlex',
                    is_open_access: item.open_access?.is_oa || false,
                    citation_count: item.cited_by_count || 0,
                    journal
                };
            } catch (err) {
                console.warn('[OpenAlex] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }

    /**
     * Reconstruct abstract from inverted index
     * @param {Object} invertedIndex - Inverted index
     * @returns {string} Reconstructed abstract
     */
    reconstructAbstract(invertedIndex) {
        try {
            const words = [];
            for (const [word, positions] of Object.entries(invertedIndex)) {
                positions.forEach(pos => {
                    words[pos] = word;
                });
            }
            return words.filter(Boolean).join(' ').substring(0, 500); // Limit to 500 chars
        } catch {
            return null;
        }
    }
}

export default OpenAlexClient;
