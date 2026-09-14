#!/bin/bash
# Fast-forward main to the hotfix, push, deploy production.
cd /Users/derylduer/Workspace/civicsentinel-tn || exit 1
rm -f .git/index.lock
git add scripts/hotfix-ship-2026-09-14.sh && git commit -q -m "scripts: ship helper" 2>/dev/null
git checkout -q main 2>&1 | tail -1 || git checkout -q -b main origin/main
git merge -q --ff-only hotfix/partial-load-and-anon-grants 2>&1 | tail -2
git push -q origin main 2>&1 | tail -2
git push -q origin hotfix/partial-load-and-anon-grants 2>&1 | tail -1
git log --oneline -1
echo "--- deploy"
/usr/local/bin/vercel --prod --yes 2>&1 | tail -4
