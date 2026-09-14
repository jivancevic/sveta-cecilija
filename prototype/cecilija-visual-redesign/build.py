import base64, os, re, sys
sys.path.insert(0, '/Users/jivancevic/.claude/jobs/f8e36e39/tmp/board')
from gen import svg, I  # noqa: E402  (importing gen re-generates the round-1 board files; harmless)

here = os.path.dirname(os.path.abspath(__file__))
tpl = open(os.path.join(here, 'cecilija-prototip.template.html')).read()
logo = 'data:image/png;base64,' + base64.b64encode(open('/Users/jivancevic/.claude/jobs/f8e36e39/tmp/board/logo.png', 'rb').read()).decode()
CROWN = '<path d="m3 7 4.5 4.5L12 4l4.5 7.5L21 7l-2 11H5z"></path><path d="M5 21h14"></path>'
CROWN_NB = '<path d="m3 8 4.5 4.5L12 5l4.5 7.5L21 8l-2 11H5z"></path>'
rep = {
    'logo': logo,
    'bell': svg(I['bell'], 22),
    'note': svg(I['note'], 18),
    'chev': svg(I['chev'], 18),
    'chevl': svg('<path d="m15 18-6-6 6-6"></path>', 20, 2),
    'check': svg('<path class="chk" d="M20 6 9 17l-5-5"></path>', 20, 2.25),
    'home': svg(I['home'], 24), 'swords': svg(I['swords'], 24), 'chart': svg(I['chart'], 24),
    'trophy': svg(I['trophy'], 24), 'more': svg(I['more'], 24),
    'crown': svg(CROWN, 22, 2), 'crownnb': svg(CROWN_NB, 22, 2),
}
out = re.sub(r'\{\{([a-z]+)\}\}', lambda m: rep[m.group(1)], tpl)
open(os.path.join(here, 'cecilija-prototip.html'), 'w').write(out)
print(len(out) // 1024, 'KB', re.findall(r'\{\{([a-z]+)\}\}', out))
