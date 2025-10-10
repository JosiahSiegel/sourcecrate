// ============================================================================
// APP.JS - Main entry point and event handlers
// ============================================================================

import { API_BASE_URL, DownloadReliability } from './state.js';
import {
    papersByKey,
    pdfOnlyFilter,
    renderedPaperKeys,
    setPdfOnlyFilter
} from './state.js';
import { searchWithClient, searchByTitle as apiSearchByTitle } from './api.js';
import { renderStreamingResults, buildPaperCard } from './rendering.js';
import {
    getBookmarks,
    isBookmarked,
    toggleBookmark,
    getBookmarkStats,
    getCollectionPapers,
    clearAllBookmarks,
    getCollections,
    createCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection
} from './bookmarks.js';
import {
    addToHistory,
    getRecentSearches,
    clearHistory,
    removeFromHistory
} from './history.js';

// ============================================================================
// Service Worker Registration - Cache API responses for instant repeat searches
// ============================================================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .catch(err => console.log('[SW] Registration failed:', err));
    });
}

// ============================================================================
// View State Management
// ============================================================================

let currentView = 'search'; // 'search' or 'bookmarks'
let currentCollection = 'all'; // Currently selected collection
let currentSortOrder = 'date-desc'; // Current sort order for bookmarks
let searchHistoryBlurTimeout = null; // Track blur timeout to prevent race conditions

// ============================================================================
// Global window functions (for onclick handlers in HTML)
// ============================================================================

/**
 * Track download attempt when user clicks download button
 * @param {string} pdfUrl - PDF URL
 * @param {string} downloadId - Download button ID
 */
window.trackDownloadAttempt = function(pdfUrl, downloadId) {
    // Optimistically record as success
    DownloadReliability.recordAttempt(pdfUrl, true);

    // Optional: HEAD request to check if URL is accessible
    setTimeout(() => {
        fetch(pdfUrl, { method: 'HEAD', mode: 'no-cors' })
            .then(() => {
                // console.log(`Download initiated: ${DownloadReliability.getDomain(pdfUrl)}`);
            })
            .catch(() => {
                DownloadReliability.recordAttempt(pdfUrl, false);
                // console.warn(`Download may have failed: ${DownloadReliability.getDomain(pdfUrl)}`);
            });
    }, 1000);
};

/**
 * Get paper data from search results or bookmarks
 * @param {string} paperKey - Paper key
 * @returns {Object|null} Paper object or null
 */
function getPaperData(paperKey) {
    // Try to get from search results first
    let paper = papersByKey.get(paperKey);

    // If not in search results, try bookmarks
    if (!paper) {
        const bookmarks = getBookmarks();
        paper = bookmarks[paperKey];
    }

    return paper || null;
}

/**
 * Search by paper title (exposed globally for onclick)
 * @param {string} title - Paper title
 */
window.searchByTitle = function(title) {
    // Switch to search view if currently in bookmarks view
    if (currentView === 'bookmarks') {
        showSearchView();
    }

    apiSearchByTitle(title, renderStreamingResults);
};

/**
 * Toggle bookmark status for a paper (exposed globally for onclick)
 * @param {HTMLElement} buttonElement - Bookmark button element
 */
window.togglePaperBookmark = function(buttonElement) {
    const paperKey = buttonElement.dataset.paperKey;
    const paper = getPaperData(paperKey);

    if (!paper) {
        console.warn('Paper not found for key:', paperKey);
        return;
    }

    const isNowBookmarked = toggleBookmark(paper);

    // Update button visual and ARIA state
    if (isNowBookmarked) {
        buttonElement.classList.add('bookmarked');
        buttonElement.setAttribute('aria-pressed', 'true');
        buttonElement.setAttribute('aria-label', 'Remove bookmark');
        buttonElement.title = 'Remove bookmark';
    } else {
        buttonElement.classList.remove('bookmarked');
        buttonElement.setAttribute('aria-pressed', 'false');
        buttonElement.setAttribute('aria-label', 'Bookmark this paper');
        buttonElement.title = 'Bookmark this paper';
    }

    // Update bookmark count in UI
    updateBookmarkCount();

    // If in bookmarks view and paper was unbookmarked, refresh the list
    if (currentView === 'bookmarks' && !isNowBookmarked) {
        const searchQuery = document.getElementById('bookmarksSearchInput').value;
        renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
        renderCollectionsInline(); // Update counts
    }
};

