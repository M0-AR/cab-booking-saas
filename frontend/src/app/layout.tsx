import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Providers } from "@/components/providers";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "./fonts/InterVariable-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: {
    default: "CabDesk — Cab booking management",
    template: "%s · CabDesk",
  },
  description:
    "Multi-tenant cab booking management: fleet, drivers, bookings and reports.",
  applicationName: "CabDesk",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CabDesk",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#14181f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
