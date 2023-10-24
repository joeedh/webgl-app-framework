#!/usr/bin/env sh

if [[ ! -f ./scripts/config/config_local.js ]]; then
  echo "== Generating scripts/config/config_local.js =="
  cp scripts/config/config_local.js.example scripts/config/config_local.js
fi

git submodule init
git submodule update

npm update

echo "Building icon sheets. . ."

cd assets
python render_icons.py
cd ..
