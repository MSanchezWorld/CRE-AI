import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Providers from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://borrowbot.app"),
  title: {
    default: "Agent Treasury | AI Agents That Earn, Borrow, and Pay",
    template: "%s | Agent Treasury"
  },
  description:
    "AI agents with self-sustaining treasuries. Hold BTC & ETH, earn yield, borrow to spend — verified by Chainlink CRE on Base.",
  openGraph: {
    title: "Agent Treasury | AI Agents That Earn, Borrow, and Pay",
    description:
      "Hold BTC & ETH, earn yield, borrow to spend. AI agent treasuries verified by Chainlink CRE on Aave V3.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Treasury | AI Agents That Earn, Borrow, and Pay",
    description:
      "Hold BTC & ETH, earn yield, borrow to spend. AI agent treasuries verified by Chainlink CRE on Aave V3."
  }
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="bg-background text-text-primary font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
