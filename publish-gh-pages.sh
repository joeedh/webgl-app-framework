#!/bin/bash

git commit -a

python make_zip.py

rm -rf _site
git clone https://github.com/joeedh/webgl-app-framework.git _site

mkdir -p _site
if cd _site; then
  git checkout gh-pages
  git pull

  rm -rf scripts node_modules assets
  unzip -o -q ../app.zip
  git add *
  git commit -a -m "update gh-pages"
  git push
  cd ../
#  rm -rf _site
else
  echo "Failed to create _site dir"
  exit 1
fi;