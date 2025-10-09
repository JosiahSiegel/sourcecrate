// ============================================================================
// BOOKMARKS.JS - Save papers and organize into collections (client-side localStorage)
// ============================================================================

import { getPaperKey } from './utils.js';

const STORAGE_KEY = 'sourcecrate_bookmarks';
const COLLECTIONS_KEY = 'sourcecrate_collections';

/**
 * Get all bookmarked papers from localStorage
 * @returns {Object} Map of paperKey -> paper object
 */
export function getBookmarks() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.warn('Failed to load bookmarks:', e);
        return {};
    }
}

/**
 * Save bookmarks to localStorage
 * @param {Object} bookmarks - Bookmarks object
 */
function saveBookmarks(bookmarks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    } catch (e) {
        console.error('Failed to save bookmarks:', e);
        alert('Failed to save bookmark. Storage may be full.');
    }
}

/**
 * Get all collections from localStorage
 * @returns {Object} Map of collectionId -> collection object
 */
export function getCollections() {
    try {
        const stored = localStorage.getItem(COLLECTIONS_KEY);
        const collections = stored ? JSON.parse(stored) : {};

        // Ensure "All Papers" collection exists
        if (!collections.all) {
            collections.all = {
                id: 'all',
                name: 'All Papers',
                description: 'All bookmarked papers',
                paperKeys: [],
                created: Date.now(),
                isDefault: true
            };
        }

        return collections;
    } catch (e) {
        console.warn('Failed to load collections:', e);
        return {
            all: {
                id: 'all',
                name: 'All Papers',
                description: 'All bookmarked papers',
                paperKeys: [],
                created: Date.now(),
                isDefault: true
            }
        };
    }
}

/**
 * Save collections to localStorage
 * @param {Object} collections - Collections object
 */
function saveCollections(collections) {
    try {
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    } catch (e) {
        console.error('Failed to save collections:', e);
    }
}

/**
 * Check if a paper is bookmarked
 * @param {Object|string} paperOrKey - Paper object or paper key
 * @returns {boolean} True if bookmarked
 */
export function isBookmarked(paperOrKey) {
    const key = typeof paperOrKey === 'string' ? paperOrKey : getPaperKey(paperOrKey);
    const bookmarks = getBookmarks();
    return key in bookmarks;
}

/**
 * Add paper to bookmarks
 * @param {Object} paper - Paper object
 * @param {string} collectionId - Optional collection ID (defaults to 'all')
 * @returns {boolean} Success status
 */
export function addBookmark(paper, collectionId = 'all') {
    const key = getPaperKey(paper);
    const bookmarks = getBookmarks();

    // Store paper with timestamp
    bookmarks[key] = {
        ...paper,
        _bookmarked_at: Date.now()
    };

    saveBookmarks(bookmarks);

    // Add to collection
    const collections = getCollections();
    if (collections[collectionId]) {
        if (!collections[collectionId].paperKeys.includes(key)) {
            collections[collectionId].paperKeys.push(key);
            saveCollections(collections);
        }
    }

    return true;
}

/**
 * Remove paper from bookmarks
 * @param {Object|string} paperOrKey - Paper object or paper key
 * @returns {boolean} Success status
 */
export function removeBookmark(paperOrKey) {
    const key = typeof paperOrKey === 'string' ? paperOrKey : getPaperKey(paperOrKey);
    const bookmarks = getBookmarks();

    if (key in bookmarks) {
        delete bookmarks[key];
        saveBookmarks(bookmarks);

        // Remove from all collections
        const collections = getCollections();
        Object.values(collections).forEach(collection => {
            const index = collection.paperKeys.indexOf(key);
            if (index > -1) {
                collection.paperKeys.splice(index, 1);
            }
        });
        saveCollections(collections);

        return true;
    }

    return false;
}

/**
 * Toggle bookmark status
 * @param {Object} paper - Paper object
 * @returns {boolean} New bookmark status (true = bookmarked, false = removed)
 */
export function toggleBookmark(paper) {
    if (isBookmarked(paper)) {
        removeBookmark(paper);
        return false;
    } else {
        addBookmark(paper);
        return true;
    }
}

/**
 * Get papers in a specific collection
 * @param {string} collectionId - Collection ID
 * @returns {Array} Array of paper objects
 */
