import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement the 2D canvas context (and throws "not implemented" when
// asked for one). The runtime/renderer already treat a missing context as a no-op, so
// stub getContext to return null quietly to keep test output clean.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
