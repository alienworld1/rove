"use client";
import { useMemo, useRef, useState } from "react";
import { useDocsSearch } from "fumadocs-core/search/client";
import { fetchClient } from "fumadocs-core/search/client/fetch";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import SearchEmpty from "./search-empty";
const client = fetchClient({ api: "/api/search" });
export default function DocsSearchDialog(props: SharedProps) {
  const trigger = useRef<HTMLElement | null>(null);
  const [retry, setRetry] = useState(0);
  const dependencies = useMemo(() => [retry, props.open], [retry, props.open]);
  const { search, setSearch, query } = useDocsSearch({ client }, dependencies);
  return (
    <SearchDialog
      {...props}
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
    >
      <SearchDialogOverlay />
      <SearchDialogContent
        aria-describedby="search-status"
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          trigger.current =
            active instanceof HTMLElement && active !== document.body
              ? active
              : ([
                  ...document.querySelectorAll<HTMLElement>(
                    "button[data-search-full], button[data-search]",
                  ),
                ].find((button) => button.getClientRects().length > 0) ?? null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (trigger.current?.isConnected) trigger.current.focus();
        }}
      >
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput
            aria-label="Search docs"
            placeholder="Search docs"
          />
          <SearchDialogClose />
        </SearchDialogHeader>
        <p
          id="search-status"
          role="status"
          aria-live="polite"
          className="px-4 py-2 text-sm text-fd-muted-foreground"
        >
          {query.error
            ? "Search is unavailable. Browse the topics or try again."
            : query.isLoading
              ? "Searching…"
              : query.data !== "empty" && query.data
                ? query.data.length === 0
                  ? "No matching pages. Try “protected value”, “reserve”, or a reason code."
                  : `${query.data.length} results. Use the arrow keys to choose a page.`
                : "Search session guidance, payment protection, integrations, and reason codes."}
        </p>
        {query.error ? (
          <button
            className="m-4 rounded border border-fd-border px-3 py-2"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        ) : (
          <SearchDialogList
            items={query.data === "empty" ? null : query.data}
            Empty={SearchEmpty}
          />
        )}
      </SearchDialogContent>
    </SearchDialog>
  );
}
