#!/bin/zsh
# Instala (o reinstala) com.ravn.jobs: wrapper en ~/.ravn-jobs + plist + bootstrap.
set -euo pipefail
mkdir -p /Users/ezeotero/.ravn-jobs/logs
cp /Users/ezeotero/Documents/ravn/daemon/jobs/run-jobs.sh /Users/ezeotero/.ravn-jobs/run-jobs.sh
chmod +x /Users/ezeotero/.ravn-jobs/run-jobs.sh
cp /Users/ezeotero/Documents/ravn/daemon/launchd/com.ravn.jobs.plist /Users/ezeotero/Library/LaunchAgents/com.ravn.jobs.plist
launchctl bootout "gui/$(id -u)/com.ravn.jobs" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" /Users/ezeotero/Library/LaunchAgents/com.ravn.jobs.plist
launchctl list | grep com.ravn.jobs
echo "OK com.ravn.jobs instalado"
