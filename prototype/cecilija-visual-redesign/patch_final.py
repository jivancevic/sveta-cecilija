import os, shutil, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(here, 'cecilija-prototip.template.html')
s = open(p).read()
s = s.replace("transition: background .3s var(--ease), color .3s var(--ease); touch-action: pan-y; }",
              "transition: background .3s var(--ease), color .3s var(--ease); touch-action: pan-y; -webkit-user-select: none; user-select: none; scrollbar-width: none; }\n.app::-webkit-scrollbar { display: none; }")
open(p, 'w').write(s)
print('user-select' in s)
subprocess.run([sys.executable, os.path.join(here, 'build.py')], check=True)
dst = os.path.expanduser('~/Desktop/cecilija-redesign-prototip')
for f in ['cecilija-prototip.html', 'cecilija-prototip.template.html', 'build.py', 'patch_dark.py', 'patch_final.py']:
    shutil.copy(os.path.join(here, f), dst)
print(sorted(os.listdir(dst)))
