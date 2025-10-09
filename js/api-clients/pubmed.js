// ============================================================================
// PUBMED.JS - PubMed API client (CORS-enabled)
// ============================================================================
// API Docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/

import BaseAPIClient from './base.js';

export class PubMedClient extends BaseAPIClient {
    constructor() {
        super('PubMed');
        this.searchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
        this.fetchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
    }

    /**
     * Search PubMed papers (two-step: search then fetch)
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Array of papers
     */
    async search(query, limit = 10) {
        try {
            // Step 1: Search for PMIDs
            const searchParams = new URLSearchParams({
                db: 'pubmed',
                term: query,
                retmax: limit,
                retmode: 'json',
                sort: 'relevance'
            });

            const searchUrl = `${this.searchUrl}?${searchParams}`;
            const searchResponse = await this.fetchWithTimeout(searchUrl);

            if (!searchResponse.ok) {
                console.warn(`[PubMed] Search HTTP ${searchResponse.status}`);
                return [];
            }

            const searchData = await searchResponse.json();
            const pmids = searchData.esearchresult?.idlist || [];

            if (pmids.length === 0) return [];

            // Step 2: Fetch details for PMIDs
            const fetchParams = new URLSearchParams({
                db: 'pubmed',
                id: pmids.join(','),
                retmode: 'xml'
            });

            const fetchUrl = `${this.fetchUrl}?${fetchParams}`;
            const fetchResponse = await this.fetchWithTimeout(fetchUrl);

            if (!fetchResponse.ok) {
                console.warn(`[PubMed] Fetch HTTP ${fetchResponse.status}`);
                return [];
            }

            const xmlText = await fetchResponse.text();
            return this.parsePubMedXML(xmlText);
        } catch (error) {
            console.error(`[PubMed] Search error:`, error);
            return [];
        }
    }

    /**
     * Parse PubMed XML response
     * @param {string} xmlText - XML response
     * @returns {Array} Normalized papers
     */
    parsePubMedXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const articles = xmlDoc.querySelectorAll('PubmedArticle');
        const papers = [];

        articles.forEach(article => {
            try {
                const medlineCitation = article.querySelector('MedlineCitation');
                const pmid = medlineCitation?.querySelector('PMID')?.textContent;

                // Title
                const title = medlineCitation?.querySelector('ArticleTitle')?.textContent?.trim();

                // Abstract
                const abstractNodes = medlineCitation?.querySelectorAll('AbstractText');
                const abstract = abstractNodes
                    ? Array.from(abstractNodes).map(n => n.textContent).join(' ')
                    : null;

                // Authors
                const authorNodes = medlineCitation?.querySelectorAll('Author');
                const authors = authorNodes
                    ? Array.from(authorNodes).map(author => {
                        const lastName = author.querySelector('LastName')?.textContent || '';
                        const foreName = author.querySelector('ForeName')?.textContent || '';
                        return `${foreName} ${lastName}`.trim();
                    }).filter(Boolean)
                    : [];

                // Year
                const pubDate = medlineCitation?.querySelector('PubDate');
                const year = pubDate?.querySelector('Year')?.textContent
                    ? parseInt(pubDate.querySelector('Year').textContent)
                    : null;

                // Journal
                const journal = medlineCitation?.querySelector('Journal Title')?.textContent;

                // DOI
                const articleIdList = article.querySelector('ArticleIdList');
                const doiNode = articleIdList
                    ? Array.from(articleIdList.querySelectorAll('ArticleId')).find(
                        id => id.getAttribute('IdType') === 'doi'
                    )
                    : null;
                const doi = doiNode?.textContent;

                // Build PubMed URL
                const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null;

                // PubMed Central link (if available)
                const pmcNode = articleIdList
                    ? Array.from(articleIdList.querySelectorAll('ArticleId')).find(
                        id => id.getAttribute('IdType') === 'pmc'
                    )
                    : null;
                const pmcId = pmcNode?.textContent;
                const pdfUrl = pmcId ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/pdf/` : null;

                papers.push({
                    title,
                    authors,
                    abstract,
                    year,
                    doi,
                    url,
                    pdf_url: pdfUrl,
                    open_access_pdf: pdfUrl,
                    source: 'PubMed',
                    is_open_access: !!pdfUrl,
                    citation_count: 0, // PubMed doesn't provide citation counts in API
                    journal
                });
            } catch (err) {
                console.warn('[PubMed] Failed to parse article:', err);
            }
        });

        return papers;
    }
}

export default PubMedClient;
