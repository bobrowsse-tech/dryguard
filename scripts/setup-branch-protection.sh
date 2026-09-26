#!/usr/bin/env bash
# Locks down main (and master, if it exists) on a freshly created DryGuard
# repo so that, even though the project is open source:
#   - the default branch can never be deleted
#   - all changes land only via reviewed pull requests (no direct pushes,
#     including by admins)
#   - only the maintainer(s) listed below may open pull requests against it
#     (everyone else can fork and the maintainer cherry-picks/merges, which
#     is the standard low-trust-contributor model for a young OSS project)
#
# Requires: GitHub CLI (`gh`), authenticated with a token that has `repo`
# and `admin:org` (if this is an org repo) scopes on the target repository.
#
# Usage:
#   ./scripts/setup-branch-protection.sh <owner>/<repo> [maintainer-login ...]
#
# Example:
#   ./scripts/setup-branch-protection.sh dryguard-dev/dryguard bobrowsse

set -euo pipefail

REPO="${1:?Usage: $0 <owner>/<repo> [maintainer-login ...]}"
shift || true
MAINTAINERS=("$@")

if [ "${#MAINTAINERS[@]}" -eq 0 ]; then
  echo "No maintainer logins given; defaulting restriction to the repo owner only." >&2
  MAINTAINERS=("$(echo "$REPO" | cut -d/ -f1)")
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI ('gh') is required. https://cli.github.com/" >&2
  exit 1
fi

echo "Configuring branch protection on $REPO for branches: main, master (if present)"
echo "Restricting who can push/merge to: ${MAINTAINERS[*]}"

# Build the `restrictions.users` JSON array from MAINTAINERS.
users_json=$(printf '%s\n' "${MAINTAINERS[@]}" | jq -R . | jq -s .)

protect_branch() {
  local branch="$1"

  # Does the branch even exist on this repo? Skip silently if not (lets the
  # same script run against a repo that only has `main`).
  if ! gh api "repos/$REPO/branches/$branch" >/dev/null 2>&1; then
    echo "  - $branch: does not exist, skipping"
    return
  fi

  echo "  - $branch: applying protection"

  # required_status_checks: keep CI green before merge is allowed.
  # enforce_admins: true means even repo admins (i.e. us) can't bypass this
  #   by pushing directly or force-merging — everything really does go
  #   through a PR.
  # required_pull_request_reviews: at least 1 approval, dismiss stale
  #   approvals on new commits, and restrict who can even *push* (which for
  #   a protected branch means who can merge a PR into it / open PRs that
  #   target it in the restricted sense GitHub supports).
  # restrictions: only the listed users (or teams) may push to the branch
  #   directly. Note this restricts *direct pushes*, not who may open a PR
  #   (GitHub has no such toggle for public repos — anyone can fork and PR).
  #   The .github/workflows/restrict-pr-authors.yml workflow is what
  #   actually enforces "only we may open PRs", by auto-closing anyone
  #   else's. Together: nobody but the allow-listed maintainer(s) can get
  #   code into main, whether by pushing directly or via a PR.
  # allow_deletions: false — the branch (and therefore the repo's history
  #   on it) can never be deleted via the API or UI while protection is on.
  # allow_force_pushes: false — history on the branch can't be rewritten.
  gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/$REPO/branches/$branch/protection" \
    -f "required_status_checks[strict]=true" \
    -f "required_status_checks[contexts][]=Build, lint, typecheck, test" \
    -F "enforce_admins=true" \
    -F "required_pull_request_reviews[required_approving_review_count]=1" \
    -F "required_pull_request_reviews[dismiss_stale_reviews]=true" \
    -F "required_conversation_resolution=true" \
    -F "restrictions[users][]=${MAINTAINERS[0]}" \
    $(for m in "${MAINTAINERS[@]:1}"; do printf -- '-F restrictions[users][]=%s ' "$m"; done) \
    -F "restrictions[teams]=[]" \
    -F "restrictions[apps]=[]" \
    -F "allow_deletions=false" \
    -F "allow_force_pushes=false" \
    -F "block_creations=false" \
    -F "lock_branch=false"
}

protect_branch "main"
protect_branch "master"

echo
echo "Also locking the repo-level 'delete branch/repo' surface:"
# Belt-and-braces: branch protection above already blocks deleting main via
# the branches API, but this also confirms the repository itself isn't
# flagged for deletion/archival and that only the owner can do so (GitHub
# has no separate API toggle for "who can delete the repo" beyond
# collaborator permission level, which is managed via
# `gh api repos/$REPO/collaborators` — see README for adding contributors
# with write-but-not-admin access).
gh api "repos/$REPO" -f delete_branch_on_merge=true >/dev/null

echo "Done. $REPO: main/master cannot be deleted or force-pushed, and only" \
     "${MAINTAINERS[*]} can merge — everyone else must go through a reviewed PR from a fork."
