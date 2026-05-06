import { defineConfig } from "vite";

export default defineConfig({
  base: "/gesture-control/",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("@huggingface/transformers")) return "vendor-transformers";
          if (id.includes("@mediapipe/tasks-vision")) return "vendor-mediapipe";
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
