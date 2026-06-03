// sccache cross-worktree launcher.
//
// A thin wrapper inserted between CMake's compiler-launcher hook and the real
// sccache so that ONE sccache server caches for EVERY git worktree at once.
//
// Why this exists
// ---------------
// sccache's background server reads SCCACHE_BASEDIRS exactly once, at startup,
// and strips those base dirs from the absolute paths that leak into the
// preprocessed source (line markers, __FILE__) before hashing. With a single
// base dir per server you must bounce the server every time you build from a
// different worktree. This launcher instead keeps the *union* of every live
// worktree's root in SCCACHE_BASEDIRS, so the single shared server produces
// identical cache keys for all of them and no per-switch bounce is needed.
//
// How it works
// ------------
// The launcher lives in a shared directory (C:/dev/sccache-worktrees) alongside
// a "registry": one "<name>.<hash>.txt" file per worktree whose contents are
// that worktree's absolute root (written by tools/sccache-wrapper/setup.mjs at
// worktree-creation / configure time). On every compile the launcher:
//   1. scans the registry, deleting any file whose worktree no longer exists
//      on disk (auto-GC), and unions the survivors into SCCACHE_BASEDIRS;
//   2. exports SCCACHE_BASEDIRS so that if THIS invocation autostarts the
//      server, the server is born knowing every worktree;
//   3. restarts the server (sccache --stop-server) only when the union has
//      gained a base dir the running server doesn't have (a genuine addition,
//      i.e. a brand-new worktree's first build) — never for a pure removal,
//      since a leftover base dir is harmless and a restart would disrupt a
//      concurrent build in another worktree;
//   4. execs the real sccache with the original (compiler + args) tail.
//
// It NEVER fails the build for bookkeeping reasons: any error in steps 1-3 is
// swallowed and it proceeds straight to step 4 (and if sccache itself can't be
// found on PATH, it runs the bare compiler).
//
// Build: single translation unit, no third-party deps. See
// tools/sccache-wrapper/setup.mjs (compiles it with the project's clang++).

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <set>
#include <string>
#include <vector>

#ifdef _WIN32
#  define NOMINMAX
#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
#  include <process.h>
static const char kPathSep = ';';
static const char* kSccacheName = "sccache.exe";
#else
#  include <fcntl.h>
#  include <sys/file.h>
#  include <sys/wait.h>
#  include <unistd.h>
static const char kPathSep = ':';
static const char* kSccacheName = "sccache";
#endif

namespace fs = std::filesystem;

// --- small helpers ---------------------------------------------------------

static std::string trim(const std::string& s) {
  size_t a = s.find_first_not_of(" \t\r\n");
  if (a == std::string::npos) return "";
  size_t b = s.find_last_not_of(" \t\r\n");
  return s.substr(a, b - a + 1);
}

// Forward slashes, no trailing slash — matches tools/new-worktree.mjs `fwd()`
// and the paths cmake/clang emit, so set-dedup and base-dir prefixing line up.
static std::string normalizeDir(std::string s) {
  for (char& c : s) {
    if (c == '\\') c = '/';
  }
  while (s.size() > 1 && s.back() == '/') s.pop_back();
  return s;
}

static std::string envOr(const char* name, const char* fallback) {
  const char* v = std::getenv(name);
  return v ? std::string(v) : std::string(fallback);
}

static void setEnv(const char* name, const std::string& val) {
#ifdef _WIN32
  _putenv_s(name, val.c_str());
#else
  setenv(name, val.c_str(), 1);
#endif
}

// Directory containing this executable — the registry lives next to it.
static fs::path selfDir(const char* argv0) {
#ifdef _WIN32
  char buf[4096];
  DWORD n = GetModuleFileNameA(nullptr, buf, sizeof(buf));
  if (n > 0 && n < sizeof(buf)) return fs::path(std::string(buf, n)).parent_path();
#else
  std::error_code ec;
  fs::path p = fs::read_symlink("/proc/self/exe", ec);
  if (!ec) return p.parent_path();
#endif
  std::error_code ec;
  fs::path p = fs::absolute(fs::path(argv0), ec);
  return ec ? fs::path(".") : p.parent_path();
}

// First `name` found on PATH, or empty.
static std::string findOnPath(const char* name) {
  std::string path = envOr("PATH", "");
  size_t i = 0;
  while (i <= path.size()) {
    size_t j = path.find(kPathSep, i);
    if (j == std::string::npos) j = path.size();
    std::string dir = path.substr(i, j - i);
    if (!dir.empty()) {
      std::error_code ec;
      fs::path cand = fs::path(dir) / name;
      if (fs::is_regular_file(cand, ec)) return cand.string();
    }
    i = j + 1;
  }
  return "";
}

static std::set<std::string> readSet(const fs::path& file) {
  std::set<std::string> out;
  std::ifstream in(file);
  std::string line;
  while (std::getline(in, line)) {
    std::string t = trim(line);
    if (!t.empty()) out.insert(normalizeDir(t));
  }
  return out;
}

