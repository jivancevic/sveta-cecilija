import os, shutil
here = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(here, 'cecilija-prototip.template.html')
s = open(p).read()
s = s.replace("  --tabH: 64px; --ease: cubic-bezier(.2,.8,.2,1);\n  color-scheme: light;",
              "  --tabH: 64px; --ease: cubic-bezier(.2,.8,.2,1);\n  --crni: #1a140c; --track: #ffffff; --markEdge: transparent; --thumb: #1a140c;\n  color-scheme: light;")
s = s.replace("  --shadowBar: 0 10px 30px -10px rgba(0,0,0,0.8);\n  color-scheme: dark;",
              "  --shadowBar: 0 10px 30px -10px rgba(0,0,0,0.8);\n  --crni: #050403; --track: #3b322a; --markEdge: rgba(217,212,204,0.4); --thumb: rgba(217,171,60,0.16);\n  color-scheme: dark;")
s = s.replace(".split { position: relative; height: 12px; border-radius: var(--rPill); background: var(--card); overflow: hidden; }",
              ".split { position: relative; height: 12px; border-radius: var(--rPill); background: var(--track); overflow: hidden; }")
s = s.replace(".split .crni { right: 50%; background: var(--ink);", ".split .crni { right: 50%; background: var(--crni);")
s = s.replace(".mark--crni, .mark--otm { background: #1a140c; color: var(--grey); }",
              ".mark--crni, .mark--otm { background: #1a140c; color: var(--grey); box-shadow: 0 0 0 1.5px var(--markEdge); }")
s = s.replace("border-radius: var(--rPill); background: #1a140c; transition: transform .35s var(--ease); }",
              "border-radius: var(--rPill); background: var(--thumb); transition: transform .35s var(--ease); }")
open(p, 'w').write(s)
print('crni', s.count('var(--crni)'), 'thumb', s.count('var(--thumb)'), 'track', s.count('var(--track)'), 'edge', s.count('var(--markEdge)'))

# build
import subprocess, sys
subprocess.run([sys.executable, os.path.join(here, 'build.py')], check=True)

# durable backup outside the job tmp dir (the tmp dir dies with the job)
dst = os.path.expanduser('~/Desktop/cecilija-redesign-prototip')
os.makedirs(dst, exist_ok=True)
board = os.path.join(here, '..', 'board')
for f in ['cecilija-prototip.html', 'cecilija-prototip.template.html', 'build.py', 'patch_dark.py']:
    shutil.copy(os.path.join(here, f), dst)
for f in ['gen.py', 'gen2.py', 'canvas.json', 'logo.png']:
    shutil.copy(os.path.join(board, f), dst)
print(sorted(os.listdir(dst)))
