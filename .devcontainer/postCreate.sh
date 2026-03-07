#!/usr/bin/env bash

#delete vscode's password, whatever it is
sudo passwd -d vscode
su vscode -c "pnpm i"
su vscode -c "bash git_pull.sh"
su vscode -c "bash git_pull.sh"
