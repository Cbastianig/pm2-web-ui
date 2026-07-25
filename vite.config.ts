import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  server: {
    port: 3005,
  },
  optimizeDeps: {
    exclude: ["pm2"],
  },
  ssr: {
    external: ["pm2", "better-sqlite3"],
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact(), viteTsConfigPaths()],
});
