import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // D-ID may be configured in Rork as VITE_*, EXPO_PUBLIC_*, or DID_*.
  // Keep all supported public prefixes available to the browser build.
  envPrefix: ["VITE_", "EXPO_PUBLIC_", "DID_"],
}));
