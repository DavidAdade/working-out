import type { MetadataRoute } from "next";

/** Lets the app be added to the home screen and open full-screen, like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorkoutFlex",
    short_name: "WorkoutFlex",
    description: "Flexible running and strength training plan and log.",
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
