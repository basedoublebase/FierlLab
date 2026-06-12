import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FierlLab",
    short_name: "FierlLab",
    description: "Sprong-resultaten, winddata en theoretisch maximum voor polsstokverspringen",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#d70015",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
