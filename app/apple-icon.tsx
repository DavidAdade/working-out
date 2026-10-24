import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f2541b", color: "#fff", fontSize: 104, fontWeight: 800, letterSpacing: -2 }}>
        30
      </div>
    ),
    size,
  );
}
