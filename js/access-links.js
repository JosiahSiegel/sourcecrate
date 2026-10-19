import { isValidUrl, isValidPdfUrl, isKnownBrokenUrl, getFullDoiUrl, normalizeDoi, deduplicateSourceLinks } from './utils.js';

/**
 * Get best access URL for a source link
 * @param {Object} paper - Paper object
 * @param {Object} link - Source link object
 * @returns {Object|null} Access object or null
 */
function getBestAccessUrl(paper, link) {
    // Check if PDF URL exists and is valid
    if (link.has_pdf && link.pdf_url && isValidUrl(link.pdf_url)) {
        // Check for known broken patterns
        if (isKnownBrokenUrl(link.pdf_url)) {
            // URL is known to be broken - use DOI fallback if available
            if (paper.doi) {
                return {
                    type: 'doi',
                    url: getFullDoiUrl(paper.doi),
                    label: `${link.source} (via DOI)`,
                    source: link.source,
                    citation_count: link.citation_count || 0,
                    is_fallback: true
                };
            }
            // No DOI available, URL is broken, skip this link
            return null;
        }

        // URL appears valid
        return {
            type: 'pdf',
            url: link.pdf_url,
            label: `Download PDF (${link.source})`,
            source: link.source,
            citation_count: link.citation_count || 0,
            is_fallback: false
        };
    }

    // No PDF, check for page URL
    if (link.url && isValidUrl(link.url)) {
        return {
            type: 'page',
            url: link.url,
            label: link.source,
            source: link.source,
            citation_count: link.citation_count || 0,
            is_fallback: false
        };
    }

    return null;
}

/**
 * Build source access links (unified function)
 * @param {Object} paper - Paper object
 * @returns {{html: string, firstUrl: string|null}} Links and the first displayed destination
 */
export function getAccessLinks(paper) {
    const sourceLinks = paper._source_links || [];

    // Collect PDFs and page URLs
    let pdfs = [];
    let allPages = [];

    if (sourceLinks.length > 0) {
        // New path: use _source_links
        const uniqueSourceLinks = deduplicateSourceLinks(sourceLinks);
        const accessUrls = uniqueSourceLinks
            .map(link => getBestAccessUrl(paper, link))
            .filter(access => access !== null);

        pdfs = accessUrls.filter(access => access.type === 'pdf');
        const doiFallbacks = accessUrls.filter(access => access.type === 'doi' && access.is_fallback);
        const pages = accessUrls.filter(access => access.type === 'page');
        allPages = [...pages, ...doiFallbacks];
    } else {
        // Legacy path: use paper.pdf_url and paper.url directly
        const pdfUrl = paper.pdf_url || paper.open_access_pdf;
        if (isValidPdfUrl(pdfUrl) && !isKnownBrokenUrl(pdfUrl)) {
            pdfs.push({
                type: 'pdf',
                url: pdfUrl,
                label: `Download PDF (${paper.source || 'Unknown'})`,
                source: paper.source || 'Unknown'
            });
        }

        // Add page URL if available and not DOI
        if (paper.url && isValidUrl(paper.url) && !paper.url.includes('doi.org/')) {
            allPages.push({
                type: 'page',
                url: paper.url,
                label: paper.source || 'Unknown',
                citation_count: parseInt(paper.citation_count) || 0
            });
        }
    }

    // Ensure DOI link is always included if paper has DOI
    if (paper.doi) {
        const fullDoiUrl = getFullDoiUrl(paper.doi);
        const normalizedDoi = normalizeDoi(paper.doi);

        // Only proceed if we have a valid DOI URL
        if (fullDoiUrl && isValidUrl(fullDoiUrl)) {
            // Check if any existing link is a DOI URL
            let doiLinkIndex = -1;
            for (let i = 0; i < allPages.length; i++) {
                const access = allPages[i];
                if (access.url && access.url.includes('doi.org/')) {
                    const existingNormalizedDoi = normalizeDoi(access.url);
                    if (existingNormalizedDoi === normalizedDoi) {
                        doiLinkIndex = i;
                        break;
                    }
                }
            }

            if (doiLinkIndex >= 0) {
                // Found existing DOI link - update it
                allPages[doiLinkIndex].url = fullDoiUrl;
                allPages[doiLinkIndex].label = 'DOI';
            } else {
                // No DOI link exists - add it
                allPages.push({
                    type: 'page',
                    url: fullDoiUrl,
                    label: 'DOI',
                    source: 'DOI',
                    citation_count: 0,
                    is_fallback: false
                });
            }
        }
    }

    // Deduplicate by URL
    const uniquePages = [];
    const seenUrls = new Set();
    const seenDois = new Set();

    allPages.forEach(access => {
        if (access.url && access.url.includes('doi.org/')) {
            const normalizedDoi = normalizeDoi(access.url);
            if (!seenDois.has(normalizedDoi)) {
                seenDois.add(normalizedDoi);
                seenUrls.add(access.url);
                uniquePages.push(access);
            }
        } else {
            if (!seenUrls.has(access.url)) {
                seenUrls.add(access.url);
                uniquePages.push(access);
            }
        }
    });

    const pages = uniquePages.filter(access => isValidUrl(access.url));
    const hasNonDoi = pages.some(access => !access.url.includes('doi.org/'));
    const visiblePages = pages.filter(access => !hasNonDoi || !access.url.includes('doi.org/'))
        .sort((a, b) => (parseInt(b.citation_count) || 0) - (parseInt(a.citation_count) || 0));
    return { pdfs, pages: visiblePages, firstUrl: pdfs[0]?.url || visiblePages[0]?.url || null };
}
