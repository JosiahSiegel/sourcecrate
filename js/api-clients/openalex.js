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
            this.lastError = error.message;
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
                // oa_url may be an HTML landing page. Only location.pdf_url
                // identifies a provider-declared PDF (still unverified until fetched).
                const pdfUrl = item.best_oa_location?.pdf_url || item.primary_location?.pdf_url ||
                    item.locations?.find(location => location.is_oa && location.pdf_url)?.pdf_url || null;
                const pageUrl = item.best_oa_location?.landing_page_url || item.open_access?.oa_url ||
                    item.primary_location?.landing_page_url || item.doi || item.id;

                // Journal
                const journal = item.primary_location?.source?.display_name;

                return {
                    title: item.title,
                    authors,
                    abstract: item.abstract_inverted_index ? this.reconstructAbstract(item.abstract_inverted_index) : null,
                    year,
                    doi,
                    url: pageUrl,
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
            return words.filter(Boolean).join(' ');
        } catch {
            return null;
        }
    }
}

export default OpenAlexClient;
