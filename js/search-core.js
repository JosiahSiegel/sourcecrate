// Shared by sourcecrate.org and the MCP adapter. No browser UI state belongs here.
import ClientSearchOrchestrator, { defaultSources } from './api-clients/orchestrator.js';
import PaperProcessor from './processing-poc.js';
import { applyFilters, sortByRelevance } from './utils.js';

export const sources = defaultSources.filter(source => source !== 'semanticscholar');
export const DEFAULT_MIN_RELEVANCE = 25;

export function rankPapers(papers, query) {
    const processor = new PaperProcessor();
    // Source completion order must not decide which duplicate's metadata wins.
    const ordered = [...papers].sort((a, b) => {
        const key = p => `${p.source || ''}\n${p.doi || ''}\n${p.title || ''}\n${JSON.stringify(p.authors || [])}`;
        return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
    });
    return sortByRelevance(processor.processPapers(ordered, query));
}

export async function searchPapers(query, options = {}) {
    const { limit = 25, pdfOnly = false, minRelevance = DEFAULT_MIN_RELEVANCE, maxResults = null, signal, onSourceStart, onResults,
        onSourceComplete, onComplete, sources: selected = sources } = options;
    if (typeof query !== 'string' || !query.trim()) throw new Error('A search query is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1–100');
    if (!Number.isFinite(minRelevance) || minRelevance < 0 || minRelevance > 100) throw new Error('Minimum relevance must be 0–100');
    if (maxResults !== null && (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 1000)) {
        throw new Error('Maximum results must be 1–1000');
    }
    if (!Array.isArray(selected) || !selected.length || selected.some(s => !sources.includes(s))) {
        throw new Error('Select supported SourceCrate sources');
    }
    const combinedSignal = AbortSignal.any([AbortSignal.timeout(25000), ...[signal].filter(Boolean)]);
    const orchestrator = new ClientSearchOrchestrator({ signal: combinedSignal });
    const raw = [];
    const sourceStatus = [];
    let papers = [];
    const select = ranked => {
        const filtered = applyFilters(ranked, pdfOnly, minRelevance, true);
        return maxResults === null ? filtered : filtered.slice(0, maxResults);
    };
    const summary = await orchestrator.searchWithCallbacks(query.trim(), {
        limit, sources: [...new Set(selected)], onSourceStart,
        onResults(data) {
            raw.push(...data.papers);
            papers = rankPapers(raw, query);
            onResults?.({ ...data, papers: select(papers) });
        },
        onSourceComplete(data) {
            sourceStatus.push({ source: data.source, count: data.count, error: data.error || null,
                ...(data.warning ? { warning: data.warning, via: data.via } : {}) });
            onSourceComplete?.(data);
        },
        async onComplete(data) {
            await onComplete?.(data);
        }
    });
    if (signal?.aborted) throw signal.reason || new Error('Search cancelled');
    const matching = applyFilters(papers, pdfOnly, minRelevance, true);
    const filtered = select(papers);
    return { ...summary, total_candidates: summary.total_results, total_results: filtered.length, papers: filtered,
        total_ranked: papers.length, total_matching: matching.length,
        filtered_out: papers.length - matching.length, truncated: filtered.length < matching.length,
        filters: { min_relevance: minRelevance, max_results: maxResults, pdf_only: pdfOnly },
        source_status: sourceStatus, partial: sourceStatus.some(s => s.error || s.warning) };
}
