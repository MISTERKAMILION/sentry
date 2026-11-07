import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "S.E.N.T.R.Y - Product Compliance Scanner",
  description: "AI Product Compliance Scanner",
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
