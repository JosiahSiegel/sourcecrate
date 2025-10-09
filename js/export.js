// ============================================================================
// EXPORT.JS - Export results to various citation formats (BibTeX, RIS, CSV, JSON)
// ============================================================================
// All processing is client-side using native browser APIs

import { formatAuthors, normalizeDoi } from './utils.js';

/**
 * Escape special characters for BibTeX
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeBibTeX(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[{}]/g, (char) => `\\${char}`)
        .replace(/[&%$#_]/g, (char) => `\\${char}`)
        .replace(/~/g, '\\textasciitilde{}')
        .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Generate BibTeX key from paper
 * Format: FirstAuthorLastName + Year + FirstTitleWord
 * @param {Object} paper - Paper object
 * @returns {string} BibTeX citation key
 */
function generateBibTeXKey(paper) {
    let key = '';

    // Get first author's last name
    if (paper.authors && paper.authors.length > 0) {
        const firstAuthor = paper.authors[0];
        const lastName = firstAuthor.split(' ').pop().replace(/[^a-zA-Z]/g, '');
        key += lastName;
    } else {
        key += 'Unknown';
    }

    // Add year
    key += paper.year || 'XXXX';

    // Add first meaningful word from title (>3 chars)
    if (paper.title) {
        const words = paper.title.split(/\s+/);
        const firstWord = words.find(w => w.length > 3)?.replace(/[^a-zA-Z]/g, '') || 'paper';
        key += firstWord;
    }

    return key;
}

/**
 * Export papers to BibTeX format
 * @param {Array} papers - Array of paper objects
 * @returns {string} BibTeX formatted string
 */
export function exportToBibTeX(papers) {
    const entries = papers.map(paper => {
        const key = generateBibTeXKey(paper);
        const title = escapeBibTeX(paper.title || 'Untitled');
        const authors = paper.authors?.join(' and ') || 'Unknown';
        const year = paper.year || '';
        const journal = escapeBibTeX(paper.journal || '');
        const doi = normalizeDoi(paper.doi);
        const abstract = escapeBibTeX(paper.abstract || '');
        const url = paper.url || '';

        // Determine entry type
        const isPreprint = paper.source?.toLowerCase().includes('arxiv') ||
                          paper.source?.toLowerCase().includes('preprint');
        const hasJournal = journal && journal.trim() !== '';
        const entryType = (isPreprint || !hasJournal) ? 'misc' : 'article';

        let bibtex = `@${entryType}{${key},\n`;
        bibtex += `  title = {${title}},\n`;
        bibtex += `  author = {${authors}},\n`;
        if (year) bibtex += `  year = {${year}},\n`;
        if (journal) bibtex += `  journal = {${journal}},\n`;
        if (doi) bibtex += `  doi = {${doi}},\n`;
        if (abstract) bibtex += `  abstract = {${abstract}},\n`;
        if (url) bibtex += `  url = {${url}},\n`;
        if (paper.source) bibtex += `  note = {Source: ${paper.source}},\n`;
        bibtex += `}\n`;

        return bibtex;
    });

    return entries.join('\n');
}

/**
 * Export papers to RIS format (EndNote, Mendeley, Zotero)
 * @param {Array} papers - Array of paper objects
 * @returns {string} RIS formatted string
 */
export function exportToRIS(papers) {
    const entries = papers.map(paper => {
        const isPreprint = paper.source?.toLowerCase().includes('arxiv') ||
                          paper.source?.toLowerCase().includes('preprint');
        const type = isPreprint ? 'INPR' : 'JOUR'; // INPR = in press/preprint, JOUR = journal article

        let ris = `TY  - ${type}\n`;
        ris += `TI  - ${paper.title || 'Untitled'}\n`;

        // Authors (one per line)
        if (paper.authors && paper.authors.length > 0) {
            paper.authors.forEach(author => {
                ris += `AU  - ${author}\n`;
            });
        }

        if (paper.year) ris += `PY  - ${paper.year}\n`;
        if (paper.journal) ris += `JO  - ${paper.journal}\n`;
        if (paper.abstract) ris += `AB  - ${paper.abstract}\n`;
        if (paper.doi) ris += `DO  - ${normalizeDoi(paper.doi)}\n`;
        if (paper.url) ris += `UR  - ${paper.url}\n`;
        if (paper.source) ris += `N1  - Source: ${paper.source}\n`;

        ris += `ER  - \n\n`;

        return ris;
    });

    return entries.join('');
}

/**
 * Export papers to CSV format
 * @param {Array} papers - Array of paper objects
 * @returns {string} CSV formatted string
 */
export function exportToCSV(papers) {
    // CSV header
    const headers = ['Title', 'Authors', 'Year', 'Journal', 'DOI', 'URL', 'PDF URL', 'Abstract', 'Source', 'Citations', 'Open Access'];

    // Escape CSV field
    const escapeCSV = (field) => {
        if (!field) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    // Build CSV rows
    const rows = papers.map(paper => {
        return [
            escapeCSV(paper.title || ''),
            escapeCSV(formatAuthors(paper.authors)),
            escapeCSV(paper.year || ''),
            escapeCSV(paper.journal || ''),
            escapeCSV(normalizeDoi(paper.doi) || ''),
            escapeCSV(paper.url || ''),
            escapeCSV(paper.pdf_url || ''),
            escapeCSV(paper.abstract || ''),
            escapeCSV(paper.source || ''),
            escapeCSV(paper.citation_count || 0),
            escapeCSV(paper.is_open_access ? 'Yes' : 'No')
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

/**
 * Export papers to JSON format
 * @param {Array} papers - Array of paper objects
 * @returns {string} JSON formatted string
 */
export function exportToJSON(papers) {
    // Clean papers for export (remove internal fields)
    const cleanedPapers = papers.map(paper => {
        const cleaned = {
            title: paper.title,
            authors: paper.authors,
            year: paper.year,
            journal: paper.journal,
            abstract: paper.abstract,
            doi: normalizeDoi(paper.doi),
            url: paper.url,
            pdf_url: paper.pdf_url,
            source: paper.source,
            citation_count: paper.citation_count || 0,
            is_open_access: paper.is_open_access || false
        };

        // Include source links if available
        if (paper._source_links) {
            cleaned.source_links = paper._source_links;
        }

        return cleaned;
    });

    return JSON.stringify(cleanedPapers, null, 2);
}

/**
 * Download content as file
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 */
export function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export papers in specified format
 * @param {Array} papers - Array of paper objects
 * @param {string} format - Export format ('bibtex', 'ris', 'csv', 'json')
 */
export function exportPapers(papers, format) {
    if (!papers || papers.length === 0) {
        alert('No papers to export');
        return;
    }

    const timestamp = new Date().toISOString().split('T')[0];
    let content, filename, mimeType;

    switch (format.toLowerCase()) {
        case 'bibtex':
            content = exportToBibTeX(papers);
            filename = `sourcecrate_export_${timestamp}.bib`;
            mimeType = 'application/x-bibtex';
            break;

        case 'ris':
            content = exportToRIS(papers);
            filename = `sourcecrate_export_${timestamp}.ris`;
            mimeType = 'application/x-research-info-systems';
            break;

        case 'csv':
            content = exportToCSV(papers);
            filename = `sourcecrate_export_${timestamp}.csv`;
            mimeType = 'text/csv';
            break;

        case 'json':
            content = exportToJSON(papers);
            filename = `sourcecrate_export_${timestamp}.json`;
            mimeType = 'application/json';
            break;

        default:
            alert(`Unknown export format: ${format}`);
            return;
    }

    downloadFile(content, filename, mimeType);
}
