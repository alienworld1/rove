import type { ReactNode } from "react";
import Image from "next/image";
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
      nav={{
        title: (
          <Image src="/rove-logo.png" alt="Rove Docs" width={120} height={40} />
        ),
        url: "/docs",
      }}
      themeSwitch={{ enabled: false }}
      links={[{ text: "Rove home", url: appOrigin, external: true }]}
    >
      <NavigationKeyboardRecovery />
      {children}
    </DocsLayout>
  );
}