export function getCollectionPapers(collectionId = 'all') {
    const bookmarks = getBookmarks();
    const collections = getCollections();

    if (!collections[collectionId]) {
        return [];
    }

    const papers = collections[collectionId].paperKeys
        .map(key => bookmarks[key])
        .filter(Boolean); // Remove any null/undefined entries

    // Sort by bookmark timestamp (newest first)
    return papers.sort((a, b) => (b._bookmarked_at || 0) - (a._bookmarked_at || 0));
}

/**
 * Create a new collection
 * @param {string} name - Collection name
 * @param {string} description - Optional description
 * @returns {Object} New collection object
 */
export function createCollection(name, description = '') {
    const collections = getCollections();
    const id = `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newCollection = {
        id,
        name,
        description,
        paperKeys: [],
        created: Date.now(),
        isDefault: false
    };

    collections[id] = newCollection;
    saveCollections(collections);

    return newCollection;
}

/**
 * Delete a collection (cannot delete default 'all' collection)
 * @param {string} collectionId - Collection ID
 * @returns {boolean} Success status
 */
export function deleteCollection(collectionId) {
    if (collectionId === 'all') {
        alert('Cannot delete the default "All Papers" collection');
        return false;
    }

    const collections = getCollections();
    if (collections[collectionId]) {
        delete collections[collectionId];
        saveCollections(collections);
        return true;
    }

    return false;
}

/**
 * Add paper to a specific collection
 * @param {string} paperKey - Paper key
 * @param {string} collectionId - Collection ID
 * @returns {boolean} Success status
 */
export function addToCollection(paperKey, collectionId) {
    const collections = getCollections();

    if (!collections[collectionId]) {
        console.warn(`Collection ${collectionId} not found`);
        return false;
    }

    if (!collections[collectionId].paperKeys.includes(paperKey)) {
        collections[collectionId].paperKeys.push(paperKey);
        saveCollections(collections);
        return true;
    }

    return false;
}

/**
 * Remove paper from a specific collection
 * @param {string} paperKey - Paper key
 * @param {string} collectionId - Collection ID
 * @returns {boolean} Success status
 */
export function removeFromCollection(paperKey, collectionId) {
    if (collectionId === 'all') {
        // Removing from 'all' means removing the bookmark entirely
        return removeBookmark(paperKey);
    }

    const collections = getCollections();

    if (!collections[collectionId]) {
        return false;
    }

    const index = collections[collectionId].paperKeys.indexOf(paperKey);
    if (index > -1) {
        collections[collectionId].paperKeys.splice(index, 1);
        saveCollections(collections);
        return true;
    }

    return false;
}

/**
 * Get bookmark statistics
 * @returns {Object} Statistics object
 */
export function getBookmarkStats() {
    const bookmarks = getBookmarks();
    const collections = getCollections();

    return {
        totalBookmarks: Object.keys(bookmarks).length,
        totalCollections: Object.keys(collections).length - 1, // Exclude 'all'
        oldestBookmark: Object.values(bookmarks).reduce((oldest, paper) => {
            const timestamp = paper._bookmarked_at || Infinity;
            return timestamp < oldest ? timestamp : oldest;
        }, Infinity),
        newestBookmark: Object.values(bookmarks).reduce((newest, paper) => {
            const timestamp = paper._bookmarked_at || 0;
            return timestamp > newest ? timestamp : newest;
        }, 0)
    };
}

/**
 * Export all bookmarks (for backup)
 * @returns {Object} Bookmarks and collections data
 */
export function exportBookmarksData() {
    return {
        bookmarks: getBookmarks(),
        collections: getCollections(),
        exportedAt: Date.now(),
        version: 1
    };
}

/**
 * Import bookmarks (from backup)
 * @param {Object} data - Exported bookmarks data
 * @returns {boolean} Success status
 */
export function importBookmarksData(data) {
    try {
        if (data.bookmarks) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.bookmarks));
        }
        if (data.collections) {
            localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(data.collections));
        }
        return true;
    } catch (e) {
        console.error('Failed to import bookmarks:', e);
        return false;
    }
}

/**
 * Clear all bookmarks and collections (with confirmation)
 * @returns {boolean} Success status
 */
export function clearAllBookmarks() {
    if (confirm('Are you sure you want to delete ALL bookmarks and collections? This cannot be undone.')) {
        try {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(COLLECTIONS_KEY);
            return true;
        } catch (e) {
            console.error('Failed to clear bookmarks:', e);
            return false;
        }
    }
    return false;
}
