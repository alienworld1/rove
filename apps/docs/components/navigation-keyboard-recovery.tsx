"use client";

import { useEffect } from "react";
import { useSidebar } from "fumadocs-ui/components/sidebar/base";

export default function NavigationKeyboardRecovery() {
  const { open, setOpen } = useSidebar();

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    function closeMenu(event: KeyboardEvent) {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]'))
        return;
      event.preventDefault();
      setOpen(false);
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    }
    document.addEventListener("keydown", closeMenu);
    return () => document.removeEventListener("keydown", closeMenu);
  }, [open, setOpen]);

  return null;
}
