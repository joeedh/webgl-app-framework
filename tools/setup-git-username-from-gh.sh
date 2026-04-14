#!/usr/bin/env bash

sudo apt-get install -y jq

#gh auth login
#echo "Get permission to read user email"

if [ -z "`gh auth status | grep user`" ]; then
    echo "Need gh user permissions"
    gh auth refresh -h github.com -s user
fi

GT_EMAIL=`gh api user/emails | /usr/bin/jq '.[0].email'`
GT_NAME=`gh api user | /usr/bin/jq '.name'`

echo Name: $GT_NAME
echo Email: $GT_EMAIL

git config --global user.name "$GT_NAME"
git config --global user.email "$GT_EMAIL"

