// Global setup that runs BEFORE any tests
// This ensures fetch is mocked before any modules are imported

export function setup() {
    // This runs once before all tests
    console.log('[TEST SETUP] Initializing global mocks');
}

export function teardown() {
    // This runs once after all tests
    console.log('[TEST TEARDOWN] Cleaning up global mocks');
}
