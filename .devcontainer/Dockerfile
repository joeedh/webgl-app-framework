FROM mcr.microsoft.com/devcontainers/base:trixie

USER vscode

ENV SHELL=/bin/bash

# Pin versions for the brush-backend toolchain in one place.
# Kept in sync with sculptcore/ci/versions.env — that file is the source of
# truth for CI and for make.mjs sbrush-validate; we copy it in below.
COPY sculptcore/ci/versions.env /tmp/versions.env

RUN sudo apt update
RUN sudo apt-get install -y gh vim
RUN sudo apt-get update
RUN git config --global core.editor vim

# Clear root's password so `su root` works without a password inside the
# container. The base image locks root by default; this unlocks it for
# interactive debugging convenience.
RUN sudo passwd -d root

WORKDIR /home/vscode

ENV PATH=/usr/local/bin:$PATH

WORKDIR /home/vscode

# try to speed up chown'ing a bit by selectively recursing
RUN sudo chown vscode:vscode /usr/local/bin -R
RUN sudo chown vscode:vscode /usr/local/lib -R
RUN sudo chown vscode:vscode /usr/local/libexec -R
RUN sudo chown vscode:vscode /usr/local/include -R
RUN sudo chown vscode:vscode /usr/local/share -R
RUN sudo chown vscode:vscode /usr/local

# remove any existing nodejs from apt
RUN sudo apt-get -y remove nodejs 2> /dev/null

# install nodejs (version pin lives in sculptcore/ci/versions.env)
RUN . /tmp/versions.env && \
    wget "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" && \
    tar --checkpoint=2000 -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1 && \
    rm "node-v${NODE_VERSION}-linux-x64.tar.xz"

RUN echo "export PATH=/usr/local/bin:$PATH" >> /home/vscode/.bashrc

RUN . /tmp/versions.env && \
    npm i -g "pnpm@${PNPM_VERSION}" turbo
RUN pnpm setup

# ===========================================================================
# Sculptcore brush-backend toolchains
# ---------------------------------------------------------------------------
# Everything from here on supports the sbrush DSL plan in
# sculptcore/documentation/brush_compute_dsl.md. Each block installs one
# backend's emitter/validator so that `node make.mjs configure native
# --backends=cpp,wgsl,spirv,cuda,hip,opencl` works inside this container.
# All backends are syntax-only — no GPU is required at runtime.
#
# Note: the Dawn (tint) and clspv builds compile LLVM from source and add
# 10-30 minutes to image build. Worth it; iteration inside the container is
# fast afterward.
# ===========================================================================

