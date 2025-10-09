// ============================================================================
// ORCHESTRATOR.JS - Client-side search orchestrator
// ============================================================================
// Coordinates parallel searches across multiple CORS-enabled academic APIs
// Uses dynamic imports to load API clients only when needed (-40KB initial load)

/**
 * Default sources list - SINGLE SOURCE OF TRUTH
 * All available academic sources configured for client-side search
 * Note: Some sources may need to be filtered out for CORS compatibility
 */
export const defaultSources = [
    'arxiv',
    'crossref',
    'pubmed',
    'openalex',
    'doaj',
    'europepmc',
    'semanticscholar',
    'unpaywall',
    'datacite',
    'zenodo'
];

/**
 * Client-side search orchestrator for CORS-enabled sources
 * Runs searches in parallel directly from the browser
 */
export class ClientSearchOrchestrator {
    constructor() {
        // Lazy-loaded clients (loaded on first search via dynamic import -40KB initial)
        this.clients = {};
        this.clientPromises = {}; // Track loading promises to avoid duplicate imports
        this.defaultSources = defaultSources;
    }

    /**
     * Dynamically load and cache an API client
     * @param {string} sourceName - Name of the source (e.g., 'arxiv')
     * @returns {Promise<Object>} Client instance
     */
    async getClient(sourceName) {
        // Return cached client if already loaded
        if (this.clients[sourceName]) {
            return this.clients[sourceName];
        }

        // Return in-progress promise if currently loading
        if (this.clientPromises[sourceName]) {
            return this.clientPromises[sourceName];
        }

        // Start loading the client module
        this.clientPromises[sourceName] = (async () => {
            try {
                let ClientClass;
                switch (sourceName) {
                    case 'arxiv':
                        ClientClass = (await import('./arxiv.js')).default;
                        break;
                    case 'crossref':
                        ClientClass = (await import('./crossref.js')).default;
                        break;
                    case 'pubmed':
                        ClientClass = (await import('./pubmed.js')).default;
                        break;
                    case 'openalex':
                        ClientClass = (await import('./openalex.js')).default;
                        break;
                    case 'doaj':
                        ClientClass = (await import('./doaj.js')).default;
                        break;
                    case 'europepmc':
                        ClientClass = (await import('./europepmc.js')).default;
                        break;
                    case 'semanticscholar':
                        ClientClass = (await import('./semanticscholar.js')).default;
                        break;
                    case 'unpaywall':
                        ClientClass = (await import('./unpaywall.js')).default;
                        break;
                    case 'datacite':
                        ClientClass = (await import('./datacite.js')).default;
                        break;
                    case 'zenodo':
                        ClientClass = (await import('./zenodo.js')).default;
                        break;
                    default:
                        throw new Error(`Unknown source: ${sourceName}`);
                }

                // Instantiate and cache
                this.clients[sourceName] = new ClientClass();
                return this.clients[sourceName];
            } catch (error) {
                console.error(`[ClientSearch] Failed to load ${sourceName}:`, error);
                throw error;
            }
        })();

        return this.clientPromises[sourceName];
    }

    /**
     * Search across multiple sources in parallel
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Search results with metadata
     */
    async search(query, options = {}) {
        const {
            limit = 10,
            sources = this.defaultSources,
            onSourceStart = null,
            onSourceComplete = null,
            onProgress = null
        } = options;

        const startTime = performance.now();
        const results = {
            papers: [],
            sources_searched: 0,
            sources_successful: 0,
            total_results: 0,
            elapsed_ms: 0
        };

        // Create search promises for all sources
        const searchPromises = sources.map(async (sourceName) => {
            try {
                // Notify source started
                if (onSourceStart) {
                    onSourceStart({ source: sourceName });
                }

                // Dynamically load client if not cached
                const client = await this.getClient(sourceName);
                const papers = await client.search(query, limit);

                // Notify source completed
                if (onSourceComplete) {
                    onSourceComplete({
                        source: sourceName,
                        count: papers.length,
                        success: true
                    });
                }

                return { source: sourceName, papers, error: null };
            } catch (error) {
                console.error(`[ClientSearch] ${sourceName} failed:`, error);

                // Notify source completed (with error)
                if (onSourceComplete) {
                    onSourceComplete({
                        source: sourceName,
                        count: 0,
                        success: false,
                        error: error.message
                    });
                }

                return { source: sourceName, papers: [], error: error.message };
            }
        });

        // Wait for all searches to complete
        const sourceResults = await Promise.all(searchPromises);

        // Aggregate results
        sourceResults.forEach(result => {
            results.sources_searched++;
            if (result.papers.length > 0) {
                results.sources_successful++;
                results.papers.push(...result.papers);
                results.total_results += result.papers.length;
            }
        });

        results.elapsed_ms = performance.now() - startTime;

        return results;
    }

    /**
     * Search with streaming-like callback support
     * Calls onResults callback as each source completes
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Object>} Final aggregated results
     */
    async searchWithCallbacks(query, options = {}) {
        const {
            limit = 10,
            sources = this.defaultSources,
            onSourceStart = null,
            onResults = null,
            onSourceComplete = null,
            onComplete = null
        } = options;

        const startTime = performance.now();
        let sourcesCompleted = 0;
        let sourcesSuccessful = 0;
        let totalResults = 0;

        // Search each source and call callbacks as they complete
        const searchPromises = sources.map(async (sourceName) => {
            try {
                // Notify source started
                if (onSourceStart) {
                    onSourceStart({ source: sourceName });
                }

                // Dynamically load client if not cached
                const client = await this.getClient(sourceName);
                const papers = await client.search(query, limit);

                // Notify results received (streaming-like)
                if (onResults && papers.length > 0) {
                    onResults({
                        source: sourceName,
                        papers,
                        count: papers.length
                    });
                }

                sourcesCompleted++;
                if (papers.length > 0) {
                    sourcesSuccessful++;
                    totalResults += papers.length;
                }

                // Notify source completed
                if (onSourceComplete) {
                    onSourceComplete({
                        source: sourceName,
                        count: papers.length,
                        completed: sourcesCompleted,
                        total: sources.length
                    });
                }
            } catch (error) {
                console.error(`[ClientSearch] ${sourceName} failed:`, error);
                sourcesCompleted++;

                // Notify source completed (with error)
                if (onSourceComplete) {
                    onSourceComplete({
                        source: sourceName,
                        count: 0,
                        completed: sourcesCompleted,
                        total: sources.length,
                        error: error.message
                    });
                }
            }
        });

        // Wait for all searches to complete
        await Promise.all(searchPromises);

        const elapsedMs = performance.now() - startTime;

        // Notify search complete
        if (onComplete) {
            onComplete({
                sources_searched: sources.length,
                sources_successful: sourcesSuccessful,
                total_results: totalResults,
                elapsed_ms: elapsedMs
            });
        }

        return {
            sources_searched: sources.length,
            sources_successful: sourcesSuccessful,
            total_results: totalResults,
            elapsed_ms: elapsedMs
        };
    }
}

export default ClientSearchOrchestrator;
