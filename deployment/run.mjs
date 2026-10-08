import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const commands = {
  migrate: {
    directory: "packages/persistence/",
    args: ["./node_modules/drizzle-kit/bin.cjs", "migrate"],
  },
  admin: {
    directory: "apps/engine/",
    args: ["--import", "tsx", "src/hosted-admin.ts"],
  },
  probe: {
    directory: "apps/engine/",
    args: ["--import", "tsx", "src/probe-payment.ts"],
  },
};
const command = commands[process.argv[2]];
if (!command) throw new Error("Choose migrate, admin, or probe.");
const settings = parseEnv(
  await readFile(new URL("engine/.env", import.meta.url), "utf8"),
);
const child = spawn(
  process.execPath,
  [...command.args, ...process.argv.slice(3)],
  {
    cwd: fileURLToPath(new URL(command.directory, root)),
    env: { ...process.env, ...settings },
    stdio: "inherit",
  },
);
child.on("error", () => {
  process.stderr.write(
    "Couldn't start the deployment command. Check Node and installed dependencies.\n",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
