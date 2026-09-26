#!/usr/bin/env bash
# Alternative to the pre-commit framework: wires DryGuard directly into this
# repo's own .git/hooks, for anyone who doesn't use `pre-commit`.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_PATH="$REPO_ROOT/.git/hooks/pre-commit"

cat > "$HOOK_PATH" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pnpm --filter @dryguard/cli exec dryguard precommit
EOF

chmod +x "$HOOK_PATH"
echo "Installed pre-commit hook at $HOOK_PATH"
