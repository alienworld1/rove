export function formatOperationalValue(value: string | null, decimals: number) {
  if (value === null) return "Unknown";
  const padded = value.padStart(decimals + 1, "0");
  if (decimals === 0) return padded;
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
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
