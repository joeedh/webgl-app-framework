#!/usr/bin/env sh

git submodule init
git submodule update

echo "Updating potree. . ."

cd scripts/extern/potree
npm update

echo "Building potree. . ."

npm run-script build

cd ../../../

cp -r scripts/extern/potree/build/potree/resources .
cp -r scripts/extern/potree/build/potree/workers .
cp -r scripts/extern/potree/build/potree/lazylibs .

mkdir -p libs/ept

cp -r scripts/extern/potree/libs/ept libs

echo "Building icon sheets. . ."

cd assets
python render_icons.py
cd ..

python make_zip.py
