#!/usr/bin/env bash
# One-command GitHub Pages rollout for the Subcurrent app prototype.
# Needs git and the GitHub CLI (https://cli.github.com), logged in with: gh auth login
set -euo pipefail
REPO="${1:-subcurrent-app-prototype}"
cd "$(dirname "$0")"
command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Log in first: gh auth login"; exit 1; }
OWNER="$(gh api user -q .login)"
URL="https://${OWNER}.github.io/${REPO}"

# Full URLs for the link preview, so the card shows up in texts
perl -pi -e "s#property=\"og:image\" content=\"[^\"]*\"#property=\"og:image\" content=\"${URL}/og-image.jpg\"#; s#property=\"og:url\" content=\"[^\"]*\"#property=\"og:url\" content=\"${URL}/\"#" docs/index.html

if [ ! -d .git ]; then git init -q; git symbolic-ref HEAD refs/heads/main; fi
git add -A
git commit -qm "Publish Subcurrent app prototype" || echo "Nothing new to commit"
git branch -M main

if ! gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
  gh repo create "${REPO}" --public --source=. --remote=origin >/dev/null
  gh api -X POST "repos/${OWNER}/${REPO}/pages" -f build_type=workflow >/dev/null
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${OWNER}/${REPO}.git"
git push -u origin main

echo ""
echo "Deploying. Live in about a minute at: ${URL}/"
echo "Watch it: gh run watch -R ${OWNER}/${REPO}"
