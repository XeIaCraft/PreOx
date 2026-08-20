import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

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
          background: "#2f5d54",
        }}
      >
        <svg width="110" height="110" viewBox="0 0 32 32" fill="none">
          <path
            d="M7 16h3.2l2-6.5 3.6 13 2-6.5 1.6 3.5h5.6"
            stroke="#f7faf9"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
