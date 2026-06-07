#!/usr/bin/env bash
# deploy-gh-pages.sh — push dist/ to gh-pages branch
set -e
cd "$(dirname "$0")/.."

SHA=$(git rev-parse --short HEAD)
echo "Deploying dist/ to gh-pages (from $SHA)..."

# Build
npm run build

# Create temp dir
TMP=$(mktemp -d)
cp -r dist/* "$TMP/"
cp dist/.gitignore "$TMP/" 2>/dev/null || true

# Switch to temp directory and create gh-pages
cd "$TMP"
git init
git checkout -b gh-pages
git add -A
git commit -m "deploy: $SHA" --allow-empty
git push --force "https://github.com/Jasminism1/JasTavern.git" gh-pages

# Cleanup
rm -rf "$TMP"
echo "✓ Deployed to https://jasminism1.github.io/JasTavern/"
