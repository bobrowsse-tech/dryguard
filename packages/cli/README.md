# @dryguard/cli

Headless DryGuard for CI and git hooks.

```bash
npx @dryguard/cli init
npx @dryguard/cli scan .
npx @dryguard/cli baseline .
npx @dryguard/cli precommit
```

`scan` exits with status 1 when it finds a duplicate that is not in the baseline.

See the [DryGuard repository](https://github.com/bobrowsse-tech/dryguard#readme).
