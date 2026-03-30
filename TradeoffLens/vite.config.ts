import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "lens-core/shell.css",
        replacement: path.resolve(__dirname, "../packages/lens-core/src/shell.css"),
      },
      {
        find: "lens-core",
        replacement: path.resolve(__dirname, "../packages/lens-core/src/index.ts"),
      },
    ],
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  test: {
    environment: "node",
    globals: true,
  },
});
