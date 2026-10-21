# Third-party notices

Welkin theme code: Copyright (c) 2026 ZenithSeraph, licensed under MIT. See [LICENSE](LICENSE).

The visual design is inspired by the archive and interface style of **Arknights (明日方舟)**. Arknights and related names belong to their respective owners. This is an independent community theme. The package contains no game artwork, logos, audio, or fonts.

## Three.js

The bundled Three.js modules and examples in `source/assets/welkin/vendor/` are MIT licensed. Copyright © 2010–2026 Three.js authors. See [THREE-LICENSE.txt](source/assets/welkin/vendor/THREE-LICENSE.txt). Original source attribution in the files is retained.

## RhineLabUI

Some motion formulas and height tint logic in `glass-scene.js` are adapted from [RhineLabUI](https://github.com/LBEILC/RhineLabUI), Copyright (c) 2026 LBEILC. See [RhineLabUI-LICENSE.txt](source/assets/welkin/vendor/RhineLabUI-LICENSE.txt) for its MIT license.

## Installed dependencies

Hexo, hexo-util and Sharp are installed separately through npm and retain their own licenses. Their source and binaries are not bundled in this repository or release ZIP.

## js-yaml

The browser YAML editor bundles js-yaml under the MIT License, Copyright (C) 2011–2015 Vitaly Puzrin. See `source/assets/welkin/vendor/JS-YAML-LICENSE.txt`. The original license banner is retained in `js-yaml.min.js`.

## User-provided online image editor

The standalone editor in source/ps/ was originally integrated from the site owner's supplied “在线Photoshop做图源码” bundle. Its editor core and supporting assets were subsequently updated from the owner-supplied Photopea-1/Photopea directory, downloaded from the Internet Archive item photopea_202606 (Photopea.zip, reported MD5 e1c5120b01869e86e5087f931c1f8c95). The archive item date is not an upstream software version; this snapshot includes core assets named with 2025 timestamps. Existing embedded third-party notices and copyright banners are retained.

The custom ui-zh.js, bridge.js and modern.css adapt the local interface, menu events, tool controls and layout. The vendor core has small integration changes for the toolbar/header dimensions, footer space and startup hook. UI font loading uses system fonts; supplied document fonts are hosted locally.

The bundle references Photopea and 稿定 services; those names and the underlying third-party editor code remain the property of their respective owners. This integration does not relicense that code under the Welkin theme's MIT license and does not claim affiliation with Adobe, Photopea or 稿定. No separate license file was supplied with either bundle.
