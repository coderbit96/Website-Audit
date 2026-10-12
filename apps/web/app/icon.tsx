import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#020617",
        border: "3px solid #22d3ee",
        borderRadius: "16px",
        color: "#cffafe",
        display: "flex",
        fontFamily: "sans-serif",
        fontSize: 38,
        fontWeight: 700,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      S
    </div>,
    size,
  );
}
