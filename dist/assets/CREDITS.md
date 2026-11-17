# Minecraft item artwork

The interface uses Minecraft PNG textures and an in-game shield render. CSS scales
them with pixel rendering. The graph uses the same images.

The equipment thumbnails and enchanted book texture are taken from the Java 26.3
asset snapshot mirrored by [Misode's mcmeta](https://github.com/misode/mcmeta/tree/26.3-assets/assets/minecraft/textures/item).
They are illustrative icons for the equipment type, not a material selector.

The shield is a 3D item. Its image is the Java 26.2 inventory render exported by
[Minecraft Item Gallery](https://github.com/TinyTank800/MinecraftAllImages), by
Okami Squadron / TinyTank800, pinned to commit
`8888a461f088c6b907f13c14f25a12d90a481ae3`. It shows the actual shield rather than
the empty equipment-slot outline. See [the gallery license](ITEM-GALLERY-LICENSE.txt).

The downloaded files' exact source URLs and SHA-256 hashes are recorded in
[`items/sources.json`](items/sources.json). `scripts/fetch-item-icons.py` downloads
the same assets again if needed. All icons are served locally, with no hotlinking.

Minecraft textures and artwork are owned by Mojang/Microsoft. They are included
to identify Minecraft items in this unofficial fan tool. The brand's anvil mark
is the website's own logo, not an in-game item image. No affiliation is implied.

The project's MIT license covers its original code and documentation. It does not
relicense the Minecraft names, item textures, mob renders or other third-party
artwork. This also applies to the Minecraft images embedded in the repository
banner at `assets/anvil-banner.svg`. Existing third-party notices still apply.

## Interface icons and theme backgrounds

The anvil, grass-block and bedrock interface icons are native inventory renders from
[Owen1212055/mc-assets](https://github.com/Owen1212055/mc-assets), pinned to commit
`271a000189e86e101a1361af6d4266f6201ff726`. Other interface icons use the original
Java 26.3 item textures from mcmeta, listed in `items/sources.json`.

The creeper, bee, enderman, zombie, axolotl, skeleton, blaze, fox, shulker and dolphin are native Minecraft renders
from [Owen1212055/mc-assets](https://github.com/Owen1212055/mc-assets), pinned to commit
`271a000189e86e101a1361af6d4266f6201ff726`. The PNG files are unmodified; CSS controls
their size, opacity and movement. They are decorative and do not determine the
calculator's version rules.

Exact source URLs and hashes are in [`mobs/sources.json`](mobs/sources.json).
Use `python scripts/fetch-mob-images.py` to download the same images again.

## Minecraft sounds

The click, anvil-use and level-up recordings are original, unmodified Minecraft
Java sounds downloaded from Mojang's official asset servers using the
[1.21.1 asset index](https://piston-meta.mojang.com/v1/packages/b4c5b00becac17e3f7e88d8f55c8c01107cc9de9/17.json).
Exact URLs and verified SHA-1 hashes are in [sounds/sources.json](sounds/sources.json).
These game assets belong to their respective rights holders and are not covered
by this project's MIT code license. Sound is optional and disabled initially.
