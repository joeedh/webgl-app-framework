#!/bin/bash

if [ ! -d "./scripts/renderengine" ]; then
  echo "checking out renderengine code"

#I can never decide whether to use submodules or not.  They're kind of a pain.  
  git clone https://github.com/joeedh/webgl-app-shadergraph.git scripts/shadernodes
  git clone https://github.com/joeedh/wegl-app-renderer.git scripts/renderengine
  
  cp githooks/prepare-commit-msg scripts/renderengine/.git/hooks
  cp githooks/prepare-commit-msg scripts/shadernodes/.git/hooks
fi
