import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import DocsSearchDialog from "../components/docs-search-dialog";
import "./globals.css";
export const metadata = {
  title: { default: "Rove Docs", template: "%s · Rove Docs" },
  description:
    "Guidance for EV roaming operators and integration engineers: payment protection, session risk, and final accounting.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#docs-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-fd-background focus:p-3"
        >
          Skip to content
        </a>
        <RootProvider
          theme={{ enabled: false }}
          i18n={{
            translations: {
              "Search(search trigger)": "Search docs",
              "Search(search dialog)": "Search docs",
              "Open Search(search trigger)(aria-label)": "Search docs",
            },
          }}
          search={{ SearchDialog: DocsSearchDialog }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
