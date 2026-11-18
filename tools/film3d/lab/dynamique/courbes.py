"""Les courbes de la conduite simulée : les deux dérapages et le changement de voie (matplotlib : python3.10).

    python3.10 tools/film3d/lab/dynamique/courbes.py <dossier> [avant.json]

Écrit <dossier>/derapage-P2.png, derapage-P5.png et changement-de-voie.png : glisse, lacet, braquage des roues
avant, latérale, roulis, vitesse, pédales et frein à main, une grandeur par vignette (jamais deux échelles sur un
axe), les images du film en abscisse. avant.json : la conduite dessinée d'avant (film/v9), superposée là où elle a la
même grandeur (un export {t, slip, steer, speed, alat, heading} à quatre points par image)."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dynamique as D          # noqa: E402
import parcours as PC          # noqa: E402
import voie                    # noqa: E402

import matplotlib              # noqa: E402
matplotlib.use("Agg")
import matplotlib.pyplot as plt   # noqa: E402

# la palette (ordre fixe, validée : bleu, orange, vert d'eau) ; l'encre et la surface
BLEU, ORANGE, VERT = "#2a78d6", "#eb6834", "#1baf7a"
ENCRE, GRIS, FOND, GRILLE = "#0b0b0b", "#52514e", "#fcfcfb", "#e4e3df"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": GRILLE, "axes.labelcolor": GRIS, "text.color": ENCRE,
                     "xtick.color": GRIS, "ytick.color": GRIS, "axes.facecolor": FOND, "figure.facecolor": FOND,
                     "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRILLE,
                     "grid.linewidth": 0.6, "lines.linewidth": 1.8, "legend.frameon": False})


def vignette(ax, titre, unite, cible=None):
    ax.set_title(titre, loc="left", fontsize=9.5, fontweight="bold")
    ax.set_ylabel(unite)
    if cible is not None:
        ax.axhspan(cible[0], cible[1], color=GRILLE, alpha=0.7, lw=0)
    ax.axhline(0.0, color=GRIS, lw=0.6)


def derapage(nom, f0, f1, etoile, signe, cible, avant, dossier):
    dr = PC.DRIVE
    fs = [f0 + k / 10.0 for k in range((f1 - f0) * 10 + 1)]
    ts = [f / 24.0 for f in fs]
    av = None
    if avant:
        idx = [k for k, t in enumerate(avant["t"]) if f0 <= t * 24.0 <= f1]
        h = avant["heading"]
        lacet = [(h[min(k + 1, len(h) - 1)] - h[max(k - 1, 0)]) * 48.0 for k in idx]
        av = dict(f=[avant["t"][k] * 24.0 for k in idx], slip=[signe * avant["slip"][k] for k in idx],
                  steer=[signe * avant["steer"][k] for k in idx], speed=[avant["speed"][k] * 3.6 for k in idx],
                  alat=[signe * avant["alat"][k] / D.G for k in idx], lacet=[signe * v for v in lacet])
    fig, axs = plt.subplots(4, 2, figsize=(11, 10.5), sharex=True)
    cote = "gauche" if signe > 0 else "droite"
    fig.suptitle("%s : le dérapage simulé (virage à %s, grandeurs comptées positives vers l'intérieur du virage)"
                 % (nom, cote), x=0.01, ha="left", fontsize=12, fontweight="bold")
    series = (
        ("Glisse (cap de la caisse moins cap de la vitesse)", "°", [signe * dr.slip(t) for t in ts], "slip", cible),
        ("Lacet de la caisse", "°/s", [signe * dr.yaw_rate(t) for t in ts], "lacet", None),
        ("Braquage des roues avant (négatif : contre-braquage)", "°", [signe * dr.steer(t) for t in ts], "steer",
         None),
        ("Accélération latérale", "g", [signe * dr.alat(t) / D.G for t in ts], "alat", (0.0, 0.7)),
        ("Roulis (positif : vers l'extérieur)", "°", [signe * dr.roll(t) for t in ts], None, (3.0, 6.0)),
        ("Vitesse", "km/h", [dr.speed(t) * 3.6 for t in ts], "speed", None),
    )
    for ax, (titre, unite, ys, cle, zone) in zip(axs.flat, series):
        vignette(ax, titre, unite, zone)
        if av and cle:
            ax.plot(av["f"], av[cle], color=ORANGE, label="avant : courbe dessinée (v9)")
        ax.plot(fs, ys, color=BLEU, label="simulation")
        ax.axvline(etoile, color=GRIS, lw=0.8, ls=(0, (3, 3)))
        if cle == "slip":
            k = max(range(len(ys)), key=lambda i: ys[i])
            ax.annotate("crête %.1f° à l'image %.1f" % (ys[k], fs[k]), (fs[k], ys[k]), xytext=(8, 6),
                        textcoords="offset points", fontsize=8.5, color=ENCRE)
            ax.annotate("étoile, image %d" % etoile, (etoile, ax.get_ylim()[0]), xytext=(4, 4),
                        textcoords="offset points", fontsize=8, color=GRIS)
    ax = axs[3][0]
    vignette(ax, "Pédales et frein à main (course de 0 à 1)", "course")
    ax.plot(fs, [dr.throttle(t) for t in ts], color=BLEU, label="gaz")
    ax.plot(fs, [dr.brake(t) for t in ts], color=ORANGE, label="frein")
    ax.plot(fs, [dr.handbrake(t) for t in ts], color=VERT, label="frein à main", ls=(0, (5, 2)))
    ax.axvline(etoile, color=GRIS, lw=0.8, ls=(0, (3, 3)))
    ax.legend(loc="upper right", fontsize=8, ncol=3)
    ax.set_xlabel("image du film (24 par seconde)")
    ax = axs[3][1]
    vignette(ax, "Patinage des roues arrière (1 : elles roulent ; 0 : bloquées)", "rapport")
    ax.plot(fs, [dr.wheelspin(t) for t in ts], color=BLEU)
    ax.axvline(etoile, color=GRIS, lw=0.8, ls=(0, (3, 3)))
    ax.set_xlabel("image du film (24 par seconde)")
    fig.text(0.01, 0.005, "Bandes grises : la cible de la glisse à la crête, 0 à 0,7 g de latérale (le mouillé), 3 à 6° "
             "de roulis. Trait pointillé : l'étoile.", fontsize=8, color=GRIS)
    if av:
        h, lab = axs[0][0].get_legend_handles_labels()
        fig.legend(h, lab, loc="upper right", bbox_to_anchor=(0.99, 0.955), ncol=2, fontsize=9)
    fig.tight_layout(rect=(0, 0.015, 1, 0.94))
    chemin = os.path.join(dossier, "derapage-%s.png" % nom)
    fig.savefig(chemin, dpi=130)
    plt.close(fig)
    print("écrit", chemin)


def changement(dossier):
    cas = [c for c in voie.CAS if c[0].startswith("3,5 m en 1.9") or c[0] == "3,5 m en 1,5 s"]
    fig, axs = plt.subplots(4, 2, figsize=(11, 10.5), sharex="col")
    fig.suptitle("Changement de voie de 3,5 m à 90 km/h sur le mouillé : ce qui tient (1,92 s) et ce qui est "
                 "demandé (1,5 s)", x=0.01, ha="left", fontsize=12, fontweight="bold")
    for col, (nom, dec, _ok) in enumerate(cas):
        _m, dr = voie.essai(nom, dec)
        _R, y_of = voie.route(dec)
        t0 = voie.S0 / voie.V - 0.3
        t1 = (dec[-1][0] + dec[-1][1]) / voie.V + 1.2
        ts = [t0 + k / 240.0 for k in range(int((t1 - t0) * 240))]
        xs = [t - voie.S0 / voie.V for t in ts]
        ax = axs[0][col]
        vignette(ax, "%s : place en travers" % nom, "m")
        ax.plot(xs, [y_of(dr.s(t)) for t in ts], color=ORANGE, label="voulue (la route)")
        ax.plot(xs, [-dr.pos(t)[0] for t in ts], color=BLEU, label="simulation")
        ax.legend(loc="lower right", fontsize=8)
        for ax, (titre, unite, ys, zone) in zip(
                (axs[1][col], axs[2][col], axs[3][col]),
                (("Glisse et roulis", "°", None, None),
                 ("Accélération latérale", "g", [dr.alat(t) / D.G for t in ts], (-0.7, 0.7)),
                 ("Lacet de la caisse", "°/s", [dr.yaw_rate(t) for t in ts], None))):
            vignette(ax, titre, unite, zone)
            if ys is None:
                ax.plot(xs, [dr.slip(t) for t in ts], color=BLEU, label="glisse")
                ax.plot(xs, [dr.roll(t) for t in ts], color=ORANGE, label="roulis")
                ax.plot(xs, [dr.steer(t) for t in ts], color=VERT, label="roues avant", ls=(0, (5, 2)))
                ax.legend(loc="upper right", fontsize=8, ncol=3)
            else:
                ax.plot(xs, ys, color=BLEU)
        axs[3][col].set_xlabel("secondes depuis le début du changement de voie")
    fig.text(0.01, 0.005, "Bande grise : ± 0,7 g, ce que le mouillé tient. Un S de 3,5 m en 1,5 s demande 0,92 g : la "
             "berline le fait en retard (0,40 m d'écart), sans tête-à-queue.", fontsize=8, color=GRIS)
    fig.tight_layout(rect=(0, 0.015, 1, 0.97))
    chemin = os.path.join(dossier, "changement-de-voie.png")
    fig.savefig(chemin, dpi=130)
    plt.close(fig)
    print("écrit", chemin)


if __name__ == "__main__":
    dossier = sys.argv[1]
    os.makedirs(dossier, exist_ok=True)
    avant = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else None
    derapage("P2", 108, 222, PC.ETOILES[2], 1.0, PC.CRETES[0], avant, dossier)
    derapage("P5", 408, 510, PC.ETOILES[5], -1.0, PC.CRETES[1], avant, dossier)
    changement(dossier)
    _ = math
