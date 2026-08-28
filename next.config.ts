import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework in responses — no functional benefit to
  // a would-be attacker knowing, but no reason to hand it out either.
  poweredByHeader: false,
  // pdfjs-dist (server-side text extraction, pdf-text.ts) does its own
  // dynamic import of pdf.worker.mjs relative to its own package directory
  // when running in Node without a real Worker (its "fake worker"
  // fallback). Bundling it into a serverless function's traced output
  // breaks that relative resolution — found 2026-08-28 via "Setting up
  // fake worker failed: Cannot find module '.../pdf.worker.mjs'" on the
  // new per-chapter split's AI-suggestion call, even on a 32-page chapter
  // (so not a timeout/size issue, a packaging one). Marking it external
  // keeps it (and its worker file) served straight from node_modules at
  // runtime instead of being bundled, which is Next's own documented fix
  // for this exact class of library.
  serverExternalPackages: ["pdfjs-dist"],
  // serverExternalPackages alone got the worker's expected path from
  // .next/server/chunks/ssr/pdf.worker.mjs (never existed) to
  // node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs (the right path,
  // still missing) — Vercel's output file tracing can't see pdfjs-dist's
  // internal dynamic import of that file (it's constructed at runtime, not
  // statically analyzable), so the file itself never gets copied into the
  // deployed function even though the rest of the package does. Force it
  // in explicitly — Next's own documented pattern for this exact class of
  // native/runtime asset (their docs use `sharp`/`aws-crt` as examples).
  outputFileTracingIncludes: {
    "/*": ["node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
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
