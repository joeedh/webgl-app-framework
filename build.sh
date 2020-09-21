#!/usr/bin/env sh

git submodule init
git submodule update

npm update

if [ ! -d "./scripts/renderengine" ]; then
  echo "checking out renderengine code"
  git clone https://github.com/joeedh/webgl-app-shadergraph.git scripts/shadernodes
  git clone https://github.com/joeedh/wegl-app-renderer.git scripts/renderengine
fi

echo "Building icon sheets. . ."

cd assets
python render_icons.py
cd ..
