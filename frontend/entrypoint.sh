#!/bin/sh
# Runtime-ersättning av byggtida platshållare (CI-guidens mönster,
# docs/02-frontend-runtime-config.md): imagen byggs en gång med platshållare i
# .next-outputen; vid containerstart sed-ersätts de med poddens miljövärden.
#
# Endast värden som Next bakar in vid BYGGE behöver platshållare (rewrites i
# next.config.js). Middleware/server-komponenter läser process.env vid KÖRNING
# och behöver ingen ersättning (AUTH_MODE, BACKEND_INTERNAL_URL i fetch-anrop).

replace_env_var() {
  placeholder=$1
  value=$2

  if [ "$value" = "__UNSET__" ]; then
    echo "Varning: ${placeholder} saknar värde — hoppar över."
  else
    echo "Ersätter ${placeholder}..."
    # Även *.json: rewrite-destinationerna bor i routes-manifest.json /
    # required-server-files.json, inte i JS-chunkarna.
    find /app/.next -type f \( -name "*.js" -o -name "*.json" \) -exec sed -i \
      "s|${placeholder}|${value}|g" {} +
  fi

  return 0
}

echo "Ersätter runtime-miljövärden..."
replace_env_var "http://backend-internal-url-placeholder" "${BACKEND_INTERNAL_URL:-__UNSET__}"

echo "Startar Next.js..."
exec node server.js
