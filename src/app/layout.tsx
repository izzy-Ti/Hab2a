import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EthP2P — Ethiopian USDT Marketplace",
  description:
    "Buy and sell USDT securely with Ethiopian Birr through our P2P escrow marketplace. Trusted by thousands of Ethiopian traders.",
  keywords: "P2P, USDT, Ethiopia, cryptocurrency, ETB, TRC20, escrow",
  openGraph: {
    title: "EthP2P — Ethiopian USDT Marketplace",
    description: "Secure P2P USDT trading with ETB",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
