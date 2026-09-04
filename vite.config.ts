import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // The Cloudflare plugin manages the output layout itself, emitting the
  // browser bundle to dist/client and the worker to dist/scripturepad.
  // Do not override build.outDir: pointing it at dist/client nests both
  // environments inside that directory, which makes the worker bundle — and
  // the .dev.vars it inlines — part of the served static assets.
  plugins: [cloudflare()],
});
