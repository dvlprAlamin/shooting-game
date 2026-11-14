"""
Builds the remote-player soldiers from the Mixamo sources in assets-src/mixamo/. Those sources are git-ignored:
Mixamo files may be used inside the game but not shared as raw files.

  Ch15_nonPBR.fbx, Ch35_nonPBR.fbx  ->  <out>/soldier_ch15.glb, soldier_ch35.glb  (mesh + skin, no clips)
  animations/*/*.fbx                ->  <out>/soldier_clips.glb (one skeleton, every clip) + soldier_clips.json

Each character: the rifle-grip finger pose from the idle clip is baked into the mesh and the finger bones are
removed (the hands always hold a gun), the mesh is cut to about TARGET_TRIS, and its materials' diffuse maps are
packed side by side into one atlas, so a soldier is one draw call.
Each clip: the hips' travel is taken out of the moving clips (the game moves the soldier) and its speed and
direction go to soldier_clips.json, so the game can match the step rate to how fast a soldier really moves.

Usage (Blender 4.4 or newer), from apps/client:
  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-characters.py -- assets-src/mixamo <out>
Then compress into public/models: ONLY=characters node scripts/build-models.mjs <out> public/models
"""
import bpy
import json
import os
import sys

import numpy as np

SRC, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(OUT, exist_ok=True)

CHARACTERS = {'ch15': 'Ch15_nonPBR.fbx', 'ch35': 'Ch35_nonPBR.fbx'}
TARGET_TRIS = 9000
CELL = 1024  # atlas cell per source material (build-models.mjs scales the atlas for the game)

RIFLE = 'animations/Pro Rifle Pack'
PISTOL = 'animations/Pistol_Handgun Locomotion Pack'
GRIP_POSE = f'{RIFLE}/idle.fbx'

# Game name -> (source file, kind). 'loop' clips lose their travel and loop in place; 'once' clips start at the
# soldier's position and keep their travel (a death falls a step back). The pistol strafes are named by the way
# they travel, since the source names don't say.
CLIPS = {
    'rifle_idle': (f'{RIFLE}/idle', 'loop'),
    'rifle_aim': (f'{RIFLE}/idle aiming', 'loop'),
    **{f'rifle_{gait}_{d}': (f'{RIFLE}/{gait} {name}', 'loop')
       for gait in ('walk', 'run')
       for d, name in (('f', 'forward'), ('b', 'backward'), ('l', 'left'), ('r', 'right'),
                       ('fl', 'forward left'), ('fr', 'forward right'),
                       ('bl', 'backward left'), ('br', 'backward right'))},
    'rifle_sprint_f': (f'{RIFLE}/sprint forward', 'loop'),
    'rifle_sprint_fl': (f'{RIFLE}/sprint forward left', 'loop'),
    'rifle_sprint_fr': (f'{RIFLE}/sprint forward right', 'loop'),
    'rifle_jump_up': (f'{RIFLE}/jump up', 'once'),
    'rifle_jump_loop': (f'{RIFLE}/jump loop', 'loop'),
    'rifle_jump_down': (f'{RIFLE}/jump down', 'once'),
    'death_front': (f'{RIFLE}/death from the front', 'once'),
    'death_back': (f'{RIFLE}/death from the back', 'once'),
    'death_right': (f'{RIFLE}/death from right', 'once'),
    'death_headshot': (f'{RIFLE}/death from front headshot', 'once'),
    'pistol_idle': (f'{PISTOL}/pistol idle', 'loop'),
    'pistol_walk_f': (f'{PISTOL}/pistol walk', 'loop'),
    'pistol_walk_b': (f'{PISTOL}/pistol walk backward', 'loop'),
    'pistol_strafe_a': (f'{PISTOL}/pistol strafe', 'loop'),
    'pistol_strafe_b': (f'{PISTOL}/pistol strafe (2)', 'loop'),
    'pistol_run_f': (f'{PISTOL}/pistol run', 'loop'),
    'pistol_run_b': (f'{PISTOL}/pistol run backward', 'loop'),
    'pistol_jump': (f'{PISTOL}/pistol jump', 'once'),
}

HIPS = 'mixamorig:Hips'
FINGERS = ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky')


def is_finger(name):
    return 'Hand' in name and any(f in name for f in FINGERS)


def dropped_into(name):
    """Bones the game doesn't need, and the bone that takes over their skin weights."""
    if is_finger(name):
        return 'mixamorig:LeftHand' if 'Left' in name else 'mixamorig:RightHand'
    if name.endswith('HeadTop_End'):
        return 'mixamorig:Head'
    if name.endswith('Toe_End'):
        return name.replace('Toe_End', 'ToeBase')
    return None


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    before_objects, before_actions = set(bpy.data.objects), set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    objects = [o for o in bpy.data.objects if o not in before_objects]
    actions = [a for a in bpy.data.actions if a not in before_actions]
    return objects, actions


