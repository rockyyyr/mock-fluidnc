import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, normalize, resolve } from "node:path";

export interface VirtualFileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
}

export class VirtualFileSystem {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async list(relativePath = "."): Promise<string[]> {
    return readdir(this.safePath(relativePath));
  }

  listSync(relativePath = "."): string[] {
    return readdirSync(this.safePath(relativePath));
  }

  async listDetailed(relativePath = "."): Promise<VirtualFileEntry[]> {
    const base = this.safePath(relativePath);
    const names = await readdir(base);
    const entries = await Promise.all(
      names.map(async (name) => {
        const fullPath = resolve(base, name);
        const details = await stat(fullPath);
        return entryFromStat(relativePath, name, details.size, details.isDirectory());
      })
    );
    return entries.sort(compareEntries);
  }

  listDetailedSync(relativePath = "."): VirtualFileEntry[] {
    const base = this.safePath(relativePath);
    return readdirSync(base)
      .map((name) => {
        const fullPath = resolve(base, name);
        const details = statSync(fullPath);
        return entryFromStat(relativePath, name, details.size, details.isDirectory());
      })
      .sort(compareEntries);
  }

  async read(relativePath: string): Promise<string> {
    return readFile(this.safePath(relativePath), "utf8");
  }

  readSync(relativePath: string): string {
    return readFileSync(this.safePath(relativePath), "utf8");
  }

  async write(relativePath: string, contents: string): Promise<void> {
    const target = this.safePath(relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }

  writeSync(relativePath: string, contents: string): void {
    const target = this.safePath(relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  }

  async delete(relativePath: string): Promise<void> {
    await rm(this.safePath(relativePath), { recursive: true, force: true });
  }

  deleteSync(relativePath: string): void {
    rmSync(this.safePath(relativePath), { recursive: true, force: true });
  }

  async rename(fromPath: string, toPath: string): Promise<void> {
    const target = this.safePath(toPath);
    await mkdir(dirname(target), { recursive: true });
    await rename(this.safePath(fromPath), target);
  }

  renameSync(fromPath: string, toPath: string): void {
    const target = this.safePath(toPath);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(this.safePath(fromPath), target);
  }

  private safePath(relativePath: string): string {
    const target = resolve(this.root, normalize(relativePath));
    if (!target.startsWith(this.root)) {
      throw new Error("Path escapes virtual filesystem root");
    }
    return target;
  }
}

function entryFromStat(relativePath: string, name: string, size: number, isDirectory: boolean): VirtualFileEntry {
  const cleanBase = relativePath === "." ? "" : normalize(relativePath).replace(/^\/+/, "").replace(/\/+$/, "");
  const cleanName = basename(name);
  return {
    name: cleanName,
    path: `/${cleanBase ? `${cleanBase}/` : ""}${cleanName}`,
    type: isDirectory ? "directory" : "file",
    size
  };
}

function compareEntries(a: VirtualFileEntry, b: VirtualFileEntry): number {
  if (a.type !== b.type) {
    return a.type === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}
