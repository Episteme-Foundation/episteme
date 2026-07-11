import {
  DEFAULT_SETTINGS,
  type Settings,
  type SitePolicy,
} from "./types";

const KEY = "episteme-settings";

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(fn: (s: Settings) => void): void {
  chrome.storage.sync.onChanged.addListener((changes) => {
    if (changes[KEY]) {
      fn({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue ?? {}) });
    }
  });
}

export async function setSitePolicy(
  host: string,
  policy: SitePolicy
): Promise<Settings> {
  const current = await getSettings();
  const overrides = { ...current.siteOverrides };
  if (policy === "default") delete overrides[host];
  else overrides[host] = policy;
  return saveSettings({ siteOverrides: overrides });
}

/** Effective behavior for a host, resolving "default" to the global setting. */
export function resolveSitePolicy(
  settings: Settings,
  host: string
): "auto" | "manual" | "disabled" {
  const override = settings.siteOverrides[host] ?? "default";
  if (override !== "default") return override;
  return settings.autoAnalyze ? "auto" : "manual";
}
