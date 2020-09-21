#!/bin/bash

git commit -a

python make_zip.py

rm -rf _site
git clone . _site

cd _site

git checkout gh-pages
rm -rf scripts node_modules assets
unzip -q ../app.zip
git add *
git commit -a -m "update gh-pages"
git push
cd ../
rm -rf _site
