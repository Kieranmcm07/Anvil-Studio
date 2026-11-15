"""Refresh the pinned Java data snapshot. Development helper; never needed to run the app."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://raw.githubusercontent.com/misode/mcmeta/26.3-data/data/minecraft/'
IDS = '''protection fire_protection feather_falling blast_protection projectile_protection respiration aqua_affinity thorns depth_strider frost_walker binding_curse soul_speed swift_sneak sharpness smite bane_of_arthropods knockback fire_aspect looting sweeping_edge efficiency silk_touch unbreaking fortune power punch flame infinity luck_of_the_sea lure loyalty impaling riptide channeling multishot quick_charge piercing density breach wind_burst mending vanishing_curse lunge'''.split()

def get(path):
    with urlopen(BASE + path + '.json', timeout=30) as response:
        return json.load(response)

def expand(value, kind):
    if isinstance(value, list):
        return sorted(set(x for v in value for x in expand(v, kind)))
    if not value:
        return []
    if value.startswith('#minecraft:'):
        return expand(get('tags/' + kind + '/' + value.split(':')[1])['values'], kind)
    return [value.removeprefix('minecraft:')]

def enchantment(name):
    d = get('enchantment/' + name)
    return name, {'max': d['max_level'], 'bookCost': max(1, d['anvil_cost'] // 2),
                  'items': expand(d['supported_items'], 'item'),
                  'excludes': expand(d.get('exclusive_set', []), 'enchantment')}

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=8) as pool:
        data = dict(pool.map(enchantment, IDS))
    output = {'version': 'Java 26.3', 'source': BASE, 'enchantments': data}
    (ROOT / 'dist' / 'vanilla-data.json').write_text(json.dumps(output, indent=2) + '\n', encoding='utf-8')
    print('Fetched', len(data), 'version-pinned enchantments and resolved item/exclusion tags.')
