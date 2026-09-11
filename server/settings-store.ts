import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../src/domain/user-settings";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

/** Keyed by the Auth0 user id (the ID token's `sub` claim) rather than email
 * or username — this tenant's accounts don't reliably carry either (some
 * users have no verified email, `nickname`/`name` can change), while `sub`
 * is always present and stable for the life of the account. Preferences —
 * e.g. which maps app "Entdecken" links open in — follow that id across
 * devices without needing an account system of our own. */
type SettingsByUserId = Record<string, Partial<UserSettings>>;

async function readAll(): Promise<SettingsByUserId> {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as SettingsByUserId) : {};
  } catch {
    return {};
  }
}

async function writeAll(all: SettingsByUserId): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmpFile = path.join(DATA_DIR, `.settings-${randomUUID()}.json.tmp`);
  await writeFile(tmpFile, JSON.stringify(all, null, 2), "utf8");
  await rename(tmpFile, SETTINGS_FILE);
}

export async function readUserSettings(userId: string): Promise<UserSettings> {
  const all = await readAll();
  return { ...DEFAULT_USER_SETTINGS, ...all[userId] };
}

export async function updateUserSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings> {
  const all = await readAll();
  const updated = { ...DEFAULT_USER_SETTINGS, ...all[userId], ...patch };
  all[userId] = updated;
  await writeAll(all);
  return updated;
}
