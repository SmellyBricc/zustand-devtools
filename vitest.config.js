import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["bridge/test/**/*.test.ts", "tests/**/*.test.js"],
    // Each file gets a fresh jsdom window so bridge module-level state
    // (registry, listeners, session ID) can't leak between suites.
    isolate: true,
  },
});