def armature_in(objects):
    return next(o for o in objects if o.type == 'ARMATURE')


def fcurves(action):
    """Every F-curve of a (layered, Blender 4.4+) action."""
    return [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]


def activate(obj):
    bpy.context.view_layer.update()  # forget objects removed since
    for o in bpy.context.view_layer.objects:
        if o:
            o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def remove_bones(arm, names):
    activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    for name in names:
        bone = arm.data.edit_bones.get(name)
        if bone:
            arm.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------------------------------------------------------
# Characters
# ---------------------------------------------------------------------------------------------------------------

def bake_grip(arm, mesh):
    """Curls the fingers round a grip (the pose they have in the idle clip) for good, then drops the finger bones."""
    src_objects, _ = import_fbx(os.path.join(SRC, GRIP_POSE))
    src = armature_in(src_objects)
    bpy.context.scene.frame_set(1)

    arm.animation_data_clear()  # the T-pose keys the character came with
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis.identity()
        if is_finger(pb.name) and pb.name in src.pose.bones:
            pb.rotation_quaternion = src.pose.bones[pb.name].matrix_basis.to_quaternion()
    for o in src_objects:
        bpy.data.objects.remove(o)
    bpy.context.view_layer.update()

    # Bake the posed fingers into the mesh, keeping a copy of the armature modifier for the skin.
    activate(mesh)
    mod = next(m for m in mesh.modifiers if m.type == 'ARMATURE')
    bpy.ops.object.modifier_copy(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    activate(arm)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Move the dropped bones' weights to the bone that takes over, then remove them.
    groups = mesh.vertex_groups
    moves = {g.index: dropped_into(g.name) for g in groups if dropped_into(g.name)}
    for v in mesh.data.vertices:
        add = {}
        for g in v.groups:
            target = moves.get(g.group)
            if target:
                add[target] = add.get(target, 0) + g.weight
        for target, w in add.items():
            group = groups.get(target) or groups.new(name=target)
            try:
                w += group.weight(v.index)
            except RuntimeError:
                pass
            group.add([v.index], w, 'REPLACE')
    for index in sorted(moves, reverse=True):
        groups.remove(groups[index])
    remove_bones(arm, [b.name for b in arm.data.bones if dropped_into(b.name)])


def decimate(arm, mesh):
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    for m in list(mesh.modifiers):
        mesh.modifiers.remove(m)
    activate(mesh)
    dec = mesh.modifiers.new('decimate', 'DECIMATE')
    dec.ratio = min(1, TARGET_TRIS / tris)
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec.name)
    skin = mesh.modifiers.new('skin', 'ARMATURE')
    skin.object = arm
    for p in mesh.data.polygons:
        p.use_smooth = True
    return tris, len(mesh.data.polygons)


def base_color_image(mat):
    for node in mat.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for l in node.outputs[0].links):
            return node.image
    raise RuntimeError(f'{mat.name}: no base colour texture')


def pack_atlas(name, mesh):
    """One texture for the whole soldier: each material's diffuse map in its own cell, side by side."""
    mats = [s.material for s in mesh.material_slots]
    n = len(mats)
    atlas = np.zeros((CELL, CELL * n, 4), np.float32)
    for i, mat in enumerate(mats):
        img = base_color_image(mat).copy()
        img.scale(CELL, CELL)
        px = np.empty(CELL * CELL * 4, np.float32)
        img.pixels.foreach_get(px)
        atlas[:, i * CELL:(i + 1) * CELL] = px.reshape(CELL, CELL, 4)
        bpy.data.images.remove(img)
    atlas[..., 3] = 1
    image = bpy.data.images.new(f'{name}_atlas', CELL * n, CELL, alpha=False)
    image.pixels.foreach_set(atlas.ravel())
    image.pack()

    uv = mesh.data.uv_layers.active.data
    for p in mesh.data.polygons:
        i = p.material_index
        for li in p.loop_indices:
            u, v = uv[li].uv
            uv[li].uv = ((i + u) / n, v)
        p.material_index = 0

    mat = bpy.data.materials.new(f'soldier_{name}')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 0.85
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    return n


def build_character(name, file):
    reset()
    objects, _ = import_fbx(os.path.join(SRC, file))
    arm = armature_in(objects)
    meshes = [o for o in objects if o.type == 'MESH']
    assert len(meshes) == 1, f'{file}: expected one mesh, got {len(meshes)}'
    mesh = meshes[0]
    bake_grip(arm, mesh)
    before, after = decimate(arm, mesh)
    cells = pack_atlas(name, mesh)
    activate(arm)
    mesh.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f'soldier_{name}.glb'), export_format='GLB', use_selection=True,
        export_animations=False, export_skins=True, export_morph=False, export_tangents=False,
        export_image_format='WEBP', export_image_quality=90, export_yup=True, export_apply=False)
    hips = arm.data.bones[HIPS].head_local
    print(f'CHARACTER {name}: {before} -> {after} tris, {len(arm.data.bones)} bones, {cells} atlas cells, '
          f'hips {tuple(round(c, 2) for c in hips)}')
    return {'hips': [round(c * arm.scale.x, 4) for c in hips]}


