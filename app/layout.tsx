import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (latin subset, variable weight), so a build never has to reach Google Fonts — a clean
// Vercel build with no cache failed on the Google loader. Both fonts are under the SIL Open Font
// License; the licences sit beside the files in app/fonts/. Only the latin subset, as before.
const inter = localFont({
  src: "./fonts/Inter-latin-wght.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-latin-wght.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "Zestoxx — Trade with an edge",
  description:
    "Charts, options chains, institutional flow data and a composite signal — all in one place, risk-free with paper trading.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
