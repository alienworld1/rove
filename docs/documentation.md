# Read and maintain Rove Docs

Use Node 22+ and pnpm 11.19.0. `pnpm install` generates the Fumadocs content entry. `pnpm dev:docs` serves [the public manual](http://localhost:3001/docs); `/` redirects there. Reading and search need no engine, PostgreSQL, wallet, RPC, or access key.

Local development defaults to product port 3000 and docs port 3001. Production-mode builds require explicit `NEXT_PUBLIC_APP_ORIGIN` for docs and `NEXT_PUBLIC_DOCS_ORIGIN` for web. Both must be HTTP(S) origins without credentials, paths, queries, or fragments. Use deployed hostnames when publishing; no hosting provider is changed by this setup.

```sh
pnpm --filter @rove/docs check:references
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000 pnpm --filter @rove/docs typecheck
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000 pnpm --filter @rove/docs build
```

`check:references` compiles the same trusted MDX collection as the app. It checks all 18 routes, navigation membership, heading targets, internal/context links, exact reasons/events/faults/routes, source pointers, current Zod JSON schemas, the real Lab compiler, the historical SAFE verifier, and exact accounting normalization. It reads only versioned public sources and never sends transactions. Its regression test verifies that removing an anchor or required entry fails the gate.

Content lives in `apps/docs/content/docs`. Group order lives in its `meta.json` files. Shared public topic/reason/event links live in `packages/contracts/src/docs-links.ts`. Preserve published heading IDs when editing. Unknown reasons/events deliberately lead to reference indexes. Add new supported identifiers and reviewed meanings when their sources change; do not change financial behavior to match prose.

Schema/example blocks come from `apps/docs/lib/reference-blocks.ts`; reviewed reason prose lives in `reason-notes.json`. `pnpm --filter @rove/docs reference:snippets` prints current safe blocks for review and insertion. The check requires schema/fixture blocks to match the current canonical sources. Human review still owns protocol meaning and the limits of a claimed workflow. Date external network evidence; remote links are not fetched by CI.

## Verify navigation and recovery

1. Start only docs. Open the primer, protection, Tempo, and security pages. Deep-link/reload `http://localhost:3001/docs/reference/reason-codes#evidence-signature-invalid`.
2. Use **Search docs** or Ctrl/Cmd+K. Find `EVIDENCE_SIGNATURE_INVALID` and `top-up`; follow results. Search nonsense and check the editable no-results state. Escape restores trigger focus.
3. Block `/api/search` in browser network tooling and make a new query. Verify the unavailable message and preserved query. Remove blocking and choose **Try again**. Search uses the installed Fumadocs client and its debounce/stale-result handling.
4. Open `/docs/unknown-topic`; expect HTTP 404 and **Browse docs**. The standard render error boundary provides **Try again** and **Browse docs**.
5. At 1440, 1280, 768, and 390 px, check navigation, table/code scrolling, visible focus, skip link, search/menu Escape, and no body overflow. Enable reduced motion. Copy an example; denying clipboard access must leave selectable text and clear fallback copy.
6. Follow [local product setup](charging-storage.md). Before entering the key, **Docs** must work. Inspect a rejected Lane C reading and open its explanation in a new tab; the original URL/selection must remain intact. Check protection, payment, scenario/schema, and completion links. No live funding is required for this path.

For local completion configure USD / TEST_ASSET / controlled-cpo as described in [session completion](session-completion.md). Live proofs are explicitly selected financial workflows with funded test-only accounts; they are not documentation checks.
