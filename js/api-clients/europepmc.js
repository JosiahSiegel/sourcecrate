// ============================================================================
// EUROPEPMC.JS - Europe PMC API client (CORS-enabled)
// ============================================================================
// API Docs: https://europepmc.org/RestfulWebService
// NOTE: As of January 2025, the API endpoint appears to be returning 404 errors.
//       This may be a temporary outage or service migration.
//       The client handles errors gracefully and won't block other sources.

import BaseAPIClient from './base.js';

export class EuropePMCClient extends BaseAPIClient {
    constructor() {
        super('Europe PMC');
        this.baseUrl = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
        // Alternative endpoint to try if main fails:
        // 'https://europepmc.org/webservices/rest/search'
    }

    /**
     * Search Europe PMC papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                query: query,
                format: 'json',
                pageSize: limit,
                resultType: 'core'
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                // Log warning but don't fail - graceful degradation
                console.warn(`[Europe PMC] HTTP ${response.status} - API may be temporarily unavailable`);
                return [];
            }

            const data = await response.json();
            return this.parseEuropePMCResponse(data);
        } catch (error) {
            // Gracefully handle errors - don't block other sources
            console.warn(`[Europe PMC] Skipping source due to error:`, error.message);
            return [];
        }
    }

    /**
     * Parse Europe PMC JSON response
     * @param {Object} data - JSON response
     * @returns {Array} Normalized papers
     */
    parseEuropePMCResponse(data) {
        if (!data.resultList?.result) return [];

        return data.resultList.result.map(item => {
            try {
                // Authors - handle authorString or authorList
                let authors = [];
                if (item.authorString) {
                    authors = item.authorString.split(', ');
                } else if (item.authorList?.author) {
                    authors = item.authorList.author.map(a =>
                        `${a.firstName || ''} ${a.lastName || ''}`.trim()
                    ).filter(Boolean);
                }

                // Full text URLs
                const fullTextUrls = item.fullTextUrlList?.fullTextUrl || [];
                const pdfUrl = fullTextUrls.find(u => u.documentStyle === 'pdf')?.url;

                return {
                    title: item.title,
                    authors,
                    abstract: item.abstractText,
                    year: item.pubYear ? parseInt(item.pubYear) : null,
                    doi: item.doi,
                    url: `https://europepmc.org/article/${item.source}/${item.id}`,
                    pdf_url: pdfUrl || null,
                    open_access_pdf: pdfUrl || null,
                    source: 'Europe PMC',
                    is_open_access: item.isOpenAccess === 'Y',
                    citation_count: parseInt(item.citedByCount) || 0,
                    journal: item.journalTitle
                };
            } catch (err) {
                console.warn('[Europe PMC] Failed to parse item:', err);
                return null;
            }
        }).filter(Boolean);
    }
}

export default EuropePMCClient;
