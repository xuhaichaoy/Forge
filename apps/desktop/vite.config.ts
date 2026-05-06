import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@hicodex/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
      "@hicodex/codex-protocol": fileURLToPath(
        new URL("../../packages/codex-protocol/src", import.meta.url),
      ),
    },
  },
});
