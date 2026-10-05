// Procedural roofing-sheet geometry, computed on the GPU. A flat plane is
// displaced in the vertex shader by a height function per Century profile, so
// morphing between C-868 and Box Profile is a single uniform tween — no mesh
// swaps, no downloaded models. Normals come from a finite-difference gradient.

export const PROFILES = [
  { id: 0, name: 'Corrugated', color: '#b3262b' },
  { id: 1, name: 'Box Profile IT-5', color: '#1f5fa8' },
  { id: 2, name: 'C-Wave', color: '#6b1e26' },
  { id: 3, name: 'C-800', color: '#c2512e' },
  { id: 4, name: 'C-840', color: '#2b2f36' },
  { id: 5, name: 'C-868', color: '#1f4d35' },
  { id: 6, name: 'Stone-coated Shake', color: '#34363a' },
  { id: 7, name: 'Stone-coated Roman', color: '#7a3a2c' },
]

export const SHEET = { width: 2.4, length: 6 }

/** Profile id for bare roof battens (no sheet laid yet). */
export const BARE = 8

// Shared by the floating sheet and the house roof: constants, helpers and profileHeight(id, p).
export const PROFILE_GLSL = /* glsl */ `
const float PI = 3.14159265;
const float W = ${SHEET.width.toFixed(2)};
// Scale is 2.4 units per metre of cover width, so a 350 mm tile course is 0.84.
const float COURSE = 0.84;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Semicircular Roman barrel with a flat valley; t runs 0..1 across one pitch.
float romanBarrel(float t, float valley) {
  float u = clamp((t - valley * 0.5) / (1.0 - valley), 0.0, 1.0);
  float c = 2.0 * u - 1.0;
  return sqrt(max(0.0, 1.0 - c * c));
}

// Trapezoidal rib centred in the pitch, straight webs, flat crown.
float trapRib(float t, float baseHalf, float topHalf) {
  return clamp((baseHalf - abs(t - 0.5)) / (baseHalf - topHalf), 0.0, 1.0);
}

// Tile course: short rise off the step, long flat tread, then a near-vertical ~20 mm drop.
float stepRise(float s, float h) {
  return h * smoothstep(0.0, 0.3, s) * (1.0 - smoothstep(0.94, 1.0, s));
}

// The barrel is pressed shallower at the start of each course, so the step face
// is tallest at the crests — that is what draws the curved nose on each tile end.
float nose(float s, float squash) { return mix(squash, 1.0, smoothstep(0.0, 0.15, s)); }

// Course position with a curved tile end. The drop line is pushed downhill where the
// cross-profile is high, so each barrel ends in an arc (Roman "spoon" or C-Wave bow)
// rather than the whole sheet stepping along one straight line.
float tileS(float y, float course, float lip, float shape) {
  return fract((y + 60.0 - lip * shape) / course);
}

// The tile end rolls over before the drop, as pressed tiles do.
float lipRoll(float s) { return 1.0 - 0.12 * smoothstep(0.8, 1.0, s); }

// Thin raised line down the centre of each valley (the sheet's pressing seam).
float valleySeam(float t) { return exp(-pow(min(t, 1.0 - t) / 0.012, 2.0)); }

// Roman-family tile: barrel across, curved-end courses along.
float romanTile(float x, float y, float pitch, float valley, float barrelH, float course, float lip, float stepH, float squash) {
  float t = fract(x / pitch);
  float b = romanBarrel(t, valley);
  float s = tileS(y, course, lip, b);
  return barrelH * b * nose(s, squash) * lipRoll(s) + stepRise(s, stepH) + 0.004 * valleySeam(t);
}

float profileHeight(float id, vec2 p) {
  float x = p.x + W * 0.5;
  // Bare timber battens: the roof frame before any sheet is laid.
  if (id > 7.5) {
    float b = fract((p.y + 60.0) / 0.6);
    return 0.03 * (smoothstep(0.78, 0.82, b) - smoothstep(0.96, 1.0, b));
  }
  float s = fract((p.y + 60.0) / COURSE);
  // Corrugated: plain sine, ~10 corrugations per sheet.
  if (id < 0.5) return 0.028 * sin(x / (W / 10.0) * 2.0 * PI);
  // Box profile IT-5: five trapezoid ribs, two small stiffeners in each pan.
  if (id < 1.5) {
    float t = fract(x / (W / 5.0));
    float stiff = exp(-pow((t - 0.1) / 0.018, 2.0)) + exp(-pow((t - 0.9) / 0.018, 2.0));
    return 0.082 * trapRib(t, 0.2, 0.065) + 0.006 * stiff;
  }
  // C-Wave: a flat, slightly dished pan beside a narrow roll; course ends trace a cupid's bow.
  if (id < 2.5) {
    float t = fract(x / (W / 5.5));
    float roll = romanBarrel(clamp((t - 0.55) / 0.45, 0.0, 1.0), 0.0);
    float pan = -0.15 * sin(PI * clamp(t / 0.55, 0.0, 1.0));
    float shape = roll + 0.35 * (1.0 + pan);
    float s2 = tileS(p.y, 0.52, 0.07, shape);
    return 0.05 * (roll + pan * 0.4) * nose(s2, 1.0) * lipRoll(s2) + stepRise(s2, 0.042);
  }
  // C-800: classic Roman, six round barrels with spoon-shaped ends.
  if (id < 3.5) return romanTile(x, p.y, W / 6.0, 0.12, 0.066, 0.62, 0.08, 0.045, 1.0);
  // C-840: a dozen fine round ribs with closely spaced steps; ribs notch the step edge.
  if (id < 4.5) {
    float t = fract(x / (W / 12.0));
    float rib = romanBarrel(t, 0.45);
    float s2 = tileS(p.y, 0.42, 0.03, rib);
    return 0.026 * rib * nose(s2, 0.8) + stepRise(s2, 0.04);
  }
  // C-868: deep Roman, ~4.5 large full barrels, each ending in a deep crescent.
  if (id < 5.5) return romanTile(x, p.y, W / 4.5, 0.16, 0.092, 0.74, 0.11, 0.05, 1.0);
  // Stone-coated panels: ~370 mm courses and a thick (~25 mm) butt, laid as a sawtooth.
  float row = floor((p.y + 60.0) / COURSE);
  float butt = 0.062 * s * (1.0 - smoothstep(0.95, 1.0, s));
  // Shake: offset blocks with deep grooves, each block sitting at its own slight height.
  if (id < 6.5) {
    float bx = x / (W / 6.0) + mod(row, 2.0) * 0.5;
    float edge = min(fract(bx), 1.0 - fract(bx));
    float groove = 0.022 * (1.0 - smoothstep(0.0, 0.07, edge));
    float lift = 0.01 * hash(vec2(floor(bx), row)) * s;
    return butt - groove + lift;
  }
  // Stone Roman: narrow barrels, short courses and strongly scalloped ends, as on the swatch board.
  float tb = fract(x / (W / 7.0));
  float sb = romanBarrel(tb, 0.2);
  float ss = tileS(p.y, 0.56, 0.1, sb);
  return 0.066 * sb * nose(ss, 0.7) * lipRoll(ss) + 0.055 * ss * (1.0 - smoothstep(0.95, 1.0, ss));
}

`

