// ============================================================================
// RENDERING.JS - UI rendering functions for paper cards and source links
// ============================================================================

import {
    isValidUrl,
    isValidPdfUrl,
    isKnownBrokenUrl,
    getFullDoiUrl,
    normalizeDoi,
    sanitizeFilename,
    stripHtmlTags,
    truncateText,
    formatAuthors,
    formatJournal,
    deduplicateSourceLinks,
    getPaperKey,
    applyFilters,
    sortByRelevance
} from './utils.js';
import {
    papersByKey,
    sourcesCompleted,
    totalSources,
    pdfOnlyFilter,
    relevanceThreshold,
    renderedPaperKeys,
    bm25ScoringComplete,
    DownloadReliability
} from './state.js';
import {
    getPaperCollections
} from './bookmarks.js';

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
 * @returns {string} HTML for source links
 */
function buildSourceLinks(paper) {
    const sourceLinks = paper._source_links || [];
    const filename = sanitizeFilename(paper.title);

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

    let html = '<div class="source-access-container">';

    // Primary action: Download PDF button
    if (pdfs.length > 0) {
        const primaryPdf = pdfs[0];
        const downloadId = `download_${Math.random().toString(36).substr(2, 9)}`;

        html += `<div class="primary-pdf-action">
            <a href="${primaryPdf.url}"
               download="${filename}"
               target="_blank"
               rel="noopener noreferrer"
               class="btn btn-primary btn-pdf-download"
               data-pdf-url="${primaryPdf.url}"
               id="${downloadId}"
               onclick="window.trackDownloadAttempt(this.dataset.pdfUrl, this.id); return true;">
               <span class="pdf-icon">📄</span> ${primaryPdf.label}
            </a>`;

        // Progressive disclosure: Alternate PDFs
        if (pdfs.length > 1) {
            html += `<details class="alternate-pdfs-dropdown">
                <summary>+${pdfs.length - 1} more PDF${pdfs.length > 2 ? 's' : ''}</summary>
                <ul class="alternate-pdf-list">`;

            pdfs.slice(1).forEach(access => {
                const altDownloadId = `download_${Math.random().toString(36).substr(2, 9)}`;
                html += `<li>
                    <a href="${access.url}"
                       download="${filename}"
                       target="_blank"
                       rel="noopener noreferrer"
                       data-pdf-url="${access.url}"
                       id="${altDownloadId}"
                       onclick="window.trackDownloadAttempt(this.dataset.pdfUrl, this.id); return true;">
                       ${access.label}
                    </a>
                </li>`;
            });

            html += `</ul></details>`;
        }

        html += `</div>`;
    }

    // Source chips
    if (uniquePages.length > 0) {
        // Sort: DOI first, then by citation count
        const sortedPages = [...uniquePages].sort((a, b) => {
            const aIsDoi = a.url && a.url.includes('doi.org/');
            const bIsDoi = b.url && b.url.includes('doi.org/');

            if (aIsDoi && !bIsDoi) return -1;
            if (!aIsDoi && bIsDoi) return 1;

            const countA = parseInt(a.citation_count) || 0;
            const countB = parseInt(b.citation_count) || 0;
            return countB - countA;
        });

        html += `<div class="all-sources-chips">
            <span class="sources-label">Sources:</span>`;

        sortedPages.forEach(access => {
            if (!access.url || !isValidUrl(access.url)) return;

            const citationCount = parseInt(access.citation_count) || 0;

            let citationClass = '';
            if (citationCount >= 100) {
                citationClass = 'citation-tier-high';
            } else if (citationCount >= 50) {
                citationClass = 'citation-tier-medium';
            } else if (citationCount >= 10) {
                citationClass = 'citation-tier-low';
            } else if (citationCount > 0) {
                citationClass = 'citation-tier-minimal';
            }

            const citationText = citationCount > 0
                ? ` <span class="source-citations ${citationClass}">(${citationCount.toLocaleString()})</span>`
                : '';

            const isDoiUrl = access.url.includes('doi.org/');
            const chipClass = isDoiUrl ? 'source-chip-doi' : 'source-chip-page';

            let displayLabel = access.label;
            if (isDoiUrl) {
                displayLabel = 'DOI';
            } else {
                const dbSources = ['crossref', 'semantic scholar', 'pubmed', 'arxiv', 'google scholar', 'europe pmc', 'doaj', 'core'];
                const labelLower = access.label.toLowerCase();
                if (dbSources.some(db => labelLower.includes(db))) {
                    displayLabel = 'Publisher';
                }
            }

            html += `<a href="${access.url}"
                       target="_blank"
                       class="source-chip ${chipClass}"
                       title="${isDoiUrl ? 'DOI Resolver' : 'Publisher page'}">
                       ${displayLabel}${citationText}
                     </a>`;
        });

        html += `</div>`;
    }

    // Google Scholar fallback removed - rarely used, saves ~300 bytes

    html += '</div>';
    return html;
}

