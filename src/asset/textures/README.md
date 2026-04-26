# Planet Surface Textures

Drop two kinds of textures here to enable PBR planet surface rendering
(see `src/js/world/planet-material.js`):

```
asset/textures/
  materials/<set-name>/      ← ambientcg PBR sets (after webp convert)
    *_Color.webp
    *_Roughness.webp
    *_NormalGL.webp            (optional)
  noise/<name>.webp          ← any seamless noise texture
```

**Web optimization** — after downloading raw `.jpg`/`.png` assets, run
the WebP converter to shrink them ~80% before checking into git:

```
cd tools
npm install         # one-time, installs sharp
npm run textures:webp
```

The converter walks `src/asset/textures/**` and replaces every JPG/PNG
with a `.webp` (quality 82). It deletes the originals only after the
WebP file is written successfully. Pass `--keep` to keep originals,
`--q 90` to bump quality.

Reference them per-planet in `src/js/config.js`:

```js
planets: {
    ember: {
        // ...existing fields,
        surface: {
            materials: [
                {
                    albedo:    './asset/textures/materials/Lava005/Color.jpg',
                    roughness: './asset/textures/materials/Lava005/Roughness.jpg',
                    normal:    './asset/textures/materials/Lava005/Normal.jpg',
                },
                {
                    albedo:    './asset/textures/materials/Rock039/Color.jpg',
                    roughness: './asset/textures/materials/Rock039/Roughness.jpg',
                },
                {
                    albedo:    './asset/textures/materials/Ash002/Color.jpg',
                    roughness: './asset/textures/materials/Ash002/Roughness.jpg',
                },
            ],
            noise: './asset/textures/noise/perlin_001.png',
        },
    },
}
```

Up to 3 PBR slots per planet — the planet material blends them across the
surface using the noise texture (or procedural fbm fallback).

## ambientcg.com

- Download free PBR sets from
  https://ambientcg.com/list?type=material%2Cdecal%2Catlas&sort=popular
- Use the 1K or 2K JPG packs (the planet only needs visible-detail
  resolution; 2K is plenty).
- Each set ships with `Color`, `Normal`, `Roughness`, `AmbientOcclusion`,
  `Displacement`. The planet material currently uses `Color` and
  `Roughness`. Drop the rest in too — future passes can wire normal/AO.

## joshbrew/Noise_Textures

- Repository: https://github.com/joshbrew/Noise_Textures
- Grab any seamless noise PNG (perlin, simplex, worley, etc.).
- The R channel is sampled — color noise textures work fine, only the red
  component contributes to the blend factor.

## Without these textures

The planet still renders. The factory's procedural fbm noise stands in
for the noise texture, and the per-vertex biome paint stands in for the
PBR albedo. The active planet's tint color is always blended on top, so
the planet's environment palette flows onto the terrain regardless.

See `docs/planet-material-system.md` for the full rendering pipeline.
