import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { ExecutionProfile } from "./contract.ts";
import { parseExecutionProfile } from "./validation.ts";

const profilesDirectory = join(import.meta.dir, "../../execution-profiles");

export async function listExecutionProfiles(): Promise<ExecutionProfile[]> {
  const files = (await readdir(profilesDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Promise.all(files.map(async (name) => {
    const path = join(profilesDirectory, name);
    return parseExecutionProfile(await Bun.file(path).json());
  }));
}

export async function getExecutionProfile(name: string): Promise<ExecutionProfile> {
  const profile = (await listExecutionProfiles()).find((candidate) => candidate.name === name);
  if (!profile) throw new Error(`Unknown execution profile: ${name}`);
  return profile;
}
