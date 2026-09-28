# @dryguard/cli

<p align="center">
  <img src="https://github.com/bobrowsse-tech/dryguard/raw/main/packages/vscode-extension/images/icon.png" width="96" alt="DryGuard">
</p>

Headless DryGuard for CI and git hooks. It scans the workspace for functions that are structurally the same and fails the process when it finds a **new** duplicate.

```bash
npx @dryguard/cli init          # write a starter .dryguardrc.json
npx @dryguard/cli scan .        # report, exit 1 if anything new matches
npx @dryguard/cli baseline .    # snapshot current duplicates as accepted
npx @dryguard/cli precommit     # same check, limited to files in this commit
```

## What you will see

`scan` prints each pair that scores at or above the structural threshold (default **0.85**), with the file and line of the function that already exists. A function is considered when it has at least three statements, or a branch or loop. One-line helpers are skipped.

| Exit code | Meaning |
|---|---|
| 0 | No new duplicates. Matches already listed in `.dryguard/baseline.json` do not count. |
| 1 | At least one duplicate is not in the baseline. |

```bash
npx @dryguard/cli scan . --format json       # for other tools
npx @dryguard/cli scan . --format markdown   # for a pull-request summary
npx @dryguard/cli scan . --semantic          # also run the looser semantic tier
npx @dryguard/cli scan . --max-duplicates 5  # fail only if new duplicates exceed 5
```

`precommit` only looks at files you are committing. An old duplicate in a file you did not touch does not block the commit.

`baseline` writes `.dryguard/baseline.json`. Commit that file when you adopt DryGuard on a repo that already has copies, then re-run it only when the team agrees to keep a new one.

The same `.dryguardrc.json` is what the editor extension and the MCP server read. The full guide — quick fixes, the ignore comment, language notes — is [How to use DryGuard](https://github.com/bobrowsse-tech/dryguard/blob/main/docs/HOW_TO_USE.md).