# Shared build prerequisites + LLVM/clang for the native-clang toolchain
# referenced by sculptcore/make.mjs configure native.
RUN . /tmp/versions.env && \
    sudo apt-get update && sudo apt-get install -y --no-install-recommends \
        ca-certificates curl wget git xz-utils unzip \
        build-essential pkg-config python3 python3-pip python-is-python3 \
        cmake ninja-build gnupg lsb-release && \
    curl -fsSL https://apt.llvm.org/llvm.sh -o /tmp/llvm.sh && \
    sudo bash /tmp/llvm.sh "${LLVM_VERSION}" && \
    sudo apt-get install -y --no-install-recommends \
        "clang-${LLVM_VERSION}" "lld-${LLVM_VERSION}" "llvm-${LLVM_VERSION}" \
        "libc++-${LLVM_VERSION}-dev" "libc++abi-${LLVM_VERSION}-dev" && \
    sudo update-alternatives --install /usr/bin/clang   clang   "/usr/bin/clang-${LLVM_VERSION}"   100 && \
    sudo update-alternatives --install /usr/bin/clang++ clang++ "/usr/bin/clang++-${LLVM_VERSION}" 100 && \
    sudo rm -rf /var/lib/apt/lists/* /tmp/llvm.sh

# Tint (WGSL validator) — built from Dawn standalone at the pinned commit.
# Only the `tint` binary is kept; the rest of Dawn is discarded.
# Fetch-by-SHA pattern (not `git clone` + `checkout`) so any reachable commit
# works — including ones that only live on chromium/* milestone branches.
RUN . /tmp/versions.env && \
    git init /tmp/dawn && cd /tmp/dawn && \
    git remote add origin https://dawn.googlesource.com/dawn && \
    git -c protocol.version=2 fetch --depth=1 origin "${TINT_COMMIT}" && \
    git checkout FETCH_HEAD && \
    cp scripts/standalone.gclient .gclient && \
    python3 tools/fetch_dawn_dependencies.py --use-test-deps && \
    cmake -S . -B out -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DDAWN_BUILD_SAMPLES=OFF \
        -DDAWN_USE_X11=OFF \
        -DTINT_BUILD_TESTS=OFF && \
    cmake --build out --target tint_cmd_tint_cmd && \
    sudo install -m0755 out/tint /usr/local/bin/tint && \
    cd / && rm -rf /tmp/dawn

# SPIR-V tools (spirv-val, spirv-opt, spirv-dis) + glslang
RUN . /tmp/versions.env && \
    git clone --depth=1 -b "vulkan-sdk-${SPIRV_TOOLS_VERSION}" \
        https://github.com/KhronosGroup/SPIRV-Tools.git /tmp/spirv-tools && \
    git clone --depth=1 -b "vulkan-sdk-${SPIRV_TOOLS_VERSION}" \
        https://github.com/KhronosGroup/SPIRV-Headers.git /tmp/spirv-tools/external/spirv-headers && \
    cmake -S /tmp/spirv-tools -B /tmp/spirv-tools/build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DSPIRV_SKIP_TESTS=ON && \
    cmake --build /tmp/spirv-tools/build --target spirv-val spirv-opt spirv-dis && \
    sudo install -m0755 /tmp/spirv-tools/build/tools/spirv-val /usr/local/bin/ && \
    sudo install -m0755 /tmp/spirv-tools/build/tools/spirv-opt /usr/local/bin/ && \
    sudo install -m0755 /tmp/spirv-tools/build/tools/spirv-dis /usr/local/bin/ && \
    rm -rf /tmp/spirv-tools && \
    git clone --depth=1 -b "${GLSLANG_VERSION}" \
        https://github.com/KhronosGroup/glslang.git /tmp/glslang && \
    cmake -S /tmp/glslang -B /tmp/glslang/build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release -DENABLE_OPT=OFF && \
    cmake --build /tmp/glslang/build --target glslang-standalone && \
    sudo install -m0755 /tmp/glslang/build/StandAlone/glslang /usr/local/bin/ && \
    rm -rf /tmp/glslang

# From here on we use bash for RUN steps because the CUDA / OpenCL blocks
# rely on ${var/x/y} pattern substitution, which dash (the default /bin/sh)
# does not support. Earlier steps stay on /bin/sh to keep their cache.
SHELL ["/bin/bash", "-c"]

# CUDA toolkit (nvcc + headers; no driver / GPU needed for --cuda --dryrun)
#
# Debian 12 trixie's apt uses Sequoia (sqv) for OpenPGP verification, with a
# policy that rejects SHA1 second-preimage-resistance signatures after
# 2026-02-01. NVIDIA's cuda-keyring still ships SHA1 self-signatures, so apt
# rejects the InRelease file. We relax the sqv policy *just* for SHA1 before
# the apt-get update; everything else stays at the trixie default.
RUN . /tmp/versions.env && \
    CUDA_MAJOR_MINOR="${CUDA_VERSION%.*}" && \
    CUDA_DEB_REPO="https://developer.download.nvidia.com/compute/cuda/repos/debian12/x86_64" && \
    sudo mkdir -p /etc/crypto-policies/back-ends && \
    printf '[hash_algorithms]\nsha1.collision_resistance = "always"\nsha1.second_preimage_resistance = "always"\n' \
        | sudo tee /etc/crypto-policies/back-ends/sequoia.config > /dev/null && \
    curl -fsSL "${CUDA_DEB_REPO}/cuda-keyring_1.1-1_all.deb" -o /tmp/cuda-keyring.deb && \
    sudo dpkg -i /tmp/cuda-keyring.deb && \
    sudo apt-get update && \
    sudo apt-get install -y --no-install-recommends \
        "cuda-nvcc-${CUDA_MAJOR_MINOR/./-}" \
        "cuda-cudart-dev-${CUDA_MAJOR_MINOR/./-}" \
        "cuda-cccl-${CUDA_MAJOR_MINOR/./-}" && \
    sudo rm -rf /var/lib/apt/lists/* /tmp/cuda-keyring.deb

ENV PATH=/usr/local/cuda/bin:$PATH \
    CUDA_HOME=/usr/local/cuda

# ROCm / HIP — DEFERRED TO WAVE 5.
#
# Two upstream problems block installing AMD's ROCm on Debian 12 trixie:
#
#   1. AMD's rocm.gpg.key has an invalid binding self-signature that
#      trixie's sequoia (sqv) verifier rejects. [trusted=yes] bypasses
#      this, but is a workaround, not a fix.
#   2. AMD only ships ROCm packages for Ubuntu (jammy / noble). The
#      `rocm-llvm` package depends on `libstdc++-{5,7,11}-dev`, none of
#      which exist on Debian trixie (which ships libstdc++-14-dev).
#      `hipcc` transitively needs `rocm-llvm` for its clang, so we can't
#      cleanly install hipcc syntax-only either.
#
# Options to revisit when Wave 5 lands:
#   * Switch the base image to ubuntu:22.04 (loses Debian-trixie ergonomics)
#   * Multi-stage: install HIP in a jammy stage, copy bins+libs into trixie
#     (fragile — runtime libstdc++ ABI mismatch)
#   * Use AMD's HIP CPU runtime (hipCPU) for syntax-only checks instead
#   * Wait for AMD's Debian 13 packages (announced, not yet shipped)
#
# For now the image ships without hipcc. The Wave 5 HIP emitter will gate
# its validator on `which hipcc` and skip cleanly when absent.
#
# ENV PATH=/opt/rocm/bin:$PATH HIP_PLATFORM=amd  # restore when re-enabled

# OpenCL — clspv (OpenCL C → SPIR-V) + POCL headers for OpenCL C parsing
# clspv pins to a commit (no upstream release tags); fetch-by-SHA like Dawn.
RUN . /tmp/versions.env && \
    sudo apt-get update && sudo apt-get install -y --no-install-recommends \
        opencl-headers ocl-icd-opencl-dev pocl-opencl-icd && \
    git init /tmp/clspv && cd /tmp/clspv && \
    git remote add origin https://github.com/google/clspv.git && \
    git -c protocol.version=2 fetch --depth=1 origin "${CLSPV_COMMIT}" && \
    git checkout FETCH_HEAD && \
    python3 utils/fetch_sources.py --shallow --ci && \
    cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --target clspv && \
    sudo install -m0755 build/bin/clspv /usr/local/bin/ && \
    cd / && rm -rf /tmp/clspv && sudo rm -rf /var/lib/apt/lists/*

# Sanity check: every advertised validator resolves on PATH at image build
# time. If any of these fails, the image build fails — which is what we want.
# hipcc is intentionally omitted (see ROCm block above; Wave 5 follow-up).
# We use `command -v` for existence rather than `--version`, since some
# binaries (tint) treat `--version` as an unknown flag and exit non-zero.
RUN for tool in clang node pnpm tint spirv-val spirv-opt spirv-dis glslang nvcc clspv; do \
        if ! command -v "$tool" > /dev/null; then \
            echo "missing: $tool"; exit 1; \
        fi; \
        echo "ok: $tool -> $(command -v $tool)"; \
    done
