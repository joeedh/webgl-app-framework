#!/usr/bin/env sh

git submodule init
git submodule update

cd scripts/extern/potree
npm update
npm run-script build

cd ../../../

cp -r scripts/extern/potree/build/potree/resources .
cp -r scripts/extern/potree/build/potree/workers .
cp -r scripts/extern/potree/build/potree/lazylibs .