# ---------------------------------------------------------------------------------------------------------------
# Clips
# ---------------------------------------------------------------------------------------------------------------

def hips_curves(action):
    curves = [None, None, None]
    for fc in fcurves(action):
        if fc.data_path == f'pose.bones["{HIPS}"].location':
            curves[fc.array_index] = fc
    return curves


def set_values(fc, values):
    for kp, value in zip(fc.keyframe_points, values):
        kp.co[1] = value
        kp.interpolation = 'LINEAR'


def settle_hips(arm, action, kind, fps):
    """Takes the travel out of the hips (in armature space: Y up, the soldier faces +Z, its left is +X).
    Returns the travel speed (m/s), its direction (x, z) and the clip's length."""
    curves = hips_curves(action)
    rest = arm.data.bones[HIPS].matrix_local.to_3x3()
    frames = [kp.co[0] for kp in curves[0].keyframe_points]
    assert all(len(c.keyframe_points) == len(frames) for c in curves), f'{action.name}: hips keys differ'
    local = np.array([[kp.co[1] for kp in c.keyframe_points] for c in curves]).T  # (frames, 3), bone space
    world = local @ np.array(rest).T  # armature space

    travel = world[-1] - world[0]
    duration = (frames[-1] - frames[0]) / fps
    scale = arm.scale.x  # armature units -> metres
    horizontal = np.array([travel[0], travel[2]]) * scale
    distance = float(np.hypot(*horizontal))

    t = (np.array(frames) - frames[0]) / max(frames[-1] - frames[0], 1)
    for axis in (0, 2):
        if kind == 'loop':
            world[:, axis] -= travel[axis] * t
            world[:, axis] -= world[:, axis].mean()
        else:
            world[:, axis] -= world[0, axis]
    local = world @ np.array(rest.inverted()).T
    for axis, fc in enumerate(curves):
        set_values(fc, local[:, axis])

    direction = (horizontal / distance).round(3).tolist() if distance > 0.05 else [0, 0]
    return {'duration': round(duration, 4), 'speed': round(distance / duration, 3) if duration else 0,
            'dir': direction}


def build_clips():
    reset()
    meta = {}
    base = None
    for name, (file, kind) in CLIPS.items():
        objects, actions = import_fbx(os.path.join(SRC, f'{file}.fbx'))
        arm = armature_in(objects)
        action = arm.animation_data.action
        fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
        meta[name] = settle_hips(arm, action, kind, fps)
        meta[name]['loop'] = kind == 'loop'
        action.name = name
        action.use_fake_user = True
        if base is None:
            base = arm
            base.name = 'Soldier'
        else:
            for o in objects:
                bpy.data.objects.remove(o)
        start = int(action.frame_range[0])
        track = base.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, start, action)
        if hasattr(strip, 'action_slot') and action.slots:
            strip.action_slot = action.slots[0]
        print(f'CLIP {name}: {meta[name]} fps {fps}')

    # Name the pistol strafes by the way they go (+X is the soldier's left).
    side_a = 'l' if meta['pistol_strafe_a']['dir'][0] > 0 else 'r'
    sides = {'pistol_strafe_a': side_a, 'pistol_strafe_b': 'r' if side_a == 'l' else 'l'}
    for clip, side in sides.items():
        m = meta.pop(clip)
        new = f'pistol_strafe_{side}'
        bpy.data.actions[clip].name = new
        next(t for t in base.animation_data.nla_tracks if t.name == clip).name = new
        meta[new] = m

    base.animation_data.action = None
    remove_bones(base, [b.name for b in base.data.bones if dropped_into(b.name)])
    activate(base)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, 'soldier_clips.glb'), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True, export_morph=False,
        export_force_sampling=True, export_optimize_animation_size=False, export_anim_slide_to_zero=True,
        export_yup=True, export_apply=False)
    hips = base.data.bones[HIPS].head_local
    return meta, [round(c * base.scale.x, 4) for c in hips]


characters = {name: build_character(name, file) for name, file in CHARACTERS.items()}
clips, clip_hips = build_clips()
with open(os.path.join(OUT, 'soldier_clips.json'), 'w') as f:
    json.dump({'characters': characters, 'clipHips': clip_hips, 'clips': clips}, f, indent=1)
print('done')
