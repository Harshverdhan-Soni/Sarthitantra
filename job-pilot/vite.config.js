import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Keep Vite's dep-prebundle cache in /tmp so NTFS mount restrictions don't block builds
  cacheDir: "/tmp/vite-cache",
  // App runs on port 4173 (dev server and preview).
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
