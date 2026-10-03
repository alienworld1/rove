import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { source } from "../../lib/source";
import { appOrigin } from "../../lib/origin";
import NavigationKeyboardRecovery from "../../components/navigation-keyboard-recovery";
export default function DocumentationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: "Rove Docs", url: "/docs" }}
      themeSwitch={{ enabled: false }}
      links={[{ text: "Open Corridor", url: appOrigin, external: true }]}
    >
      <NavigationKeyboardRecovery />
      {children}
    </DocsLayout>
  );
}
