// ============================================================================
// SERVICE WORKER - Cache API responses for instant repeat searches
// ============================================================================

const CACHE_NAME = 'sourcecrate-v1';
const SEARCH_CACHE = 'sourcecrate-searches-v1';
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
                    if (cacheName !== CACHE_NAME && cacheName !== SEARCH_CACHE) {
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
    const isAPIRequest = url.hostname.includes('api.crossref.org') ||
                         url.hostname.includes('export.arxiv.org') ||
                         url.hostname.includes('api.openalex.org') ||
                         url.hostname.includes('eutils.ncbi.nlm.nih.gov') ||
                         url.hostname.includes('doaj.org') ||
                         url.hostname.includes('europepmc.org') ||
                         url.hostname.includes('api.unpaywall.org') ||
                         url.hostname.includes('api.datacite.org') ||
                         url.hostname.includes('zenodo.org');

    if (isAPIRequest) {
        event.respondWith(
            cacheAPIRequest(event.request)
        );
        return;
    }

    // For static assets and dynamic imports: cache-first strategy
    if (STATIC_ASSETS.some(asset => url.pathname === asset) ||
        url.pathname.startsWith('/js/api-clients/') ||
        url.pathname.includes('/js/bloom-filter.js')) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request).then((fetchResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, fetchResponse.clone());
                        return fetchResponse;
                    });
                });
            })
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
    const cache = await caches.open(SEARCH_CACHE);
    const cached = await cache.match(request);

    if (cached) {
        // Check if cached response is still fresh
        const cachedTime = await getCacheTime(request.url);
        if (cachedTime && (Date.now() - cachedTime < CACHE_DURATION)) {
            return cached;
        }
    }

    try {
        // Fetch fresh data with 30s timeout (2x client timeout for safety margin)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);

        // Cache successful responses
        if (response.ok) {
            await cache.put(request, response.clone());
            await setCacheTime(request.url, Date.now());
        }

        return response;
    } catch (error) {
        // If network fails, return cached version even if stale
        if (cached) {
            return cached;
        }
        throw error;
    }
}

/**
 * Store cache timestamp in IndexedDB
 */
async function setCacheTime(url, timestamp) {
    const db = await openDB();
    const tx = db.transaction('cache-times', 'readwrite');
    tx.objectStore('cache-times').put({ url, timestamp });
    return tx.complete;
}

/**
 * Get cache timestamp from IndexedDB
 */
async function getCacheTime(url) {
    try {
        const db = await openDB();
        const tx = db.transaction('cache-times', 'readonly');
        const record = await tx.objectStore('cache-times').get(url);
        return record?.timestamp;
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