const HEADER = /* glsl */ `
uniform float uProfileA;
uniform float uProfileB;
uniform float uProfileMix;
uniform float uReveal;
uniform float uTime;
varying float vSheetY;
varying float vStone;
varying vec2 vLocal;

${PROFILE_GLSL}
float sheetHeight(vec2 p) {
  return mix(profileHeight(uProfileA, p), profileHeight(uProfileB, p), uProfileMix);
}

vec3 sheetDisplace(vec3 pos, out vec3 n) {
  const float e = 0.003;
  float h = sheetHeight(pos.xy);
  float dx = (sheetHeight(pos.xy + vec2(e, 0.0)) - h) / e;
  float dy = (sheetHeight(pos.xy + vec2(0.0, e)) - h) / e;
  n = normalize(vec3(-dx, -dy, 1.0));
  vSheetY = (pos.y / ${SHEET.length.toFixed(2)}) + 0.5;
  vStone = mix(step(5.5, uProfileA), step(5.5, uProfileB), uProfileMix);
  vLocal = pos.xy;
  return vec3(pos.xy, pos.z + h);
}
`

const FRAG_HEADER = /* glsl */ `
uniform float uReveal;
uniform float uScan;
uniform float uTime;
uniform vec3 uGlow;
varying float vSheetY;
varying float vStone;
varying vec2 vLocal;
float grainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float grainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = grainHash(i), b = grainHash(i + vec2(1.0, 0.0));
  float c = grainHash(i + vec2(0.0, 1.0)), d = grainHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`

