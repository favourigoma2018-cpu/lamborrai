import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Web3Providers } from "@/components/providers/web3-providers";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bet3 · Azuro Sportsbook",
  description: "Decentralized sportsbook on Azuro Protocol (Base Sepolia).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  );
}
