import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { Navbar, Footer } from "@/components/layout/navbar";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Turf — Book sports turfs near you", template: "%s · Turf" },
  description:
    "Discover nearby sports turfs, check live availability and book instantly — pay online or at the venue.",
  applicationName: "Turf",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Turf" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#141915" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>
          <Navbar />
          <main id="main" className="min-h-[70vh]">{children}</main>
          <Footer />
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}
