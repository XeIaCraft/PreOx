import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PreOx — Hub applicatif",
    short_name: "PreOx",
    description:
      "PreOx est un hub applicatif centralisé qui réunit vos outils métiers dans un seul espace, avec des accès gérés module par module.",
    start_url: "/apps",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#2f5d54",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
