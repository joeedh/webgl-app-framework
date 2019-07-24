import os, os.path, sys, subprocess, time, math, random

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
dir = np(os.getcwd()) + basepath

def main():
  os.chdir(dir)

  for s in sizes:
      if have_pillow: #render twice as big for downsampling
          dimen = s*16*oversample_fac
      else:
          dimen = s*16

      for f in files:
        out = os.path.split(f)[1].replace(".svg", "")

        fname = "%s%i.png"%(out, s)

        x1, y1 = 0, int(512*2.0/3.0)
        x2, y2 = 512, 512

        height = dimen // 3;
        
        cmd = [inkscape_path, "-C", "-e"+fname, "-w %i"%dimen, "-h %i"%height, "-z", "--export-area=%i:%i:%i:%i" % (x1,y1,x2,y2), f]

        print("- " + gen_cmdstr(cmd))
        subprocess.call(cmd)

        paths.append("./" + fname)

  sharpen_iconsheets(paths)

  for p in paths:
      fname = os.path.split(p)[1]
      copy(p, "./" + fname)

  #"""
  #print("copying rendered icon sheet to build/")
  #copy("./%s.png"%out, "../../build/%s.png"%out)
  #copy("./%s16.png"%out, "../../build/%s16.png"%out)
  #os.system("%s %s %s%sbuild%s%s" % (cp, "%s.png"%out, sub, sub, sep, "%s.png"%out))
  #os.system("%s %s %s%sbuild%s%s" % (cp, "%s16.png"%out, sub, sub, sep, "%s16.png"%out))
  #"""

  os.chdir(start_dir)

print(__name__)
if __name__ == "__main__":
  main()
