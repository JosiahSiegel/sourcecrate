// ============================================================================
// UI.JS - User interface rendering functions
// ============================================================================
// Handles all UI manipulation: search history, bookmarks view, collections UI,
// modals, button states, and view transitions

import {
    getBookmarks,
    isBookmarked,
    getBookmarkStats,
    getCollectionPapers,
    getCollections
} from './bookmarks.js';
import {
    getRecentSearches
} from './history.js';
import {
    buildPaperCard
} from './rendering.js';
import {
    getTimeAgo,
    filterBookmarksByQuery,
    sortBookmarks
} from './utils.js';

// ============================================================================
// Search History UI
// ============================================================================

/**
 * Populate search history dropdown
 * @param {Function} selectCallback - Callback for selecting history item
 * @param {Function} deleteCallback - Callback for deleting history item
 */
export function populateSearchHistory(selectCallback, deleteCallback) {
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
export function showSearchHistory() {
    // Note: populateSearchHistory should be called separately by the caller with appropriate callbacks
    document.getElementById('searchHistoryDropdown').style.display = 'block';
    document.getElementById('searchQuery').setAttribute('aria-expanded', 'true');
}

/**
 * Hide search history dropdown
 */
export function hideSearchHistory() {
    document.getElementById('searchHistoryDropdown').style.display = 'none';
    document.getElementById('searchQuery').setAttribute('aria-expanded', 'false');
}

// ============================================================================
// View Management
// ============================================================================

/**
 * Show bookmarks view
 * @param {string} currentCollection - Current collection ID
 * @param {string} currentSortOrder - Current sort order
 */
export function showBookmarksView(currentCollection, currentSortOrder) {
    // Hide search section and results
    document.querySelector('.search-section').style.display = 'none';
    document.querySelector('.results-section').classList.remove('active');

    // Show bookmarks section
    document.getElementById('bookmarksSection').style.display = 'block';

    // Render collections inline
    renderCollectionsInline(currentCollection);

    // Render bookmarks for current collection
    const searchQuery = document.getElementById('bookmarksSearchInput').value;
    renderBookmarksForCollection(currentCollection, searchQuery, currentSortOrder);
}

/**
 * Show search view
 * @param {Map} papersByKey - Map of search results
 */
export function showSearchView(papersByKey) {
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

// ============================================================================
// Bookmark Button States
// ============================================================================

/**
 * Update bookmark button states for all visible cards
 */
export function updateBookmarkButtonStates() {
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
 * Update bookmark count badge
 */
export function updateBookmarkCount() {
    const stats = getBookmarkStats();
    document.getElementById('bookmarkCount').textContent = stats.totalBookmarks;
}

// ============================================================================
// Bookmarks Rendering
// ============================================================================

/**
 * Render bookmarked papers with optional search and sort
 * @param {string} searchQuery - Optional search query to filter bookmarks
 * @param {string} sortOrder - Optional sort order
 */
export function renderBookmarks(searchQuery = '', sortOrder = 'date-desc') {
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
 * Render bookmarks for a specific collection
 * @param {string} collectionId - Collection ID
 * @param {string} searchQuery - Search query
 * @param {string} sortOrder - Sort order
 */
export function renderBookmarksForCollection(collectionId, searchQuery = '', sortOrder = 'date-desc') {
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

// ============================================================================
// Collections UI
// ============================================================================

/**
 * Render collections inline (plain text with bullets)
 * @param {string} currentCollection - Current collection ID
 */
export function renderCollectionsInline(currentCollection) {
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

// ============================================================================
// Collection Modal Management
// ============================================================================

/**
 * Show create collection modal
 */
export function showCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    modal.style.display = 'flex';

    // Focus on name input
    document.getElementById('collectionName').focus();
}

/**
 * Hide create collection modal
 */
export function hideCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    modal.style.display = 'none';

    // Clear form
    document.getElementById('createCollectionForm').reset();
}
