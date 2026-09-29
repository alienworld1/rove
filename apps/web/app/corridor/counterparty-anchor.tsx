export function CounterpartyAnchor({
  name,
  role,
  align,
}: {
  name: string;
  role: "eMSP" | "CPO";
  align: "origin" | "destination";
}) {
  return (
    <div
      className={`flex min-h-28 w-40 shrink-0 flex-col justify-center border-line-system px-4 max-[1279px]:w-32 ${align === "origin" ? "border-r text-left" : "border-l text-right"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-tertiary">
        {role}
      </p>
      <p className="mt-2 text-lg font-semibold leading-5 text-ink">{name}</p>
    </div>
  );
}
