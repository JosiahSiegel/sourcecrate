# SourceCrate

Academic paper search that runs entirely in your browser. No backend needed.

## How it works

Searches academic databases in parallel. Everything happens client-side - the deduplication, BM25 relevance scoring, all of it.

## Usage

Clone and open `index.html`:

```bash
git clone https://github.com/JosiahSiegel/sourcecrate.git
cd sourcecrate
open index.html
```

Search for papers by keywords, DOI, or author names. Results stream in as each source responds. Click paper titles to search for similar work.

## Development

Vanilla JS with ES6 modules. No build step.

```bash
npm run dev      # Start development server (port 3000)
npm test         # Run unit + integration tests
npm run test:e2e # Run E2E tests (port 3001)
```

For Git Bash/Linux/macOS users who prefer a custom port:
```bash
node dev-server.js 3001
```

## Privacy

Everything runs locally in your browser. No tracking, no data collection. Direct API calls to public academic databases.

## License

MIT
