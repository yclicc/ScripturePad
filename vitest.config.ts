import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Shared parsing logic is pure and needs no Worker runtime, so it runs in
    // plain node. Tests that need D1/KV bindings should use
    // @cloudflare/vitest-pool-workers in a separate project.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
