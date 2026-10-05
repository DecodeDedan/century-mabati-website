"""Build Century Mabati roofing profiles in Blender at real-world scale (millimetres).

Headless:   Blender -b --python build_profiles.py -- [--only c868,it5] [--render] [--out DIR]
Via MCP:    exec(open("<this file>").read()); build_all(render=False)

Sources for dimensions:
  * IT5: Mabati Rolling Mills Tekdek IT5 sheet — 6 ribs @ 182 mm, 112 mm trough, 34 mm deep,
    910 mm cover / 980 mm overall.
  * C-868 / C-800 / C-840: the number is the effective cover width in mm (the Kenyan Roman
    tile "ROMAX" lists 868 mm effective coverage). Barrel counts, course length, barrel height
    and the curved tile-end shape are measured off Century's labelled sample board photo.
  * Stone-coated: standard 1340 x 420 mm panel, 1265 x 370 mm exposure.
"""

import argparse
import math
import os
import sys

import bpy

MM = 0.001  # Blender works in metres

# ---------------------------------------------------------------- helpers (mm in, mm out)


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def frac(v):
    return v - math.floor(v)


def roman_barrel(t, valley):
    """Semicircular barrel with a flat valley; t runs 0..1 across one pitch."""
    u = min(1.0, max(0.0, (t - valley * 0.5) / (1.0 - valley)))
    c = 2.0 * u - 1.0
    return math.sqrt(max(0.0, 1.0 - c * c))


def step_rise(s, h):
    """Tile course: short rise off the step, long tread, near-vertical drop at the tile end."""
    # Drop spread over the last 10% of the course: still a crisp step, but wide enough that the
    # curved tile-end line is sampled by several grid rows instead of stair-stepping.
    return h * smoothstep(0.0, 0.3, s) * (1.0 - smoothstep(0.9, 1.0, s))


def nose(s, squash):
    """Barrel pressed shallower under the tile above, full height toward its own end."""
    return squash + (1.0 - squash) * smoothstep(0.0, 0.15, s)


def lip_roll(s):
    return 1.0 - 0.12 * smoothstep(0.8, 1.0, s)


def tile_s(y, course, lip, shape):
    """Course position; the drop is pushed downhill under high parts, curving each tile end."""
    return frac((y - lip * shape) / course)


def valley_seam(t):
    d = min(t, 1.0 - t)
    return math.exp(-((d / 0.012) ** 2))


def hash2(a, b):
    return frac(math.sin(a * 127.1 + b * 311.7) * 43758.5453)


# ---------------------------------------------------------------- profile definitions

PROFILES = {
    "corrugated": dict(label="Corrugated", kind="corrugated", width=912, length=1200,
                       pitch=76, depth=18, color="#b3262b"),
    "it5": dict(label="Box Profile IT-5", kind="box", width=980, length=1200,
                pitch=182, trough=112, crown=26, depth=34, color="#1f5fa8"),
    "cwave": dict(label="C-Wave", kind="wave", width=900, length=1200,
                  pitch=180, height=28, course=210, lip=30, step=16, color="#6b1e26"),
    "c800": dict(label="C-800 Classic Roman", kind="roman", width=800, length=1200,
                 pitch=160, valley=0.12, barrel=29, course=240, lip=32, step=17, squash=1.0,
                 color="#c2512e"),
    "c840": dict(label="C-840 Flat-step", kind="fine", width=840, length=1200,
                 pitch=70, rib=13, course=175, lip=12, step=15, color="#2b2f36"),
    "c868": dict(label="C-868 Deep Roman", kind="roman", width=868, length=1200,
                 pitch=217, valley=0.16, barrel=38, course=290, lip=46, step=19, squash=1.0,
                 color="#1f4d35"),
    "stone_roman": dict(label="Stone-coated Roman", kind="stone_roman", width=1265, length=1110,
                        pitch=158, valley=0.2, barrel=26, course=370, lip=40, butt=24,
                        color="#7a3a2c", stone=True),
    "stone_shake": dict(label="Stone-coated Shake", kind="stone_shake", width=1265, length=1110,
                        block=211, course=370, butt=24, groove=8, color="#34363a", stone=True),
}