/**
 * Handle collection change for a paper (exposed globally for onchange)
 * @param {HTMLSelectElement} selectElement - Select element
 */
window.handleCollectionChange = function(selectElement) {
    const paperKey = selectElement.dataset.paperKey;
    const targetCollectionId = selectElement.value;

    if (!targetCollectionId) {
        // No collection selected (placeholder selected)
        selectElement.value = ''; // Reset to placeholder
        return;
    }

    // Add to target collection
    if (addToCollection(paperKey, targetCollectionId)) {
        // Reset dropdown to placeholder
        selectElement.value = '';

        // Re-render bookmarks to update collection indicators
        const searchQuery = document.getElementById('bookmarksSearchInput').value;
        renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
    }
};

/**
 * Handle adding a paper to a collection (exposed globally for onchange)
 * @param {HTMLSelectElement} selectElement - Select element
 * @param {string} paperKey - Paper key
 */
window.handleCollectionAdd = function(selectElement, paperKey) {
    const targetCollectionId = selectElement.value;

    if (!targetCollectionId) {
        // No collection selected (placeholder selected)
        return;
    }

    // Add to target collection
    if (addToCollection(paperKey, targetCollectionId)) {
        // Reset dropdown to placeholder
        selectElement.value = '';

        // Re-render bookmarks to update collection indicators and counts
        const searchQuery = document.getElementById('bookmarksSearchInput').value;
        renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
        renderCollectionsInline();
    }
};

/**
 * Handle removing a paper from the current collection (exposed globally for onclick)
 * @param {HTMLButtonElement} buttonElement - Remove button element
 */
window.handleRemoveFromCollection = function(buttonElement) {
    const paperKey = buttonElement.dataset.paperKey;
    const collectionId = buttonElement.dataset.collectionId;

    if (collectionId === 'all') {
        // Can't remove from "All Papers" - this would delete the bookmark
        return;
    }

    if (confirm('Remove this paper from the current collection?')) {
        if (removeFromCollection(paperKey, collectionId)) {
            // Re-render bookmarks to reflect removal
            const searchQuery = document.getElementById('bookmarksSearchInput').value;
            renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);

            // Update collection counts
            renderCollectionsInline();
        }
    }
};


// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle search form submission
 */
document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const query = document.getElementById('searchQuery').value;
    const limit = 25; // Default: 25 results per source
    const pdfOnly = document.getElementById('pdfOnly').checked;
    const minRelevance = 35;

    // Hide search history dropdown
    hideSearchHistory();

    // Execute search across multiple academic databases
    await searchWithClient(query, limit, pdfOnly, minRelevance, renderStreamingResults);

    // Add to search history
    // Note: We'll update the result count after search completes
    addToHistory(query, 0, { pdfOnly, relevanceThreshold: minRelevance });

    // Show export toolbar
    document.getElementById('exportToolbar').style.display = 'flex';
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Update bookmark count badge
 */
function updateBookmarkCount() {
    const stats = getBookmarkStats();
    document.getElementById('bookmarkCount').textContent = stats.totalBookmarks;
}

/**
 * Populate search history dropdown
 */
function populateSearchHistory() {
    const recentSearches = getRecentSearches(10);
    const historyList = document.getElementById('searchHistoryList');

    if (recentSearches.length === 0) {
        historyList.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-tertiary);">No recent searches</li>';
        return;
    }

    historyList.innerHTML = recentSearches.map((item, index) => {
        const date = new Date(item.timestamp);
        const timeAgo = getTimeAgo(date);

        return `
            <li role="option"
                onclick="selectHistoryItem('${item.query.replace(/'/g, "\\'")}')"
                onkeypress="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectHistoryItem('${item.query.replace(/'/g, "\\'")}')}">
                <span class="history-query">${item.query}</span>
                <span class="history-meta">${timeAgo}</span>
                <button class="history-delete-btn" onclick="event.stopPropagation(); deleteHistoryItem(${index})" title="Delete" tabindex="-1">×</button>
            </li>
        `;
    }).join('');
}

