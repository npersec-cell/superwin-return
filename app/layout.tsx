import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUPERWIN HUB - Predict, Earn, and Trade Your Skills for Real Rewards",
  description: "PUBG MOBILE prediction room using free coins.",
  icons: {
    icon: "/SuperWin_b.png",
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
  themeColor: "#0d1013",
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