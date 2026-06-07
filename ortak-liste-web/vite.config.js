import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Ortak Liste",
        short_name: "Liste",
        description: "Ortak alışveriş ve yapılacaklar listesi",
        theme_color: "#111827",
        background_color: "#f4f6f8",
        display: "standalone",
        start_url: "/"
      },
    }),
  ],
});
