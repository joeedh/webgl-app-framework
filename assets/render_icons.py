#!python3
import os, os.path, sys, subprocess, time, math, random

SHARPEN = True
SVG_SIZE = 512
SVG_DIVISIONS = 16
OUTPUT_HEIGHT_SCALE = 0.5

#sys.exit(0)
sep = os.path.sep

env = os.environ
if "INKSCAPE_PATH" in env:
  inkscape_path = env["INKSCAPE_PATH"]
else:
  inkscape_path = None
  
def np(path):
  return os.path.abspath(os.path.normpath(path))
  
def find(old, path):
  path = np(path)
  
  if old: 
    return old
    
  if os.path.exists(path):
    return path
  
  return None
  
def find_inkscape_win32():
  global inkscape_path
  
  paths = env["PATH"].split(";");
  for p in paths:
    p = p.strip()
    if not p.endswith("\\"): p += "\\"
    ret = find(inkscape_path, p + "inkscape.exe")
    if ret: return ret
    
  ret = find(inkscape_path, "c:\\Program Files\\Inkscape\\inkscape.exe")
  ret = find(ret, "c:\\Program Files (x86)\\Inkscape\\inkscape.exe")
  
  return ret
  
def find_inkscape_nix():
  global inkscape_path

  paths = env["PATH"].split(":");
  for p in paths:
    p = p.strip()
    if not p.endswith("/"): p += "/"
    ret = find(inkscape_path, p + "inkscape")
    if ret: return ret

  ret = find(inkscape_path, "/usr/local/bin/inkscape")
  ret = find(ret, "/usr/bin/inkscape")
  ret = find(ret, "/bin/inkscape");
  ret = find(ret, "~/inkscape/inkscape");

if "WIN" in sys.platform.upper():
  inkscape_path = find_inkscape_win32()
else:
  inkscape_path = find_inkscape_nix()

if inkscape_path == None:
  sys.stderr.write("Could not find inkscape binary");
  #this script is supposed to fail silently
  sys.exit();
  #sys.exit(-1)

def get_inkscape_version():
    p = subprocess.run([inkscape_path, "--version"], stdout=subprocess.PIPE, check=True)
    s = str(p.stdout, "latin-1").lower()
    if s.startswith("inkscape"):
        s = s[8:].strip()

    if " " in s:
        s = s[:s.find(" ")].strip()

    return s

inkscape_version = get_inkscape_version()
inkscape_1 = inkscape_version.startswith("1")

files = ["iconsheet.svg"]

def gen_cmdstr(cmd):
  cmdstr = ""
  for c in cmd:
    cmdstr += c + " "
  return cmdstr

def copy(src, dst):
    file = open(src, "rb")
    buf = file.read()
    file.close();

    file = open(dst, "wb")
    file.write(buf)
    file.close()

have_pillow = True
try:
    import PIL
except:
    have_pillow = False
    #sys.stderr.write("Warning: Pillow module not found; cannot sharpen iconsheets\n")

oversample_fac = 2

def sharpen_iconsheets(paths):
    print("\nsharpening. . .\n");

    global have_pillow, oversample_fac

    if not have_pillow:
      return
      
    import PIL, PIL.ImageFilter, PIL.Image

    filter = PIL.ImageFilter.SHARPEN
    #filter = PIL.ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3)

    for f in paths:
        im = PIL.Image.open(f)
        for i in range(2):
            im = im.filter(filter);

        im = im.resize((im.width//oversample_fac, im.height//oversample_fac), PIL.Image.LANCZOS)
        im = im.filter(filter);

        print(im.width, im.height)
        im.save(f)

sizes = [16, 24, 32, 40, 50, 64, 80, 128]
paths = []

start_dir = os.getcwd()
basepath = "./"
dir = np(os.getcwd())
if not dir.endswith(os.path.sep):
    dir += os.path.sep
dir += basepath


def main():
  os.chdir(dir)

  for s in sizes:
      if have_pillow and SHARPEN: #render twice as big for downsampling
          dimen = s*SVG_DIVISIONS*oversample_fac
      else:
          dimen = s*SVG_DIVISIONS

      for f in files:
        out = os.path.split(f)[1].replace(".svg", "")

        fname = "%s%i.png"%(out, s)

        x1, y1 = 0, int(SVG_SIZE*(1.0 - OUTPUT_HEIGHT_SCALE))
        x2, y2 = SVG_SIZE, SVG_SIZE

        height = int(dimen * OUTPUT_HEIGHT_SCALE)

        if inkscape_1:
            y1 = 0
            y2 =  int(SVG_SIZE * OUTPUT_HEIGHT_SCALE)
            cmd = [inkscape_path, "--export-filename="+fname, "-w",  "%i"%dimen, "-h", "%i"%height, "--export-area=%i:%i:%i:%i" % (x1,y1,x2,y2), f]
        else:
            cmd = [inkscape_path, "-C", "-e"+fname, "-w %i"%dimen, "-h %i"%height, "-z", "--export-area=%i:%i:%i:%i" % (x1,y1,x2,y2), f]

        print("- " + gen_cmdstr(cmd))
        subprocess.call(cmd)

        paths.append("./" + fname)

  if SHARPEN:
    sharpen_iconsheets(paths)

  for p in paths:
      fname = os.path.split(p)[1]
      copy(p, "./" + fname)

  os.chdir(start_dir)

print(__name__)
if __name__ == "__main__":
  main()
