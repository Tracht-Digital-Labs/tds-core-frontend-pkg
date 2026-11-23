import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { transform } from "@astrojs/compiler-rs";
import { describe, expect, it } from "vitest";

/**
 * Every `.astro` file in the package compiles.
 *
 * Neither vitest nor `tsc` reads them, and this package ships them as source:
 * a template the compiler rejects only fails in a PRODUCT's build, after a
 * release. This runs the same compiler Astro uses, so that failure happens here.
 */

const src = __dirname;

function astroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(full);
    return entry.name.endsWith(".astro") ? [full] : [];
  });
}

describe("astro templates", () => {
  const files = astroFiles(src);

  it("finds the shell", () => {
    expect(files.map((f) => relative(src, f).replaceAll("\\", "/"))).toContain("layouts/Layout.astro");
  });

  it.each(files.map((f) => [relative(src, f).replaceAll("\\", "/"), f]))("%s compiles", async (_name, file) => {
    const result = await transform(readFileSync(file, "utf8"), { filename: file });
    const errors = (result.diagnostics ?? []).filter((d) => d.severity === "error");
    expect(errors.map((d) => d.text)).toEqual([]);
  });
});
