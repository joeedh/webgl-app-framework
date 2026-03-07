#!/usr/bin/env bash
find documentation/ -name '*.md' | while read -r file; do
  echo "Processing $file"
  npx markdown-toc --append "##NL##<!-- regenerate with pnpm markdown-toc -->" -i "$file"
  sed -i 's/##NL##/\
/g' "$file"
done