/**
 * Show search history dropdown
 */
function showSearchHistory() {
    populateSearchHistory();
    document.getElementById('searchHistoryDropdown').style.display = 'block';
    document.getElementById('searchQuery').setAttribute('aria-expanded', 'true');
}

/**
 * Hide search history dropdown
 */
function hideSearchHistory() {
    document.getElementById('searchHistoryDropdown').style.display = 'none';
    document.getElementById('searchQuery').setAttribute('aria-expanded', 'false');
}

/**
 * Select a history item
 * @param {string} query - Search query
 */
window.selectHistoryItem = function(query) {
    document.getElementById('searchQuery').value = query;
    hideSearchHistory();
    // Trigger search
    document.getElementById('searchForm').dispatchEvent(new Event('submit'));
};

/**
 * Delete a history item
 * @param {number} index - History item index
 */
window.deleteHistoryItem = function(index) {
    removeFromHistory(index);
    populateSearchHistory();
};

/**
 * Get time ago string from date
 * @param {Date} date - Date object
 * @returns {string} Time ago string
 */
function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

/**
 * Update bookmark button states for all visible cards
 */
function updateBookmarkButtonStates() {
    document.querySelectorAll('.bookmark-btn').forEach(button => {
        const paperKey = button.dataset.paperKey;
        if (isBookmarked(paperKey)) {
            button.classList.add('bookmarked');
            button.setAttribute('aria-pressed', 'true');
            button.setAttribute('aria-label', 'Remove bookmark');
            button.title = 'Remove bookmark';
        } else {
            button.classList.remove('bookmarked');
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', 'Bookmark this paper');
            button.title = 'Bookmark this paper';
        }
    });
}

/**
 * Show bookmarks view
 */
function showBookmarksView() {
    // Update view state
    currentView = 'bookmarks';

    // Hide search section and results
    document.querySelector('.search-section').style.display = 'none';
    document.querySelector('.results-section').classList.remove('active');

    // Show bookmarks section
    document.getElementById('bookmarksSection').style.display = 'block';

    // Render collections inline
    renderCollectionsInline();

    // Render bookmarks for current collection
    const searchQuery = document.getElementById('bookmarksSearchInput').value;
    renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
}

/**
 * Show search view
 */
function showSearchView() {
    // Update view state
    currentView = 'search';

    // Show search section
    document.querySelector('.search-section').style.display = 'block';

    // Hide bookmarks section
    document.getElementById('bookmarksSection').style.display = 'none';

    // Only show results section if there are actual results
    const resultsSection = document.querySelector('.results-section');
    if (papersByKey.size === 0) {
        // No search results - hide the entire results section
        resultsSection.classList.remove('active');
    } else {
        // Has results - show the section
        resultsSection.classList.add('active');
    }
}

/**
 * Filter papers by search query
 * @param {Array} papers - Array of papers
 * @param {string} query - Search query
 * @returns {Array} Filtered papers
 */
function filterBookmarksByQuery(papers, query) {
    if (!query || query.trim() === '') {
        return papers;
    }

    const normalizedQuery = query.toLowerCase().trim();

    return papers.filter(paper => {
        // Search in title
        const titleMatch = (paper.title || '').toLowerCase().includes(normalizedQuery);

        // Search in authors
        const authorsText = Array.isArray(paper.authors)
            ? paper.authors.join(' ')
            : (paper.authors || '');
        const authorsMatch = authorsText.toLowerCase().includes(normalizedQuery);

        // Search in abstract
        const abstractMatch = (paper.abstract || '').toLowerCase().includes(normalizedQuery);

        // Search in journal
        const journalMatch = (paper.journal || '').toLowerCase().includes(normalizedQuery);

        return titleMatch || authorsMatch || abstractMatch || journalMatch;
    });
}

/**
 * Sort papers by specified criteria
 * @param {Array} papers - Array of papers
 * @param {string} sortOrder - Sort order option
 * @returns {Array} Sorted papers
 */
