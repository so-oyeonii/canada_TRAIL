import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./profile.css";
import "./handsfree.css";
// After the screen styles so a primitive wins where a legacy rule shares its name.
import "./components.css";
import "./discovery.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale: pinch zoom is how a traveler reads a 10px label in daylight.
  viewportFit: "cover",
  themeColor: "#08121f", // matches --canvas
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.jpg`;

  return {
    title: "TRAIL V3 — Hands-free souvenir travel",
    description: "Find local gifts along your route, buy them in store, and send your purchased bags safely to your hotel.",
    applicationName: "TRAIL V3",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "TRAIL V3" },
    openGraph: {
      title: "TRAIL V3 — Hands-free souvenir travel",
      description: "Find local gifts along your route. Buy them in store. Send your bags safely to your hotel.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "TRAIL mobile gift shopping and hotel delivery app" }],
    },
    twitter: { card: "summary_large_image", title: "TRAIL V3 — Hands-free souvenir travel", description: "Route-aware local gift discovery and secure store-to-hotel bag transfer.", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /></head><body>{children}</body></html>;
}
