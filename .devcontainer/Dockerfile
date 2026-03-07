FROM mcr.microsoft.com/devcontainers/base:trixie

RUN sudo apt update
#RUN sudo apt-get -y install clang gcc make python3 cmake ninja-build
RUN sudo apt-get install -ys gh git vim
RUN sudo apt-get update

# try to speed up chown'ing a bit by selectively recursing
RUN sudo chown vscode:vscode /usr/local/bin -R
RUN sudo chown vscode:vscode /usr/local/lib -R
RUN sudo chown vscode:vscode /usr/local/share -R
RUN sudo chown vscode:vscode /usr/local

# install nodejs
RUN wget https://nodejs.org/dist/v24.14.0/node-v24.14.0-linux-x64.tar.xz
RUN tar --checkpoint=2000 -xJf node-v24.14.0-linux-x64.tar.xz -C /usr/local --strip-components=1

RUN echo "export PATH=/usr/local/bin:$PATH" >> /home/vscode/.bashrc

RUN npm i -g pnpm turbo
RUN pnpm setup
RUN git config --global core.editor vim
RUN pnpm i

