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
    title: "TRAIL — AI shopping, balanced budgets, hotel delivery",
    description: "Plan gifts and personal finds, shop at real local stores, track actual spend, rebalance the trip wallet, and send bags to your hotel.",
    applicationName: "TRAIL",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "TRAIL" },
    openGraph: {
      title: "TRAIL — Your travel shopping command center",
      description: "Ask AI, approve a balanced plan, shop offline, and send every bag to your hotel.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "TRAIL mobile gift shopping and hotel delivery app" }],
    },
    twitter: { card: "summary_large_image", title: "TRAIL — Your travel shopping command center", description: "Ask AI, approve a balanced plan, shop offline, and send every bag to your hotel.", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
