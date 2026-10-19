// ============================================================================
// DATACITE.JS - DataCite API client (CORS-enabled)
// ============================================================================
// API Docs: https://support.datacite.org/docs/api

import BaseAPIClient from './base.js';

export class DataCiteClient extends BaseAPIClient {
    constructor({ clientId } = {}) {
        super('DataCite');
        this.baseUrl = 'https://api.datacite.org/dois';
        this.clientId = clientId;
        // Two attempts, including backoff, fit inside the shared 25-second search budget.
        this.timeout = 9000;
    }

    /**
     * Search DataCite DOIs
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        this.lastError = null;
        const params = new URLSearchParams({
            query,
            'page[size]': limit,
            'page[number]': 1,
            'fields[dois]': 'doi,titles,creators,descriptions,publicationYear,url,publisher'
        });
        if (this.clientId) params.set('client-id', this.clientId);
        const url = `${this.baseUrl}?${params}`;
        for (let attempt = 0; attempt < 2; attempt++) {
            let retry = false;
            let delay = 500;
            try {
                this.signal?.throwIfAborted();
                const response = await this.fetchWithTimeout(url);
                if (response.ok) {
                    const papers = this.parseDataCiteResponse(await response.json());
                    this.lastError = null;
                    return papers;
                }
                retry = response.status === 429 || response.status >= 500;
                const retryAfter = response.headers.get('Retry-After');
                if (retryAfter !== null) {
                    const seconds = Number(retryAfter);
                    const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
                    if (Number.isFinite(requested)) delay = Math.max(delay, requested);
                }
                await response.body?.cancel();
            } catch (error) {
                this.lastError = error.message;
                retry = error instanceof TypeError || error.name === 'TimeoutError' || /request timeout after/.test(error.message);
            }
            // Do not retry invalid requests, caller cancellation, or long rate limits.
            if (!retry || attempt === 1 || this.signal?.aborted || delay > 1000) break;
            try {
                await this.waitForRetry(delay);
            } catch (error) {
                this.lastError = error.message;
                break;
            }
        }
        return [];
    }

    waitForRetry(delay) {
        return new Promise((resolve, reject) => {
            const finish = () => { this.signal?.removeEventListener('abort', abort); resolve(); };
            const timer = setTimeout(finish, delay);
            const abort = () => {
                clearTimeout(timer);
                this.signal?.removeEventListener('abort', abort);
                reject(this.signal.reason || new Error('Search cancelled'));
            };
            this.signal?.addEventListener('abort', abort, { once: true });
            if (this.signal?.aborted) abort();
        });
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
