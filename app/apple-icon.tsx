import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f2541b", color: "#fff", fontSize: 84, fontWeight: 800, letterSpacing: -3 }}>
        WF
      </div>
    ),
    size,
  );
}
