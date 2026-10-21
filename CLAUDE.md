# Subcurrent app prototype

Static site. Everything that ships is in `docs/` (one self-contained `index.html` plus icons, manifest, service worker). No build step.

## Deploy (GitHub + Vercel)

Run from this folder:

```bash
./ship.sh            # pushes to github.com/TheDude0007/subcurrent-app-prototype, then deploys to Vercel prod
./ship.sh <owner>    # push under a different GitHub account
```

Before running, check:
1. `gh auth status` shows an account that can create repos under TheDude0007. If not, run `gh auth login` (or `gh auth switch`).
2. Vercel: the script runs `vercel login` if needed; that opens a browser for the user to approve.

After deploy, report the Vercel URL and the GitHub URL back to the user.

## Rules
- Repos for this project go under the GitHub account TheDude0007.
- Don't edit `docs/index.html` by hand for big changes; it's generated. Small text fixes are fine.
- `vercel.json` serves `docs/` with no install or build. Keep it that way so Vercel doesn't install Playwright.
- `npm test -- <url>` runs the Playwright smoke test against a deployed URL (needs `npm install` and `npx playwright install chromium` first).