function sortBookmarks(papers, sortOrder) {
    const sorted = [...papers]; // Create copy to avoid mutating original

    switch (sortOrder) {
        case 'date-desc':
            // Newest first (by bookmark timestamp)
            return sorted.sort((a, b) => {
                const timeA = a._bookmarked_at || 0;
                const timeB = b._bookmarked_at || 0;
                return timeB - timeA;
            });

        case 'date-asc':
            // Oldest first (by bookmark timestamp)
            return sorted.sort((a, b) => {
                const timeA = a._bookmarked_at || 0;
                const timeB = b._bookmarked_at || 0;
                return timeA - timeB;
            });

        case 'title-asc':
            // Title A-Z
            return sorted.sort((a, b) => {
                const titleA = (a.title || '').toLowerCase();
                const titleB = (b.title || '').toLowerCase();
                return titleA.localeCompare(titleB);
            });

        case 'title-desc':
            // Title Z-A
            return sorted.sort((a, b) => {
                const titleA = (a.title || '').toLowerCase();
                const titleB = (b.title || '').toLowerCase();
                return titleB.localeCompare(titleA);
            });

        case 'year-desc':
            // Year newest first
            return sorted.sort((a, b) => {
                const yearA = a.year || 0;
                const yearB = b.year || 0;
                return yearB - yearA;
            });

        case 'year-asc':
            // Year oldest first
            return sorted.sort((a, b) => {
                const yearA = a.year || 0;
                const yearB = b.year || 0;
                return yearA - yearB;
            });

        default:
            return sorted;
    }
}

/**
 * Render bookmarked papers with optional search and sort
 * @param {string} searchQuery - Optional search query to filter bookmarks
 * @param {string} sortOrder - Optional sort order
 */
function renderBookmarks(searchQuery = '', sortOrder = 'date-desc') {
    let bookmarkedPapers = getCollectionPapers('all');
    const bookmarksResults = document.getElementById('bookmarksResults');

    if (bookmarkedPapers.length === 0) {
        bookmarksResults.innerHTML = '<p class="placeholder">No bookmarked papers yet. Star papers from search results to save them here!</p>';
        return;
    }

    // Apply search filter
    bookmarkedPapers = filterBookmarksByQuery(bookmarkedPapers, searchQuery);

    // Apply sort order
    bookmarkedPapers = sortBookmarks(bookmarkedPapers, sortOrder);

    // Show filtered count if different from total
    if (searchQuery && searchQuery.trim() !== '') {
        const totalCount = getCollectionPapers('all').length;
        if (bookmarkedPapers.length < totalCount) {
            const countMessage = `<p style="margin-bottom: 1rem; color: var(--text-secondary);">Showing ${bookmarkedPapers.length} of ${totalCount} bookmarks</p>`;
            bookmarksResults.innerHTML = countMessage;
        }
    }

    // Show "no results" if filtered out everything
    if (bookmarkedPapers.length === 0) {
        bookmarksResults.innerHTML = '<p class="placeholder">No bookmarks match your search query.</p>';
        return;
    }

    // Render bookmarked papers
    const cardsHtml = bookmarkedPapers.map((paper, index) =>
        buildPaperCard(paper, index, false)
    ).join('');

    if (searchQuery && searchQuery.trim() !== '') {
        const totalCount = getCollectionPapers('all').length;
        const countMessage = bookmarkedPapers.length < totalCount
            ? `<p style="margin-bottom: 1rem; color: var(--text-secondary);">Showing ${bookmarkedPapers.length} of ${totalCount} bookmarks</p>`
            : '';
        bookmarksResults.innerHTML = countMessage + cardsHtml;
    } else {
        bookmarksResults.innerHTML = cardsHtml;
    }

    // Update bookmark button states
    setTimeout(updateBookmarkButtonStates, 100);
}

/**
 * Render collections inline (plain text with bullets)
 */
