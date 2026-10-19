import { test, expect } from '@playwright/test';

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
