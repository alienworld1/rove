import { timingSafeEqual } from "node:crypto";

export function hasDemoSession(request: Request, token: string) {
  const supplied = request.headers
    .get("cookie")
    ?.split("; ")
    .find((part) => part.startsWith("rove_demo="))
    ?.slice("rove_demo=".length);
  if (!supplied) return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