def height_mm(p, x, y):
    k = p["kind"]
    if k == "corrugated":
        return 0.5 * p["depth"] * math.sin(2.0 * math.pi * x / p["pitch"])
    if k == "box":
        t = frac(x / p["pitch"])
        base_half = (p["pitch"] - p["trough"]) / 2.0 / p["pitch"]
        top_half = p["crown"] / 2.0 / p["pitch"]
        rib = min(1.0, max(0.0, (base_half - abs(t - 0.5)) / (base_half - top_half)))
        # Two stiffeners split each trough into thirds.
        off = p["trough"] / 6.0 / p["pitch"]
        stiff = sum(math.exp(-(((t - c) / 0.012) ** 2)) for c in (off, 1.0 - off))
        return p["depth"] * rib + 3.0 * stiff
    if k == "roman":
        t = frac(x / p["pitch"])
        b = roman_barrel(t, p["valley"])
        s = tile_s(y, p["course"], p["lip"], b)
        return p["barrel"] * b * nose(s, p["squash"]) * lip_roll(s) + step_rise(s, p["step"]) + 1.0 * valley_seam(t)
    if k == "wave":
        t = frac(x / p["pitch"])
        roll = roman_barrel(min(1.0, max(0.0, (t - 0.55) / 0.45)), 0.0)
        pan = -0.15 * math.sin(math.pi * min(1.0, t / 0.55))
        s = tile_s(y, p["course"], p["lip"], roll + 0.35 * (1.0 + pan))
        return p["height"] * (roll + 0.4 * pan) * nose(s, 1.0) * lip_roll(s) + step_rise(s, p["step"])
    if k == "fine":
        t = frac(x / p["pitch"])
        rib = roman_barrel(t, 0.25)
        s = tile_s(y, p["course"], p["lip"], rib)
        return p["rib"] * rib * nose(s, 0.9) + step_rise(s, p["step"])
    if k == "stone_roman":
        t = frac(x / p["pitch"])
        b = roman_barrel(t, p["valley"])
        s = tile_s(y, p["course"], p["lip"], b)
        butt = p["butt"] * s * (1.0 - smoothstep(0.95, 1.0, s))
        return p["barrel"] * b * nose(s, 0.7) * lip_roll(s) + butt
    if k == "stone_shake":
        row = math.floor(y / p["course"])
        s = frac(y / p["course"])
        bx = x / p["block"] + (row % 2) * 0.5
        edge = min(frac(bx), 1.0 - frac(bx)) * p["block"]
        groove = p["groove"] * (1.0 - smoothstep(0.0, 14.0, edge))
        lift = 4.0 * hash2(math.floor(bx), row) * s
        return p["butt"] * s * (1.0 - smoothstep(0.95, 1.0, s)) - groove + lift
    raise ValueError(f"unknown profile kind: {k}")


# ---------------------------------------------------------------- mesh + materials


