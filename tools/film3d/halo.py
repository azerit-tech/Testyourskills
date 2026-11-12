# Le halo des sources, au compositing, le même pour tous les plans (lumière v3.1) : l'éclat d'une rampe vient de sa
# lentille tenue sous l'écrêtage et d'un halo court posé ici, pas d'une lumière jetée sur la chaussée. Un seul nœud
# Glare (flou lumineux, pas d'étoile), son seuil au-dessus des lampadaires et des phares en codes : seuls les cœurs des
# lentilles et des lampes le franchissent. Puis la dispersion légère de l'objectif.
#
# Appelé par scene_a.render_settings (une ligne), que tous les plans appellent.
#
# FILM3D_HALO_EXR=<dossier> écrit en plus l'image linéaire avant le halo (multicouche, une par image) : pour mesurer
# la valeur des lentilles, des lampes et des phares, et placer le seuil.
import os

# le seuil compare la plus forte composante d'un pixel (linéaire, avant la transformée de vue) ; HALO_SIZE en
# fraction de l'image (0,5 : la moitié du cadre), gardé court
HALO_THRESHOLD = 1.2
HALO_SMOOTH = 0.1
HALO_STRENGTH = 0.12
HALO_SIZE = 0.6
HALO_SATURATION = 1.0


def halo(scene):
    """Le compositing commun : Glare (Bloom) puis dispersion de l'objectif ; renvoie l'arbre."""
    import bpy
    ng = bpy.data.node_groups.new("comp_halo", "CompositorNodeTree")
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    rl = ng.nodes.new("CompositorNodeRLayers")
    gl = ng.nodes.new("CompositorNodeGlare")
    for k, v in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", HALO_THRESHOLD), ("Smoothness", HALO_SMOOTH),
                 ("Strength", HALO_STRENGTH), ("Size", HALO_SIZE), ("Saturation", HALO_SATURATION)):
        try:
            gl.inputs[k].default_value = v
        except Exception as e:
            print("[halo] glare", k, e)
    ld = ng.nodes.new("CompositorNodeLensdist")
    try:
        ld.inputs["Dispersion"].default_value = 0.012
        ld.inputs["Distortion"].default_value = -0.01
    except Exception as e:
        print("[halo] objectif", e)
    go = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ng.links.new(gl.outputs["Image"], ld.inputs["Image"])
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
    scene.compositing_node_group = ng
    return ng
