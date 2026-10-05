"""Century Mabati website house: a realistic Kenyan stone bungalow with a compound hip roof.

Modelled on the homes Century has roofed (see public/img/home-*.jpg): machine-cut stone walls,
a projecting front wing whose hip roof meets the main roof in valleys, a recessed veranda with
round columns, steel casement windows with burglar bars and white plaster surrounds, deep white
fascia, gutters and downpipes, a stone chimney, a water tank on its stand, paving, lawn, shrubs
and trees. Textures (cut stone, plaster, paving, grass) are generated here with numpy, so the
Blender render and the website GLB share the same finishes.

Roof faces are exported as flat placeholders named "Roof_*": the website reads their corners and
drapes its animated roofing shader over them.

Live (MCP):  ns = {"__name__": "house"}; exec(open(PATH).read(), ns); ns["build_all"](export=True)
Headless:    Blender -b --python build_house.py

Blender Z-up, metres, ground at Z=0.

CONNECTION MAP
  lawn base top (Z=0.15)          <-> plinth bottom (Z=0.14)            overlap 0.010 on Z
  plinth top (Z=0.59)             <-> every wall block bottom (Z=0.58)  overlap 0.010 on Z
  front strip wall (Y -4.5..-2.45) <-> main wall block (Y from -2.5)    overlap 0.050 on Y
  wing wall (Y -8.5..-4.45)       <-> front strip wall (Y to -4.5)      overlap 0.050 on Y
  wall faces                      <-> glass, casement frames, plaster surrounds, door   embed 0.020
  burglar-bar rods                <-> sill top / lintel bottom          overlap 0.010 on Z
  veranda slab top (Z=0.74)       <-> column bases                      overlap 0.010 on Z
  column tops                     <-> veranda ceiling (Z=3.00)          overlap 0.010 on Z
  veranda ceiling                 <-> main block wall at Y=-2.5         overlap 0.050 on Y
  roof eave edges (Z=3.254)       <-> fascia board tops (Z=3.274)       fascia laps 0.020 above
  fascia outer face               <-> gutter back                        overlap 0.010 on the eave normal
  gutter bottom                   <-> downpipe top                       overlap 0.020 on Z
  wing ridge (Z=5.044)            <-> main front roof plane at Y=-2.0    ridge runs 0.4 m into the main roof
  chimney                         <-> back roof plane                    passes through; cap overlaps 0.020
  tank stand top                  <-> tank bottom                         overlap 0.010 on Z
  tree trunk top                  <-> canopy                              canopy centre 0.3 m below trunk top
"""

import math
import os
import random

import bmesh
import bpy
import mathutils
import numpy as np

HERE = "/Users/okwared/Softwares/Karanja/century-mabati"
GLB_PATH = os.path.join(HERE, "public", "models", "century-house.glb")
TEX_DIR = os.path.join(HERE, "blender", "out", "textures")
PREFIX = "House "  # object names are global across scenes; the board scene already has a 'Plinth'

PITCH = math.radians(30)
TAN = math.tan(PITCH)
OVERHANG = 0.6
BASE_TOP = 0.15
PLINTH_TOP = 0.59
WALL_TOP = 3.58                          # 3.6 m walls, as on Century's client homes: room for a proper veranda
ROOF_REF = 3.60                          # roof plane on the wall line, 2 cm above the wall top
EAVE_Z = ROOF_REF - OVERHANG * TAN       # 3.254

# Main block 14 x 9 m with a hip roof (ridge along X).
MAIN = dict(x0=-7.0, x1=7.0, y0=-4.5, y1=4.5)
M_EX, M_EY = 7.0 + OVERHANG, 4.5 + OVERHANG                 # eave half-extents 7.6 x 5.1
M_RIDGE_HX = M_EX - M_EY                                     # 2.5
M_RIDGE_Z = EAVE_Z + M_EY * TAN                              # 6.198
# Front wing 5 m wide, projecting 4 m forward on the left, own hip roof (ridge along Y).
WING = dict(x0=-6.5, x1=-1.5, y0=-8.5, y1=-4.5)
W_CX, W_HX = -4.0, 2.5 + OVERHANG                            # eave half-width 3.1
W_FRONT = -8.5 - OVERHANG                                    # -9.1
W_RIDGE_Z = EAVE_Z + W_HX * TAN                              # 5.044
W_RIDGE_Y0 = W_FRONT + W_HX                                  # -6.0 (45-degree hip)
W_MEET_Y = -M_EY + W_HX                                      # -2.0, where the wing ridge meets the main roof
# Veranda: recessed into the front-right of the main block.
PORCH = dict(x0=1.0, x1=7.0, y0=-4.5, y1=-2.5)
PORCH_CEIL = 3.00                        # top 3.06: under the fascia's inner face, below the roof plane
EMBED = 0.020

rng = random.Random(7)


def nm(name):
    return name if name.startswith(PREFIX) else PREFIX + name


# ---------------------------------------------------------------- geometry helpers (skill)


