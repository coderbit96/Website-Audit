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
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <svg fill="none" height="42" viewBox="0 0 32 32" width="42">
        <path
          d="M5.5 6.5v19M5.5 25.5h21"
          stroke="#67e8f9"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
        <path
          d="m8.5 21 5.25-5.25 4 3.25 7.75-8"
          stroke="#67e8f9"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <circle cx="25.75" cy="11" fill="#67e8f9" r="2.75" />
      </svg>
    </div>,
    size,
  );
}
