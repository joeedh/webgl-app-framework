#!/usr/bin/env sh

git submodule init
git submodule update

npm update

if [ ! -d "./scripts/renderengine" ]; then
  bash clone_renderengine.sh
fi

echo "Building icon sheets. . ."

cd assets
python render_icons.py
cd ..