def _link(name, bm):
    mesh = bpy.data.meshes.new(nm(name))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(nm(name), mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_box(name, center, half):
    """Axis-aligned box from explicit vertices; half = true half-extents (same contract as size=2 cubes)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    for v in bm.verts:
        v.co = mathutils.Vector((center[0] + v.co.x * half[0], center[1] + v.co.y * half[1], center[2] + v.co.z * half[2]))
    return _link(name, bm)


def make_beam(name, start, end, hw=0.012, hh=0.010):
    """Skill Rule 2: beam from start to end built from explicit vertices — no rotations."""
    dx, dy, dz = end[0] - start[0], end[1] - start[1], end[2] - start[2]
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    if L < 1e-6:
        return None
    fx, fy, fz = dx / L, dy / L, dz / L
    ux, uy, uz = (0, 0, 1) if abs(fz) < 0.99 else (1, 0, 0)
    rx = fy * uz - fz * uy; ry = fz * ux - fx * uz; rz = fx * uy - fy * ux
    rL = math.sqrt(rx * rx + ry * ry + rz * rz); rx, ry, rz = rx / rL, ry / rL, rz / rL
    upx = ry * fz - rz * fy; upy = rz * fx - rx * fz; upz = rx * fy - ry * fx
    bm = bmesh.new()
    v = []
    for base in (start, end):
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v.append(bm.verts.new((base[0] + rx * hw * sx + upx * hh * sy,
                                   base[1] + ry * hw * sx + upy * hh * sy,
                                   base[2] + rz * hw * sx + upz * hh * sy)))
    for f in ((0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (0, 3, 2, 1), (4, 5, 6, 7)):
        bm.faces.new([v[i] for i in f])
    return _link(name, bm)


def make_cylinder(name, x, y, z0, z1, r, segments=24):
    """Vertical cylinder from explicit vertices (axis-aligned, so no rotation involved)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=z1 - z0)
    for v in bm.verts:
        v.co.x += x
        v.co.y += y
        v.co.z += (z0 + z1) / 2
    return _link(name, bm)


def make_face(name, points):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in points])
    bm.normal_update()
    return _link(name, bm)


def make_blob(name, center, radius, seed, squash=0.85):
    """Foliage: subdivided sphere with seeded lumps baked into the vertices (exports as-is)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=radius)
    r = random.Random(seed)
    lumps = [(mathutils.Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-0.3, 1))).normalized(), r.uniform(0.12, 0.25)) for _ in range(9)]
    for v in bm.verts:
        n = v.co.normalized()
        bump = sum(a * max(0.0, n.dot(d)) ** 3 for d, a in lumps) + r.uniform(-0.03, 0.03)
        v.co = n * radius * (1.0 + bump)
        v.co.z *= squash
        v.co += mathutils.Vector(center)
    return _link(name, bm)


def verify_bounds(name, quiet=False):
    obj = bpy.data.objects[nm(name)]
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    b = {"x": (min(v.x for v in vs), max(v.x for v in vs)),
         "y": (min(v.y for v in vs), max(v.y for v in vs)),
         "z": (min(v.z for v in vs), max(v.z for v in vs))}
    if not quiet:
        print(f"{nm(name)}: X[{b['x'][0]:.3f},{b['x'][1]:.3f}] Y[{b['y'][0]:.3f},{b['y'][1]:.3f}] Z[{b['z'][0]:.3f},{b['z'][1]:.3f}]")
    return b


def verify_overlap(name_a, name_b, axis="z", min_overlap=0.005, quiet=False):
    a = verify_bounds(name_a, quiet)
    b = verify_bounds(name_b, quiet)
    overlap = min(a[axis][1], b[axis][1]) - max(a[axis][0], b[axis][0])
    ok = overlap >= min_overlap
    if not quiet or not ok:
        print(f"  {nm(name_a)} <-> {nm(name_b)} [{axis.upper()}]: {'OK' if ok else 'GAP WARNING'} ({overlap:.4f}m)")
    return ok


def finalize(obj, smooth=False):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="MEDIAN")
    bpy.ops.object.shade_smooth()
    if not smooth and hasattr(bpy.ops.object, "shade_smooth_by_angle"):
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    bpy.ops.object.select_all(action="DESELECT")


def audit_all():
    meshes = sorted([o for o in bpy.context.scene.objects if o.type == "MESH"], key=lambda o: o.name)
    bad = [o.name for o in meshes if tuple(round(c, 3) for c in o.rotation_euler) != (0.0, 0.0, 0.0)
           or tuple(round(c, 3) for c in o.scale) != (1.0, 1.0, 1.0)]
    for name in bad:
        print(f"  [!!] {name}")
    print(f"audit: {len(meshes)} meshes, all transforms clean: {not bad}")
    return not bad


# ---------------------------------------------------------------- UVs: world-space box mapping


def box_uv(obj, tile):
    """Project UVs from world coordinates along each face's dominant axis; `tile` metres per texture repeat."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    mw = obj.matrix_world
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            w = mw @ loop.vert.co
            u, v = ((w.y, w.z) if ax == 0 else (w.x, w.z) if ax == 1 else (w.x, w.y))
            loop[uv].uv = (u / tile, v / tile)
    bm.to_mesh(me)
    bm.free()