// buildLegacyLinks removed - merged into unified buildSourceLinks function

/**
 * Build a paper card HTML
 * @param {Object} paper - Paper object
 * @param {number} index - Card index
 * @param {boolean} showBadge - Show streaming badge
 * @param {Object} options - Optional rendering options
 * @param {boolean} options.showCollectionSelector - Show collection dropdown
 * @param {string} options.currentCollectionId - Current collection ID
 * @param {Array} options.collections - Array of collection objects
 * @returns {string} HTML for paper card
 */
export function buildPaperCard(paper, index, showBadge = true, options = {}) {
    // Limit authors display to first 5
    let authors;
    if (Array.isArray(paper.authors) && paper.authors.length > 5) {
        authors = formatAuthors(paper.authors.slice(0, 5)) + ' et al.';
    } else {
        authors = formatAuthors(paper.authors);
    }

    const journal = truncateText(formatJournal(paper.journal), 100);
    const cleanAbstract = stripHtmlTags(paper.abstract);
    const abstract = truncateText(cleanAbstract, 500);
    const accessLinks = buildSourceLinks(paper);

    // Use data attribute for title to avoid escaping issues in onclick
    const safeTitle = (paper.title || 'Untitled').replace(/"/g, '&quot;');

    // Build research metadata badges
    let metadataBadges = '';

    // DOI Badge with copy icon
    if (paper.doi) {
        const fullDoiUrl = getFullDoiUrl(paper.doi);
        metadataBadges += `<span class="metadata-badge badge-doi"
                                 title="${fullDoiUrl} (click to copy)"
                                 onclick="navigator.clipboard.writeText('${fullDoiUrl}')"
                                 onkeypress="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigator.clipboard.writeText('${fullDoiUrl}')}"
                                 tabindex="0"
                                 role="button"
                                 aria-label="Copy DOI to clipboard"
                                 style="cursor: pointer;">
                             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                             </svg>
                             DOI
                           </span>`;
    }

    // Open Access Badge
    const isOpenAccess = paper.is_open_access || paper.isOpenAccess || paper.open_access;
    if (isOpenAccess) {
        metadataBadges += `<span class="metadata-badge badge-open-access" title="Open Access - Free to read and reuse">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                             </svg>
                             Open Access
                           </span>`;
    }

    // Preprint Badge
    const preprintSources = ['arxiv', 'biorxiv', 'medrxiv', 'socarxiv', 'osf preprints', 'preprint'];
    const isPreprint = paper.source && preprintSources.some(ps => paper.source.toLowerCase().includes(ps));
    if (isPreprint) {
        metadataBadges += `<span class="metadata-badge badge-preprint" title="Preprint - Not peer-reviewed">
                             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.25rem;">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                             </svg>
                             Preprint
                           </span>`;
    }

    // Citation Count Badge (simplified)
    const citationCount = parseInt(paper.citation_count) || 0;
    if (citationCount > 0) {
        const citationLabel = citationCount >= 1000 ? `${(citationCount/1000).toFixed(1)}k` : citationCount.toLocaleString();
        metadataBadges += `<span class="metadata-badge badge-citations" title="${citationCount.toLocaleString()} citation${citationCount !== 1 ? 's' : ''}">
                             ${citationLabel}
                           </span>`;
    }

    // Get paper key for bookmark functionality
    const paperKey = getPaperKey(paper);

    // Collection selector (minimal dropdown, bookmarks view only)
    let collectionSelector = '';
    if (options.showCollectionSelector && options.collections) {
        // Get collections this paper is already in
        const paperCollections = getPaperCollections(paperKey);

        // Filter out: 'all' collection, collections paper is already in
        const availableCollections = options.collections.filter(c =>
            c.id !== 'all' && !paperCollections.includes(c.id)
        );

        if (availableCollections.length > 0) {
            collectionSelector = `
                <div class="collection-add-dropdown-wrapper">
                    <button type="button" class="collection-add-dropdown-btn" data-paper-key="${paperKey}">
                        Add to collection... ▾
                    </button>
                    <div class="collection-add-dropdown-menu" style="display: none;">
                        ${availableCollections.map(c =>
                            `<button type="button" data-collection-id="${c.id}" data-paper-key="${paperKey}">${c.name}</button>`
                        ).join('')}
                    </div>
                </div>`;
        }
    }

    return `
        <div class="paper-card ${showBadge ? 'paper-card-streaming' : ''}" data-paper-key="${paperKey}">
            <div class="paper-header">
                <div class="paper-title-actions">
                    <h3>
                        ${paper.title || 'Untitled'}
                        <span class="title-search-icon"
                              data-title="${safeTitle}"
                              onclick="searchByTitle(this.dataset.title)"
                              title="Search for this paper"
                              role="button"
                              tabindex="0"
                              onkeypress="if(event.key==='Enter'||event.key===' ')searchByTitle(this.dataset.title)"
                              aria-label="Search for this paper">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                        </span>
                    </h3>
                    <button class="bookmark-btn"
                            data-paper-key="${paperKey}"
                            onclick="window.togglePaperBookmark(this)"
                            aria-pressed="false"
                            aria-label="Bookmark this paper">
                        <svg class="bookmark-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                </div>
            </div>
            ${collectionSelector}
            ${metadataBadges ? `<div class="research-metadata-badges">${metadataBadges}</div>` : ''}
            <div class="paper-meta">
                <span class="paper-authors">${authors}</span>
                ${paper.year ? `<span class="paper-year">${paper.year}</span>` : ''}
                ${journal ? `<span class="paper-journal">${journal}</span>` : ''}
            </div>
            ${abstract ? `<p class="paper-abstract">${abstract}</p>` : ''}
            ${accessLinks}
        </div>
    `;
}

/**
 * Update citation badge for an existing paper card in the DOM
 * @param {string} paperKey - The unique key for the paper
 * @param {number} citationCount - The new citation count
 */
export function updateCitationBadge(paperKey, citationCount) {
    // Find the paper card element
    const cardElement = document.querySelector(`.paper-card[data-paper-key="${paperKey}"]`);
    if (!cardElement) return;

    // Find or create the metadata badges container
    let badgesContainer = cardElement.querySelector('.research-metadata-badges');
    if (!badgesContainer) {
        // Create badges container if it doesn't exist
        badgesContainer = document.createElement('div');
        badgesContainer.className = 'research-metadata-badges';
        const header = cardElement.querySelector('.paper-header');
        if (header) {
            header.insertAdjacentElement('afterend', badgesContainer);
        }
    }

    // Find existing citation badge
    let citationBadge = badgesContainer.querySelector('.badge-citations');

    const count = parseInt(citationCount) || 0;

    if (count > 0) {
        const citationLabel = count >= 1000 ? `${(count/1000).toFixed(1)}k` : count.toLocaleString();
        const badgeHtml = `<span class="metadata-badge badge-citations" title="${count.toLocaleString()} citation${count !== 1 ? 's' : ''}">
                             ${citationLabel}
                           </span>`;

        if (citationBadge) {
            // Update existing badge
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = badgeHtml;
            citationBadge.replaceWith(tempDiv.firstElementChild);
        } else {
            // Add new badge
            badgesContainer.insertAdjacentHTML('beforeend', badgeHtml);
        }
    } else if (citationBadge) {
        // Remove badge if count is 0
        citationBadge.remove();
    }
}

/**
 * Update results summary
 * @param {number} count - Number of results
 * @param {boolean} searchComplete - Whether search and scoring are complete
 * @param {number} effectiveThreshold - Actual threshold used (may be lowered from default)
 */
export function updateResultsSummary(count, searchComplete, effectiveThreshold = relevanceThreshold) {
    const pdfInfo = pdfOnlyFilter ? ` with direct download` : '';
    const isLoading = totalSources > 0 && sourcesCompleted < totalSources;
    const isComplete = totalSources > 0 && sourcesCompleted === totalSources;

    const spinner = isLoading ? '<div class="loading-spinner"></div>' : '';

    let summaryHtml;

    if (!searchComplete) {
        // Still processing - don't show count to avoid confusing fluctuation
        summaryHtml = `${spinner}<p>Searching... (${sourcesCompleted}/${totalSources || '?'} sources completed)</p>`;
    } else {
        // Processing complete - show final count
        const statusIcon = isComplete ? '✅ ' : '';
        const statusText = isComplete ? 'Search complete! Found' : 'Found';

        summaryHtml = `${spinner}<p>${statusIcon}${statusText} <strong>${count}</strong> papers${pdfInfo} (${sourcesCompleted}/${totalSources || '?'} sources completed)</p>`;
    }

    let summaryDiv = document.getElementById('results-summary');

    if (!summaryDiv) {
        summaryDiv = document.createElement('div');
        summaryDiv.id = 'results-summary';
        summaryDiv.className = 'results-summary';
        summaryDiv.setAttribute('role', 'status');
        summaryDiv.setAttribute('aria-live', 'polite');
        summaryDiv.setAttribute('aria-atomic', 'true');

        const resultsDiv = document.getElementById('results');
        resultsDiv.insertBefore(summaryDiv, resultsDiv.firstChild);
    }

    summaryDiv.innerHTML = summaryHtml;
}

/**
 * Render streaming results incrementally
 */
export function renderStreamingResults() {
    const resultsDiv = document.getElementById('results');

    // Get all papers from source of truth
    const allPapers = Array.from(papersByKey.values());

    if (allPapers.length === 0) {
        resultsDiv.innerHTML = '<p class="no-results">Searching...</p>';
        return;
    }

    // Check if search is complete (all sources have reported results AND BM25 scoring done)
    const searchComplete = totalSources > 0 && sourcesCompleted >= totalSources && bm25ScoringComplete;

    // Apply filters and sort
    // Use bm25ScoringComplete for relevance filter to avoid filtering on heuristic scores
    let filteredResults = applyFilters(allPapers, pdfOnlyFilter, relevanceThreshold, bm25ScoringComplete);

    // Dynamic threshold lowering: If BM25 complete and no results, progressively lower threshold
    let effectiveThreshold = relevanceThreshold;
    if (bm25ScoringComplete && filteredResults.length === 0 && allPapers.length > 0) {
        const fallbackThresholds = [25, 15, 5, 0];
        for (const threshold of fallbackThresholds) {
            filteredResults = applyFilters(allPapers, pdfOnlyFilter, threshold, true);
            if (filteredResults.length > 0) {
                effectiveThreshold = threshold;
                break;
            }
        }
    }

    filteredResults = sortByRelevance([...filteredResults]);

    // Update summary (pass searchComplete to conditionally show count)
    updateResultsSummary(filteredResults.length, searchComplete, effectiveThreshold);

    // Get existing results container or create it
    let resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) {
        resultsDiv.innerHTML = '';

        resultsContainer = document.createElement('div');
        resultsContainer.id = 'results-container';
        resultsDiv.appendChild(resultsContainer);
    }

    // Smart DOM manipulation: only insert/move cards that changed position
    // This achieves sorted order during streaming WITHOUT flashing

    // Identify new papers
    const newPapers = filteredResults.filter(paper => !renderedPaperKeys.has(getPaperKey(paper)));

    if (newPapers.length === 0 && renderedPaperKeys.size === filteredResults.length) {
        return; // No changes needed
    }

    // If container is empty (e.g., after filter toggle), use fast path
    if (resultsContainer.children.length === 0) {
        const fragment = document.createDocumentFragment();

        filteredResults.forEach((paper, index) => {
            const key = getPaperKey(paper);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = buildPaperCard(paper, index, !searchComplete);
            const cardElement = tempDiv.firstElementChild;

            if (cardElement) {
                cardElement.dataset.paperKey = key;
                fragment.appendChild(cardElement);
                renderedPaperKeys.add(key);
            }
        });

        resultsContainer.appendChild(fragment);
        return;
    }

    // Incremental update: insert new papers and reorder existing ones
    // Process in forward order for correct insertion into populated DOM
    filteredResults.forEach((paper, targetIndex) => {
        const key = getPaperKey(paper);

        // Check if this is a new paper
        if (!renderedPaperKeys.has(key)) {
            // Create new card
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = buildPaperCard(paper, targetIndex, !searchComplete);
            const cardElement = tempDiv.firstElementChild;

            if (!cardElement) return;

            cardElement.dataset.paperKey = key;

            // Insert at correct position
            const referenceNode = resultsContainer.children[targetIndex];
            if (referenceNode) {
                resultsContainer.insertBefore(cardElement, referenceNode);
            } else {
                resultsContainer.appendChild(cardElement);
            }

            renderedPaperKeys.add(key);
        } else if (targetIndex < 20) {
            // Existing paper - check if it needs to move (only check top 20)
            const currentCard = Array.from(resultsContainer.children).find(
                card => card.dataset.paperKey === key
            );

            if (currentCard) {
                const currentIndex = Array.from(resultsContainer.children).indexOf(currentCard);

                // Only move if position changed
                if (currentIndex !== targetIndex) {
                    const referenceNode = resultsContainer.children[targetIndex];
                    if (referenceNode && referenceNode !== currentCard) {
                        resultsContainer.insertBefore(currentCard, referenceNode);
                    }
                }
            }
        }
    });
}
