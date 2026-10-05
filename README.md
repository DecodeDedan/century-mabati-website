# Century Mabati LTD — website

Scroll-driven 3D site for Century Mabati LTD, Nakuru. A single procedural steel sheet (three.js, custom vertex shader)
rolls out of a virtual roll-former and reshapes into each real profile — C-868, C-Wave, C-800, C-840, Corrugated,
Box Profile IT-5 and stone-coated — as the visitor scrolls. Quotes go straight to the sales WhatsApp line (0718 035 476).

## Commands

```bash
npm install
npm run dev      # http://localhost:5173
npm run check    # unit tests + production build
npm run build    # outputs static files to dist/
```

## Deploying

`dist/` is plain static files. Upload it to any static host (Netlify, Vercel, Cloudflare Pages, or a cPanel
`public_html` folder). Asset paths are root-relative, so serve the site from the domain root.
After choosing a domain, set `og:image` in `index.html` to the absolute URL so link previews show the photo.

## Where things live

| File | Purpose |
| --- | --- |
| `src/sheetShader.js` | Profile height functions (GLSL) and the material patch |
| `src/scene.js` | Renderer, sheet, scroll states per section (`STATES`) |
| `src/keyframes.js` | Pure scroll → state interpolation |
| `src/motion.js` | Lenis smooth scroll + GSAP reveals, split headings, factory strip |
| `src/quote.js` / `src/form.js` | WhatsApp quote builder + form UI |
| `public/img/` | Client photos, resized for web |

Sections opt into a 3D pose with `data-scene="<key>"`, where the key is an entry in `STATES`.
Without WebGL the page falls back to a hero photo; with `prefers-reduced-motion` the sheet renders as one still frame.

## Blender models

`blender/build_profiles.py` builds all eight profiles at real scale (mm) from published specs
(IT5 datasheet, cover widths) and proportions measured off Century's sample board.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/build_profiles.py -- --render
```

Outputs go to `blender/out/`: one `.glb` and `.png` per profile, `century_profiles.blend`, and
`contact-sheet.jpg`. Use `--only c868,it5` to rebuild a subset. Through MCP for Blender, run
`exec(open("<path>/build_profiles.py").read()); build_all()` to build into the open scene.

### The house (scroll section "On your roof")

`blender/build_house.py` builds the hip-roof bungalow and exports `public/models/century-house.glb`
(~140 KB). Its four roof faces are flat placeholders (`Roof_*`); `src/house.js` reads their corners
and drapes a live roof shader over them. `src/roofTimeline.js` maps scroll progress to the profile
being laid and its motion (roll, sweep, flip, morph, dissolve). Rebuild the model live through MCP:
`ns = {"__name__": "house"}; exec(open(PATH).read(), ns); ns["build_all"](export=True)`.
