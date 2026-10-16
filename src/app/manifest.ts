import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReadersBank",
    short_name: "ReadersBank",
    description: "읽을 만한 글을 한국어 웹진으로",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#e9e9e7",
    theme_color: "#e9e9e7",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