# ---------------------------------------------------------------- generated textures (numpy, tileable)


def _grid(size, area):
    c = (np.arange(size) + 0.5) * (area / size)
    return np.meshgrid(c, c)


def _smooth(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _waves(X, Y, area, seed, n=6, amp=1.0):
    """Tileable low-frequency blotches: sum of integer-frequency waves over the tile."""
    r = np.random.default_rng(seed)
    out = np.zeros_like(X)
    for _ in range(n):
        kx, ky = r.integers(1, 5, size=2)
        out += np.sin(2 * np.pi * (kx * X + ky * Y) / area + r.uniform(0, 6.28))
    return out * amp / n


def blocks_texture(size, area, bw, bh, joint, base, spread, mortar_rgb, seed, speckle=0.05):
    """Running-bond blocks (cut stone, pavers): colour + height. Tileable when area is a multiple of bw, bh."""
    r = np.random.default_rng(seed)
    X, Y = _grid(size, area)
    row = np.floor(Y / bh).astype(int)
    xo = X + (row % 2) * (bw / 2)
    col = np.floor(xo / bw).astype(int) % int(round(area / bw))
    u, v = np.mod(xo, bw), np.mod(Y, bh)
    d = np.minimum(np.minimum(u, bw - u), np.minimum(v, bh - v))
    nblocks = int(round(area / bw)) * int(round(area / bh)) + 8
    tint = r.uniform(1 - spread, 1 + spread, size=(nblocks, 1)) * r.uniform(0.97, 1.03, size=(nblocks, 3))
    bid = (row * int(round(area / bw)) + col) % nblocks
    rgb = np.array(base)[None, None, :] * tint[bid]
    rgb *= (1.0 + r.normal(0, 0.035, size=X.shape))[..., None]
    specks = r.random(X.shape) < speckle
    rgb[specks] *= 0.78
    rgb *= (0.86 + 0.14 * _smooth(joint * 0.5, joint * 2.0, d))[..., None]
    mortar = d < joint * 0.5
    m_rgb = np.array(mortar_rgb)[None, None, :] * (1.0 + r.normal(0, 0.04, size=X.shape))[..., None]
    rgb = np.where(mortar[..., None], m_rgb, rgb)
    height = _smooth(joint * 0.3, joint * 1.2, d) + r.normal(0, 0.04, size=X.shape)
    return np.clip(rgb, 0, 1), height


def plaster_texture(size, area, base, seed):
    r = np.random.default_rng(seed)
    X, Y = _grid(size, area)
    shade = 1.0 + 0.04 * _waves(X, Y, area, seed) + r.normal(0, 0.018, size=X.shape)
    return np.clip(np.array(base)[None, None, :] * shade[..., None], 0, 1), r.normal(0, 0.3, size=X.shape)


def grass_texture(size, area, seed):
    r = np.random.default_rng(seed)
    X, Y = _grid(size, area)
    patch = _waves(X, Y, area, seed, n=8)
    dry = _smooth(0.35, 0.9, patch)
    green = np.array([0.30, 0.46, 0.19])
    straw = np.array([0.52, 0.52, 0.28])
    rgb = green[None, None, :] * (1 - dry[..., None]) + straw[None, None, :] * dry[..., None]
    rgb *= (1.0 + r.normal(0, 0.12, size=X.shape))[..., None]
    return np.clip(rgb, 0, 1), r.normal(0, 0.5, size=X.shape)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength
    n = np.dstack((-dx, -dy, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def save_image(name, rgb, non_color=False):
    os.makedirs(TEX_DIR, exist_ok=True)
    h, w, _ = rgb.shape
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, w, h, alpha=False)
    rgba = np.dstack((rgb, np.ones((h, w))))
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.file_format = "JPEG"
    img.filepath_raw = os.path.join(TEX_DIR, f"{name}.jpg")
    img.save()
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def make_textures():
    """Generate every tileable texture once; returns {name: (color image, normal image or None, tile metres)}."""
    out = {}
    stone, sh = blocks_texture(1024, 1.6, 0.4, 0.2, 0.012, (0.66, 0.61, 0.52), 0.12, (0.80, 0.78, 0.72), 11)
    out["stone"] = (save_image("cm_stone", stone), save_image("cm_stone_n", normal_from_height(sh, 2.5), True), 1.6)
    dark, dh = blocks_texture(512, 1.0, 0.5, 0.25, 0.014, (0.44, 0.42, 0.39), 0.10, (0.62, 0.60, 0.56), 12)
    out["plinth"] = (save_image("cm_plinth", dark), save_image("cm_plinth_n", normal_from_height(dh, 2.0), True), 1.0)
    plaster, _ = plaster_texture(512, 2.0, (0.94, 0.91, 0.84), 13)
    out["plaster"] = (save_image("cm_plaster", plaster), None, 2.0)
    pave, ph = blocks_texture(512, 1.2, 0.2, 0.1, 0.006, (0.58, 0.56, 0.53), 0.14, (0.40, 0.39, 0.37), 14, speckle=0.03)
    out["paving"] = (save_image("cm_paving", pave), save_image("cm_paving_n", normal_from_height(ph, 1.6), True), 1.2)
    grass, _ = grass_texture(512, 2.0, 15)
    out["grass"] = (save_image("cm_grass", grass), None, 2.0)
    return out


# ---------------------------------------------------------------- materials


def srgb(hex_color):
    def c(v):
        v = int(v, 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    h = hex_color.lstrip("#")
    return (c(h[0:2]), c(h[2:4]), c(h[4:6]), 1.0)


def _bsdf(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def flat_material(name, hex_color, rough=0.6, metal=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = _bsdf(mat)
    b.inputs["Base Color"].default_value = srgb(hex_color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return mat


def textured_material(name, tex, rough=0.85, normal_strength=1.0):
    color_img, normal_img, _ = tex
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = _bsdf(mat)
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = color_img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if normal_img:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = normal_img
        nm_node = nt.nodes.new("ShaderNodeNormalMap")
        nm_node.inputs["Strength"].default_value = normal_strength
        nt.links.new(tn.outputs["Color"], nm_node.inputs["Color"])
        nt.links.new(nm_node.outputs["Normal"], b.inputs["Normal"])
    return mat


def assign(obj, mat, tile=None):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if tile:
        box_uv(obj, tile)
    return obj


class Mats:
    """All materials for the house, created once per build."""

    def __init__(self, tex):
        self.tex = tex
        self.stone = textured_material("Cut stone", tex["stone"], rough=0.88, normal_strength=1.0)
        self.plinth = textured_material("Plinth stone", tex["plinth"], rough=0.9, normal_strength=1.0)
        self.plaster = textured_material("Plaster", tex["plaster"], rough=0.8)
        self.paving = textured_material("Paving", tex["paving"], rough=0.85, normal_strength=0.8)
        self.grass = textured_material("Lawn", tex["grass"], rough=0.95)
        self.white = flat_material("White paint", "#f3f3f0", rough=0.45)
        self.glass = flat_material("Window glass", "#1d2833", rough=0.04)
        self.steel = flat_material("Burglar bars", "#2a2d31", rough=0.4, metal=0.7)
        self.door = flat_material("Door timber", "#5b3a22", rough=0.5)
        self.concrete = flat_material("Concrete", "#b9b6ae", rough=0.85)
        self.soil = flat_material("Soil edge", "#5a4634", rough=0.95)
        self.tank = flat_material("Water tank", "#1f2124", rough=0.35)
        self.leaf = flat_material("Foliage", "#3d6b33", rough=0.85)
        self.leaf_dark = flat_material("Foliage dark", "#2f5529", rough=0.85)
        self.bark = flat_material("Bark", "#5a4632", rough=0.9)
        self.roof_proxy = flat_material("Roof placeholder", "#6b1e26", rough=0.5, metal=0.3)
        self.cap = flat_material("Roof cap", "#6b1e26", rough=0.45, metal=0.35)


# ---------------------------------------------------------------- build steps


def new_scene():
    scene = bpy.data.scenes.get("Century House")
    if scene:
        for obj in list(scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        scene = bpy.data.scenes.new("Century House")
    bpy.context.window.scene = scene
    scene.unit_settings.system = "METRIC"
    world = bpy.data.worlds.get("House sky") or bpy.data.worlds.new("House sky")
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    sky = next((n for n in nt.nodes if n.type == "TEX_SKY"), None) or nt.nodes.new("ShaderNodeTexSky")
    for attr, value in (("sun_elevation", math.radians(38)), ("sun_rotation", math.radians(215))):
        if hasattr(sky, attr):
            setattr(sky, attr, value)
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.35
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("House sun", "SUN"))
    sun.data.energy = 4.0
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = (math.radians(52), 0.0, math.radians(-35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("House camera"))
    cam.data.lens = 38
    cam.location = (19.0, -27.0, 13.0)
    cam.rotation_euler = (mathutils.Vector((0, -1.5, 2.4)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    print("scene 'Century House' ready")
    return scene


def build_grounds(m):
    """Lawn disc with a soil edge, the stone plinth band, a paved path to the veranda steps."""
    base = assign(make_cylinder("Lawn", 0, 0, 0.0, BASE_TOP, 12.5, segments=128), m.grass, m.tex["grass"][2])
    rim = assign(make_cylinder("Soil rim", 0, 0, -0.02, BASE_TOP - 0.02, 12.65, segments=128), m.soil)
    verify_overlap("Lawn", "Soil rim", "z", 0.005)
    pb = BASE_TOP - 0.010
    for name, b in (("Plinth main", MAIN), ("Plinth wing", WING)):
        assign(make_box(name, ((b["x0"] + b["x1"]) / 2, (b["y0"] + b["y1"]) / 2, (pb + PLINTH_TOP) / 2),
                        ((b["x1"] - b["x0"]) / 2 + 0.15, (b["y1"] - b["y0"]) / 2 + 0.15, (PLINTH_TOP - pb) / 2)), m.plinth, m.tex["plinth"][2])
        verify_overlap("Lawn", name, "z", 0.005)
    # Path from the veranda steps to the lawn edge.
    path = assign(make_box("Path", (4.0, -8.1, BASE_TOP + 0.01), (1.3, 2.75, 0.02)), m.paving, m.tex["paving"][2])
    verify_overlap("Lawn", "Path", "z", 0.005)


def build_walls(m):
    wb = PLINTH_TOP - 0.010
    zc, hz = (wb + WALL_TOP) / 2, (WALL_TOP - wb) / 2
    # Main block behind the veranda line, the front strip left of the veranda, and the wing.
    assign(make_box("Wall main", (0.0, (-2.5 + 4.5) / 2, zc), (7.0, 3.5, hz)), m.stone, m.tex["stone"][2])
    assign(make_box("Wall front", ((-7.0 + 1.0) / 2, (-4.5 - 2.45) / 2, zc), (4.0, (4.5 - 2.45) / 2, hz)), m.stone, m.tex["stone"][2])
    assign(make_box("Wall wing", (W_CX, (-8.5 - 4.45) / 2, zc), (2.5, (8.5 - 4.45) / 2, hz)), m.stone, m.tex["stone"][2])
    verify_overlap("Plinth main", "Wall main", "z", 0.005)
    verify_overlap("Plinth wing", "Wall wing", "z", 0.005)
    verify_overlap("Wall front", "Wall main", "y", 0.04)
    verify_overlap("Wall wing", "Wall front", "y", 0.04)


def _place(face, along, out, z):
    axis, sign, coord = face
    d = coord + sign * out
    return (along, d, z) if axis == "y" else (d, along, z)


def _half(face, ha, hd, hz):
    return (ha, hd, hz) if face[0] == "y" else (hd, ha, hz)


def window(m, name, face, wall, along, z0, z1, width, bars=True):
    """Steel casement window: glass, white grid frame, plaster surround (sill, lintel, jambs), burglar bars."""
    zc, hz = (z0 + z1) / 2, (z1 - z0) / 2
    parts = []
    def box(tag, a, out, z, ha, hd, hzz, mat, tile=None):
        o = assign(make_box(f"{name} {tag}", _place(face, a, out, z), _half(face, ha, hd, hzz)), mat, tile)
        parts.append(o.name)
        return o
    box("glass", along, 0.0, zc, width / 2, 0.02, hz, m.glass)
    # Casement grid: outer frame, vertical mullions every ~0.4 m, two transoms.
    t = 0.025
    box("frame top", along, 0.012, z1 - t, width / 2, 0.032, t, m.white)
    box("frame bottom", along, 0.012, z0 + t, width / 2, 0.032, t, m.white)
    box("frame left", along - width / 2 + t, 0.012, zc, t, 0.032, hz, m.white)
    box("frame right", along + width / 2 - t, 0.012, zc, t, 0.032, hz, m.white)
    cols = max(2, round(width / 0.4))
    for i in range(1, cols):
        box(f"mullion {i}", along - width / 2 + i * width / cols, 0.012, zc, 0.012, 0.03, hz, m.white)
    for j in (1, 2):
        box(f"transom {j}", along, 0.012, z0 + j * (z1 - z0) / 3, width / 2, 0.03, 0.012, m.white)
    # Plaster surround: sill and lintel project 80-100 mm, jambs 60 mm.
    sill = box("sill", along, 0.03, z0 - 0.04, width / 2 + 0.12, 0.05, 0.04, m.plaster, m.tex["plaster"][2])
    lintel = box("lintel", along, 0.025, z1 + 0.07, width / 2 + 0.12, 0.045, 0.07, m.plaster, m.tex["plaster"][2])
    box("jamb left", along - width / 2 - 0.06, 0.02, zc, 0.06, 0.04, hz, m.plaster, m.tex["plaster"][2])
    box("jamb right", along + width / 2 + 0.06, 0.02, zc, 0.06, 0.04, hz, m.plaster, m.tex["plaster"][2])
    ok = all(verify_overlap(wall, p, face[0], 0.015, quiet=True) for p in parts)
    if bars:
        n = max(3, int(width / 0.13))
        for i in range(1, n):
            a = along - width / 2 + i * width / n
            rod = box(f"bar {i}", a, 0.06, zc, 0.007, 0.007, hz + 0.01, m.steel)
            ok &= verify_overlap(sill.name, rod.name, "z", 0.005, quiet=True)
            ok &= verify_overlap(lintel.name, rod.name, "z", 0.005, quiet=True)
        box("bar rail", along, 0.06, zc, width / 2, 0.007, 0.007, m.steel)
    return ok


def door(m, name, face, wall, along, width=1.0, height=2.2):
    z0 = PLINTH_TOP + 0.15
    zc, hz = z0 + height / 2, height / 2
    parts = [assign(make_box(f"{name} leaf", _place(face, along, 0.0, zc), _half(face, width / 2, 0.025, hz)), m.door).name]
    for tag, a, z, ha, hzz in (("head", along, z0 + height + 0.06, width / 2 + 0.1, 0.06),
                               ("jamb L", along - width / 2 - 0.05, zc, 0.05, hz),
                               ("jamb R", along + width / 2 + 0.05, zc, 0.05, hz)):
        parts.append(assign(make_box(f"{name} {tag}", _place(face, a, 0.025, z), _half(face, ha, 0.045, hzz)), m.plaster, m.tex["plaster"][2]).name)
    return all(verify_overlap(wall, p, face[0], 0.015, quiet=True) for p in parts)


def build_openings(m):
    F = lambda axis, sign, coord: (axis, sign, coord)
    results = [
        window(m, "Wing front window", F("y", -1, -8.5), "Wall wing", W_CX, 1.0, 2.5, 2.2),
        window(m, "Wing left window", F("x", -1, -6.5), "Wall wing", -6.8, 1.1, 2.4, 1.4),
        window(m, "Wing right window", F("x", 1, -1.5), "Wall wing", -6.8, 1.1, 2.4, 1.4),
        window(m, "Front window", F("y", -1, -4.5), "Wall front", -0.25, 1.1, 2.4, 1.3),
        window(m, "Veranda window L", F("y", -1, -2.5), "Wall main", 2.2, 1.1, 2.4, 1.4),
        window(m, "Veranda window R", F("y", -1, -2.5), "Wall main", 5.9, 1.1, 2.4, 1.4),
        window(m, "Right window 1", F("x", 1, 7.0), "Wall main", -0.8, 1.1, 2.4, 1.4),
        window(m, "Right window 2", F("x", 1, 7.0), "Wall main", 2.6, 1.1, 2.4, 1.4),
        window(m, "Left window 1", F("x", -1, -7.0), "Wall main", 0.2, 1.1, 2.4, 1.4),
        window(m, "Left window 2", F("x", -1, -7.0), "Wall main", 2.9, 1.1, 2.4, 1.4),
        window(m, "Back window 1", F("y", 1, 4.5), "Wall main", -4.6, 1.1, 2.4, 1.6),
        window(m, "Back window 2", F("y", 1, 4.5), "Wall main", -1.4, 1.1, 2.4, 1.6),
        window(m, "Back window 3", F("y", 1, 4.5), "Wall main", 1.8, 1.7, 2.4, 0.8),
        window(m, "Back window 4", F("y", 1, 4.5), "Wall main", 4.8, 1.1, 2.4, 1.6),
        door(m, "Front door", F("y", -1, -2.5), "Wall main", 4.05),
        door(m, "Back door", F("y", 1, 4.5), "Wall main", 3.3, width=0.9),
    ]
    print(f"openings: {sum(results)}/{len(results)} fully seated (glass, frames, surrounds, bars)")


def build_veranda(m):
    """Paved slab with two steps, three round columns with bases and capitals, plastered ceiling."""
    slab_top = PLINTH_TOP + 0.15
    px0, px1, py0 = PORCH["x0"], PORCH["x1"] + 0.3, -M_EY + 0.1
    slab = assign(make_box("Veranda slab", ((px0 + px1) / 2, (py0 - 2.45) / 2, (BASE_TOP + slab_top) / 2 - 0.005),
                           ((px1 - px0) / 2, (-2.45 - py0) / 2, (slab_top - BASE_TOP) / 2 + 0.005)), m.paving, m.tex["paving"][2])
    for i, (dz, dy) in enumerate(((0.2, 0.35), (0.4, 0.70))):
        assign(make_box(f"Step {i + 1}", (4.05, py0 - dy / 2 + 0.01, BASE_TOP + (slab_top - BASE_TOP - dz) / 2 + 0.005),
                        (1.4, dy / 2, (slab_top - BASE_TOP - dz) / 2 + 0.005)), m.paving, m.tex["paving"][2])
    ceiling = assign(make_box("Veranda ceiling", ((px0 + M_EX) / 2, (-M_EY - 2.45) / 2, PORCH_CEIL + 0.03),
                              ((M_EX - px0) / 2, (-2.45 + M_EY) / 2, 0.03)), m.plaster, m.tex["plaster"][2])
    verify_overlap("Veranda ceiling", "Wall main", "y", 0.04)
    ok = True
    for i, x in enumerate((1.5, 4.05, 6.6)):
        cy = -M_EY + 0.45
        base = assign(make_box(f"Column {i + 1} base", (x, cy, slab_top + 0.09), (0.24, 0.24, 0.1)), m.plaster)
        shaft = assign(make_cylinder(f"Column {i + 1}", x, cy, slab_top + 0.17, PORCH_CEIL - 0.13, 0.15), m.white)
        cap = assign(make_box(f"Column {i + 1} capital", (x, cy, PORCH_CEIL - 0.07), (0.22, 0.22, 0.08)), m.plaster)
        ok &= verify_overlap("Veranda slab", base.name, "z", 0.005, quiet=True)
        ok &= verify_overlap(base.name, shaft.name, "z", 0.005, quiet=True)
        ok &= verify_overlap(shaft.name, cap.name, "z", 0.005, quiet=True)
        ok &= verify_overlap(cap.name, "Veranda ceiling", "z", 0.005, quiet=True)
    print(f"veranda: slab, 2 steps, 3 columns, ceiling — joints {'OK' if ok else 'GAP WARNING'}")


def roof_faces():
    ez = EAVE_Z
    mx, my, mr, mz = M_EX, M_EY, M_RIDGE_HX, M_RIDGE_Z
    wl, wr, wf, wz = W_CX - W_HX, W_CX + W_HX, W_FRONT, W_RIDGE_Z
    wy_back = -M_EY + 0.2  # wing eaves run 0.2 m under the main roof so the valley closes
    return {
        "Roof_Main_Front": [(-mx, -my, ez), (mx, -my, ez), (mr, 0, mz), (-mr, 0, mz)],
        "Roof_Main_Back": [(mx, my, ez), (-mx, my, ez), (-mr, 0, mz), (mr, 0, mz)],
        "Roof_Main_Left": [(-mx, my, ez), (-mx, -my, ez), (-mr, 0, mz)],
        "Roof_Main_Right": [(mx, -my, ez), (mx, my, ez), (mr, 0, mz)],
        "Roof_Wing_Front": [(wl, wf, ez), (wr, wf, ez), (W_CX, W_RIDGE_Y0, wz)],
        "Roof_Wing_Left": [(wl, wy_back, ez), (wl, wf, ez), (W_CX, W_RIDGE_Y0, wz), (W_CX, W_MEET_Y + 0.4, wz)],
        "Roof_Wing_Right": [(wr, wf, ez), (wr, wy_back, ez), (W_CX, W_MEET_Y + 0.4, wz), (W_CX, W_RIDGE_Y0, wz)],
    }


def build_roof(m):
    for name, pts in roof_faces().items():
        assign(make_face(name, pts), m.roof_proxy)
    ez, ft = EAVE_Z, EAVE_Z + 0.02
    fz = ft - 0.13
    mx, my = M_EX, M_EY
    wl, wr, wf = W_CX - W_HX, W_CX + W_HX, W_FRONT
    e = 0.02
    # Fascia segments (the main front eave is interrupted by the wing).
    fascia = {
        "Fascia main back": ((-mx - e, my, fz), (mx + e, my, fz), (0, 1)),
        "Fascia main left": ((-mx, -my - e, fz), (-mx, my + e, fz), (-1, 0)),
        "Fascia main right": ((mx, -my - e, fz), (mx, my + e, fz), (1, 0)),
        "Fascia main front R": ((wr, -my, fz), (mx + e, -my, fz), (0, -1)),
        "Fascia main front L": ((-mx - e, -my, fz), (wl, -my, fz), (0, -1)),
        "Fascia wing front": ((wl - e, wf, fz), (wr + e, wf, fz), (0, -1)),
        "Fascia wing left": ((wl, wf - e, fz), (wl, -my, fz), (-1, 0)),
        "Fascia wing right": ((wr, wf - e, fz), (wr, -my, fz), (1, 0)),
    }
    gutter_names = []
    for name, (a, b, (ox, oy)) in fascia.items():
        assign(make_beam(name, a, b, hw=0.025, hh=0.13), m.white)
        g = 0.025 + 0.06 - 0.01  # gutter back laps 10 mm into the fascia face
        ga = (a[0] + ox * g, a[1] + oy * g, ft - 0.06)
        gb = (b[0] + ox * g, b[1] + oy * g, ft - 0.06)
        gname = name.replace("Fascia", "Gutter")
        assign(make_beam(gname, ga, gb, hw=0.06, hh=0.05), m.white)
        gutter_names.append((gname, "x" if ox else "y", name))
    ok = all(verify_overlap(f, g, ax, 0.005, quiet=True) for g, ax, f in gutter_names)
    ok &= verify_overlap("Roof_Main_Front", "Fascia main front R", "z", 0.015, quiet=True)
    print(f"fascia + gutters: {len(fascia)} runs, joints {'OK' if ok else 'GAP WARNING'}")
    # Downpipes from the gutters to the plinth at the outer corners.
    for i, (x, y) in enumerate(((mx + 0.085, -my + 0.3), (mx + 0.085, my - 0.3), (-mx - 0.085, my - 0.3), (wl - 0.085, wf + 0.3), (wr + 0.085, wf + 0.3))):
        assign(make_cylinder(f"Downpipe {i + 1}", x, y, PLINTH_TOP - 0.05, ft - 0.09, 0.045, 16), m.white)
    # Ridge, hip and valley caps.
    lift = 0.05
    mr, mz, wz = M_RIDGE_HX, M_RIDGE_Z, W_RIDGE_Z
    caps = {
        "Cap main ridge": ((-mr - 0.05, 0, mz + lift), (mr + 0.05, 0, mz + lift)),
        "Cap wing ridge": ((W_CX, W_RIDGE_Y0 - 0.05, wz + lift), (W_CX, W_MEET_Y + 0.4, wz + lift)),
        "Cap wing hip L": ((wl, wf, ez + lift), (W_CX, W_RIDGE_Y0, wz + lift)),
        "Cap wing hip R": ((wr, wf, ez + lift), (W_CX, W_RIDGE_Y0, wz + lift)),
        "Cap valley L": ((wl, -my, ez + lift * 0.6), (W_CX, W_MEET_Y, wz + lift * 0.6)),
        "Cap valley R": ((wr, -my, ez + lift * 0.6), (W_CX, W_MEET_Y, wz + lift * 0.6)),
    }
    for sx in (-1, 1):
        for sy in (-1, 1):
            if sx < 0 and sy < 0:
                caps["Cap main hip LF"] = ((-mx, -my, ez + lift), (-mr, 0, mz + lift))
            else:
                caps[f"Cap main hip {'L' if sx < 0 else 'R'}{'F' if sy < 0 else 'B'}"] = ((sx * mx, sy * my, ez + lift), (sx * mr, 0, mz + lift))
    for name, (a, b) in caps.items():
        assign(make_beam(name, a, b, hw=0.15, hh=0.065), m.cap)
    print(f"caps: {len(caps)} (ridges, hips, valleys)")


def build_extras(m):
    """Stone chimney, water tank on its stand, shrubs along the front, two trees."""
    chim = assign(make_box("Chimney", (4.6, 2.4, 5.2), (0.5, 0.4, 1.9)), m.stone, m.tex["stone"][2])
    cap = assign(make_box("Chimney cap", (4.6, 2.4, 7.12), (0.62, 0.52, 0.05)), m.concrete)
    verify_overlap("Chimney", "Chimney cap", "z", 0.005)
    stand = assign(make_box("Tank stand", (8.6, 2.4, BASE_TOP + 0.3), (0.85, 0.85, 0.31)), m.concrete)
    tank = assign(make_cylinder("Water tank", 8.6, 2.4, BASE_TOP + 0.6, BASE_TOP + 2.2, 0.72, 40), m.tank)
    assign(make_cylinder("Water tank lid", 8.6, 2.4, BASE_TOP + 2.18, BASE_TOP + 2.28, 0.25, 24), m.tank)
    verify_overlap("Lawn", "Tank stand", "z", 0.005)
    verify_overlap("Tank stand", "Water tank", "z", 0.005)
    for i, (x, y, r) in enumerate(((-7.6, -9.6, 0.55), (-0.4, -9.6, 0.5), (0.2, -5.4, 0.45), (-7.9, -2.0, 0.5), (7.9, -5.5, 0.55), (-8.0, 1.6, 0.6))):
        assign(make_blob(f"Shrub {i + 1}", (x, y, BASE_TOP + r * 0.65), r, seed=20 + i), m.leaf_dark if i % 2 else m.leaf)
    for i, (x, y, h, r) in enumerate(((-9.6, 6.2, 4.2, 1.9), (9.3, -7.6, 3.4, 1.5))):
        trunk = assign(make_cylinder(f"Tree {i + 1} trunk", x, y, BASE_TOP - 0.02, BASE_TOP + h, 0.14, 12), m.bark)
        for j, (dx, dy, dz, s) in enumerate(((0, 0, 0, 1.0), (0.8, 0.4, -0.5, 0.7), (-0.7, -0.5, -0.4, 0.75))):
            blob = assign(make_blob(f"Tree {i + 1} canopy {j + 1}", (x + dx, y + dy, BASE_TOP + h - 0.3 + dz + r * 0.4), r * s, seed=40 + i * 5 + j), m.leaf)
            verify_overlap(trunk.name, blob.name, "z", 0.05, quiet=True)
    print("extras: chimney, water tank on stand, 6 shrubs, 2 trees")


def merge_by_material():
    """Join parts that share a material (fewer draw calls on the website); roof placeholders stay separate."""
    groups = {}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or "Roof_" in obj.name:
            continue
        mat = obj.data.materials[0].name if obj.data.materials else "none"
        groups.setdefault(mat, []).append(obj)
    for mat, objs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        merged = bpy.context.view_layer.objects.active
        # Caps must not contain "Roof_": the website treats that as a roof placeholder.
        merged.name = nm("Ridge and hip caps" if mat == "Roof cap" else mat)
        merged.data.name = merged.name
    print(f"merged into {len(groups)} meshes by material")


def finish(export=True):
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        finalize(obj, smooth=any(k in obj.name for k in ("Foliage", "Shrub", "Tree", "canopy")))
    merge_by_material()
    ok = audit_all()
    tris = sum(len(p.vertices) - 2 for o in bpy.context.scene.objects if o.type == "MESH" for p in o.data.polygons)
    print(f"triangles: {tris}")
    if export:
        export_glb()
    return ok


def export_glb():
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    kwargs = dict(filepath=GLB_PATH, export_format="GLB", use_selection=True, export_apply=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    if "export_image_format" in props:
        kwargs["export_image_format"] = "JPEG"
    if "export_jpeg_quality" in props:
        kwargs["export_jpeg_quality"] = 82
    bpy.ops.export_scene.gltf(**kwargs)
    print(f"exported {GLB_PATH} ({os.path.getsize(GLB_PATH) / 1024:.0f} KB)")


def build_all(export=False):
    new_scene()
    m = Mats(make_textures())
    build_grounds(m)
    build_walls(m)
    build_openings(m)
    build_veranda(m)
    build_roof(m)
    build_extras(m)
    return finish(export)


if __name__ == "__main__":
    build_all(export=True)
