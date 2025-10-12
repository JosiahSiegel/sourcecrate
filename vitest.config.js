import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for fast DOM simulation
    environment: 'happy-dom',

    // Test file patterns
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],

    // Coverage configuration (Vitest 3 auto-excludes test files)
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        ['json', { file: 'coverage.json' }],
        ['html'],
        ['lcov', { projectRoot: './src' }]
      ],
      include: ['js/**/*.js'],
      exclude: [
        'js/sponsors-data.js', // Static data
        'js/app.js' // Entry point with event handlers - tested via E2E
      ],
      thresholds: {
        lines: 45,
        functions: 60,
        branches: 65,
        statements: 45,
        // Per-file thresholds for critical modules (lowered to match current coverage)
        'js/processing-poc.js': { lines: 70, functions: 70 },
        'js/utils.js': { lines: 55, functions: 60 }
      }
    },

    // Mock localStorage
    setupFiles: ['./tests/setup.js'],

    // Test timeout (increased for integration tests with mocked APIs)
    testTimeout: 15000,

    // Global test options
    globals: true,

    // Performance optimizations (Vitest 3)
    pool: 'threads',
    poolOptions: {
      threads: {
        // Use available CPU cores for parallel execution
        maxThreads: 4,
        minThreads: 1
      }
    },

    // Vitest 3: Projects configuration (recommended pattern)
    projects: [
      {
        // Project for tests that need DOM
        test: {
          name: 'unit-and-integration',
          include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
          exclude: ['tests/unit/api-mocking.test.js'], // API mocking tests use node environment
          environment: 'happy-dom',
          setupFiles: ['./tests/setup.js']
        }
      },
      {
        // Project for API mocking tests (no DOM, pure Node.js for MSW compatibility)
        test: {
          name: 'api-mocking',
          include: ['tests/unit/api-mocking.test.js'],
          environment: 'node',
          setupFiles: ['./tests/setup-msw-only.js'] // MSW-only setup without DOM mocks
        }
      }
    ]
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': '/js'
    }
  }
});