// Stone chips: per-granule normal jitter and colour variation, only on stone-coated.
const FRAG_GRAIN_NORMAL = /* glsl */ `
if (vStone > 0.001) {
  vec2 q = vLocal * 85.0;
  vec2 j = vec2(grainNoise(q), grainNoise(q + 17.3)) - 0.5;
  vec2 k = vec2(grainHash(floor(vLocal * 190.0)), grainHash(floor(vLocal * 190.0) + 5.1)) - 0.5;
  normal = normalize(normal + vec3((j * 1.4 + k * 0.6) * vStone, 0.0));
}
`

const FRAG_GRAIN_COLOR = /* glsl */ `
if (vStone > 0.001) {
  float chip = grainHash(floor(vLocal * 85.0));
  float mottle = grainNoise(vLocal * 6.0);
  // Two-tone blend, darker chips, and the odd pale granule, as on real stone-coated tiles.
  vec3 stone = diffuseColor.rgb * mix(0.72, 1.15, mottle) * (1.0 - 0.3 * chip) + vec3(0.12) * step(0.97, chip);
  diffuseColor.rgb = mix(diffuseColor.rgb, stone, vStone);
}
`

// Roll-forming reveal: everything past the cut line is discarded and the cut
// line itself glows like a laser. The scan band sweeps along the sheet.
const FRAG_DISCARD = /* glsl */ `
if (vSheetY > uReveal) discard;
`

const FRAG_EMISSIVE = /* glsl */ `
float cut = smoothstep(0.022, 0.0, uReveal - vSheetY) * step(uReveal, 0.999);
float band = smoothstep(0.03, 0.0, abs(fract(vSheetY - uTime * 0.08) - 0.5)) * uScan;
// The scan band is neutral white so it reads as a light sweep on any paint colour.
totalEmissiveRadiance += uGlow * cut * 3.0 + vec3(band * 0.4);
`

// Granules are matte: no lacquer layer on stone-coated.
const FRAG_NO_COAT = /* glsl */ `
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - vStone;
#endif
`

/** Patch a three.js material so it renders the profiled sheet. */
export function patchSheetMaterial(material, uniforms, { lit }) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = HEADER + shader.vertexShader
    if (lit) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal; vec3 cmDisplaced = sheetDisplace(position, objectNormal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = cmDisplaced;')
    } else {
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 cmN; vec3 transformed = sheetDisplace(position, cmN);')
    }
    shader.fragmentShader = FRAG_HEADER + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_DISCARD)
    if (lit) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vStone * 0.2, 0.0, 1.0);')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_GRAIN_NORMAL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_GRAIN_COLOR)
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + FRAG_NO_COAT)
    }
  }
  // The lit and wireframe variants inject different code; keep their programs apart.
  material.customProgramCacheKey = () => (lit ? 'sheet-lit' : 'sheet-wire')
}
