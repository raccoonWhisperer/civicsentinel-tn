#!/bin/bash
cd /Users/derylduer/Workspace/civicsentinel-tn || exit 1
rm -f .git/index.lock
git add app.js scripts/serve-local-2026-09-14.sh scripts/hotfix-amend-2026-09-14.sh
git commit -q --amend --no-edit
git log --oneline -1; git status --short | head -3