function renderCollectionsInline() {
    const collections = getCollections();
    const container = document.getElementById('collectionsInline');

    if (!container) return;

    // Build inline text with bullets
    const collectionsHtml = Object.values(collections).map(collection => {
        const papers = getCollectionPapers(collection.id);
        const isActive = collection.id === currentCollection;
        const activeClass = isActive ? 'active' : '';

        const deleteBtn = collection.isDefault ? '' : ` <span class="collection-delete" onclick="event.preventDefault(); deleteCollectionConfirm('${collection.id}')" title="Delete">×</span>`;

        return `<a href="#" class="collection-link ${activeClass}" data-collection="${collection.id}" onclick="event.preventDefault(); switchCollection('${collection.id}')">${collection.name} (${papers.length})</a>${deleteBtn}`;
    }).join(' · ');

    container.innerHTML = collectionsHtml;
}

/**
 * Switch to a different collection
 * @param {string} collectionId - Collection ID to switch to
 */
window.switchCollection = function(collectionId) {
    currentCollection = collectionId;

    // Re-render collections to update active state
    renderCollectionsInline();

    // Re-render bookmarks for this collection
    const searchQuery = document.getElementById('bookmarksSearchInput').value;
    renderBookmarksForCollection(collectionId, searchQuery, currentSortOrder);
};

/**
 * Render bookmarks for a specific collection
 * @param {string} collectionId - Collection ID
 * @param {string} searchQuery - Search query
 * @param {string} sortOrder - Sort order
 */
function renderBookmarksForCollection(collectionId, searchQuery = '', sortOrder = 'date-desc') {
    let bookmarkedPapers = getCollectionPapers(collectionId);
    const bookmarksResults = document.getElementById('bookmarksResults');

    if (bookmarkedPapers.length === 0) {
        bookmarksResults.innerHTML = '<p class="placeholder">No papers in this collection yet.</p>';
        return;
    }

    // Apply search filter
    bookmarkedPapers = filterBookmarksByQuery(bookmarkedPapers, searchQuery);

    // Apply sort order
    bookmarkedPapers = sortBookmarks(bookmarkedPapers, sortOrder);

    // Show filtered count if different from total
    if (searchQuery && searchQuery.trim() !== '') {
        const totalCount = getCollectionPapers(collectionId).length;
        if (bookmarkedPapers.length < totalCount) {
            const countMessage = `<p style="margin-bottom: 1rem; color: var(--text-secondary);">Showing ${bookmarkedPapers.length} of ${totalCount} papers</p>`;
            bookmarksResults.innerHTML = countMessage;
        }
    }

    // Show "no results" if filtered out everything
    if (bookmarkedPapers.length === 0) {
        bookmarksResults.innerHTML = '<p class="placeholder">No papers match your search query.</p>';
        return;
    }

    // Render bookmarked papers with collection selector
    const collections = Object.values(getCollections());
    const cardsHtml = bookmarkedPapers.map((paper, index) =>
        buildPaperCard(paper, index, false, {
            showCollectionSelector: true,
            currentCollectionId: collectionId,
            collections: collections
        })
    ).join('');

    if (searchQuery && searchQuery.trim() !== '') {
        const totalCount = getCollectionPapers(collectionId).length;
        const countMessage = bookmarkedPapers.length < totalCount
            ? `<p style="margin-bottom: 1rem; color: var(--text-secondary);">Showing ${bookmarkedPapers.length} of ${totalCount} papers</p>`
            : '';
        bookmarksResults.innerHTML = countMessage + cardsHtml;
    } else {
        bookmarksResults.innerHTML = cardsHtml;
    }

    // Update bookmark button states
    setTimeout(updateBookmarkButtonStates, 100);
}

/**
 * Show create collection modal
 */
function showCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    modal.style.display = 'flex';

    // Focus on name input
    document.getElementById('collectionName').focus();
}

/**
 * Hide create collection modal
 */
function hideCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    modal.style.display = 'none';

    // Clear form
    document.getElementById('createCollectionForm').reset();
}

/**
 * Delete collection with confirmation
 * @param {string} collectionId - Collection ID to delete
 */
