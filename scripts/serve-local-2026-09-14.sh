#!/bin/bash
# Static preview of the working tree on the Mac (no /api). Stop with: pkill -f 'http.server 8765'
cd /Users/derylduer/Workspace/civicsentinel-tn || exit 1
nohup /usr/bin/python3 -m http.server 8765 --bind 127.0.0.1 > /tmp/civicsentinel-preview.log 2>&1 &
echo started
