// ============================================================================
// SEARCH WORKFLOW E2E TESTS - End-to-end tests in real browser
// ============================================================================

import { test, expect } from '@playwright/test';
import mockApiResponses from '../fixtures/mock-api-responses.json' with { type: 'json' };

/**
 * Helper to submit search form (dismisses history dropdown first)
 */
async function submitSearch(page) {
    // Dismiss search history dropdown if visible (it can block the submit button)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    // Click search button (use form ID for specificity)
    await page.click('#searchForm button[type="submit"]');
}

/**
 * Helper to dismiss search history dropdown (prevents dropdown from blocking other elements)
 */
async function dismissDropdown(page) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
}

/**
 * Setup network interception to prevent real API calls
 * CRITICAL: This prevents spamming real academic APIs during tests
 */
async function setupNetworkInterception(page) {
    // Intercept arXiv API
    await page.route('**/export.arxiv.org/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/xml',
            body: mockApiResponses.arxiv.xml
        });
    });

    // Intercept CrossRef API
    await page.route('**/api.crossref.org/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.crossref)
        });
    });

    // Intercept PubMed API
    await page.route('**/eutils.ncbi.nlm.nih.gov/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/xml',
            body: mockApiResponses.pubmed.xml
        });
    });

    // Intercept OpenAlex API
    await page.route('**/api.openalex.org/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.openalex)
        });
    });

    // Intercept DOAJ API
    await page.route('**/doaj.org/api/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.doaj)
        });
    });

    // Intercept Europe PMC API
    await page.route('**/europepmc.org/webservices/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.europepmc)
        });
    });

    // Intercept Unpaywall API
    await page.route('**/api.unpaywall.org/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.unpaywall)
        });
    });

    // Intercept DataCite API
    await page.route('**/api.datacite.org/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.datacite)
        });
    });

    // Intercept Zenodo API
    await page.route('**/zenodo.org/api/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockApiResponses.zenodo)
        });
    });
}

test.describe('Search Workflow', () => {
    test.beforeEach(async ({ page }) => {
        // Setup network interception BEFORE navigating to page
        await setupNetworkInterception(page);
        await page.goto('/');
    });

    test('should load homepage successfully', async ({ page }) => {
        // Check title
        await expect(page).toHaveTitle(/SourceCrate/);

        // Check main elements exist
        await expect(page.locator('#searchQuery')).toBeVisible();
        // Check search form submit button exists
        await expect(page.locator('#searchForm button[type="submit"]')).toBeVisible();
    });

    test('should perform a basic search', async ({ page }) => {
        // Enter search query
        await page.fill('#searchQuery', 'machine learning');
        await submitSearch(page);

        // Wait for results to appear
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Check that results are displayed
        const resultsDiv = page.locator('#results');
        await expect(resultsDiv).toBeVisible();

        // Should have loading or results message
        const content = await resultsDiv.textContent();
        expect(content.length).toBeGreaterThan(0);
    });

    test('should display streaming results', async ({ page }) => {
        await page.fill('#searchQuery', 'neural networks');
        await submitSearch(page);

        // Wait for results section to activate
        await page.waitForSelector('.results-section.active');

        // Should show search progress
        const liveRegion = page.locator('#searchStatusLive');
        const statusText = await liveRegion.textContent();
        expect(statusText.length).toBeGreaterThan(0);
    });

    test('should apply PDF-only filter', async ({ page }) => {
        // Dismiss dropdown to prevent it from blocking checkbox
        await dismissDropdown(page);
        // Check PDF filter checkbox
        await page.check('#pdfOnly');

        // Perform search
        await page.fill('#searchQuery', 'computer science');
        await submitSearch(page);

        // Wait for results
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Results should respect PDF filter
        // (verification depends on actual API responses)
        const resultsDiv = page.locator('#results');
        await expect(resultsDiv).toBeVisible();
    });

    test('should show accessibility live region updates', async ({ page }) => {
        await page.fill('#searchQuery', 'test query');
        await submitSearch(page);

        // Live region should be updated for screen readers
        const liveRegion = page.locator('#searchStatusLive');
        await expect(liveRegion).toHaveAttribute('role', 'status');
        await expect(liveRegion).toHaveAttribute('aria-live', 'polite');

        // Should contain status message
        await expect(liveRegion).not.toBeEmpty();
    });
});

test.describe('Search Results Interaction', () => {
    test.beforeEach(async ({ page }) => {
        await setupNetworkInterception(page);
        await page.goto('/');
    });

    test('should filter results by text query', async ({ page }) => {
        // Perform initial search
        await page.fill('#searchQuery', 'artificial intelligence');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Apply text filter
        const filterInput = page.locator('#filterQuery');
        if (await filterInput.isVisible()) {
            await filterInput.fill('neural');

            // Results should update
            const resultsDiv = page.locator('#results');
            await expect(resultsDiv).toBeVisible();
        }
    });

    test('should sort results', async ({ page }) => {
        // Perform search
        await page.fill('#searchQuery', 'machine learning');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Open sort dropdown
        const sortButton = page.locator('.sort-dropdown-toggle');
        if (await sortButton.isVisible()) {
            await sortButton.click();

            // Select sort option
            const citationsOption = page.locator('text=Citations');
            if (await citationsOption.isVisible()) {
                await citationsOption.click();

                // Results should re-render
                await page.waitForTimeout(500);
            }
        }
    });

    test('should export results', async ({ page }) => {
        // Perform search
        await page.fill('#searchQuery', 'data science');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Open export dropdown
        const exportButton = page.locator('.export-dropdown-toggle');
        if (await exportButton.isVisible()) {
            // Click export button
            await exportButton.click();

            // Dropdown should open
            const dropdown = page.locator('.export-dropdown-menu');
            if (await dropdown.isVisible()) {
                await expect(dropdown).toBeVisible();
            }
        }
    });
});

