#try to render sharper/better-filtered icons from svg
#requires Pillow, e.g. pip install Pillow

import os, os.path, sys, subprocess, time, math, random

try:
  import PIL, PIL.Image, PIL.ImageChops, PIL.ImageMath
  have_pillow = True
except:
  have_pillow = False

if not have_pillow:
  sys.stderr.write("\nPillow module not installed; rendering iconsheets with less quality\n")
  sys.stderr.flush()
  
  import render_icons
  render_icons.main()
  sys.exit(0)

from math import *

print("==Iconsheet Render==")
print("make sure the following is in the svg tag:\n    shape-rendering=\"crispEdges\"\n")

sep = os.path.sep

env = os.environ
if "INKSCAPE_PATH" in env:
  inkscape_path = env["INKSCAPE_PATH"]
else:
  inkscape_path = None
  
def copy(src, dst):
    file = open(src, "rb")
    buf = file.read()
    file.close();

    file = open(dst, "wb")
    file.write(buf)
    file.close()

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

sep = os.path.sep

env = os.environ
  
def np(path):
  return os.path.abspath(os.path.normpath(path))
  
sizes = [16, 24, 32, 64]
paths = []

start_dir = os.getcwd()
basepath = sep + "src" + sep + "datafiles" + sep
dir = np(os.getcwd()) + basepath

os.chdir("tools/scripts/render_icons_electron")
src = os.path.join(dir, "iconsheet.svg")

first = True
image = None
import random
random.seed(0)

filter = 0.75

for s in sizes:
    #s = 64
    totw = 0.0
    first = True
    w = 2
    for i in range(w*w):
      offx = ((i % w) - w*0.5)/w
      offy = ((i // w) - w*0.5)/w
      
      offx += (random.random()-0.5)/w
      offy += (random.random()-0.5)/w
      
      offx *= filter;
      offy *= filter;
      
      dimen = s*16
      fname = "iconsheet%i.png" % s
      
      #cmd = ["electron", ".", src, "512", "512", str(dimen), str(dimen), "%.4f" % offx, "%.4f" % offy, "_out.png"]
      #cmd = " ".join(cmd)
      #os.system(cmd);
      
      dimen = int(dimen)
      cmd = [inkscape_path, "-C", "--export-png=_out.png", "-h %i"%dimen, "-w %i"%dimen, "-z",
             "--export-area=%.5f:%.5f:%.5f:%.5f" % (offx,offy,512+offx,512+offy), src]
#             "--export-area=%i:%i:%i:%i" % (0,0,512,512), src]
             
      
      subprocess.call(cmd)
      print(" ".join(cmd))
      #continue
      im = PIL.Image.open("_out.png")
      if first:
        first = False
        image = list(im.split())
        totw = 1.0;
      else:
        im = list(im.split())
        
        w1 = 1.0 - sqrt(offx*offx + offy*offy) / sqrt(w*2);
        w1 = w1*w1*(3.0 - 2.0*w1);
        w1 *= w1;
        w1 = w1*0.8 + 0.2;
        
        #w1 = 1.0
        totw += w1;
        
        #print(w1)
        
        for j in range(len(image)):
          image[j] = PIL.ImageMath.eval("float(a) + float(b)*(%.6f)" % w1, a=image[j], b = im[j])

      image2 = list(range(len(image)));
      for j in range(len(image2)):
        image2[j] = PIL.ImageMath.eval("convert(float(a)/%.6f, 'L')" % (totw), a=image[j])
        
      mode = "RGBA" if len(image) == 4 else "RGB"
      image2 = PIL.Image.merge(mode, image2)
      image2.save("accum.png")
    
    copy("accum.png", "../../../build/" + fname)
    copy("accum.png", "../../../src/datafiles/" + fname)
    #subprocess.call(cmd);
    
    continue
    """
    #break
    if have_pillow: #render twice as big for downsampling
        dimen = s*16*oversample_fac
    else:
        dimen = s*16

    for f in files:
      out = os.path.split(f)[1].replace(".svg", "")

      fname = "%s%i.png"%(out, s)

      x1, y1 = 0, 0
      x2, y2 = 512, 512

      cmd = [inkscape_path, "-C", "-e"+fname, "-h %i"%dimen, "-w %i"%dimen, "-z", "--export-area=%i:%i:%i:%i" % (x1,y1,x2,y2), f]

      print("- " + gen_cmdstr(cmd))
      subprocess.call(cmd)

      paths.append("./" + fname)
      """

#for p in paths:
#    fname = os.path.split(p)[1]
#    copy(p, "../../build/" + fname)

#"""
#print("copying rendered icon sheet to build/")
#copy("./%s.png"%out, "../../build/%s.png"%out)
#copy("./%s16.png"%out, "../../build/%s16.png"%out)
#os.system("%s %s %s%sbuild%s%s" % (cp, "%s.png"%out, sub, sub, sep, "%s.png"%out))
#os.system("%s %s %s%sbuild%s%s" % (cp, "%s16.png"%out, sub, sub, sep, "%s16.png"%out))
#"""

os.chdir(start_dir)
