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

RUN npm i -g pnpm turbo
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
        cmake ninja-build gnupg lsb-release software-properties-common && \
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
RUN . /tmp/versions.env && \
    git clone https://dawn.googlesource.com/dawn /tmp/dawn && \
    cd /tmp/dawn && git checkout "${TINT_COMMIT}" && \
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

# CUDA toolkit (nvcc + headers; no driver / GPU needed for --cuda --dryrun)
RUN . /tmp/versions.env && \
    CUDA_MAJOR_MINOR="${CUDA_VERSION%.*}" && \
    CUDA_DEB_REPO="https://developer.download.nvidia.com/compute/cuda/repos/debian12/x86_64" && \
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

# ROCm / HIP — syntax-only hipcc, no AMD driver needed
RUN . /tmp/versions.env && \
    curl -fsSL "https://repo.radeon.com/rocm/rocm.gpg.key" \
        | sudo gpg --dearmor -o /usr/share/keyrings/rocm.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/rocm.gpg] \
          https://repo.radeon.com/rocm/apt/${ROCM_VERSION} jammy main" \
        | sudo tee /etc/apt/sources.list.d/rocm.list && \
    sudo apt-get update && \
    sudo apt-get install -y --no-install-recommends \
        hipcc hip-dev hip-runtime-amd rocm-llvm && \
    sudo rm -rf /var/lib/apt/lists/*

ENV PATH=/opt/rocm/bin:$PATH \
    HIP_PLATFORM=amd

# OpenCL — clspv (OpenCL C → SPIR-V) + POCL headers for OpenCL C parsing
RUN . /tmp/versions.env && \
    sudo apt-get update && sudo apt-get install -y --no-install-recommends \
        opencl-headers ocl-icd-opencl-dev pocl-opencl-icd && \
    git clone --depth=1 -b "${CLSPV_COMMIT}" \
        https://github.com/google/clspv.git /tmp/clspv && \
    cd /tmp/clspv && python3 utils/fetch_sources.py --shallow && \
    cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --target clspv && \
    sudo install -m0755 build/bin/clspv /usr/local/bin/ && \
    cd / && rm -rf /tmp/clspv && sudo rm -rf /var/lib/apt/lists/*

# Sanity check: every advertised validator resolves on PATH at image build
# time. If any of these fails, the image build fails — which is what we want.
RUN clang --version && \
    node --version && pnpm --version && \
    tint --version && \
    spirv-val --version && spirv-opt --version && \
    glslang --version && \
    nvcc --version && \
    hipcc --version && \
    clspv --version
