import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SUPERWIN HUB - Predict & Earn Rewards",
    template: "%s | SUPERWIN HUB"
  },
  description: "ทายผล PUBG MOBILE ฟรียกตัง สะสมเหรียญ ไต่อันดับ Leaderboard แยงตำแหนง Top!",
  icons: {
    icon: [
      { url: "/SuperWin_b.png", sizes: "any", type: "image/png" },
    ],
    apple: [
      { url: "/SuperWin_b.png", sizes: "180x180", type: "image/png" },
    ],
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
  themeColor: "#0d1013",
  openGraph: {
    title: "SUPERWIN HUB - ทายผลสะสมเหรียญ",
    description: "ทายผล PUBG MOBILE ฟรียกตัง สะสมเหรียญ ไต่อันดับ Leaderboard",
    type: "website",
    locale: "th_TH",
    siteName: "SUPERWIN HUB",
  },
  twitter: {
    card: "summary",
    title: "SUPERWIN HUB - ทายผลสะสมเหรียญ",
    description: "ทายผล PUBG MOBILE ฟรียกตัง สะสมเหรียญ ไต่อันดับ Leaderboard",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}