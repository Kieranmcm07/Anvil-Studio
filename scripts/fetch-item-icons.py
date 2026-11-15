"""Download original, unmodified Minecraft item textures for the interface."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'assets' / 'items'
BASE = 'https://raw.githubusercontent.com/misode/mcmeta/26.3-assets/assets/minecraft/textures/item/'
NAMES = '''diamond_helmet diamond_chestplate diamond_leggings diamond_boots diamond_sword
diamond_axe diamond_pickaxe diamond_shovel diamond_hoe bow crossbow_standby trident mace
diamond_spear elytra shield fishing_rod shears flint_and_steel carrot_on_a_stick
warped_fungus_on_a_stick enchanted_book anvil grass_block experience_bottle paper
emerald amethyst_shard prismarine_crystals blaze_powder'''.split()
SHIELD = ('https://raw.githubusercontent.com/TinyTank800/MinecraftAllImages/'
          '8888a461f088c6b907f13c14f25a12d90a481ae3/public/images-v2/26.2/shield.png')
RENDERS = ('https://raw.githubusercontent.com/Owen1212055/mc-assets/'
           '271a000189e86e101a1361af6d4266f6201ff726/item-assets/')

def download(name):
    # The shield is a 3D item. Use its inventory render, not the empty-slot outline.
    url = SHIELD if name == 'shield' else BASE + name + '.png'
    if name in ['anvil', 'grass_block']:
        url = RENDERS + name.upper() + '.png'
    try:
        with urlopen(url, timeout=30) as response:
            data = response.read()
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Expected a PNG texture')
        (ROOT / (name + '.png')).write_bytes(data)
        return name, {'source': url, 'sha256': hashlib.sha256(data).hexdigest()}
    except Exception as error:
        print(name, str(error))
        return name, {'error': str(error)}

if __name__ == '__main__':
    ROOT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        manifest = dict(pool.map(download, NAMES))
    (ROOT / 'sources.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print('Downloaded', sum('source' in entry for entry in manifest.values()), 'original textures.')
    if any('error' in entry for entry in manifest.values()):
        raise SystemExit('Some icons could not be downloaded; inspect sources.json.')
