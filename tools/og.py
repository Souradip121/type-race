# Builds assets/img/og.png (1200x630 link preview) from the reel stills:
#   python tools/og.py [stillsDir]
import sys
from PIL import Image
src = sys.argv[1] if len(sys.argv) > 1 else 'screenshots'
W, H = 1200, 630
og = Image.new('RGB', (W, H), '#09275B')
names = ['lobby.png', 'race.png', 'results.png']
h = 600
w = round(1170 * h / 2532)
gap = 40
x0 = (W - (3 * w + 2 * gap)) // 2
for i, n in enumerate(names):
    im = Image.open(f'{src}/{n}').convert('RGB').resize((w, h), Image.LANCZOS)
    og.paste(im, (x0 + i * (w + gap), (H - h) // 2))
og.save('assets/img/og.png', optimize=True)
print('assets/img/og.png', og.size)
