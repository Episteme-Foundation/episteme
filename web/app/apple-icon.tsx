import { ImageResponse } from "next/og";

// Apple touch icon — the mark on a warm-paper tile (iOS masks to a rounded
// square, so it wants an opaque background rather than the transparent favicon).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same faceted diamond as app/icon.svg, scaled to the tile.
const mark = `
<svg width="104" height="104" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 1.6 22.4 12 1.6 12 Z" fill="#1f6b46"/>
  <path d="M1.6 12 22.4 12 12 22.4 Z" fill="#16543a"/>
  <line x1="2.4" y1="12" x2="21.6" y2="12" stroke="#fbfaf6" stroke-width="0.8"/>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbfaf6",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          width={104}
          height={104}
          src={`data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`}
          alt=""
        />
      </div>
    ),
    size,
  );
}
