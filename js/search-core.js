// Shared by sourcecrate.org and the MCP adapter. No browser UI state belongs here.
import ClientSearchOrchestrator, { defaultSources } from './api-clients/orchestrator.js';
import PaperProcessor from './processing-poc.js';
import { applyFilters, sortByRelevance } from './utils.js';

export const sources = defaultSources.filter(source => source !== 'semanticscholar');

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
    const { limit = 25, pdfOnly = false, signal, onSourceStart, onResults,
        onSourceComplete, onComplete, sources: selected = sources } = options;
    if (typeof query !== 'string' || !query.trim()) throw new Error('A search query is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1–100');
    if (!Array.isArray(selected) || !selected.length || selected.some(s => !sources.includes(s))) {
        throw new Error('Select supported SourceCrate sources');
    }
    const combinedSignal = AbortSignal.any([AbortSignal.timeout(25000), ...[signal].filter(Boolean)]);
    const orchestrator = new ClientSearchOrchestrator({ signal: combinedSignal });
    const raw = [];
    const sourceStatus = [];
    let papers = [];
    const summary = await orchestrator.searchWithCallbacks(query.trim(), {
        limit, sources: [...new Set(selected)], onSourceStart,
        onResults(data) {
            raw.push(...data.papers);
            papers = rankPapers(raw, query);
            onResults?.({ ...data, papers });
        },
        onSourceComplete(data) {
            sourceStatus.push({ source: data.source, count: data.count, error: data.error || null });
            onSourceComplete?.(data);
        },
        async onComplete(data) {
            await onComplete?.(data);
        }
    });
    if (signal?.aborted) throw signal.reason || new Error('Search cancelled');
    const filtered = applyFilters(papers, pdfOnly, 0, true);
    return { ...summary, total_candidates: summary.total_results, total_results: filtered.length, papers: filtered,
        source_status: sourceStatus, partial: sourceStatus.some(s => s.error) };
}
