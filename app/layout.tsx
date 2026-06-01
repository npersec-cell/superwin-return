import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SUPERWIN HUB",
  description: "PUBG MOBILE prediction room using free coins.",
  icons: {
    icon: "/SuperWin_b.png",
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