import type { MetadataRoute } from "next";

/** Lets the app be added to the home screen and open full-screen, like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorkoutFlex",
    short_name: "WorkoutFlex",
    description: "Flexible running and strength training plan and log.",
    start_url: "/",
    display: "standalone",
    // The light page colour: iOS paints this while relaunching the app, and the old near-black flashed between frames
    background_color: "#eef1f4",
    theme_color: "#f2541b",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
