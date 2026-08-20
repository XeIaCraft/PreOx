import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Applies a stored explicit theme choice (see ThemeToggle) before first
// paint, so a returning user with data-theme="dark" saved never sees a
// flash of the light theme while the page hydrates.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("preox-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PreOx — Hub applicatif",
    template: "%s · PreOx",
  },
  description:
    "PreOx est un hub applicatif centralisé qui réunit vos outils métiers dans un seul espace, avec des accès gérés module par module.",
  appleWebApp: {
    title: "PreOx",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets fixed/sticky UI near the screen edges account for the iPhone
  // notch/home-indicator via env(safe-area-inset-*) instead of sitting
  // under them.
  viewportFit: "cover",
  // Matches the mobile browser's own chrome (status bar / URL bar) to
  // --background in both themes instead of a single fixed color that
  // would clash with dark mode.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#101512" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
