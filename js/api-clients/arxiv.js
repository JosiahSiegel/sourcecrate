// ============================================================================
// ARXIV.JS - arXiv API client (CORS-enabled)
// ============================================================================
// API Docs: https://arxiv.org/help/api/index

import BaseAPIClient from './base.js';

export class ArxivClient extends BaseAPIClient {
    constructor() {
        super('arXiv');
        this.baseUrl = 'https://export.arxiv.org/api/query';
    }

    /**
     * Search arXiv papers
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            const params = new URLSearchParams({
                search_query: `all:${query}`,
                start: 0,
                max_results: limit,
                sortBy: 'relevance',
                sortOrder: 'descending'
            });

            const url = `${this.baseUrl}?${params}`;
            const response = await this.fetchWithTimeout(url, {}, 'high'); // High priority: fast source

            if (!response.ok) {
                console.warn(`[arXiv] HTTP ${response.status}`);
                return [];
            }

            const xmlText = await response.text();
            return this.parseArxivXML(xmlText);
        } catch (error) {
            console.error(`[arXiv] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse arXiv Atom XML response
     * @param {string} xmlText - XML response
     * @returns {Array} Normalized papers
     */
    parseArxivXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const entries = xmlDoc.querySelectorAll('entry');
        const papers = [];

        entries.forEach(entry => {
            try {
                const title = entry.querySelector('title')?.textContent?.trim();
                const summary = entry.querySelector('summary')?.textContent?.trim();
                const published = entry.querySelector('published')?.textContent;
                const id = entry.querySelector('id')?.textContent;

                // Extract arXiv ID and build PDF URL
                const arxivId = id?.split('/abs/')[1];
                const pdfUrl = arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : null;

                // Parse authors
                const authorNodes = entry.querySelectorAll('author name');
                const authors = Array.from(authorNodes).map(node => node.textContent.trim());

                // Parse year
                const year = published ? new Date(published).getFullYear() : null;

                // Get DOI if available
                const doiElement = Array.from(entry.querySelectorAll('link')).find(
                    link => link.getAttribute('title') === 'doi'
                );
                const doi = doiElement?.getAttribute('href')?.replace('https://doi.org/', '');

                papers.push({
                    title,
                    authors,
                    abstract: summary,
                    year,
                    doi,
                    url: id,
                    pdf_url: pdfUrl,
                    open_access_pdf: pdfUrl,
                    source: 'arXiv',
                    is_open_access: true,
                    citation_count: 0, // arXiv doesn't provide citations
                    journal: 'arXiv (preprint)'
                });
            } catch (err) {
                console.warn('[arXiv] Failed to parse entry:', err);
            }
        });

        return papers;
    }
}

export default ArxivClient;
