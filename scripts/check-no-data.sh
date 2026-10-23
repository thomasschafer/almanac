#!/usr/bin/env bash
# Fails if the repository tracks anything that looks like personal data or a database. The repo is
# public, so data must only ever live in the app's data directory outside the repo.
set -euo pipefail

cd "$(dirname "$0")/.."

forbidden="$(git ls-files | grep -Ei '\.(db|db-wal|db-shm|sqlite|sqlite3|csv|xlsx|ods|ltx)$' || true)"
if [[ -n "$forbidden" ]]; then
  echo "These tracked files look like data and must not be committed:" >&2
  echo "$forbidden" >&2
  exit 1
fi

# SQLite files start with this header regardless of their name.
while IFS= read -r -d '' file; do
  if [[ -f "$file" ]] && head -c 15 "$file" | grep -q "SQLite format 3"; then
    echo "$file is an SQLite database and must not be committed" >&2
    exit 1
  fi
done < <(git ls-files -z)

echo "No data files tracked."
