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
