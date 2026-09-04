import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Must match the callback URL registered with YouVersion
  // (http://localhost:8787/auth/callback) and the `dev.port` in
  // wrangler.jsonc. Vite defaults to 5173 and does not inherit that setting,
  // so OAuth breaks unless it is pinned here too. `strictPort` fails loudly
  // rather than silently moving to another port.
  server: {
    port: 8787,
    strictPort: true,
  },
  // The Cloudflare plugin manages the output layout itself, emitting the
  // browser bundle to dist/client and the worker to dist/scripturepad.
  // Do not override build.outDir: pointing it at dist/client nests both
  // environments inside that directory, which makes the worker bundle — and
  // the .dev.vars it inlines — part of the served static assets.
  plugins: [cloudflare()],
});
