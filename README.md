# SourceCrate

Academic paper search that runs entirely in your browser. No backend needed.

## How it works

Searches academic databases in parallel. Everything happens client-side - the deduplication, BM25 relevance scoring, all of it.

Relevance ranking favors title phrases and combined title-and-author matches, with whole-word matching that ignores capitalization and accents. The site and MCP default to a minimum lexical relevance score of 25/100. Choose **All relevance** on the site or `min_relevance: 0` in the MCP to include weak matches. The filter applies consistently during loading and after completion; scores are not confidence probabilities. Short technical terms such as AI, 2D and 3D are retained. Click a result title to open its first available access link (PDF, publisher page, or DOI); the magnifying glass searches for that title.

## Usage

Clone and start the local server (ES modules require HTTP):

```bash
git clone https://github.com/JosiahSiegel/sourcecrate.git
cd sourcecrate
npm ci
npm run dev
```

Search for papers by keywords, DOI, or author names. Results stream in as each source responds. Click paper titles to open their first available link.

## Development

Vanilla JS with ES6 modules. Use Node.js 22.12 or later for development.

```bash
npm run dev      # Start development server (port 3000)
npm test         # Run unit + integration tests
npm run test:coverage # Coverage with Vitest 5's AST-based counters
npx playwright install chromium # Install the browser used by CI
npm run test:e2e -- --project=chromium # Run E2E tests (port 3001)
```

For Git Bash/Linux/macOS users who prefer a custom port:
```bash
node dev-server.js 3001
```

PDF links are provider-declared candidates, not verified downloads. OpenAlex landing pages and DOAJ HTML full text stay page links. MCP downloads validate actual PDF contents and report evidence; a valid PDF still needs review to confirm it is the requested work. Use regular web research for product documentation and practical guidance.

## Deployment and MCP

Pushes to `main` run unit, integration, and desktop/mobile browser tests before
deploying to [sourcecrate.org](https://sourcecrate.org). `scripts/build-site.mjs`
copies only production assets into `dist`; `version.json` records the deployed
commit, which CI checks after deployment. No server backend is required.

For AI agents, install the companion [SourceCrate MCP](https://github.com/JosiahSiegel/sourcecrate-mcp#readme).
Its README includes a portable stdio configuration and versioned installation command.
The MCP imports this repository's `sourcecrate/search` and `sourcecrate/access-links`
exports at a pinned revision. The browser and MCP share source clients, title/author
ranking, deduplication, relevance scores and link selection. Provider availability
can differ because of browser CORS and rate limits; the same input candidates produce
the same ranked results. Search and ranking changes belong in this repository.
Open Library complements academic sources with books, including title-and-author searches.

DataCite requests select only the metadata needed for results and retry transient
failures once within the search deadline, respecting cancellation and `Retry-After`.
If Zenodo's direct API is blocked, rate-limited, or unavailable, the shared engine
searches DataCite's public `cern.zenodo` index. These are Zenodo records with landing
page links, not guaranteed PDFs. Coverage can differ from Zenodo's live API.
The site shows source availability notices; MCP exposes the same warnings and
`via: "datacite"` in `source_status`, with `partial: true` for fallback searches.
Changing the site does not silently update installed MCP versions: release a new
MCP version pinned to the tested engine revision, then update the installation.

Coverage thresholds were rebaselined when upgrading from Vitest 3 to 5, whose
AST-based counters report untested functions/branches differently. All existing
tests remain required, alongside browser regression tests.

## Privacy

Everything runs locally in your browser. No tracking, no data collection. Direct API calls to public academic databases.

## License

MIT

Paper relevance scores use 0–100. Identity and score-filter examples are in
`tests/fixtures/paper-contract.json`; MCP parity tests exercise the shared engine directly.
