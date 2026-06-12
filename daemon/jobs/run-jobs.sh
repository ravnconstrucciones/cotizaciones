#!/bin/zsh
# Wrapper de com.ravn.jobs — paths absolutos SIN espacios (lección de com.ravn.tudia,
# que moría con exit 127 por exec a un script dentro de iCloud).
export PATH="/Users/ezeotero/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export HOME="/Users/ezeotero"
exec /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  "/Users/ezeotero/Documents/ravn/daemon/jobs/runner.py" \
  >> "/Users/ezeotero/.ravn-jobs/logs/runner.log" 2>&1
