#!/usr/bin/env bash
# Ship the Subcurrent app: push to GitHub (TheDude0007) and deploy to Vercel production.
# Needs: git, GitHub CLI (gh auth login), Node 18+ (npx). Vercel login happens on first run.
# Usage: ./ship.sh [github-owner] [repo-name]
set -euo pipefail
OWNER="${1:-TheDude0007}"
REPO="${2:-subcurrent-app-prototype}"
cd "$(dirname "$0")"

command -v gh  >/dev/null || { echo "Install the GitHub CLI: https://cli.github.com"; exit 1; }
command -v npx >/dev/null || { echo "Install Node 18+: https://nodejs.org"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }

echo "== 1/3  Git commit"
if [ ! -d .git ]; then git init -q; git symbolic-ref HEAD refs/heads/main; fi
git add -A
git commit -qm "Update Subcurrent app prototype" || echo "Nothing new to commit"
git branch -M main

echo "== 2/3  GitHub: ${OWNER}/${REPO}"
if ! gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
  gh repo create "${OWNER}/${REPO}" --public --description "Subcurrent fan app + owner portal prototype" >/dev/null
  echo "Created github.com/${OWNER}/${REPO}"
fi
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/${OWNER}/${REPO}.git"
else
  git remote add origin "https://github.com/${OWNER}/${REPO}.git"
fi
git push -u origin main
# Optional GitHub Pages mirror (ignore if it already exists)
gh api -X POST "repos/${OWNER}/${REPO}/pages" -f build_type=workflow >/dev/null 2>&1 || true

echo "== 3/3  Vercel production deploy"
npx --yes vercel@latest whoami >/dev/null 2>&1 || npx --yes vercel@latest login
npx --yes vercel@latest link --yes --project "${REPO}" >/dev/null
npx --yes vercel@latest git connect "https://github.com/${OWNER}/${REPO}" --yes >/dev/null 2>&1 \
  && echo "Vercel now redeploys on every push to main" \
  || echo "Note: auto-deploy on push not linked; connect the repo in the Vercel dashboard if you want it"
URL="$(npx --yes vercel@latest deploy --prod --yes | tail -n1)"

echo ""
echo "GitHub:  https://github.com/${OWNER}/${REPO}"
echo "Vercel:  ${URL}"
echo "Pages:   https://${OWNER,,}.github.io/${REPO}/  (about a minute after push)"
