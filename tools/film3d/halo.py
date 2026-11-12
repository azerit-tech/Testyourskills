# Le halo des sources, au compositing, le même pour tous les plans (lumière v3.1) : l'éclat d'une rampe vient de sa
# lentille tenue sous l'écrêtage et d'un halo court posé ici, pas d'une lumière jetée sur la chaussée.
#
# Deux nœuds Glare en flou lumineux (pas d'étoile) :
#  - le halo commun, sur toute l'image, au seuil HALO_THRESHOLD : seuls les cœurs de lampe l'accrochent. Mesuré en
#    linéaire (plus forte composante, P1 40, P3 24, P4 24, P6 30) : une lentille de rampe allumée vaut 0,4 à 3, les
#    verres des lampadaires et des phares 3 à 40 ; un seuil ne peut donc pas prendre les lentilles sans les lampes ;
#  - le halo des rampes, sur la seule passe « rampe » (cast_vehicles.BAR_AOV : l'émission des lentilles allumées, vue
#    de la caméra), ajouté à l'image : l'éclat corail ou violet suit le clignotement et ne touche ni le sol ni la
#    berline. Puis la dispersion légère de l'objectif.
#
# Appelé par scene_a.render_settings (une ligne), que tous les plans appellent.
#
# FILM3D_HALO_EXR=<dossier> écrit en plus l'image linéaire avant le halo et la passe des rampes (multicouche) : pour
# mesurer lentilles, lampes et phares et régler les deux halos sans rendre.
import os

BAR_AOV = "rampe"          # (le nom de cast_vehicles.BAR_AOV)
HALO_THRESHOLD = 3.0       # linéaire, plus forte composante d'un pixel avant la transformée de vue
HALO_SMOOTH = 0.1
HALO_STRENGTH = 0.14
HALO_SIZE = 0.65           # fraction du cadre
BAR_HALO_STRENGTH = 6.0       # réglé sur P4 24 et P1 40 (0,6 et 1,2 ne se voyaient pas, 12 débordait)
BAR_HALO_SIZE = 0.45


def _glare(ng, threshold, smooth, strength, size):
    gl = ng.nodes.new("CompositorNodeGlare")
    for k, v in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", threshold), ("Smoothness", smooth),
                 ("Strength", strength), ("Size", size), ("Saturation", 1.0)):
        try:
            gl.inputs[k].default_value = v
        except Exception as e:
            print("[halo] glare", k, e)
    return gl


def halo(scene):
    """Le compositing commun : halo des lampes, halo des rampes, dispersion de l'objectif ; renvoie l'arbre."""
    import bpy
    for vl in scene.view_layers:
        if BAR_AOV not in vl.aovs:
            a = vl.aovs.add()
            a.name, a.type = BAR_AOV, "COLOR"
    ng = bpy.data.node_groups.new("comp_halo", "CompositorNodeTree")
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = ng.nodes.new("CompositorNodeRLayers")
    gl = _glare(ng, HALO_THRESHOLD, HALO_SMOOTH, HALO_STRENGTH, HALO_SIZE)
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    img = gl.outputs["Image"]
    bar = rl.outputs.get(BAR_AOV)
    if bar is not None:
        gb = _glare(ng, 0.0, 0.0, BAR_HALO_STRENGTH, BAR_HALO_SIZE)
        ng.links.new(bar, gb.inputs["Image"])
        add = ng.nodes.new("ShaderNodeMix")
        add.data_type, add.blend_type, add.clamp_result = "RGBA", "ADD", False
        add.inputs[0].default_value = 1.0
        cols = [s for s in add.inputs if s.type == "RGBA" and s.enabled]
        ng.links.new(img, cols[0])
        ng.links.new(gb.outputs["Glare"], cols[1])
        img = next(s for s in add.outputs if s.type == "RGBA" and s.enabled)
    else:
        print("[halo] pas de passe", BAR_AOV, ": halo des rampes absent")
    ld = ng.nodes.new("CompositorNodeLensdist")
    try:
        ld.inputs["Dispersion"].default_value = 0.012
        ld.inputs["Distortion"].default_value = -0.01
    except Exception as e:
        print("[halo] objectif", e)
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(img, ld.inputs["Image"])
    ng.links.new(ld.outputs["Image"], go.inputs[0])
    probe = os.environ.get("FILM3D_HALO_EXR", "").strip()
    if probe:
        os.makedirs(probe, exist_ok=True)
        fo = ng.nodes.new("CompositorNodeOutputFile")
        fo.directory, fo.file_name = probe + "/", "lin"
        fo.save_as_render = False
        fo.format.media_type = "MULTI_LAYER_IMAGE"
        fo.format.file_format = "OPEN_EXR_MULTILAYER"
        fo.format.color_depth = "32"
        fo.file_output_items.new("RGBA", "image")
        ng.links.new(rl.outputs["Image"], fo.inputs["image"])
        if bar is not None:
            fo.file_output_items.new("RGBA", BAR_AOV)
            ng.links.new(bar, fo.inputs[BAR_AOV])
    scene.compositing_node_group = ng
    return ng
