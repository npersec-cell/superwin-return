import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SUPERWIN HUB - Predict & Earn Rewards",
    template: "%s | SUPERWIN HUB"
  },
  description: "Predict PUBG MOBILE results for free, earn coins, climb the leaderboard!",
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
    title: "SUPERWIN HUB - Predict & Earn Coins",
    description: "Predict PUBG MOBILE results for free, earn coins, climb the leaderboard",
    type: "website",
    locale: "en_US",
    siteName: "SUPERWIN HUB",
  },
  twitter: {
    card: "summary",
    title: "SUPERWIN HUB - Predict & Earn Coins",
    description: "Predict PUBG MOBILE results for free, earn coins, climb the leaderboard",
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