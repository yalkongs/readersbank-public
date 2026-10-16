import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import "./transitions.css";
import { SITE_URL } from "@/lib/site";
import { SWRegister } from "@/components/SWRegister";

const notoSerifKr = Noto_Serif_KR({
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-noto-serif-kr",
});


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ReadersBank", template: "%s · ReadersBank" },
  description: "읽을 만한 글을 한국어 웹진으로",
  openGraph: { type: "website", siteName: "ReadersBank", locale: "ko_KR" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "ReadersBank", statusBarStyle: "default" },
  icons: { icon: { url: "/icons/favicon-64.png?v=2", type: "image/png", sizes: "64x64" }, apple: "/icons/apple-touch-icon.png?v=2" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={notoSerifKr.variable} suppressHydrationWarning>
      <head>
        {/* 첫 페인트 전에 저장된 테마를 적용해야 깜빡임이 없다. 동기 스크립트로 둔다. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- 의도적 동기 로딩(테마 깜빡임 방지) */}
        <script src="/theme-init.js" />
      </head>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
