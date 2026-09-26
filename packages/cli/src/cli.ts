#!/usr/bin/env node
import { Command } from "commander";
import { configTemplate } from "@dryguard/core";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScan } from "./commands/scan.js";
import { runBaseline } from "./commands/baseline.js";
import { runPrecommit } from "./commands/precommit.js";

const program = new Command();

program.name("dryguard").description("Headless DryGuard: duplication scanning and gating for CI and git hooks.");

program
  .command("scan")
  .description("Scan the whole workspace for structural (and optionally semantic) duplicates.")
  .argument("[rootDir]", "workspace root", ".")
  .option("-t, --threshold <number>", "structural similarity threshold (0-1)", parseFloat)
  .option("--semantic", "also run the looser semantic tier")
  .option("--semantic-threshold <number>", "semantic similarity threshold (0-1)", parseFloat)
  .option("-f, --format <format>", "output format: text | json | markdown", "text")
  .option("--max-duplicates <number>", "fail only if more than this many duplicates are found (default 0)", (v) =>
    parseInt(v, 10),
  )
  .action(async (rootDir, opts) => {
    const { output, exitCode } = await runScan({
      rootDir,
      threshold: opts.threshold,
      semantic: opts.semantic,
      semanticThreshold: opts.semanticThreshold,
      format: opts.format,
      maxDuplicates: opts.maxDuplicates,
    });
    process.stdout.write(`${output}\n`);
    process.exitCode = exitCode;
  });

program
  .command("baseline")
  .description("Snapshot every current duplicate as 'accepted', so only new duplication fails scan/precommit from here on.")
  .argument("[rootDir]", "workspace root", ".")
  .option("-t, --threshold <number>", "structural similarity threshold (0-1)", parseFloat)
  .option("--semantic", "also baseline the looser semantic tier")
  .action(async (rootDir, opts) => {
    const { output } = await runBaseline({ rootDir, threshold: opts.threshold, semantic: opts.semantic });
    process.stdout.write(`${output}\n`);
  });

program
  .command("precommit")
  .description("Scoped scan for a pre-commit hook: only flags duplicates touching staged/given files.")
  .argument("[files...]", "explicit file list (as the `pre-commit` framework passes them); defaults to `git diff --cached`")
  .option("-C, --root-dir <dir>", "workspace root", ".")
  .option("-t, --threshold <number>", "structural similarity threshold (0-1)", parseFloat)
  .option("--semantic", "also run the looser semantic tier")
  .action(async (files, opts) => {
    const { output, exitCode } = await runPrecommit({
      rootDir: opts.rootDir,
      files,
      threshold: opts.threshold,
      semantic: opts.semantic,
    });
    process.stdout.write(`${output}\n`);
    process.exitCode = exitCode;
  });

program
  .command("init")
  .description("Write a starter .dryguardrc.json in the given directory.")
  .argument("[rootDir]", "workspace root", ".")
  .action((rootDir) => {
    const path = join(rootDir, ".dryguardrc.json");
    if (existsSync(path)) {
      console.error(`${path} already exists — not overwriting.`);
      process.exitCode = 1;
      return;
    }
    writeFileSync(path, configTemplate(), "utf8");
    process.stdout.write(`Wrote ${path}\n`);
  });

program.parseAsync(process.argv);
