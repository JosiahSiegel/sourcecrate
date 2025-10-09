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
    clearAllBookmarks
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
        renderBookmarks();
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

    // Hide search section
    document.querySelector('.search-section').style.display = 'none';
    document.querySelector('.results-section').style.display = 'none';

    // Show bookmarks section
    document.getElementById('bookmarksSection').style.display = 'block';

    // Render bookmarks
    renderBookmarks();
}

/**
 * Show search view
 */
function showSearchView() {
    // Update view state
    currentView = 'search';

    // Show search section
    document.querySelector('.search-section').style.display = 'block';
    document.querySelector('.results-section').style.display = 'block';

    // Hide bookmarks section
    document.getElementById('bookmarksSection').style.display = 'none';
}

/**
 * Render bookmarked papers
 */
function renderBookmarks() {
    const bookmarkedPapers = getCollectionPapers('all');
    const bookmarksResults = document.getElementById('bookmarksResults');

    // Update count
    document.getElementById('allCount').textContent = bookmarkedPapers.length;

    if (bookmarkedPapers.length === 0) {
        bookmarksResults.innerHTML = '<p class="placeholder">No bookmarked papers yet. Star papers from search results to save them here!</p>';
        return;
    }

    // Render bookmarked papers
    bookmarksResults.innerHTML = bookmarkedPapers.map((paper, index) =>
        buildPaperCard(paper, index, false)
    ).join('');

    // Update bookmark button states
    setTimeout(updateBookmarkButtonStates, 100);
}

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

    // Back to search button
    document.getElementById('backToSearchBtn').addEventListener('click', () => {
        showSearchView();
    });

    // Bookmarks export handlers - dynamically import export.js only when needed
    document.getElementById('exportBookmarksBibTeXBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = getCollectionPapers('all');
        exportPapers(papers, 'bibtex');
    });

    document.getElementById('exportBookmarksRISBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = getCollectionPapers('all');
        exportPapers(papers, 'ris');
    });

    document.getElementById('exportBookmarksCSVBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = getCollectionPapers('all');
        exportPapers(papers, 'csv');
    });

    document.getElementById('exportBookmarksJSONBtn').addEventListener('click', async () => {
        const { exportPapers } = await import('./export.js');
        const papers = getCollectionPapers('all');
        exportPapers(papers, 'json');
    });

    // Clear all bookmarks
    document.getElementById('clearAllBookmarksBtn').addEventListener('click', () => {
        if (clearAllBookmarks()) {
            renderBookmarks();
            updateBookmarkCount();
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