window.deleteCollectionConfirm = function(collectionId) {
    const collections = getCollections();
    const collection = collections[collectionId];

    if (!collection) return;

    if (confirm(`Delete collection "${collection.name}"? Papers will remain in "All Papers".`)) {
        if (deleteCollection(collectionId)) {
            // If we deleted the current collection, switch to "all"
            if (currentCollection === collectionId) {
                currentCollection = 'all';
            }

            // Re-render collections and bookmarks
            renderCollectionsInline();
            switchCollection(currentCollection);
        }
    }
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // console.log('SourceCrate Browser UI initialized');

    // Update bookmark count
    updateBookmarkCount();

    // Get filter UI elements
    const pdfOnlyCheckbox = document.getElementById('pdfOnly');
    const searchInput = document.getElementById('searchQuery');

    // Live update: PDF-only checkbox changes
    pdfOnlyCheckbox.addEventListener('change', (e) => {
        setPdfOnlyFilter(e.target.checked);

        // Re-render results with new filter if we have results
        if (papersByKey.size > 0) {
            // Reset rendering state to force full re-render with new filter
            renderedPaperKeys.clear();

            // Clear existing results container
            const resultsContainer = document.getElementById('results-container');
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
            }

            // Re-render all papers with new filter applied
            renderStreamingResults();

            // Update bookmark button states after re-render
            setTimeout(updateBookmarkButtonStates, 100);
        }
    });

    // Search input focus/blur for history dropdown
    searchInput.addEventListener('focus', () => {
        // Clear any pending blur timeout to prevent race condition
        if (searchHistoryBlurTimeout) {
            clearTimeout(searchHistoryBlurTimeout);
            searchHistoryBlurTimeout = null;
        }
        showSearchHistory();
    });

    searchInput.addEventListener('blur', (e) => {
        // Delay hiding to allow clicking on history items
        searchHistoryBlurTimeout = setTimeout(() => {
            // Only hide if not focusing on history dropdown
            if (!document.getElementById('searchHistoryDropdown').contains(document.activeElement)) {
                hideSearchHistory();
            }
            searchHistoryBlurTimeout = null;
        }, 200);
    });

    // Handle keyboard navigation for history dropdown
    searchInput.addEventListener('keydown', (e) => {
        const dropdown = document.getElementById('searchHistoryDropdown');
        const isDropdownVisible = dropdown.style.display !== 'none';

        if (e.key === 'Escape') {
            hideSearchHistory();
        } else if (e.key === 'Enter' && isDropdownVisible) {
            // Ensure Enter always submits the form, never activates dropdown buttons
            e.preventDefault();
            document.getElementById('searchForm').dispatchEvent(new Event('submit'));
        }
    });

    // Clear history button
    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
        if (confirm('Clear all search history?')) {
            clearHistory();
            populateSearchHistory();
        }
    });

    // Export button handlers - dynamically import export.js only when needed
    document.getElementById('exportBibTeXBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = Array.from(papersByKey.values());
        exportPapers(papers, 'bibtex');
    });

    document.getElementById('exportRISBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = Array.from(papersByKey.values());
        exportPapers(papers, 'ris');
    });

    document.getElementById('exportCSVBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = Array.from(papersByKey.values());
        exportPapers(papers, 'csv');
    });

    document.getElementById('exportJSONBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = Array.from(papersByKey.values());
        exportPapers(papers, 'json');
    });

    // View bookmarks button
    document.getElementById('viewBookmarksBtn').addEventListener('click', () => {
        showBookmarksView();
    });

    // Back to search link
    document.getElementById('backToSearchLink').addEventListener('click', (e) => {
        e.preventDefault();
        showSearchView();
    });

    // Export dropdown toggle
    document.getElementById('exportDropdownBtn').addEventListener('click', () => {
        const menu = document.getElementById('exportDropdownMenu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Close export dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.export-dropdown-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            document.getElementById('exportDropdownMenu').style.display = 'none';
        }
    });

    // Bookmarks export handlers
    document.querySelectorAll('#exportDropdownMenu button[data-format]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const format = btn.dataset.format;
            const { exportPapers } = await import('./export.js');
            const papers = getCollectionPapers(currentCollection);
            exportPapers(papers, format);
            document.getElementById('exportDropdownMenu').style.display = 'none';
        });
    });

    // Clear all bookmarks
    document.getElementById('clearAllBookmarksBtn').addEventListener('click', () => {
        if (clearAllBookmarks()) {
            renderBookmarks();
            updateBookmarkCount();
        }
    });

    // Bookmarks search input - real-time filtering
    document.getElementById('bookmarksSearchInput').addEventListener('input', (e) => {
        const searchQuery = e.target.value;
        renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
    });

    // Sort dropdown toggle
    document.getElementById('sortDropdownBtn').addEventListener('click', () => {
        const menu = document.getElementById('sortDropdownMenu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    // Close sort dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const sortWrapper = document.querySelector('.sort-dropdown-wrapper');
        if (sortWrapper && !sortWrapper.contains(e.target)) {
            document.getElementById('sortDropdownMenu').style.display = 'none';
        }
    });

    // Sort dropdown option handlers
    document.querySelectorAll('#sortDropdownMenu button[data-sort]').forEach(btn => {
        btn.addEventListener('click', () => {
            const sortOrder = btn.dataset.sort;
            currentSortOrder = sortOrder;
            const searchQuery = document.getElementById('bookmarksSearchInput').value;
            renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
            document.getElementById('sortDropdownMenu').style.display = 'none';
        });
    });

    // Collection add dropdown handlers (event delegation for dynamic content)
    document.addEventListener('click', (e) => {
        // Toggle collection dropdown
        if (e.target.classList.contains('collection-add-dropdown-btn')) {
            const wrapper = e.target.closest('.collection-add-dropdown-wrapper');
            const menu = wrapper.querySelector('.collection-add-dropdown-menu');

            // Close other collection dropdowns
            document.querySelectorAll('.collection-add-dropdown-menu').forEach(m => {
                if (m !== menu) m.style.display = 'none';
            });

            // Toggle this menu
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            e.stopPropagation();
        }
        // Handle collection selection
        else if (e.target.closest('.collection-add-dropdown-menu')) {
            const button = e.target;
            if (button.dataset.collectionId && button.dataset.paperKey) {
                const collectionId = button.dataset.collectionId;
                const paperKey = button.dataset.paperKey;

                // Add to collection
                if (addToCollection(paperKey, collectionId)) {
                    // Close dropdown
                    const menu = button.closest('.collection-add-dropdown-menu');
                    menu.style.display = 'none';

                    // Re-render bookmarks to update collection indicators and counts
                    const searchQuery = document.getElementById('bookmarksSearchInput').value;
                    renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
                    renderCollectionsInline();
                }
            }
        }
        // Close all collection dropdowns when clicking outside
        else {
            document.querySelectorAll('.collection-add-dropdown-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        }
    });

    // Collections UI event handlers
    document.getElementById('newCollectionLink').addEventListener('click', (e) => {
        e.preventDefault();
        showCreateCollectionModal();
    });

    document.getElementById('cancelCollectionBtn').addEventListener('click', () => {
        hideCreateCollectionModal();
    });

    document.querySelector('#createCollectionModal .modal-close').addEventListener('click', () => {
        hideCreateCollectionModal();
    });

    // Close modal on background click
    document.getElementById('createCollectionModal').addEventListener('click', (e) => {
        if (e.target.id === 'createCollectionModal') {
            hideCreateCollectionModal();
        }
    });

    // Create collection form submit
    document.getElementById('createCollectionForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('collectionName').value.trim();
        const description = document.getElementById('collectionDescription').value.trim();

        if (name) {
            const newCollection = createCollection(name, description);

            // Close modal
            hideCreateCollectionModal();

            // Re-render collections
            renderCollectionsInline();

            // Switch to the new collection
            switchCollection(newCollection.id);
        }
    });

    // Observe results containers for bookmark button state updates
    const observer = new MutationObserver(() => {
        updateBookmarkButtonStates();
    });

    const resultsContainer = document.getElementById('results');
    if (resultsContainer) {
        observer.observe(resultsContainer, { childList: true, subtree: true });
    }

    const bookmarksContainer = document.getElementById('bookmarksResults');
    if (bookmarksContainer) {
        observer.observe(bookmarksContainer, { childList: true, subtree: true });
    }

    // Scroll to top button functionality
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

    // Show/hide button based on scroll position
    const toggleScrollButton = () => {
        if (window.scrollY > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }
    };

    // Listen to scroll events (with throttling for performance)
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(toggleScrollButton, 100);
    });

    // Scroll to top when button is clicked
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Initial check in case page is already scrolled
    toggleScrollButton();
});
