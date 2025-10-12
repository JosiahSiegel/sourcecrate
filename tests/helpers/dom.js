// ============================================================================
// DOM HELPERS - Shared DOM setup and manipulation utilities for tests
// ============================================================================
// Provides functions to create and manage DOM elements needed for testing
// search functionality without duplicating HTML setup code.

/**
 * Setup standard search UI DOM structure
 * Creates all essential elements needed for search tests
 * @returns {Object} References to created elements
 *
 * @example
 * const elements = setupSearchDOM();
 * expect(elements.searchStatusLive).toBeVisible();
 */
export function setupSearchDOM() {
    document.body.innerHTML = `
        <div id="searchStatusLive" role="status" aria-live="polite"></div>
        <div id="results"></div>
        <div id="results-summary"></div>
        <div class="results-section"></div>
    `;

    return getSearchElements();
}

/**
 * Setup complete search UI with controls
 * Includes input fields, filters, and buttons
 * @returns {Object} References to created elements
 */
export function setupFullSearchDOM() {
    document.body.innerHTML = `
        <form id="searchForm">
            <input type="text" id="searchQuery" placeholder="Search papers...">
            <button type="submit">Search</button>
        </form>
        <div class="search-controls">
            <input type="checkbox" id="pdfOnly">
            <label for="pdfOnly">PDF Only</label>
            <input type="range" id="relevanceSlider" min="0" max="100" value="35">
            <span id="relevanceValue">35%</span>
        </div>
        <div id="searchStatusLive" role="status" aria-live="polite"></div>
        <div id="results"></div>
        <div id="results-summary"></div>
        <div class="results-section"></div>
        <div class="search-section"></div>
    `;

    return {
        ...getSearchElements(),
        searchForm: document.getElementById('searchForm'),
        searchQuery: document.getElementById('searchQuery'),
        pdfOnly: document.getElementById('pdfOnly'),
        relevanceSlider: document.getElementById('relevanceSlider'),
        relevanceValue: document.getElementById('relevanceValue'),
        searchSection: document.querySelector('.search-section')
    };
}

/**
 * Setup bookmarks view DOM structure
 * @returns {Object} References to created elements
 */
export function setupBookmarksDOM() {
    document.body.innerHTML = `
        <div id="bookmarks-section">
            <div class="bookmarks-controls-row">
                <input type="text" id="bookmarks-search" placeholder="Search bookmarks...">
                <div class="sort-dropdown">
                    <button class="sort-dropdown-toggle">Sort</button>
                    <div class="sort-dropdown-menu"></div>
                </div>
            </div>
            <div id="bookmarks-list"></div>
            <div id="bookmarks-empty">No bookmarks yet</div>
        </div>
    `;

    return {
        bookmarksSection: document.getElementById('bookmarks-section'),
        bookmarksSearch: document.getElementById('bookmarks-search'),
        bookmarksList: document.getElementById('bookmarks-list'),
        bookmarksEmpty: document.getElementById('bookmarks-empty'),
        sortDropdownToggle: document.querySelector('.sort-dropdown-toggle'),
        sortDropdownMenu: document.querySelector('.sort-dropdown-menu')
    };
}

/**
 * Get references to standard search elements
 * @returns {Object} Element references
 */
export function getSearchElements() {
    return {
        searchStatusLive: document.getElementById('searchStatusLive'),
        results: document.getElementById('results'),
        resultsSummary: document.getElementById('results-summary'),
        resultsSection: document.querySelector('.results-section')
    };
}

/**
 * Clean up DOM after tests
 * Clears document.body innerHTML
 */
export function cleanupDOM() {
    document.body.innerHTML = '';
}

/**
 * Create a paper card element (for rendering tests)
 * @param {Object} paper - Paper object
 * @returns {HTMLElement} Paper card element
 */
export function createPaperCard(paper) {
    const div = document.createElement('div');
    div.className = 'paper-card';
    div.dataset.paperKey = paper.doi || paper.title;
    div.innerHTML = `
        <h3 class="paper-title">${paper.title}</h3>
        <p class="paper-authors">${paper.authors.join(', ')}</p>
        <p class="paper-abstract">${paper.abstract || ''}</p>
        <div class="paper-metadata">
            <span class="paper-year">${paper.year || ''}</span>
            <span class="paper-citations">${paper.citation_count || 0} citations</span>
        </div>
    `;
    return div;
}

/**
 * Append paper cards to results div
 * @param {Array} papers - Array of paper objects
 */
export function appendPaperCards(papers) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) {
        throw new Error('Results div not found. Call setupSearchDOM() first.');
    }

    papers.forEach(paper => {
        resultsDiv.appendChild(createPaperCard(paper));
    });
}

/**
 * Count paper cards in results div
 * @returns {number} Number of paper cards
 */
export function countPaperCards() {
    return document.querySelectorAll('.paper-card').length;
}

/**
 * Get all paper card elements
 * @returns {NodeList} Paper card elements
 */
export function getPaperCards() {
    return document.querySelectorAll('.paper-card');
}

/**
 * Simulate clicking an element
 * @param {HTMLElement|string} elementOrSelector - Element or selector
 */
export function clickElement(elementOrSelector) {
    const element = typeof elementOrSelector === 'string'
        ? document.querySelector(elementOrSelector)
        : elementOrSelector;

    if (!element) {
        throw new Error(`Element not found: ${elementOrSelector}`);
    }

    element.click();
}

/**
 * Set input value and trigger input event
 * @param {HTMLElement|string} elementOrSelector - Input element or selector
 * @param {string} value - Value to set
 */
export function setInputValue(elementOrSelector, value) {
    const element = typeof elementOrSelector === 'string'
        ? document.querySelector(elementOrSelector)
        : elementOrSelector;

    if (!element) {
        throw new Error(`Input element not found: ${elementOrSelector}`);
    }

    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Assert element contains text
 * @param {HTMLElement|string} elementOrSelector - Element or selector
 * @param {string} expectedText - Expected text content
 */
export function assertElementContains(elementOrSelector, expectedText) {
    const element = typeof elementOrSelector === 'string'
        ? document.querySelector(elementOrSelector)
        : elementOrSelector;

    if (!element) {
        throw new Error(`Element not found: ${elementOrSelector}`);
    }

    const actualText = element.textContent || '';
    if (!actualText.includes(expectedText)) {
        throw new Error(
            `Expected element to contain "${expectedText}", but got "${actualText}"`
        );
    }
}

/**
 * Wait for element to appear in DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<HTMLElement>} Element
 */
export async function waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) {
            return element;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Element not found after ${timeout}ms: ${selector}`);
}
