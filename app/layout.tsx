import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeTrade",
  description:
    "Personal AI-assisted, risk-controlled paper trading system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
