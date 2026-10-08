import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";

const services = ["engine", "web", "docs"];
const directory = new URL("./", import.meta.url);
const files = services.map((service) => new URL(`${service}/.env`, directory));

// Refuse partial reinitialization so a shared credential cannot drift.
for (const file of files) {
  const exists = await access(file).then(
    () => true,
    () => false,
  );
  if (exists) {
    throw new Error(
      "Deployment settings already exist. Edit deployment/*/.env directly; setup never overwrites credentials.",
    );
  }
}

const token = randomBytes(32).toString("hex");
for (const [index, service] of services.entries()) {
  const template = await readFile(
    new URL(`${service}/.env.example`, directory),
    "utf8",
  );
  await writeFile(
    files[index],
    template.replace(
      /^ENGINE_SERVICE_TOKEN=$/m,
      `ENGINE_SERVICE_TOKEN=${token}`,
    ),
    { flag: "wx", mode: 0o600 },
  );
}
process.stdout.write(
  "Created private deployment/engine/.env, deployment/web/.env, and deployment/docs/.env. Fill in your project URLs and Supabase credentials, then run pnpm deploy:check.\n",
);
