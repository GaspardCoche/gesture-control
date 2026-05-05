import { defineConfig } from "vite";

export default defineConfig({
  base: "/gesture-control/",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
  },
});
