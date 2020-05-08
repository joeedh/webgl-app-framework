import zipfile, os, os.path, sys, glob

outfile = "./viewer.zip"

sources = [
  "./docs/**",
  "./scripts/*.js",
  "./scripts/core/**",
  "./scripts/scene/**",
  "./scripts/curve/**",
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
  "./lazylibs/**"
]

print("Writing " + outfile + "...");

files = []
for f in sources:
  for path in glob.glob(f, recursive=True):
    if ".git" in path:
      continue;
    files.append(path);
    
try:
    zf = zipfile.ZipFile(outfile, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=4)
except:
    print(zipfile.ZipFile.__doc__)
    zf = zipfile.ZipFile(outfile, "w", compression=zipfile.ZIP_DEFLATED)

for i, path in enumerate(files):
  perc = float(i) / float(len(files)) * 100.0
  perc = "%.2f%%" % perc

  sys.stdout.write(perc + ": " + path[:64] + "\r");
  sys.stdout.flush()

  zf.write(path)
  
zf.close();
print("done.")
