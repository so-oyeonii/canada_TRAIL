import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;

  return {
    title: "TRAIL — 선물은 잘 고르고, 짐은 남기고",
    description: "여행지에서 예산에 맞는 선물과 매장을 추천하고, 구매한 가방을 호텔까지 배송하는 쇼핑 플래너.",
    openGraph: {
      title: "TRAIL — 선물은 잘 고르고, 짐은 남기고",
      description: "예산 맞춤 선물 추천부터 호텔 배송까지, 여행자의 쇼핑을 가볍게.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "TRAIL budget-led gift shopping and hotel delivery" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "TRAIL — 선물은 잘 고르고, 짐은 남기고",
      description: "예산 맞춤 선물 추천부터 호텔 배송까지, 여행자의 쇼핑을 가볍게.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
