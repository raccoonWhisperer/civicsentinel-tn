#!/bin/bash
# One-shot: clear stale git locks left by the sandbox and check out a hotfix branch from origin/main.
cd /Users/derylduer/Workspace/civicsentinel-tn || exit 1
rm -f .git/index.lock .git/objects/maintenance.lock
git fetch origin 2>&1 | tail -1
git checkout -B hotfix/partial-load-and-anon-grants origin/main 2>&1 | tail -2
git log --oneline -1
git status --short | head -5
