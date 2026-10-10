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
  check: {
    directory: "apps/engine/",
    args: ["--import", "tsx", "src/deployment-check.ts"],
  },
};
const command = commands[process.argv[2]];
if (!command) throw new Error("Choose migrate, admin, probe, or check.");
const settings = parseEnv(
  await readFile(new URL("engine/.env", import.meta.url), "utf8"),
);
const child = spawn(
  process.execPath,
  [...command.args, ...process.argv.slice(3)],
  {
    cwd: fileURLToPath(new URL(command.directory, root)),
    env: {
      ...process.env,
      ...settings,
      NODE_EXTRA_CA_CERTS:
        settings.NODE_EXTRA_CA_CERTS ??
        process.env.NODE_EXTRA_CA_CERTS ??
        fileURLToPath(
          new URL("certs/supabase-prod-ca-2021.crt", import.meta.url),
        ),
    },
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
