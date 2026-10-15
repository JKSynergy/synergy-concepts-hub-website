import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Synergy Concepts Hub Portal",
    short_name: "SCH Portal",
    description: "Synergy Concepts Hub Client & Admin Portal",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    background_color: "#0B0F19",
    theme_color: "#0B0F19",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity", "finance"],
    icons: [
      {
        src: "/images/sch-logo-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/sch-logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/images/sch-logo-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/images/sch-logo-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
