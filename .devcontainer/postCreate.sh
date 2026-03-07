#!/usr/bin/env bash

# fix vscode server
cat <<EOF >> ~/.bashrc
export VSCODE_SERVER=\`echo \$BROWSER | sed "s/bin\/helpers\/browser.sh/bin/g"\`
echo Found vscode server at \$VSCODE_SERVER
export PATH=\$VSCODE_SERVER/remote-cli:\$PATH
EOF

# delete vscode's password, whatever it is
sudo passwd -d vscode

su vscode -c "git config --global set config.editor vim"
su vscode -c "pnpm i"
su vscode -c "bash git_pull.sh"
su vscode -c "bash git_pull.sh"

su vscode -c "pnpm approve-builds @swc/core@1.15.18, core-js@2.6.12, esbuild@0.19.12,            │
│   unrs-resolver@1.11.1"
