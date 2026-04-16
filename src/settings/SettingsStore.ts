import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface PersistedSettings {
  grbl: Record<string, string>;
  named: Record<string, string>;
  startupLines: [string, string];
  reportIntervalMs: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  grbl: {
    "10": "1",
    "13": "0",
    "30": "0",
    "31": "0",
    "32": "0",
    "110": "0",
    "111": "0",
    "112": "0"
  },
  named: {
    "Config/Filename": "config.yaml",
    "Firmware/Build": "",
    "HTTP/BlockDuringMotion": "false",
    "HTTP/Enable": "true",
    "HTTP/Port": "8080",
    Hostname: "MockFluidNC",
    "Message/Level": "Info",
    "SD/FallbackCS": "",
    "Start/Message": "Grbl \\V [FluidNC \\B (node-simulator) \\H]",
    "Telnet/Enable": "true"
  },
  startupLines: ["", ""],
  reportIntervalMs: 200
};

export class SettingsStore {
  private settings: PersistedSettings;

  constructor(private readonly path?: string, initial?: Partial<PersistedSettings>) {
    this.settings = {
      grbl: { ...DEFAULT_SETTINGS.grbl, ...(initial?.grbl ?? {}) },
      named: { ...DEFAULT_SETTINGS.named, ...(initial?.named ?? {}) },
      startupLines: initial?.startupLines ?? [...DEFAULT_SETTINGS.startupLines],
      reportIntervalMs: initial?.reportIntervalMs ?? DEFAULT_SETTINGS.reportIntervalMs
    };
  }

  static async load(path: string): Promise<SettingsStore> {
    try {
      return new SettingsStore(path, await readSettingsFile(path));
    } catch {
      try {
        return new SettingsStore(path, await readSettingsFile(backupPath(path)));
      } catch {
        return new SettingsStore(path);
      }
    }
  }

  snapshot(): PersistedSettings {
    return {
      grbl: { ...this.settings.grbl },
      named: { ...this.settings.named },
      startupLines: [...this.settings.startupLines] as [string, string],
      reportIntervalMs: this.settings.reportIntervalMs
    };
  }

  listGrbl(): string[] {
    return Object.entries(this.settings.grbl)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([key, value]) => `$${key}=${value}`);
  }

  getGrbl(key: string): string | undefined {
    return this.settings.grbl[key];
  }

  setGrbl(key: string, value: string): void {
    this.settings.grbl[key] = value;
  }

  listNamed(): string[] {
    return Object.entries(this.settings.named)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `$${key}=${value}`);
  }

  getNamed(key: string): string | undefined {
    const canonical = this.canonicalNamedKey(key);
    return canonical ? this.settings.named[canonical] : undefined;
  }

  setNamed(key: string, value: string): boolean {
    const canonical = this.canonicalNamedKey(key);
    if (!canonical) {
      return false;
    }
    this.settings.named[canonical] = value;
    return true;
  }

  listNamedMatching(fragment: string): string[] {
    const normalized = fragment.toLowerCase();
    return this.listNamed().filter((line) => line.toLowerCase().includes(normalized));
  }

  setStartupLine(index: 0 | 1, value: string): void {
    this.settings.startupLines[index] = value;
  }

  startupReport(): string[] {
    return this.settings.startupLines.map((line, index) => `$N${index}=${line}`);
  }

  setReportInterval(ms: number): void {
    this.settings.reportIntervalMs = ms === 0 ? 0 : Math.max(50, ms);
  }

  restoreDefaults(): void {
    this.settings = {
      grbl: { ...DEFAULT_SETTINGS.grbl },
      named: { ...DEFAULT_SETTINGS.named },
      startupLines: [...DEFAULT_SETTINGS.startupLines],
      reportIntervalMs: DEFAULT_SETTINGS.reportIntervalMs
    };
  }

  stats(): string[] {
    return [
      `[MSG:Settings entries:${Object.keys(this.settings.grbl).length}]`,
      `[MSG:Named settings:${Object.keys(this.settings.named).length}]`,
      `[MSG:Startup lines:${this.settings.startupLines.length}]`,
      `[MSG:Report interval:${this.settings.reportIntervalMs}]`
    ];
  }

  async save(): Promise<void> {
    if (!this.path) {
      return;
    }
    await mkdir(dirname(this.path), { recursive: true });
    const serialized = `${JSON.stringify(this.settings, null, 2)}\n`;
    await writeAtomic(this.path, serialized);
    await writeAtomic(backupPath(this.path), serialized);
  }

  private canonicalNamedKey(key: string): string | undefined {
    return Object.keys(this.settings.named).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  }
}

async function readSettingsFile(path: string): Promise<PersistedSettings> {
  const raw = await readFile(path, "utf8");
  if (!raw.trim()) {
    throw new Error(`Settings file is empty: ${path}`);
  }
  return JSON.parse(raw) as PersistedSettings;
}

async function writeAtomic(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, path);
}

function backupPath(path: string): string {
  return `${path}.bak`;
}
