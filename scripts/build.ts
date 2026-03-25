/**
 * Build script — produces all dist artifacts
 * Run: npm run build
 */

import { build, type InlineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

const root = resolve(import.meta.dirname, "..");

const terserOptions = {
  compress: {
    drop_console: true,
    drop_debugger: true,
    pure_funcs: [
      "console.log",
      "console.warn",
      "console.info",
      "console.debug",
    ],
    passes: 2,
  },
  mangle: { properties: false, keep_fnames: true },
  format: { comments: false },
};

interface BuildVariant {
  entry: string;
  fileName: string;
  format: "es" | "iife";
  minify: false | "esbuild" | "terser";
  sourcemap: boolean;
  emitDts: boolean;
  dtsFileName?: string;
  external?: string[];
}

const variants: BuildVariant[] = [
  // ESM — full, unminified + types (main entry)
  {
    entry: "src/index.ts",
    fileName: "reactive.js",
    format: "es",
    minify: false,
    sourcemap: true,
    emitDts: true,
    external: ["react", "react-dom"],
  },
  // ESM — minified (./min export)
  {
    entry: "src/index.ts",
    fileName: "reactive.min.js",
    format: "es",
    minify: "esbuild",
    sourcemap: false,
    emitDts: false,
    external: ["react", "react-dom"],
  },
  // IIFE — minified for browser (./browser and ./iife exports)
  {
    entry: "src/index.vanilla.ts",
    fileName: "reactive.iife.min.js",
    format: "iife",
    minify: "terser",
    sourcemap: false,
    emitDts: false,
  },
  // Minimal ESM + types (./minimal export)
  {
    entry: "src/index.minimal.ts",
    fileName: "reactive.minimal.js",
    format: "es",
    minify: "esbuild",
    sourcemap: false,
    emitDts: true,
    dtsFileName: "reactive.minimal.d.ts",
  },
  // Minimal IIFE for browser (./minimal/browser export)
  {
    entry: "src/index.minimal.ts",
    fileName: "reactive.minimal.iife.js",
    format: "iife",
    minify: "terser",
    sourcemap: false,
    emitDts: false,
  },
];

async function buildAll() {
  // Clean dist once before all builds
  const { rm, mkdir, stat } = await import("fs/promises");
  await rm(resolve(root, "dist"), { recursive: true, force: true });
  await mkdir(resolve(root, "dist"), { recursive: true });

  const sizes: Array<{ file: string; size: string }> = [];

  for (const v of variants) {
    const dtsPlugin = () =>
      dts({
        entryRoot: "src",
        outDir: "dist",
        include: ["src/**/*.ts"],
        exclude: [
          "src/**/*.test.ts",
          "src/**/*.spec.ts",
          "src/examples/**",
          "src/draft/**",
          "src/react/**",
        ],
        rollupTypes: true,
        ...(v.dtsFileName ? { fileName: () => v.dtsFileName! } : {}),
      });

    const config: InlineConfig = {
      root,
      plugins: v.emitDts ? [dtsPlugin()] : [],
      build: {
        lib: {
          entry: resolve(root, v.entry),
          name: "Reactive",
          fileName: () => v.fileName,
          formats: [v.format],
        },
        rollupOptions: v.external
          ? {
              external: v.external,
              output: { globals: { react: "React", "react-dom": "ReactDOM" } },
            }
          : {},
        minify: v.minify,
        ...(v.minify === "terser" ? { terserOptions } : {}),
        sourcemap: v.sourcemap,
        outDir: resolve(root, "dist"),
        emptyOutDir: false,
      },
    };

    console.log(`\nBuilding ${v.fileName}...`);
    await build(config);

    // Log file size
    try {
      const filePath = resolve(root, "dist", v.fileName);
      const { size } = await stat(filePath);
      const kb = (size / 1024).toFixed(2);
      sizes.push({ file: v.fileName, size: `${kb} KB` });
    } catch {
      // sourcemap or dts-only — skip
    }
  }

  console.log("\n✓ All builds complete\n");
  console.log("Bundle sizes:");
  const maxLen = Math.max(...sizes.map((s) => s.file.length));
  for (const { file, size } of sizes) {
    console.log(`  ${file.padEnd(maxLen + 2)} ${size}`);
  }

  // Keep examples/dist in sync so examples work when served from examples/
  const { copyFile, mkdir: mkdirFs } = await import("fs/promises");
  await mkdirFs(resolve(root, "examples/dist"), { recursive: true });
  await copyFile(
    resolve(root, "dist/reactive.iife.min.js"),
    resolve(root, "examples/dist/reactive.iife.min.js"),
  );
  console.log("\n✓ Copied reactive.iife.min.js → examples/dist/\n");
}

buildAll().catch((e) => {
  console.error(e);
  process.exit(1);
});
