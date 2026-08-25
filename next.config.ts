import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework in responses — no functional benefit to
  // a would-be attacker knowing, but no reason to hand it out either.
  poweredByHeader: false,
  experimental: {
    // Default is 1MB — raised to 8MB for importChapterContent's hand-pasted
    // extraction JSON, then to 50MB (2026-08-24) because "Diviser un PDF"
    // (splitBookIntoChapters/suggestBookChapters/getBookPdfPageCount) sends
    // the whole book's PDF bytes as a direct Server Action argument, and a
    // real illustrated textbook routinely exceeds 8MB — every request was
    // rejected before the action even ran. If a book PDF is scanned/image-
    // heavy enough to exceed even 50MB, this ceiling needs revisiting
    // (or the upload needs to bypass the Server Action body entirely via a
    // direct-to-storage upload) — not addressed here since not confirmed
    // to be the actual remaining failure mode yet.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      // User-uploaded recipe photos and avatars, served from Supabase's
      // public storage buckets — wildcarded since the project ref varies
      // per deployment and next.config.ts can't reliably read .env at
      // config-eval time.
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // PreOx is a private hub behind auth — never let it render inside
          // someone else's frame (clickjacking) and never leak the referrer
          // path to third-party links.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
