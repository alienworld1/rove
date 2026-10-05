import { displayLabDecimal } from "@rove/contracts";

export function formatOperationalValue(
  value: string | null,
  decimals: number,
): string {
  if (value === null) return "Unknown";
  if (value.startsWith("-"))
    return `-${displayLabDecimal(value.slice(1), decimals)}`;
  return displayLabDecimal(value, decimals);
}

export function formatOperationalDelta(value: string, decimals: number) {
  return `${BigInt(value) > BigInt(0) ? "+" : ""}${formatOperationalValue(value, decimals)}`;
}

export function formatEnergy(value: string) {
  const watts = BigInt(value);
  if (watts < BigInt(1_000)) return `${value} Wh`;
  const whole = watts / BigInt(1_000);
  const fraction = (watts % BigInt(1_000))
    .toString()
    .padStart(3, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} kWh`;
}
