import { test, expect } from '@playwright/test';

test('title-author matches rank first and result headers open their first access link', async ({ page, context }) => {
    await page.route('**/*', async route => {
        if (!['fetch', 'xhr'].includes(route.request().resourceType()) ||
            new URL(route.request().url()).origin === new URL(page.url()).origin) return route.continue();
        const body = route.request().url().includes('api.crossref.org') ? { message: { items: [
            { title: ['Numerical methods'], DOI: '10.1234/unrelated', author: [{ given: 'Robert', family: 'Nystrom' }] },
            { title: ['Game Programming Patterns'], DOI: '10.1234/wrong-author', author: [{ given: 'Another', family: 'Writer' }] },
            { title: ['Game Programming Patterns'], DOI: '10.1234/exact', URL: 'https://example.org/book', author: [{ given: 'Robert', family: 'Nystrom' }] }
        ] } } : {};
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.route('https://example.org/book', route => route.fulfill({ contentType: 'text/html', body: '<h1>Book destination</h1>' }));
    await page.goto('/');
    await page.fill('#searchQuery', 'game programming patterns Robert Nystrom');
    await page.keyboard.press('Escape');
    await page.click('#searchForm button[type="submit"]');
    await expect(page.locator('#results-summary')).toContainText('Search complete');
    await expect(page.locator('.paper-card')).toHaveCount(3);
    const first = page.locator('.paper-card').first();
    await expect(first).toHaveAttribute('data-paper-key', 'doi:10.1234/exact');
    const title = first.locator('h3 a');
    const destination = await first.locator('.source-access-container a').first().getAttribute('href');
    await expect(title).toHaveAttribute('href', destination);
    expect(destination).toBe('https://example.org/book');
    const popupReady = page.waitForEvent('popup');
    await title.click();
    const popup = await popupReady;
    await expect(popup.locator('h1')).toHaveText('Book destination');
    await popup.close();
    await title.focus();
    const keyboardPopupReady = page.waitForEvent('popup');
    await title.press('Enter');
    const keyboardPopup = await keyboardPopupReady;
    await expect(keyboardPopup.locator('h1')).toHaveText('Book destination');
    await keyboardPopup.close();
    await expect(page.locator('#searchQuery')).toHaveValue('game programming patterns Robert Nystrom');
    // Cached searches retain both ordering and destinations.
    await page.click('#searchForm button[type="submit"]');
    await expect(first).toHaveAttribute('data-paper-key', 'doi:10.1234/exact');
    await expect(first.locator('h3 a')).toHaveAttribute('href', destination);
});

test('low-scoring results survive scrolling and late search completion', async ({ page }) => {
    let finishLastSource;
    const lastSource = new Promise(resolve => { finishLastSource = resolve; });
    await page.route('**/*', async route => {
        if (!['fetch', 'xhr'].includes(route.request().resourceType()) ||
            new URL(route.request().url()).origin === new URL(page.url()).origin) {
            return route.continue();
        }
        const url = route.request().url();
        if (url.includes('zenodo.org')) await lastSource;
        const body = url.includes('api.crossref.org') ? { message: { items: [
            { title: ['A short note'], DOI: '10.1234/retained-one' },
            { title: ['An unrelated study'], DOI: '10.1234/retained-two' }
        ] } } : {};
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/');
    await page.fill('#searchQuery', 'game programming patterns Robert Nystrom');
    await page.keyboard.press('Escape');
    await page.click('#searchForm button[type="submit"]');
    try {
        await expect(page.locator('.paper-card')).toHaveCount(2);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.evaluate(() => window.scrollTo(0, 0));
    } finally {
        finishLastSource();
    }
    await expect(page.locator('#results-summary')).toContainText('Search complete');
    await expect(page.locator('.paper-card')).toHaveCount(2);
    await expect(page.locator('#results-summary')).toContainText('2 papers');
    // Repeating the query exercises the completed-result cache as well.
    await page.click('#searchForm button[type="submit"]');
    await expect(page.locator('.paper-card')).toHaveCount(2);
});

test('paper metadata stays inert and filters reconcile the rendered results', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page).toHaveTitle(/SourceCrate/i);
    await expect(page.locator('#searchQuery')).toBeVisible();
    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        const { renderStreamingResults } = await import('/js/rendering.js');
        const papers = [
            { title: 'Quantum transport <img src=x onerror="window.injected=true">', doi: '10.1234/strong', abstract: 'Research on quantum transport.', relevance_score: 90, source: 'arXiv', pdf_url: 'https://arxiv.org/pdf/1234.5678' },
            { title: 'Weak match', doi: '10.1234/weak', relevance_score: 15.18 }
        ];
        state.papersByKey.clear();
        for (const paper of papers) state.papersByKey.set(`doi:${paper.doi}`, paper);
        state.setRelevanceThreshold(35);
        state.setTotalSources(1);
        state.setSourcesCompleted(1);
        state.setBm25ScoringComplete(false);
        document.querySelector('.results-section').classList.add('active');
        renderStreamingResults();
    });
    await expect(page.locator('.paper-card')).toHaveCount(2);
    await expect(page.locator('.paper-card img')).toHaveCount(0);
    expect(await page.evaluate(() => window.injected)).toBeUndefined();
    expect(await page.locator('.paper-card h3').first().evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.evaluate(async () => {
        const state = await import('/js/state.js');
        state.setBm25ScoringComplete(true);
        (await import('/js/rendering.js')).renderStreamingResults();
    });
    await expect(page.locator('.paper-card')).toHaveCount(1);
    await page.locator('.paper-card .bookmark-btn').click();
    await expect(page.locator('.paper-card .bookmark-btn')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: testInfo.outputPath('verified-results.png'), fullPage: true });
    expect(errors).toEqual([]);
});

test('service worker timestamps persist through real IndexedDB transactions', async ({ page }) => {
    await page.goto('/');
    const timestamp = await page.evaluate(async () => {
        const source = await (await fetch('/sw.js')).text();
        const cache = new Function('self', source + '; return {setCacheTime, getCacheTime};')({addEventListener() {}});
        await cache.setCacheTime('https://example.org/papers', 123456789);
        return cache.getCacheTime('https://example.org/papers');
    });
    expect(timestamp).toBe(123456789);
});
