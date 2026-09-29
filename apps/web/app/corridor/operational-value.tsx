export function OperationalValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0 border-l border-line pl-3 first:border-l-0 first:pl-0">
      <dt className="text-[11px] leading-4 text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-ink">
        {value ?? "Unknown"}
      </dd>
    </div>
  );
}
