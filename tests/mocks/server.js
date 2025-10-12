// ============================================================================
// MSW SERVER CONFIGURATION
// ============================================================================
// Configures Mock Service Worker for Node.js test environment
// See: https://mswjs.io/docs/integrations/node

import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

// Create MSW server with all request handlers
export const server = setupServer(...handlers);

// Enable detailed request logging in verbose mode
if (process.env.TEST_VERBOSE) {
  server.events.on('request:start', ({ request }) => {
    console.log('[MSW] Intercepted:', request.method, request.url);
  });

  server.events.on('request:match', ({ request }) => {
    console.log('[MSW] Matched handler for:', request.method, request.url);
  });

  server.events.on('request:unhandled', ({ request }) => {
    console.log('[MSW] No handler for:', request.method, request.url);
  });
}

// ============================================================================
// USAGE
// ============================================================================
// In tests/setup.js:
//   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
//   afterEach(() => server.resetHandlers())
//   afterAll(() => server.close())
//
// In individual tests (for per-test overrides):
//   import { server } from '../mocks/server.js'
//   import { http, HttpResponse } from 'msw'
//
//   it('should handle custom response', () => {
//     server.use(
//       http.get('https://api.example.com/*', () => {
//         return HttpResponse.json({ custom: 'data' })
//       })
//     )
//     // ... test code
//   })
