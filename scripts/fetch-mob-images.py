"""Refresh the native Minecraft mob renders used by the colour themes."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'assets' / 'mobs'
BASE = ('https://raw.githubusercontent.com/Owen1212055/mc-assets/'
        '271a000189e86e101a1361af6d4266f6201ff726/entity-assets/isometric/')
MOBS = ['creeper', 'bee', 'enderman', 'zombie', 'axolotl', 'skeleton', 'blaze']

if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for mob in MOBS:
        source = BASE + mob.upper() + '.png'
        with urlopen(source, timeout=30) as response:
            image = response.read()
        if not image.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Expected a PNG for ' + mob)
        (ROOT / (mob + '.png')).write_bytes(image)
        manifest[mob] = {'source': source, 'sha256': hashlib.sha256(image).hexdigest()}
    (ROOT / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Saved', len(manifest), 'mob images.')
