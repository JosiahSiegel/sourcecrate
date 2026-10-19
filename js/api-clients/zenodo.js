// ============================================================================
// ZENODO.JS - Zenodo API client (CORS-enabled)
// ============================================================================
// API Docs: https://developers.zenodo.org/
// Rate Limits: Guest users: 60 req/min, 2000 req/hour

import BaseAPIClient from './base.js';
import DataCiteClient from './datacite.js';

export class ZenodoClient extends BaseAPIClient {
    constructor() {
        super('Zenodo');
        this.baseUrl = 'https://zenodo.org/api/records/';
        // Reserve time for the public metadata index if the direct API is unavailable.
        this.timeout = 5000;
    }

    /**
     * Search Zenodo records
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        this.lastError = null;
        this.lastWarning = null;
        this.lastVia = null;
        try {
            this.signal?.throwIfAborted();
            const params = new URLSearchParams({
                q: query,
                size: limit,
                page: 1,
                sort: 'bestmatch'
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url);

            if (!response.ok) {
                await response.body?.cancel();
                if (response.status !== 403 && response.status !== 429 && response.status < 500) return [];
            } else {
                const data = await response.json();
                return this.parseZenodoResponse(data);
            }
        } catch (error) {
            this.lastError = error.message;
        }
        if (this.signal?.aborted) return [];

        // Public DOI metadata, not a proxy for Zenodo's network restriction. Do not
        // invent file links: this index cannot supply Zenodo's direct downloads.
        const directError = this.lastError;
        const fallback = new DataCiteClient({ clientId: 'cern.zenodo' });
        fallback.signal = this.signal;
        const papers = await fallback.search(query, limit);
        if (fallback.lastError) {
            this.lastError = `Zenodo: ${directError}; DataCite fallback: ${fallback.lastError}`;
            return [];
        }
        this.lastError = null;
        this.lastVia = 'datacite';
        this.lastWarning = `Zenodo direct search unavailable (${directError}). Using DataCite's Zenodo index; coverage may differ and direct file links are unavailable.`;
        return papers.map(paper => ({ ...paper, source: 'Zenodo', metadata_source: 'DataCite' }));
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
                    is_open_access: metadata.access_right === 'open',
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
