#!/bin/bash

git commit -a

git push
cd scripts/renderengine
git commit -a
git push
cd ../shadernodes
git commit -a
git push
cd ../
