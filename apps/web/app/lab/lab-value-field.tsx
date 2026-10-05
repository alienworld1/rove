"use client";
import { useState } from "react";
import { displayLabDecimal, parseLabDecimal } from "@rove/contracts";
import { useLabDraft } from "./lab-draft-store";
export function LabValueField({
  label,
  path,
  value,
  decimals = 0,
  onChange,
  help,
}: {
  label: string;
  path: string;
  value: string | number;
  decimals?: number;
  onChange: (value: string) => void;
  help?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const pending = useLabDraft((state) => state.pending[path]);
  const field = useLabDraft((state) => state.field);
  return (
    <label className="block text-xs font-semibold text-ink-secondary">
      {label}
      <input
        id={`field-${path}`}
        inputMode="decimal"
        value={editing ?? pending ?? displayLabDecimal(String(value), decimals)}
        onBlur={() => {
          if (pending === undefined) setEditing(null);
        }}
        aria-invalid={pending !== undefined}
        aria-describedby={help ? `help-${path}` : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          setEditing(raw);
          try {
            const parsed = parseLabDecimal(raw, decimals);
            field(path, null);
            onChange(parsed);
          } catch {
            field(path, raw);
          }
        }}
        className="mt-1.5 min-h-11 w-full rounded-sm border border-line-strong bg-pure px-3 py-2 font-mono text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-info aria-invalid:border-critical"
      />
      {help ? (
        <span
          id={`help-${path}`}
          className="mt-1 block font-normal leading-relaxed text-ink-tertiary"
        >
          {help}
        </span>
      ) : null}
      {pending !== undefined ? (
        <span className="mt-1 block font-normal text-critical">
          Enter a non-negative number with up to {decimals} decimal places.
        </span>
      ) : null}
    </label>
  );
}
