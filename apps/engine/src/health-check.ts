export async function checkDatabaseHealth(
  probe: () => Promise<void>,
  timeoutMs = 4_000,
): Promise<"ready" | "unavailable"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Health deadline")),
          timeoutMs,
        );
      }),
    ]);
    return "ready";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}
