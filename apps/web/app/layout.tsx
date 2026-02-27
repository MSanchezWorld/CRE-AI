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
    default: "BorrowBot | CRE-Powered Borrow-to-Spend on Aave",
    template: "%s | BorrowBot"
  },
  description:
    "BorrowBot uses Chainlink CRE to automate rules-based borrowing on Aave V3 — deposit, borrow USDC, and spend without selling your crypto.",
  openGraph: {
    title: "BorrowBot | CRE-Powered Borrow-to-Spend on Aave",
    description:
      "Automate rules-based borrowing on Aave V3 with Chainlink CRE. Deposit collateral, borrow USDC, spend — never sell your crypto.",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "BorrowBot | CRE-Powered Borrow-to-Spend on Aave",
    description:
      "Automate rules-based borrowing on Aave V3 with Chainlink CRE. Deposit collateral, borrow USDC, spend — never sell your crypto."
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
