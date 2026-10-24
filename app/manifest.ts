import type { MetadataRoute } from "next";

/** Lets the app be added to the home screen and open full-screen, like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Road to Sub-30",
    short_name: "Sub-30",
    description: "Knee-safe 5K and half-marathon training plan and log.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1319",
    theme_color: "#f2541b",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
