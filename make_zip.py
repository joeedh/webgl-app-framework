import zipfile, os, os.path, sys, glob

outfile = "./viewer.zip"

sources = [
  "./scripts/**"
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
    zf.write(path);

zf.close();
print("done.")
