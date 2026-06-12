// Test setup file for vitest
// This runs before each test file

// Mock localStorage for browser-dependent code
const localStorageMock = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
}
global.localStorage = localStorageMock as any

// Mock performance.now for time-based tests
if (!global.performance) {
  global.performance = { now: () => Date.now() } as any
}