static void writeSet(const fs::path& file, const std::set<std::string>& s) {
  std::ofstream out(file, std::ios::trunc);
  for (const auto& d : s) out << d << '\n';
}

static std::string join(const std::set<std::string>& s, char sep) {
  std::string out;
  for (const auto& d : s) {
    if (!out.empty()) out += sep;
    out += d;
  }
  return out;
}

// --- advisory, non-blocking, crash-safe lock (auto-released on exit) --------

struct Lock {
  bool acquired = false;
#ifdef _WIN32
  HANDLE h = INVALID_HANDLE_VALUE;
  explicit Lock(const fs::path& p) {
    h = CreateFileA(p.string().c_str(), GENERIC_WRITE, 0 /*no sharing*/, nullptr,
                    OPEN_ALWAYS, FILE_FLAG_DELETE_ON_CLOSE, nullptr);
    acquired = (h != INVALID_HANDLE_VALUE);
  }
  ~Lock() {
    if (h != INVALID_HANDLE_VALUE) CloseHandle(h);
  }
#else
  int fd = -1;
  explicit Lock(const fs::path& p) {
    fd = ::open(p.c_str(), O_CREAT | O_RDWR, 0644);
    if (fd >= 0 && ::flock(fd, LOCK_EX | LOCK_NB) == 0) acquired = true;
    else if (fd >= 0) { ::close(fd); fd = -1; }
  }
  ~Lock() {
    if (fd >= 0) ::close(fd);
  }
#endif
};

// --- run a child and wait for it, returning its exit code -------------------

static int runWait(const std::string& exe, const std::vector<std::string>& args) {
  std::vector<const char*> argv;
  argv.push_back(exe.c_str());
  for (const auto& a : args) argv.push_back(a.c_str());
  argv.push_back(nullptr);
#ifdef _WIN32
  intptr_t rc = _spawnv(_P_WAIT, exe.c_str(), argv.data());
  return rc < 0 ? 1 : static_cast<int>(rc);
#else
  pid_t pid = ::fork();
  if (pid == 0) {
    ::execv(exe.c_str(), const_cast<char* const*>(argv.data()));
    _exit(127);
  }
  int status = 0;
  ::waitpid(pid, &status, 0);
  return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
#endif
}

// --- reconcile the union of live worktrees into SCCACHE_BASEDIRS ------------
//
// Scans the registry, prunes dead worktrees, exports the union, and restarts a
// stale server iff the union gained a base dir it lacks. Never throws.
static void reconcile(const fs::path& regDir, const std::string& sccache) {
  std::set<std::string> desired;
  try {
    for (const auto& e : fs::directory_iterator(regDir)) {
      if (!e.is_regular_file()) continue;
      if (e.path().extension() != ".txt") continue;
      std::ifstream in(e.path());
      std::string line;
      std::getline(in, line);
      std::string root = normalizeDir(trim(line));
      in.close();
      if (root.empty()) continue;
      std::error_code ec;
      if (!fs::exists(root, ec)) {
        // Worktree gone — auto-delete its registry file.
        fs::remove(e.path(), ec);
        continue;
      }
      desired.insert(root);
    }
  } catch (...) {
    // A racing prune (another launcher deleting a file mid-iteration) or a
    // transient FS error: whatever we gathered so far is still usable.
  }

  if (desired.empty()) return;  // nothing registered; leave env untouched
  setEnv("SCCACHE_BASEDIRS", join(desired, kPathSep));

  if (sccache.empty()) return;  // can't restart what we can't find

  const fs::path applied = regDir / ".applied";
  auto needsAdd = [&](const std::set<std::string>& have) {
    for (const auto& d : desired)
      if (!have.count(d)) return true;
    return false;
  };

  std::error_code ec;
  if (!needsAdd(readSet(applied))) return;  // server already covers the union

  // A genuine addition: take the lock and (double-checking under it) restart
  // the server so it starts fresh with the full union via our exported env.
  Lock lk(regDir / ".lock");
  if (!lk.acquired) return;  // another launcher is handling it; our env suffices
  if (!needsAdd(readSet(applied))) return;
  runWait(sccache, {"--stop-server"});
  writeSet(applied, desired);
  (void)ec;
}

int main(int argc, char** argv) {
  // cmake invokes us as:  launcher <compiler> <arg>...
  if (argc < 2) return 0;

  std::vector<std::string> tail;
  for (int i = 1; i < argc; ++i) tail.emplace_back(argv[i]);

  std::string sccache = findOnPath(kSccacheName);

  try {
    reconcile(selfDir(argv[0]), sccache);
  } catch (...) {
    // Bookkeeping must never break the build.
  }

  if (sccache.empty()) {
    // No sccache on PATH — run the bare compiler so the build still works.
    std::string compiler = tail.front();
    tail.erase(tail.begin());
    return runWait(compiler, tail);
  }
  return runWait(sccache, tail);  // sccache <compiler> <arg>...
}
