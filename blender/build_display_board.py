"""Century Mabati sample board: all eight profiles on a sloped timber display, built step by step.

Follows the blender-assembly skill: connection map first, size=2 cubes, explicit-vertex beams
and panels for every sloped part (no Euler-rotated primitives), spanning parts sized from
verified neighbour bounds, verify_* after each part, finalize() + audit_all() at the end.

Live (MCP / socket):  ns = {"__name__": "board"}; exec(open(PATH).read(), ns); ns["setup_scene"]() ...
Headless:             Blender -b --python build_display_board.py -- --out DIR

CONNECTION MAP (metres; THETA = board slope; n = board face normal)
  board_front_edge underside      <-> plinth_top (Z=0.45)          overlap 0.010 on Z
  back_support_bottom             <-> plinth_top (Z=0.45)          overlap 0.010 on Z
  back_support_top                <-> board_back underside         overlap 0.010 on Z  (height from bounds)
  plinth front/back               <-> board footprint on Y         plinth spans board Y extent + 0.05 margin
  each sheet underside            <-> board_top_surface (along n)  contact 0.000 (rests, never floats; thin shell, so no embed)
  dividers, bottom rail, label band underside <-> board_top_surface embed 0.005
  label text underside            <-> label_band top (along n)     embed 0.001
"""

import math
import os
import sys

import bmesh
import bpy
import mathutils

HERE = "/Users/okwared/Softwares/Karanja/century-mabati/blender"
_profiles = {"__name__": "century_profiles"}
exec(open(os.path.join(HERE, "build_profiles.py")).read(), _profiles)
PROFILES = _profiles["PROFILES"]
build_mesh = _profiles["build_mesh"]
painted_material = _profiles["painted_material"]
stone_material = _profiles["stone_material"]
srgb_to_linear = _profiles["srgb_to_linear"]

ORDER = ["c868", "cwave", "c800", "c840", "corrugated", "it5", "stone_roman", "stone_shake"]
LABELS = {"c868": "C-868", "cwave": "C-WAVE", "c800": "C-800", "c840": "C-840", "corrugated": "CORRUGATED",
          "it5": "BOX PROFILE IT-5", "stone_roman": "STONE ROMAN", "stone_shake": "STONE SHAKE"}
THETA = math.radians(28)   # board slope from horizontal
SLOPE_LEN = 1.42           # deck length along the slope
DIVIDER_W = 0.06           # timber divider width
PLINTH_TOP = 0.45
DECK_HALF_T = 0.025        # 50 mm deck
TRIM_HALF_T = 0.022
BAND_HALF_S = 0.07         # label band half-depth along the slope
EMBED_SHEET = 0.0        # sheets touch the deck: a 0.6 mm shell sunk deeper lets timber poke through
EMBED_TRIM = 0.005

X_AXIS = (1.0, 0.0, 0.0)
U_SLOPE = (0.0, math.cos(THETA), math.sin(THETA))     # up the slope
U_NORMAL = (0.0, -math.sin(THETA), math.cos(THETA))   # out of the board face


def add(a, b, k=1.0):
    return (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def total_width():
    return sum(PROFILES[k]["width"] / 1000 for k in ORDER) + DIVIDER_W * (len(ORDER) + 1)


# ---------------------------------------------------------------- skill helpers


def _link(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _box_from_axes(name, center, axes, halves):
    """Box from explicit orthonormal axes and half-extents — vertices placed directly, no rotation."""
    (a, b, c), (ha, hb, hc) = axes, halves
    bm = bmesh.new()
    verts = []
    for sc in (-1, 1):
        for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = add(add(add(center, a, ha * sa), b, hb * sb), c, hc * sc)
            verts.append(bm.verts.new(p))
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([verts[i] for i in f])
    return _link(name, bm)


def make_beam(name, start, end, hw=0.012, hh=0.010):
    """Skill Rule 2: rectangular beam from start to end; width horizontal, height on the up vector."""
    d = (end[0] - start[0], end[1] - start[1], end[2] - start[2])
    L = math.sqrt(dot(d, d))
    if L < 1e-6:
        return None
    f = (d[0] / L, d[1] / L, d[2] / L)
    u = (0, 0, 1) if abs(f[2]) < 0.99 else (1, 0, 0)
    r = (f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0])
    rl = math.sqrt(dot(r, r))
    r = (r[0] / rl, r[1] / rl, r[2] / rl)
    up = (r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0])
    mid = add(start, d, 0.5)
    return _box_from_axes(name, mid, (r, up, f), (hw, hh, L / 2))