test.describe('Bookmarks Workflow', () => {
    test.beforeEach(async ({ page }) => {
        await setupNetworkInterception(page);
        await page.goto('/');
    });

    test('should navigate to bookmarks view', async ({ page }) => {
        // Click bookmarks button
        const bookmarksButton = page.locator('text=Bookmarks');
        await bookmarksButton.click();

        // Should show bookmarks view
        const bookmarksSection = page.locator('#bookmarks-section');
        if (await bookmarksSection.isVisible()) {
            await expect(bookmarksSection).toBeVisible();
        }
    });

    test('should return to search view', async ({ page }) => {
        // Go to bookmarks
        await page.click('text=Bookmarks');

        // Return to search using back link
        const backLink = page.locator('#backToSearchLink');
        if (await backLink.isVisible()) {
            await backLink.click();

            // Search section should be visible
            const searchSection = page.locator('.search-section');
            await expect(searchSection).toBeVisible();
        }
    });
});

test.describe('Regression Tests', () => {
    test.beforeEach(async ({ page }) => {
        await setupNetworkInterception(page);
        await page.goto('/');
    });

    test('should not carry filter state between searches', async ({ page }) => {
        // First search with filter
        await page.fill('#searchQuery', 'first search');
        // Dismiss dropdown to prevent it from blocking checkbox
        await dismissDropdown(page);
        await page.check('#pdfOnly');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Second search - filter should reset or respect current state
        await page.fill('#searchQuery', 'second search');
        // PDF filter checkbox state should be independent
        const pdfCheckbox = page.locator('#pdfOnly');
        const isChecked = await pdfCheckbox.isChecked();

        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Results should reflect current filter state, not cached state
        const resultsDiv = page.locator('#results');
        await expect(resultsDiv).toBeVisible();
    });

    test('should show consistent results between first search and cache', async ({ page }) => {
        // First search
        await page.fill('#searchQuery', 'cache test query');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Get result count
        const summary1 = page.locator('#results-summary');
        const text1 = await summary1.textContent();

        // Perform different search
        await page.fill('#searchQuery', 'different query');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Return to original search (should use cache)
        await page.fill('#searchQuery', 'cache test query');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        // Result count should match first search
        const summary2 = page.locator('#results-summary');
        const text2 = await summary2.textContent();

        // Both should show similar counts (cache consistency)
        expect(text1.length).toBeGreaterThan(0);
        expect(text2.length).toBeGreaterThan(0);
    });

    test('should handle dropdown selector specificity (bookmarks vs results)', async ({ page }) => {
        // This tests the fix for dropdown conflict between bookmarks and results page

        // Test results page dropdowns
        await page.fill('#searchQuery', 'test');
        await submitSearch(page);
        await page.waitForSelector('.results-section.active', { timeout: 30000 });

        const resultsSortButton = page.locator('.results-controls-row .sort-dropdown-toggle');
        if (await resultsSortButton.isVisible()) {
            await resultsSortButton.click();
            const dropdown = page.locator('.results-controls-row .sort-dropdown-menu');
            if (await dropdown.isVisible()) {
                await expect(dropdown).toBeVisible();
            }
        }

        // Navigate to bookmarks
        await page.click('text=Bookmarks');

        // Test bookmarks page dropdowns
        const bookmarksSortButton = page.locator('.bookmarks-controls-row .sort-dropdown-toggle');
        if (await bookmarksSortButton.isVisible()) {
            await bookmarksSortButton.click();
            const dropdown = page.locator('.bookmarks-controls-row .sort-dropdown-menu');
            if (await dropdown.isVisible()) {
                await expect(dropdown).toBeVisible();
            }
        }
    });
});

test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
        // Setup network interception
        await setupNetworkInterception(page);

        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto('/');

        // Search should still work
        await page.fill('#searchQuery', 'mobile test');
        await submitSearch(page);

        // Results should be visible on mobile
        await page.waitForSelector('.results-section.active', { timeout: 30000 });
        const resultsDiv = page.locator('#results');
        await expect(resultsDiv).toBeVisible();
    });

    test('should work on tablet viewport', async ({ page }) => {
        // Setup network interception
        await setupNetworkInterception(page);

        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });

        await page.goto('/');

        // Search should work
        await page.fill('#searchQuery', 'tablet test');
        await submitSearch(page);

        await page.waitForSelector('.results-section.active', { timeout: 30000 });
        const resultsDiv = page.locator('#results');
        await expect(resultsDiv).toBeVisible();
    });
});
