import { ImageResponse } from "next/og";

export const alt = "SiteSignal website audit platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#020617",
        color: "#f8fafc",
        display: "flex",
        fontFamily: "sans-serif",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#22d3ee",
          borderRadius: "999px",
          height: "380px",
          opacity: 0.12,
          position: "absolute",
          right: "-80px",
          top: "-100px",
          width: "380px",
        }}
      />
      <div
        style={{ display: "flex", flexDirection: "column", maxWidth: "930px" }}
      >
        <div
          style={{
            alignItems: "center",
            color: "#a5f3fc",
            display: "flex",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          SITESIGNAL
        </div>
        <div
          style={{
            fontSize: 74,
            fontWeight: 700,
            letterSpacing: -3,
            lineHeight: 1.04,
            marginTop: 28,
          }}
        >
          Know exactly what&apos;s hurting your website.
        </div>
        <div
          style={{
            color: "#cbd5e1",
            fontSize: 30,
            lineHeight: 1.35,
            marginTop: 28,
          }}
        >
          SEO, performance, accessibility, security, and technical website
          audits.
        </div>
      </div>
    </div>,
    size,
  );
}
