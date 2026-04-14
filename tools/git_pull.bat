git submodule init
git submodule update

git submodule foreach --recursive 'git submodule init';
git submodule foreach --recursive 'git submodule update';

git pull
cd scripts\renderengine
git pull
cd ..\shadernodes
git pull
cd ..\
