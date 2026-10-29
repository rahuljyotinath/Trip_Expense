import type { MetadataRoute } from "next"
import { getAppDisplayName, isDevelopmentBrand } from "@/lib/app-display-name"

export default function manifest(): MetadataRoute.Manifest {
  const name = getAppDisplayName()
  const shortName = name === "Tripzy_Development" ? "Tripzy_Dev" : name
  const iconPath = isDevelopmentBrand() ? "/icon-dev.svg" : "/icon.svg"
  return {
    name,
    short_name: shortName,
    description: "Split trip spends and settle with your group.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f0e8",
    theme_color: "#8B4519",
    icons: [
      { src: iconPath, sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
