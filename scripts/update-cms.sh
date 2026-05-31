#!/usr/bin/env bash
# Update the self-hosted Sveltia CMS bundle to the latest published version.
# Usage: bash scripts/update-cms.sh
set -euo pipefail

ver=$(curl -fsSL https://registry.npmjs.org/@sveltia/cms/latest | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Latest @sveltia/cms: $ver"
curl -fsSL "https://unpkg.com/@sveltia/cms@${ver}/dist/sveltia-cms.js" -o public/admin/sveltia-cms.js
echo "Updated public/admin/sveltia-cms.js → $ver"
