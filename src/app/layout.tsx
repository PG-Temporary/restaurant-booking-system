import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TableFinder - find and book a table",
  description: "Find restaurants with tables available near you and book instantly. Restaurants manage their bookings in one place.",
  // Inline icon so browsers never request /favicon.ico (a rounded square with an ember dot on a table-top line).
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23061110'/%3E%3Ccircle cx='32' cy='28' r='10' fill='%23ff7d4a'/%3E%3Crect x='14' y='44' width='36' height='6' rx='3' fill='%236fe0d2'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9efed" },
    { media: "(prefers-color-scheme: dark)", color: "#061110" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
