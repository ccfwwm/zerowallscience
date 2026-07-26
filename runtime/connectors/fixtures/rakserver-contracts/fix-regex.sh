#!/bin/bash
for file in contracts/*.json; do
  # Only fix patterns inside "pattern" fields - more targeted
  perl -i -pe 's/("pattern"\s*:\s*"[^"]*?)\d/$1\\d/g' "$file"
  perl -i -pe 's/("pattern"\s*:\s*"[^"]*?)\w/$1\\w/g' "$file"
  perl -i -pe 's/("pattern"\s*:\s*"[^"]*?)\s/$1\\s/g' "$file"
done
