// Book metadata complements the journal/preprint sources for title + author searches.
// API: https://openlibrary.org/dev/docs/api/search
import BaseAPIClient from './base.js';

export default class OpenLibraryClient extends BaseAPIClient {
    constructor() { super('Open Library'); }

    async search(query, limit = 25) {
        try {
            const params = new URLSearchParams({ q: query, limit,
                fields: 'key,title,author_name,first_publish_year' });
            const response = await this.fetchWithTimeout(`https://openlibrary.org/search.json?${params}`);
            if (!response.ok) return [];
            const data = await response.json();
            return (data.docs || []).filter(book => book.title && /^(\/works\/)?OL\d+W$/.test(book.key))
                .map(book => ({ title: book.title, authors: book.author_name || [],
                    year: book.first_publish_year, source: 'Open Library',
                    url: `https://openlibrary.org/works/${book.key.replace('/works/', '')}`,
                    pdf_url: null, is_open_access: false, citation_count: 0 }));
        } catch (error) {
            this.lastError = error.message;
            return [];
        }
    }
}
