import zipfile, os, os.path, sys, glob

outfile = "./app.zip"

sources = [
  "./scripts/*.js",
  "./scripts/core/**",
  "./scripts/config/**",
  "./scripts/scene/**",
  "./scripts/curve/**",
  "./scripts/brush/**",
  "./scripts/mesh/**",
  "./scripts/editors/**",
  "./scripts/data_api/**",
  "./scripts/light/**",
  "./scripts/sceneobject/**",
  "./scripts/renderengine/**",
  "./scripts/shadernodes/**",
  "./scripts/nullobject/**",
  "./scripts/texture/**",
  "./scripts/tet/**",
  "./scripts/test/**",
  "./scripts/trimesh/**",
  "./scripts/smesh/**",
  "./scripts/hair/**",
  "./scripts/mathl/**",
  "./scripts/util/**",
  "./scripts/shaders/**",
  "./scripts/camera/**",
  "./scripts/image/**",
  "./scripts/subsurf/**",
  "./scripts/path.ux/scripts/**",
  "./scripts/extern/**",
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
