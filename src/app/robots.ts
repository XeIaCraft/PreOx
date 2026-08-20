import type { MetadataRoute } from "next";

// PreOx is a private, login-gated hub — nothing here should ever be
// indexed or crawled, even the public landing page.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