def make_board_panel(name, center, hx, hs, hn):
    """Panel lying on the board plane: axes X, up-slope, normal."""
    return _box_from_axes(name, center, (X_AXIS, U_SLOPE, U_NORMAL), (hx, hs, hn))


def add_box(name, center, half):
    """Skill Rule 1 + 3: size=2 cube so scale == half-extent; transform applied immediately."""
    bpy.ops.mesh.primitive_cube_add(size=2, location=center)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = half
    bpy.ops.object.transform_apply(scale=True)
    return obj


def verify_bounds(name):
    obj = bpy.data.objects[name]
    vs = [obj.matrix_world @ v.co for v in obj.data.vertices]
    b = {"x": (min(v.x for v in vs), max(v.x for v in vs)),
         "y": (min(v.y for v in vs), max(v.y for v in vs)),
         "z": (min(v.z for v in vs), max(v.z for v in vs))}
    print(f"{name}: X[{b['x'][0]:.4f},{b['x'][1]:.4f}] Y[{b['y'][0]:.4f},{b['y'][1]:.4f}] Z[{b['z'][0]:.4f},{b['z'][1]:.4f}]")
    return b


def verify_overlap(name_a, name_b, axis="z", min_overlap=0.005):
    a = verify_bounds(name_a)
    b = verify_bounds(name_b)
    overlap = min(a[axis][1], b[axis][1]) - max(a[axis][0], b[axis][0])
    ok = overlap >= min_overlap
    print(f"  {name_a} <-> {name_b} [{axis.upper()}]: {'OK' if ok else 'GAP WARNING'} ({overlap:.4f}m)")
    return overlap


def normal_extent(name):
    """Min/max of the evaluated mesh (modifiers included) projected on the board normal."""
    obj = bpy.data.objects[name]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    mesh = ev.to_mesh()
    ds = [dot(tuple(obj.matrix_world @ v.co), U_NORMAL) for v in mesh.vertices]
    ev.to_mesh_clear()
    return min(ds), max(ds)


def verify_contact(base_name, part_name, min_embed):
    """On a slope, Z-overlap is meaningless; the joint is measured along the board normal."""
    _, base_top = normal_extent(base_name)
    part_low, _ = normal_extent(part_name)
    embed = base_top - part_low
    ok = min_embed - 1e-4 <= embed <= 0.02
    print(f"  {part_name} on {base_name} [normal]: {'OK' if ok else 'GAP WARNING'} (embed {embed * 1000:.1f} mm)")
    return ok


def finalize(name, smooth=True):
    obj = bpy.data.objects[name]
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="MEDIAN")
    bpy.ops.object.shade_smooth()
    if not smooth and hasattr(bpy.ops.object, "shade_smooth_by_angle"):
        # Flat-faced trim keeps crisp edges; curved sheets stay fully smooth.
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30))
    bpy.ops.object.select_all(action="DESELECT")
    return obj


