import zipfile, os, os.path, sys, glob

outfile = "./viewer.zip"

sources = [
  "./scripts/*.js",
  "./scripts/core/**",
  "./scripts/mesh/**",
  "./scripts/editors/**",
  "./scripts/data_api/**",
  "./scripts/light/**",
  "./scripts/sceneobject/**",
  "./scripts/potree/**",
  "./scripts/extern/potree/libs/**",
  "./scripts/renderengine/**",
  "./scripts/shadernodes/**",
  "./scripts/util/**",
  "./scripts/subsurf/**",
  "./scripts/path.ux/scripts/**",
  "./scripts/extern/potree/build/**",
  "./scripts/extern/*.js",
  "./scripts/extern/cdt-js/**",
  "*.html",
  "*.json",
  "*.js",
  "./assets/**",
  "./workers/**",
  "./resources/**",
  "./libs/**",
  "./examples/**",
  "Readme.MD",
  "*.css",
  "./lazylibs/**",
  "./index.html"
]

print("Writing " + outfile + "...");

zf = zipfile.ZipFile(outfile, "w")

for f in sources:
  for path in glob.glob(f, recursive=True):
    if ".git" in path:
      continue;
    zf.write(path);

zf.close();
print("done.")
