// system_settings with defaults and a short in-process cache. Stored values that fail their
// schema are ignored (default used, error logged) so a bad row can never break safety logic.
import type { Clock } from "../../lib/clock.js";
import type { Logger } from "../../lib/logger.js";
import type { Prisma } from "../../lib/prisma.js";
import { SETTINGS, SETTING_KEYS, type SettingKey, type SettingValue } from "./settings.schema.js";
import type { SettingsRepository } from "./settings.repository.js";

export const SETTINGS_CACHE_TTL_MS = 60_000;

type AllSettings = { [K in SettingKey]: SettingValue<K> };

export function createSettingsService(deps: { repo: SettingsRepository; clock: Clock; log: Logger }) {
  let cache: { at: number; values: AllSettings } | undefined;

  async function load(): Promise<AllSettings> {
    const rows = await deps.repo.findAll();
    const stored = new Map(rows.map((r) => [r.key, r.value]));
    const values = {} as Record<SettingKey, unknown>;
    for (const key of SETTING_KEYS) {
      const def = SETTINGS[key];
      const raw = stored.get(key);
      if (raw === undefined) {
        values[key] = def.default;
        continue;
      }
      const parsed = def.schema.safeParse(raw);
      if (parsed.success) values[key] = parsed.data;
      else {
        deps.log.error({ key, issues: parsed.error.issues }, "invalid system setting ignored, using default");
        values[key] = def.default;
      }
    }
    return values as AllSettings;
  }

  async function all(): Promise<AllSettings> {
    const now = deps.clock.now().getTime();
    if (!cache || now - cache.at > SETTINGS_CACHE_TTL_MS) cache = { at: now, values: await load() };
    return cache.values;
  }

  return {
    all,
    async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
      return (await all())[key];
    },
    /** Validates, stores and invalidates the cache. The audit-log entry is written by the admin service (Prompt 10). */
    async set<K extends SettingKey>(
      key: K,
      value: SettingValue<K>,
      updatedBy: string | null,
    ): Promise<SettingValue<K>> {
      const parsed = SETTINGS[key].schema.parse(value) as SettingValue<K>;
      await deps.repo.upsert(key, parsed as Prisma.InputJsonValue, updatedBy);
      cache = undefined;
      return parsed;
    },
    invalidate() {
      cache = undefined;
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
