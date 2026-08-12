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
    title: "TRAIL AI — Talk it through. Take home the right thing.",
    description: "A conversational AI gift planner that turns what you want into an editable shopping, route, and delivery plan.",
    applicationName: "TRAIL",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "TRAIL" },
    openGraph: {
      title: "TRAIL AI — Your editable gift plan",
      description: "Talk about the gift, review the AI draft, customize every detail, then approve and shop.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "TRAIL mobile gift shopping and hotel delivery app" }],
    },
    twitter: { card: "summary_large_image", title: "TRAIL AI — Your editable gift plan", description: "Talk about the gift, review the AI draft, customize every detail, then approve and shop.", images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
