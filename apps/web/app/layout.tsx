import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rove — Payment protection for EV charging networks",
  description:
    "Limit the payment risk of EV roaming with verified meter readings, a rolling payment reserve, and a live boundary on business credit exposure.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
