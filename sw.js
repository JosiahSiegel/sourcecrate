// ============================================================================
// SERVICE WORKER - Cache API responses for instant repeat searches
// ============================================================================

const CACHE_NAME = 'sourcecrate-v2';
const SEARCH_CACHE = 'sourcecrate-searches-v2';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/state.js',
    '/js/api.js',
    '/js/utils.js',
    '/js/rendering.js',
    '/js/processing-poc.js',
    '/js/api-clients/orchestrator.js',
    '/favicon.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => {
            // Activate immediately
            return self.skipWaiting();
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName.startsWith('sourcecrate-') && cacheName !== CACHE_NAME && cacheName !== SEARCH_CACHE) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control immediately
            return self.clients.claim();
        })
    );
});

// Fetch event - cache API responses
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Cache API requests (academic databases)
    const isAPIRequest = url.hostname === 'api.crossref.org' ||
                         url.hostname === 'export.arxiv.org' ||
                         url.hostname === 'api.openalex.org' ||
                         url.hostname === 'eutils.ncbi.nlm.nih.gov' ||
                         url.hostname === 'doaj.org' ||
                         url.hostname === 'europepmc.org' ||
                         url.hostname === 'api.unpaywall.org' ||
                         url.hostname === 'api.datacite.org' ||
                         url.hostname === 'zenodo.org';

    if (isAPIRequest) {
        event.respondWith(
            cacheAPIRequest(event.request)
        );
        return;
    }

    // Refresh same-origin application assets, with an offline fallback.
    if (url.origin === self.location.origin && (STATIC_ASSETS.some(asset => url.pathname === asset) ||
        url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/'))) {
        event.respondWith(
            fetch(event.request).then(async response => {
                if (response.ok) {
                    try { const cache = await caches.open(CACHE_NAME); await cache.put(event.request, response.clone()); }
                    catch { /* Storage is optional; keep serving the network response. */ }
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // For everything else: network-first
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

/**
 * Cache API requests with timestamp for TTL
 */
async function cacheAPIRequest(request) {
    let cache, cached;
    try { cache = await caches.open(SEARCH_CACHE); cached = await cache.match(request); }
    catch { return fetch(request); }

    if (cached) {
        // Check if cached response is still fresh
        const cachedTime = await getCacheTime(request.url);
        if (cachedTime && (Date.now() - cachedTime < CACHE_DURATION)) {
            return cached;
        }
    }

    let timeoutId;
    try {
        // Fetch fresh data with 30s timeout (2x client timeout for safety margin)
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);

        // Cache successful responses
        if (response.ok) {
            try {
                await cache.put(request, response.clone());
                await setCacheTime(request.url, Date.now());
            } catch { /* Cache failures must not discard a successful response. */ }
        }

        return response;
    } catch (error) {
        // If network fails, return cached version even if stale
        if (cached) {
            return cached;
        }
        throw error;
    } finally { clearTimeout(timeoutId); }
}

/**
 * Store cache timestamp in IndexedDB
 */
async function setCacheTime(url, timestamp) {
    const db = await openDB();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction('cache-times', 'readwrite');
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
            tx.objectStore('cache-times').put({ url, timestamp });
        });
    } finally { db.close(); }
}

/**
 * Get cache timestamp from IndexedDB
 */
async function getCacheTime(url) {
    try {
        const db = await openDB();
        try {
            return await new Promise((resolve, reject) => {
                const request = db.transaction('cache-times', 'readonly').objectStore('cache-times').get(url);
                request.onsuccess = () => resolve(request.result?.timestamp ?? null);
                request.onerror = () => reject(request.error);
            });
        } finally { db.close(); }
    } catch {
        return null;
    }
}

/**
 * Open IndexedDB for cache metadata
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('sourcecrate-cache', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('cache-times')) {
                db.createObjectStore('cache-times', { keyPath: 'url' });
            }
        };
    });
}

// Message handler for cache clearing
self.addEventListener('message', (event) => {
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(SEARCH_CACHE).then(() => {
                return { success: true };
            })
        );
    }
});
