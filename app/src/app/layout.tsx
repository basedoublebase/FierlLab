import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppNav } from "@/app/_components/nav";
import { SwipeNav } from "@/app/_components/swipe-nav";

export const metadata: Metadata = {
  title: "FierlLab",
  description: "Sprong-resultaten, winddata en theoretisch maximum voor polsstokverspringen",
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FierlLab",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <SwipeNav />
        <AppNav />
        {children}
      </body>
    </html>
  );
}