def audit_all():
    meshes = sorted([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: o.name)
    all_ok = True
    for obj in meshes:
        rot = tuple(round(c, 3) for c in obj.rotation_euler)
        scl = tuple(round(c, 3) for c in obj.scale)
        ok = rot == (0.0, 0.0, 0.0) and scl == (1.0, 1.0, 1.0)
        all_ok = all_ok and ok
        print(f"  [{'OK' if ok else '!!'}] {obj.name:30s} rot={rot} scl={scl}")
    print(f"\nAll transforms clean: {all_ok}")
    return all_ok


# ---------------------------------------------------------------- materials


def simple_material(name, hex_color, rough=0.6, metal=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = srgb_to_linear(hex_color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------- build steps


def setup_scene():
    """Empty the scene (keeps the UI), add studio light + camera, switch the viewport to material preview."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    world = scene.world or bpy.data.worlds.new("Studio")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.86, 0.88, 0.9, 1.0)
    bg.inputs["Strength"].default_value = 0.9
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.data.angle = math.radians(4)
    sun.rotation_euler = (math.radians(48), 0.0, math.radians(-25))
    scene.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "AREA"))
    fill.data.energy = 900.0
    fill.data.size = 6.0
    fill.location = (0.0, -6.0, 5.0)
    fill.rotation_euler = (math.radians(50), 0.0, 0.0)
    scene.collection.objects.link(fill)
    cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    cam.data.lens = 35
    scene.collection.objects.link(cam)
    scene.camera = cam
    aim_camera(target=(0.0, 0.55, 0.75), distance=total_width() * 1.12, elevation=20, azimuth=-6)
    scene.render.resolution_x, scene.render.resolution_y = 1920, 900
    set_viewport("MATERIAL", camera_view=True)
    print("scene ready: lights, camera, material preview")


def aim_camera(target, distance, elevation, azimuth):
    cam = bpy.context.scene.camera
    el, az = math.radians(elevation), math.radians(azimuth)
    cam.location = (target[0] + distance * math.cos(el) * math.sin(az),
                    target[1] - distance * math.cos(el) * math.cos(az),
                    target[2] + distance * math.sin(el))
    cam.rotation_euler = (mathutils.Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def set_viewport(shading, camera_view=False):
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != "VIEW_3D":
                continue
            for space in area.spaces:
                if space.type == "VIEW_3D":
                    space.shading.type = shading
                    space.overlay.show_floor = False
                    space.overlay.show_axis_x = space.overlay.show_axis_y = False
                    if camera_view:
                        space.region_3d.view_perspective = "CAMERA"


def deck_line():
    """Deck centre line: front edge sunk 10 mm into the plinth top, back edge SLOPE_LEN up the slope."""
    start = (0.0, 0.0, PLINTH_TOP + DECK_HALF_T - 0.010)
    return start, add(start, U_SLOPE, SLOPE_LEN)


def build_stand():
    """Sloped deck first, then the plinth and back support sized from the deck's real bounds."""
    w = total_width()
    wood = simple_material("Timber", "#a8703f", rough=0.55)
    white = simple_material("Plinth white", "#eef0f2", rough=0.7)
    start, end = deck_line()
    deck = make_beam("Board", start, end, hw=w / 2, hh=DECK_HALF_T)
    assign(deck, wood)
    db = verify_bounds("Board")
    # Plinth spans the deck footprint on Y (+50 mm margin) and runs from the floor to PLINTH_TOP.
    py0, py1 = db["y"][0] - 0.05, db["y"][1] + 0.05
    plinth = add_box("Plinth", (0.0, (py0 + py1) / 2, PLINTH_TOP / 2), (w / 2 + 0.05, (py1 - py0) / 2, PLINTH_TOP / 2))
    assign(plinth, white)
    # Back support: from 10 mm inside the plinth up to 10 mm inside the deck's underside at its back edge.
    back_under = end[2] - DECK_HALF_T / math.cos(THETA)
    z0, z1 = PLINTH_TOP - 0.010, back_under + 0.010
    support = add_box("Back support", (0.0, db["y"][1] - 0.04, (z0 + z1) / 2), (w / 2, 0.03, (z1 - z0) / 2))
    assign(support, white)
    verify_overlap("Plinth", "Board", "z", 0.005)
    verify_overlap("Plinth", "Back support", "z", 0.005)
    verify_overlap("Back support", "Board", "z", 0.005)


def sheet_slots():
    """X centre of each sheet, left to right, one divider width between neighbours."""
    x = -total_width() / 2 + DIVIDER_W
    slots = {}
    for key in ORDER:
        wm = PROFILES[key]["width"] / 1000
        slots[key] = x + wm / 2
        x += wm + DIVIDER_W
    return slots


def drop_onto(base_name, obj, embed):
    """Slide obj along the board normal until its underside sits `embed` inside base's top face."""
    bpy.context.view_layer.update()
    _, base_top = normal_extent(base_name)
    low, _ = normal_extent(obj.name)
    obj.location = add(tuple(obj.location), U_NORMAL, base_top - low - embed)
    bpy.context.view_layer.update()


def add_sheet(key):
    """Build one profile, tilt it onto the slope (rotation baked in), centre it, rest it on the deck."""
    p = PROFILES[key]
    obj = build_mesh(key, p)
    mat = stone_material(f"{p['label']} finish", p["color"]) if p.get("stone") else painted_material(f"{p['label']} paint", p["color"])
    assign(obj, mat)
    obj.rotation_euler = (THETA, 0.0, 0.0)  # flat sheet onto the slope; applied immediately below
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    # Sheets sit between the bottom rail and the label band.
    start, _ = deck_line()
    usable_mid = (0.06 + (SLOPE_LEN - 2 * BAND_HALF_S)) / 2
    centre = add(start, U_SLOPE, usable_mid)
    obj.location = (sheet_slots()[key], centre[1], centre[2])
    drop_onto("Board", obj, EMBED_SHEET)
    verify_bounds(obj.name)
    verify_contact("Board", obj.name, EMBED_SHEET)
    return obj


def add_trim():
    """Timber dividers along the slope, a bottom rail, and the white label band with profile names."""
    w = total_width()
    wood = bpy.data.materials["Timber"]
    band_mat = simple_material("Label band", "#f7f8f9", rough=0.5)
    ink = simple_material("Label ink", "#1d3152", rough=0.4)
    start, end = deck_line()
    parts = []
    x = -w / 2 + DIVIDER_W / 2
    for i in range(len(ORDER) + 1):
        d = make_beam(f"Divider {i + 1}", (x, start[1], start[2]), (x, end[1], end[2]), hw=DIVIDER_W / 2, hh=TRIM_HALF_T)
        assign(d, wood)
        drop_onto("Board", d, EMBED_TRIM)
        parts.append(d.name)
        if i < len(ORDER):
            x += DIVIDER_W + PROFILES[ORDER[i]]["width"] / 1000
    rail = make_board_panel("Bottom rail", add(start, U_SLOPE, 0.03), w / 2, 0.03, TRIM_HALF_T)
    assign(rail, wood)
    drop_onto("Board", rail, EMBED_TRIM)
    band = make_board_panel("Label band", add(end, U_SLOPE, -BAND_HALF_S), w / 2, BAND_HALF_S, 0.012)
    assign(band, band_mat)
    drop_onto("Board", band, EMBED_TRIM)
    parts += [rail.name, band.name]
    for name in parts:
        verify_contact("Board", name, EMBED_TRIM)
    band_centre = add(end, U_SLOPE, -BAND_HALF_S)
    for key, cx in sheet_slots().items():
        bpy.ops.object.text_add(location=(0, 0, 0))
        txt = bpy.context.active_object
        txt.data.body = LABELS[key]
        txt.data.align_x = txt.data.align_y = "CENTER"
        txt.data.size = 0.055
        txt.data.extrude = 0.0008
        bpy.ops.object.convert(target="MESH")
        txt = bpy.context.active_object
        txt.name = f"Label {LABELS[key]}"
        txt.rotation_euler = (THETA, 0.0, 0.0)  # lay the text on the band plane; applied immediately
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        txt.location = (cx, band_centre[1], band_centre[2])
        drop_onto("Label band", txt, 0.0005)
        assign(txt, ink)
        verify_contact("Label band", txt.name, 0.0005)
    print("trim and labels placed")


def finish(out_dir=None):
    sheets = {PROFILES[k]["label"] for k in ORDER}
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        finalize(obj.name, smooth=obj.name in sheets)
    ok = audit_all()
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "century_display_board.blend"), copy=True)
    return ok


def build_all(out_dir=None):
    setup_scene()
    build_stand()
    for key in ORDER:
        add_sheet(key)
    add_trim()
    return finish(out_dir)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    build_all(argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(HERE, "out"))
