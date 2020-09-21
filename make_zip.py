import zipfile, os, os.path, sys, glob

outfile = "./app.zip"

sources = [
  "./scripts/*.js",
  "./scripts/core/**",
  "./scripts/scene/**",
  "./scripts/curve/**",
  "./scripts/mesh/**",
  "./scripts/editors/**",
  "./scripts/data_api/**",
  "./scripts/light/**",
  "./scripts/sceneobject/**",
  "./scripts/renderengine/**",
  "./scripts/shadernodes/**",
  "./scripts/util/**",
  "./scripts/camera/**",
  "./scripts/subsurf/**",
  "./scripts/path.ux/scripts/**",
  "./scripts/extern/**",
  "./node_modules/**",
  "*.html",
  "*.json",
  "*.js",
  "./assets/**",
  "Readme.MD",
  "*.css",
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

  try:
    zf.write(path)
  except ValueError:
    sys.stdout.write("Failed to write " + path + "\n");
    sys.stdout.flush()
  
zf.close();
print("done.")
