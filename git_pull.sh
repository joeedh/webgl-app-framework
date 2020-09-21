#!/bin/bash

if [ ! -d "./scripts/renderengine" ]; then
  bash clone_renderengine.sh
fi

git pull
cd scripts/renderengine
git pull
cd ../shadernodes
git pull
cd ../
