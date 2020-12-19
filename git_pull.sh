#!/bin/bash

git submodule init
git submodule update

git submodule foreach --recursive 'git submodule init';
git submodule foreach --recursive 'git submodule update';

if [ ! -d "./scripts/renderengine" ]; then
  bash clone_renderengine.sh
fi

git pull
cd scripts/renderengine
git pull
cd ../shadernodes
git pull
cd ../
