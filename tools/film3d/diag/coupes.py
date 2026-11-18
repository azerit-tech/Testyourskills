# La luminance du bas de l'image aux sept coupes du film à six étoiles (SPEC §18.63), sans Blender ni Pillow : ffmpeg
# lit chaque image en niveaux de gris (luma BT.601, 0 à 255), la moyenne se prend sur le quart bas du cadre (la
# chaussée sous la berline, ce que l'œil compare d'une image à l'autre). Pour chaque coupe a | b : le saut d'une image
# à l'autre à la coupe, moins la pente des deux images de part et d'autre (ce que le mouvement change de lui-même),
# en % de la luminance d'avant ; au-delà du seuil (3 %), la coupe se voit.
#
#   python3 tools/film3d/diag/coupes.py --rendu DIR [--tag +ville+brouillon]
#       les images de render_film (DIR/<PLAN><tag>/NNNN.png) : les deux dernières de a, les deux premières de b
#       (à défaut, la seule image de chaque côté : le saut brut)
#   python3 tools/film3d/diag/coupes.py --film film.mp4
#       le film assemblé (image 0 = OUV/1), les mêmes images
#   options : --seuil 3 (en %) ; --bas 0.25 (la part basse du cadre mesurée) ; --stat mediane (défaut) ou moyenne
# Sort 1 si une coupe dépasse le seuil. Les images se rendent sur la machine louée, éclairées (--draft --ville) :
#   --plan OUV --frames 74-75 ; P1 1-2,32-33 ; P2 1-2,106-107 ; P3 1-2,102-103 ; P4 1-2,107-108 ; P5 1-2,59-60 ;
#   P6 1-2,132-133 ; FIN6 1-2  (les longueurs : parcours.SHOTS)
import argparse
import os
import subprocess
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(ICI))
import parcours as PC  # noqa: E402

ORDRE = ("OUV", "P1", "P2", "P3", "P4", "P5", "P6", "FIN6")


def longueurs():
    n = dict(PC.SHOTS)
    n["FIN6"] = PC.FIN6_FRAMES
    return {p: n[p] for p in ORDRE}


def gris(args):
    """(largeur, hauteur, octets) d'une image lue par ffmpeg en niveaux de gris."""
    out = subprocess.run(["ffmpeg", "-v", "error", "-threads", "2"] + args +
                         ["-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    return out


def taille(args):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                        "-of", "csv=p=0"] + args, capture_output=True, text=True, check=True).stdout.strip()
    w, h = (int(v) for v in r.split(",")[:2])
    return w, h


def moyenne_bas(data, w, h, bas, stat="mediane"):
    """La luminance du bas du cadre : la médiane par défaut (le ton de la chaussée, que n'emportent ni une bande de
    marquage ni un reflet qui entre dans le cadre ; la moyenne faisait passer pour un saut le tireté de P4/1 ou le
    passage piéton d'OUV/75), ou la moyenne."""
    y0 = int(h * (1.0 - bas))
    zone = data[y0 * w:h * w]
    if stat == "moyenne":
        return sum(zone) / max(1, len(zone))
    hist = [0] * 256
    for v in zone:
        hist[v] += 1
    half, acc = len(zone) / 2.0, 0
    for v, c in enumerate(hist):
        if acc + c >= half:
            return v + (half - acc) / max(1, c)         # interpolée dans la case : une médiane continue
        acc += c
    return 255.0


class Source:
    def __init__(self, a):
        self.a = a
        self.n = longueurs()
        self.cache = {}

    def lum(self, plan, f):
        """La luminance du bas de l'image f (1 à n) du plan, None si l'image manque."""
        key = (plan, f)
        if key in self.cache:
            return self.cache[key]
        if not 1 <= f <= self.n[plan]:
            return None
        if self.a.film:
            g = PC.START[plan] + f - 1
            args = ["-i", self.a.film, "-vf", f"select=eq(n\\,{g})", "-vsync", "0"]
            w, h = taille([self.a.film])
        else:
            p = os.path.join(self.a.rendu, f"{plan}{self.a.tag}", f"{f:04d}.png")
            if not os.path.exists(p):
                self.cache[key] = None
                return None
            args = ["-i", p]
            w, h = taille([p])
        data = gris(args)
        v = moyenne_bas(data, w, h, self.a.bas, self.a.stat) if len(data) >= w * h else None
        self.cache[key] = v
        return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rendu")
    ap.add_argument("--tag", default="+ville+brouillon")
    ap.add_argument("--film")
    ap.add_argument("--seuil", type=float, default=3.0)
    ap.add_argument("--bas", type=float, default=0.25)
    ap.add_argument("--stat", choices=("mediane", "moyenne"), default="mediane")
    a = ap.parse_args()
    if not (a.rendu or a.film):
        ap.error("--rendu DIR ou --film MP4")
    s = Source(a)
    n = s.n
    mauvaises = 0
    print(f"luminance ({a.stat}) du quart bas ({100 * a.bas:.0f} % du cadre), seuil {a.seuil:g} % (saut à la coupe "
          f"moins la pente de part et d'autre)")
    for pa, pb in zip(ORDRE, ORDRE[1:]):
        a1, a0 = s.lum(pa, n[pa] - 1), s.lum(pa, n[pa])
        b0, b1 = s.lum(pb, 1), s.lum(pb, 2)
        g = PC.START[pb]
        if a0 is None or b0 is None:
            print(f"{g - 1:4d}|{g:<4d} {pa:>4s} → {pb:<4s} : images manquantes ({pa}/{n[pa]} ou {pb}/1)")
            mauvaises += 1
            continue
        pentes = [d for d in ((a0 - a1) if a1 is not None else None, (b1 - b0) if b1 is not None else None)
                  if d is not None]
        pente = sum(pentes) / len(pentes) if pentes else 0.0
        saut = b0 - a0
        exces = 100.0 * (saut - pente) / max(a0, 1e-6)
        ok = abs(exces) <= a.seuil
        # un objet clair qui passe au bas du cadre (un passage piéton, des phares) fait une bosse qui commence avant
        # la coupe : le pas d'avant, du même signe, vaut au moins la moitié du saut (74 | 75 au v9). Signalé, pas
        # excusé : la coupe se regarde sur les images
        avant = (a0 - a1) if a1 is not None else 0.0
        transitoire = not ok and avant * saut > 0 and abs(avant) >= 0.5 * abs(saut)
        mauvaises += not ok
        verdict = "ok" if ok else "SE VOIT (une bosse commence avant la coupe : à regarder)" if transitoire else "SE VOIT"
        print(f"{g - 1:4d}|{g:<4d} {pa:>4s} → {pb:<4s} : {a0:6.1f} → {b0:6.1f}  saut {100 * saut / max(a0, 1e-6):+6.1f} %"
              f"  pente {100 * pente / max(a0, 1e-6):+5.1f} %  écart {exces:+6.1f} %  {verdict}")
    print(f"{7 - mauvaises} coupes sur 7 sous le seuil")
    sys.exit(1 if mauvaises else 0)


if __name__ == "__main__":
    main()
