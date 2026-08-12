import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#12333c",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "TRAIL — Shop smart. Travel light.",
    description: "A mobile gift planner that matches your budget, maps the right stores, and sends every bag to your hotel.",
    applicationName: "TRAIL",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "TRAIL" },
    openGraph: {
      title: "TRAIL — Shop smart. Travel light.",
      description: "Budget-led gift picks, one easy route, and hotel delivery.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "TRAIL mobile gift shopping and hotel delivery app" }],
    },
    twitter: { card: "summary_large_image", title: "TRAIL — Shop smart. Travel light.", description: "Budget-led gift picks, one easy route, and hotel delivery.", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