def build_mesh(key, p, dx=2.0, dy=1.8):
    nx = int(p["width"] / dx) + 1
    ny = int(p["length"] / dy) + 1
    verts = []
    for j in range(ny):
        y = j * p["length"] / (ny - 1)
        for i in range(nx):
            x = i * p["width"] / (nx - 1)
            # Centre the sheet on the origin; Blender Y runs down the roof slope.
            verts.append(((x - p["width"] / 2) * MM, (p["length"] / 2 - y) * MM, height_mm(p, x, y) * MM))
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
             for j in range(ny - 1) for i in range(nx - 1)]
    mesh = bpy.data.meshes.new(f"{key}_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(p["label"], mesh)
    bpy.context.scene.collection.objects.link(obj)
    solid = obj.modifiers.new("Sheet thickness", "SOLIDIFY")
    solid.thickness = 0.6 * MM  # 0.4 mm steel plus coating, slightly exaggerated to read at distance
    solid.offset = -1.0
    solid.use_even_offset = True
    solid.use_quality_normals = True
    return obj


def srgb_to_linear(hex_color):
    def chan(c):
        c = int(c, 16) / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    h = hex_color.lstrip("#")
    return (chan(h[0:2]), chan(h[2:4]), chan(h[4:6]), 1.0)


def set_input(node, names, value):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def painted_material(name, hex_color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    set_input(bsdf, ["Base Color"], srgb_to_linear(hex_color))
    set_input(bsdf, ["Metallic"], 0.35)
    set_input(bsdf, ["Roughness"], 0.45)
    set_input(bsdf, ["Coat Weight", "Clearcoat"], 0.25)
    set_input(bsdf, ["Coat Roughness", "Clearcoat Roughness"], 0.4)
    return mat


def stone_material(name, hex_color):
    """Granule coat: chip-scale noise drives colour variation and a bump; fully matte."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    chips = nt.nodes.new("ShaderNodeTexVoronoi")
    chips.inputs["Scale"].default_value = 700.0  # ~1.5 mm granules on an object in metres
    mottle = nt.nodes.new("ShaderNodeTexNoise")
    mottle.inputs["Scale"].default_value = 12.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    base = srgb_to_linear(hex_color)
    ramp.color_ramp.elements[0].color = tuple(c * 0.55 for c in base[:3]) + (1.0,)
    ramp.color_ramp.elements[1].color = tuple(min(1.0, c * 1.35) for c in base[:3]) + (1.0,)
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    mix.inputs[1].default_value = 0.6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.7
    bump.inputs["Distance"].default_value = 0.0015
    nt.links.new(coord.outputs["Object"], chips.inputs["Vector"])
    nt.links.new(coord.outputs["Object"], mottle.inputs["Vector"])
    nt.links.new(chips.outputs["Distance"], mix.inputs[0])
    nt.links.new(mottle.outputs["Fac"], mix.inputs[2])
    nt.links.new(mix.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(chips.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    set_input(bsdf, ["Metallic"], 0.0)
    set_input(bsdf, ["Roughness"], 0.95)
    return mat


# ---------------------------------------------------------------- scene, render, export


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "MILLIMETERS"
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.82, 0.85, 0.88, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 3.5
    sun_data.angle = math.radians(3)
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
    scene.collection.objects.link(sun)
    # Soft fill from up-slope so barrel crests catch a lengthwise highlight, as on the sample board.
    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill_data.energy = 120.0
    fill_data.size = 3.0
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.location = (-1.0, 2.0, 2.5)
    fill.rotation_euler = (math.radians(-40), math.radians(-20), 0.0)
    scene.collection.objects.link(fill)
    return scene


def configure_render(scene, width=1000, height=700):
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "CYCLES"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 64
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.image_settings.file_format = "PNG"
    transforms = [v.identifier for v in type(scene.view_settings).bl_rna.properties["view_transform"].enum_items]
    scene.view_settings.view_transform = "AgX" if "AgX" in transforms else "Filmic"


def frame_camera(scene, obj):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 50
    cam = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    w = max(obj.dimensions.x, obj.dimensions.y)
    # Three-quarter view from down-slope, low enough to read the tile steps.
    cam.location = (0.35 * w, -1.6 * w, 0.9 * w)
    direction = obj.location - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_profile(key, out_dir=None, render=False):
    p = PROFILES[key]
    obj = build_mesh(key, p)
    mat = stone_material(f"{p['label']} finish", p["color"]) if p.get("stone") else painted_material(f"{p['label']} paint", p["color"])
    obj.data.materials.append(mat)
    if out_dir:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, f"{key}.glb"), use_selection=True, export_apply=True)
    if render and out_dir:
        scene = bpy.context.scene
        frame_camera(scene, obj)
        scene.render.filepath = os.path.join(out_dir, f"{key}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(scene.camera, do_unlink=True)
    return obj


def build_all(keys=None, out_dir=None, render=False, lay_out=True):
    """Build profiles. With render=True each is rendered alone; afterwards all are laid side by side."""
    keys = keys or list(PROFILES)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    scene = reset_scene()
    configure_render(scene)
    built = []
    for key in keys:
        obj = build_profile(key, out_dir, render)
        if render:
            obj.hide_render = True  # keep the next render to one sheet
        built.append(obj)
    if lay_out:
        x = 0.0
        for obj in built:
            obj.hide_render = False
            obj.location.x = x
            x += obj.dimensions.x + 0.25
    if out_dir:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "century_profiles.blend"))
    return built


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", help="comma-separated profile keys: " + ", ".join(PROFILES))
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(argv)
    keys = args.only.split(",") if args.only else None
    unknown = [k for k in (keys or []) if k not in PROFILES]
    if unknown:
        parser.error(f"unknown profile(s): {', '.join(unknown)}")
    build_all(keys, args.out, args.render)
    print(f"[century] built {', '.join(keys or PROFILES)} -> {args.out}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
