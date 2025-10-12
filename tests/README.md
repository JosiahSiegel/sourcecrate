# Testing

**All tests use mocked API responses** via MSW (Mock Service Worker). No real API calls are made.

## Quick Start

```bash
# Run tests
npm test                  # Unit + integration (Vitest)
npm run test:e2e          # E2E browser tests (Playwright)
npm run test:coverage     # Coverage report

# Development
npm run test:watch        # Watch mode
npm run test:ui           # Interactive Vitest UI
npm run test:e2e:ui       # Interactive Playwright UI
```

## Structure

```
tests/
├── unit/                # Pure function tests
├── integration/         # Module interaction tests
├── e2e/                 # Playwright browser tests
├── fixtures/            # Mock data (papers, API responses)
├── helpers/             # Shared test utilities
│   ├── fixtures.js      # MOCK_PAPERS, createPaper()
│   ├── dom.js           # setupSearchDOM(), cleanupDOM()
│   ├── state.js         # resetSearchState(), simulateSearchComplete()
│   ├── mocks.js         # createMockCallback(), createMockFetch()
│   └── assertions.js    # expectValidRelevanceScore(), expectPapersSorted()
├── mocks/               # MSW handlers and server
│   ├── handlers.js      # API endpoint handlers
│   └── server.js        # MSW server instance
└── setup.js             # Global test setup (MSW, DOM)
```

## API Mocking (MSW)

All 9 academic APIs are mocked via MSW - no real network requests are made.

**Mocked APIs:** arXiv, CrossRef, PubMed, OpenAlex, DOAJ, Europe PMC, Unpaywall, DataCite, Zenodo

**Key files:**
- `tests/mocks/handlers.js` - API endpoint handlers
- `tests/fixtures/mock-api-responses.json` - Mock response data
- `tests/setup.js` - Auto-starts MSW before tests

**Per-test overrides:**
```javascript
import { server } from '../mocks/server.js';
import { http, HttpResponse } from 'msw';

server.use(
  http.get('https://api.crossref.org/*', () =>
    HttpResponse.json({ error: 'Not found' }, { status: 404 })
  )
);
```

**E2E tests** use Playwright's `page.route()` with the same mock data.

[MSW Documentation](https://mswjs.io/)

## Writing Tests

**Unit test** - `tests/unit/my-module.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../../js/my-module.js';

describe('myFunction', () => {
  it('handles input correctly', () => {
    expect(myFunction('input')).toBe('expected');
  });
});
```

**Integration test** - `tests/integration/my-feature.test.js`:
```javascript
import { describe, it, beforeEach } from 'vitest';
import { resetSearchState } from '../helpers/state.js';

describe('Feature', () => {
  beforeEach(() => resetSearchState());

  it('integrates components', async () => {
    // Test interaction
  });
});
```

**E2E test** - `tests/e2e/my-workflow.spec.js`:
```javascript
import { test, expect } from '@playwright/test';

test('completes workflow', async ({ page }) => {
  await page.goto('/');
  await page.fill('#searchQuery', 'machine learning');
  await page.click('button[type="submit"]');
  await expect(page.locator('.paper-card')).toBeVisible();
});
```

## Common Patterns

```javascript
// Use test helpers
import { MOCK_PAPERS } from '../helpers/fixtures.js';
import { setupSearchDOM } from '../helpers/dom.js';
import { createMockCallback } from '../helpers/mocks.js';

// Mock localStorage (auto-reset between tests)
localStorage.setItem('key', 'value');

// Test async operations
await searchWithClient('query', 10, false, 35, callback);
```

## Debugging

```bash
# Vitest
npm run test:watch           # Watch mode
npm test -- search-pipeline  # Run specific file
npm run test:ui              # Interactive UI

# Playwright
npm run test:e2e:ui          # Interactive UI
npx playwright test --headed # See browser
npx playwright test --debug  # Step through
```

## Coverage

```bash
npm run test:coverage  # Generate coverage report
# Open coverage/index.html in browser
```

Target: 80%+ coverage
