# Le parcours unique de la berline : un seul trajet roulé en entier, de l'avenue à la pointe, sans saut (SPEC §18.55,
# 17 novembre 2026 : « il y a des coupes de plan en plein milieu, c'est pas fluide »). La route est la vraie chaussée
# de la ville (docs/cinematique-plan-de-ville.md) : l'avenue, le rond-point, la rue des enseignes, le quai, le pont
# (sa montée, sa crête, sa descente), le port, la jetée, la pointe. Une seule caméra, le bras commun de poursuite, de
# dos, à 2,4 m. Le rendu le découpe en tronçons (SHOTS : une scène par lieu, ses voisins chargés par ville.py) ; à
# chaque raccord la berline et la caméra ont exactement le même état des deux côtés : ce ne sont pas des coupes. Les
# six étoiles sont des instants de la conduite (ETOILES), pas des coupes. Python pur.
#
# Le 18 novembre (SPEC §18.61, « les dérapages ne sont pas naturels encore ») : la berline est SIMULÉE
# (dynamique.simulate : pneus, transferts de charge, conducteur). L'ancienne conduite dessinée (motion.drive et ses
# dérapages) n'est plus que le PLAN du conducteur : la route, le profil de vitesse et son horaire, dont sortent les
# tronçons (START, FIN6_FRAMES) et les étoiles 1, 3, 4, 6, figés. DRIVE est la voiture simulée qui le suit.
import math
import os
import sys

import dynamique as D
import motion as M

FPS = 24.0

# ---- la route (abscisses s en m depuis la première image du film)
# Deux longueurs reprises du découpage d'avant (le 13 novembre), que la ville fixe : AV_AVANT, l'avenue roulée avant
# l'ancienne ouverture (la berline part de plus loin, déjà lancée) ; MONTEE, la montée du pont, autrefois sautée
# (l'ellipse de 329,89 m de P3 à P4), que la berline roule maintenant. Les abscisses d'avant se lisent donc s − AV_AVANT
# côté ville (l'avenue, le rond-point, la rue) et s − AV_AVANT − MONTEE côté eau (le pont, le port, la jetée).
# Le 17 novembre au soir (« 30 s déjà long », SPEC §18.55) : la berline part 39 m plus loin sur l'avenue (AV_AVANT
# 90 → 51), et le pont est raccourci de motion.PONT_RACCOURCI (205 m) : la montée se raccourcit d'autant, le port et
# la jetée se rapprochent de la ville (l'ancre de P4 recule d'autant dans le repère du pont, donc leurs poses).
AV_AVANT = 51.0
PONT_RACCOURCI = M.PONT_RACCOURCI
MONTEE = 329.913205 - PONT_RACCOURCI        # réglée pour que la rue tombe sur le quai (B_VILLE, test à 1 cm)
LANE = 1.45                                 # m : de l'axe de la rue (x 0,35) à la voie intérieure du pont (x 1,80)
# le rond-point (à gauche) : début nominal, rayon, angle. 90° : ses branches sont à angle droit (plan de ville)
S_ARC2, R2, A2 = 65.0 + AV_AVANT, 30.0, 90.0
L_ARC2 = R2 * math.radians(A2)
# la droite du rond-point au port : la rue (71 m), le boulevard du quai, le pont (110 m) jusqu'à son pied, le
# terre-plein ; la voie change de LANE m sur le plat du pont, de son début (y −320) à 70 m plus loin (LANE_S, LANE_L)
L_MID = 83.49 + MONTEE
S_PIED = 181.156654 + AV_AVANT + MONTEE              # l'abscisse de l'ancre de P4, au pied de la rampe côté port
Y_PIED = -5.69 - PONT_RACCOURCI                      # sa place sur le pont (x 1,80), 0,69 m avant le pied du tablier
S_DECK = S_PIED - (Y_PIED - M.PONT_Y_START)          # l'abscisse du début du tablier (y −320 du pont)
LANE_S, LANE_L = S_DECK + 3.0, 35.0                  # où la voie change, la longueur de chacun de ses deux arcs
S_ARC5, R5, A5 = S_ARC2 + L_ARC2 + L_MID, 22.0, 50.0   # le virage du port (à droite)
L_ARC5 = R5 * math.radians(A5)
# la jetée (cap −50° dans la ville) puis l'arrivée sur la pointe : la berline file dans sa voie jusqu'au bout de la
# jetée (y_D 402, 2 m sur la pointe), tourne de ARR_A degrés à gauche sur ARR_R m et s'arrête ARR_END m plus loin, au
# cap où la fin à six étoiles la cerne (fin6_orbite)
S_P6_ANCRE = 244.726551 + AV_AVANT + MONTEE          # la berline en (81,75 ; 344,42) de la jetée (scène D)
S_JETEE_FIN = S_P6_ANCRE + (402.0 - 344.42)
ARR_R, ARR_A, ARR_END = 40.0, 25.0, 3.0
L_ARR = ARR_R * math.radians(ARR_A)
S_ARRET = S_JETEE_FIN + L_ARR + ARR_END              # le bout de la route : l'arrêt

# ---- le profil de vitesse (SPEC §18.55) : lancée sur l'avenue, pointes vers 130 km/h en ligne droite, freinage
# franc avant le rond-point et le virage du port, l'arrêt sur la pointe. motion.drive tient les limites de la berline
# sur route mouillée (latérale 6,5, freinage 7, accélération 3, cercle 7,5 m/s², à-coup 12 m/s³) : là où la vitesse
# voulue dépasse l'adhérence, elle freine plus tôt et plus fort, jamais l'inverse.
# L'avenue (17 novembre au soir) : une croisière tenue à 85 km/h, l'ouverture calme (SPEC §18.36), sans la relance à
# 121 km/h d'avant : le freinage du rond-point ne commence qu'à 3,4 s, l'étoile 1 tombe juste avant, en croisière.
V_LANCEE = 85.0 / 3.6                       # la première image : déjà lancée, et toute l'avenue
V_MAX = 130.0 / 3.6                         # la vitesse voulue en ligne droite après le rond-point
# le rond-point : vitesse d'arc, où elle la demande et où elle remet les gaz (m après S_ARC2, sortie de l'anneau)
VA2, B2, G2 = 13.4556, 10.0, 56.2252
# le port (à droite) : 22 m de rayon (feuille §9.1)
VA5 = math.sqrt(6.5 * 0.92 * R5)            # 11,47 m/s : la latérale visée par motion.drive sur ce rayon
B5, G5 = 5.0 * R5 / 15.0, 9.0 * R5 / 15.0   # le freinage traîné et la remise des gaz, à l'échelle du rayon
E5_GAIN = 1.15                              # l'entrée du port adoucie de 15 % : 105 °/s² de lacet de caisse (120)
V_POINTE = 50.0 / 3.6                       # la vitesse voulue en arrivant sur la pointe, avant l'arrêt
# ---- les deux dérapages du film, dessinés (motion.drive, lim["derapages"]) : une berline lourde à propulsion sur le
# mouillé, vue de dos par le bras commun (« le dérapage est mou », 13 novembre). Le conducteur la provoque : un appel
# bref (pied levé et un léger coup de volant vers l'extérieur, la caisse part de 1 à 2° du mauvais côté), puis
# l'arrière déchargé décroche, de 5° à la crête en une demi-seconde (70 à 80 °/s au plus fort), tenu une seconde
# contre-braqué, rattrapé en trois quarts de seconde (au port : un seul petit retour de l'autre côté, sans pompage).
# Les nœuds : (s depuis le passage de l'abscisse, glisse °, vitesse °/s) ; entre deux, des quintiques
# (motion._hermite5). La route ne change pas : la caisse pivote autour de son centre, qui garde sa trajectoire. Les
# pneus arrière qui frottent en travers freinent la voiture (slip_drag m/s² par degré) ; au rond-point le pied reste
# levé tant qu'elle glisse, au port elle tient le grand dérapage au tiers des gaz (une propulsion se tient en glisse à
# l'accélérateur) contre un frottement plus fort (0,097 m/s² par degré). Les roues avant : contre-braquage de
# 0,78 × la glisse (motion.drive, counter), 22 à 28° au plus fort. L'appel du rond-point à 5,4 m après le début de
# l'arc, celui du port 10,6 m avant le sien (le coup de volant avant le virage) : les places d'avant, sur la route.
#
# Le 17 novembre au soir (« le dérapage est vraiment pas naturel ») : ces nœuds faisaient tourner la caisse comme une
# platine, autour de son centre resté sur la route, à 400–500 °/s² de lacet (une berline sur le mouillé n'en a pas le
# couple), la crête du port en pointe, sans tenue, les roues avant à 0,78 × la glisse quel que soit le mouvement.
# Les deux dérapages sont maintenant tirés d'impulsions de lacet (motion.impulsions : la dérivée seconde de la glisse,
# 230 °/s² au plus, résolue pour passer par les cibles) :
#  - l'appel : le coup de volant vers l'extérieur, la caisse part de 1,6 à 1,8° du mauvais côté (le balancier) ;
#  - le décrochage : l'arrière déchargé part, monte à 70–78 °/s, puis le contre-braquage le cueille à la crête (29° au
#    rond-point, 36° au port, aux mêmes instants qu'avant : les étoiles 2 et 5 ne bougent pas) ;
#  - la tenue : une seconde de glisse vivante, le pied qui dose (au rond-point un creux de 1,5°, une reprise ; au
#    port elle se tasse de 36 à 34,6°, rattrapée assez tôt pour que P6 s'ouvre sur 4° de glisse, comme avant) ;
#  - le rattrapage : trois quarts de seconde, l'arrière qui revient, passe un peu de l'autre côté (1,6° au rond-point,
#    3,5° au port) et se pose.
# pulses : (début, fin, bord) en s depuis le passage de l'abscisse s ; cibles : (« v » glisse ° | « d » vitesse °/s, t,
# valeur). La glisse est tenue entre la caisse et la vitesse vraie de son centre, qui part vers l'extérieur
# (LIM["pivot"] × sin glisse, filtré : pivot_tau à l'attaque et au relâché, pivot_smooth) : l'arrière part large
# (1 à 1,3 m), l'avant revient sur sa ligne pendant la tenue, la voiture sort un peu large et rejoint sa voie en
# ligne droite, sa latérale dans l'adhérence du mouillé (au rond-point vite, 0,35 s : elle doit passer le trou des
# plots de P3 ; au port sans hâte, 0,9 s : le bras ne la rattrape pas d'un coup au début de P6). Les roues avant visent la vitesse de leur essieu, plus la
# dérive de l'effort latéral (LIM["steer_geo"], front_slip ° à la latérale du mouillé, 90 °/s aux mains) : le
# contre-braquage en découle (22 à 30° au plus fort). trainee : les nœuds d'avant, qui ne règlent plus que le
# frottement des pneus arrière et les gaz (drag, gas) : la vitesse, donc les raccords, les étoiles et la durée, sont
# exactement ceux d'avant (test_motion.test_parcours).
DERAP2 = dict(s=S_ARC2 + 5.4, side=1.0, reaction=3.0,
              pulses=[(-0.38, -0.06, 0.10), (-0.08, 0.46, 0.14), (0.42, 0.87, 0.14),
                      (0.87, 1.02, 0.06), (1.00, 1.19, 0.08), (1.17, 1.32, 0.06),
                      (1.32, 2.10, 0.22), (2.08, 2.86, 0.22), (2.86, 3.10, 0.10), (3.08, 3.34, 0.10)],
              cibles=[("v", 0.02, -1.6), ("v", 0.87, 29.0), ("d", 0.87, 0.0), ("v", 1.10, 27.5), ("v", 1.32, 28.0),
                      ("d", 1.32, 0.0), ("v", 2.86, -1.6), ("d", 2.86, 0.0), ("v", 3.34, 0.0), ("d", 3.34, 0.0)],
              trainee=[(0.0, 0.0, 0.0), (0.15, -1.2, 0.0), (0.42, 7.0, 70.0), (0.60, 19.6, 70.0),
                       (0.85, 29.0, 0.0, -90.0), (1.50, 25.5, -14.0), (1.92, 8.0, -40.0), (2.32, 2.0, -6.0),
                       (2.70, 0.0, 0.0)])
DERAP5 = dict(s=S_ARC5 - 10.6138898, side=-1.0, reaction=0.4,
              pulses=[(-0.40, -0.08, 0.10), (-0.10, 0.50, 0.14), (0.46, 0.95, 0.14),
                      (0.95, 1.13, 0.08), (1.11, 1.29, 0.08),
                      (1.29, 2.07, 0.22), (2.05, 2.83, 0.22), (2.83, 3.10, 0.10), (3.08, 3.40, 0.10)],
              cibles=[("v", 0.0, -1.8), ("v", 0.95, 36.0), ("d", 0.95, 0.0), ("v", 1.29, 34.6),
                      ("d", 1.29, 0.0), ("v", 2.83, -3.5), ("d", 2.83, 0.0), ("v", 3.40, 0.0), ("d", 3.40, 0.0)],
              trainee=[(0.0, 0.0, 0.0), (0.17, -1.6, 0.0), (0.47, 8.0, 80.0), (0.67, 24.0, 80.0),
                       (0.95, 36.0, 0.0, -110.0), (1.62, 30.0, -14.0), (2.24, 9.0, -48.0), (2.70, -4.0, 0.0),
                       (3.22, 0.0, 0.0)],
              drag=0.0967, gas=0.3333, pivot_tau=(0.6, 0.9), pivot_smooth=0.9)
# ---- la voie de la berline : le slalom dans la circulation (SPEC §18.62, 18 novembre : « d'autres voitures et un
# slalom… un peu des mouvements même dans la ligne droite pour esquiver »). LA trajectoire voulue de la berline est la
# route (ROUTE, ses voies, ses deux dérapages) plus un écart latéral voie(s), en m, positif à gauche, fonction de
# l'abscisse s de la route. C'est la seule entrée du slalom : la conduite cinématique (motion.drive, lim["voie"])
# l'ajoute aux positions sans toucher à la vitesse (durées, raccords, étoiles inchangés) ; la conduite physique
# (branche film/physique) la suit comme cible de son conducteur. Ni lacet ni roulis dessinés : ils découlent du
# chemin.
#
# SLALOM : (début s, longueur m, écart m) ; chaque manœuvre déplace la cible de `écart` en `longueur` mètres, les
# manœuvres s'additionnent. Le profil (bascule) est la latérale en une période de sinus : elle part de zéro, monte,
# s'inverse, revient à zéro (latérale nulle aux deux bouts). Latérale de crête VOIE_K × écart × v² / longueur²
# (VOIE_K = 2π), à-coup de crête VOIE_J × écart × v³ / longueur³ (VOIE_J = 4π²).
# La limite est l'adhérence du mouillé, pas l'à-coup (18 novembre au soir, Jacques : « 12 m/s³, un seuil trop
# prudent ») : chaque changement de voie tient 5 m/s² de latérale au plus (μ 0,7 : 6,9 m/s² au cercle), et le cercle
# avec le freinage ou les gaz reste sous 6,5 ; l'à-coup monte à 17 m/s³ (23 dans la rue), le plafond des tests à 25.
# D'où des écarts de 2,6 à 3,8 m en 1,9 à 2,3 s (2π × écart / durée² : 3 m à 5 m/s² demandent 1,9 s), 1,2 m en
# 1,4 s dans la rue (8 m entre bordures).
# Zéro dans les deux dérapages (le rond-point de S_ARC2 − 15 à la sortie, le port de DERAP5 à la jetée) et dans le
# trou du barrage (s 184 à 191, les plots et les agents à 0,5 m de la caisse).
VOIE_K = 2.0 * math.pi
VOIE_J = 4.0 * math.pi ** 2


def bascule(u, doux=False):
    """La marche du slalom : 0 avant u = 0, 1 après u = 1, entre les deux u − sin(2πu) / 2π ; doux : la septique
    35u⁴ − 84u⁵ + 70u⁶ − 20u⁷, à-coup nul aux deux bouts (latérale 7,5 et à-coup 52,5 au lieu de 2π et 4π²), pour
    une manœuvre qui finit juste avant un dérapage : la caisse n'y garde pas de roulis."""
    if u <= 0.0:
        return 0.0
    if u >= 1.0:
        return 1.0
    if doux:
        return u ** 4 * (35.0 + u * (-84.0 + u * (70.0 - 20.0 * u)))
    return u - math.sin(2.0 * math.pi * u) / (2.0 * math.pi)


SLALOM = (
    # l'avenue, un S à droite : A roule à 35 km/h devant elle sur E1 ; elle déboîte sur E2 (2,7 m ; la patrouille 1
    # tient la voie d'en face, à sa gauche), la double par la droite, et revient sur E1 avant le freinage du
    # rond-point (doux, fini à s 100 : la caisse ne garde pas de roulis à l'entrée du dérapage ; à s 102 le Δ² du
    # roulis de P2 passait 0,15°/image²)
    (8.0, 44.0, -2.7), (52.0, 48.0, 2.7, "doux"),
    # la rue (8 m entre bordures) : D déboîte de la gauche, le nez dans sa voie ; elle s'écarte à droite (1,2 m) et
    # garde la droite : elle prend la voie de droite du pont (2,6 m de plus, sans obstacle : un choix de voie,
    # pas une esquive), derrière B1 qui y roule à 70 km/h. Elle la rattrape, déboîte à gauche (3,8 m contre la
    # route, qui se décale elle-même de 1,3 m à droite : 2,5 m de vrai) et la double avant le freinage du port
    (190.6, 26.0, -1.2), (216.6, 46.0, -2.6), (263.0, 65.0, 3.8),
    # la jetée, un S à gauche (la chaussée ne laisse que 1 m à droite de sa voie) : J1 roule à 20 km/h devant elle ;
    # elle la double par la voie d'en face (2,8 m), J2 arrive en face, appels de phares, elle se rabat (2,8 m) dans
    # le freinage de la pointe
    (396.5, 30.0, 2.8), (432.0, 38.0, -2.8),
)


def voie_dessinee(s):
    """L'écart latéral (m, positif à gauche) à la route, à l'abscisse s, du slalom de la conduite dessinée : la somme
    des manœuvres de SLALOM. Gardé pour mémoire et pour diag/audit_trafic.py : la berline ne le suit plus."""
    return sum(m[2] * bascule((s - m[0]) / m[1], len(m) > 3 and m[3] == "doux") for m in SLALOM)


# Le même slalom, dosé pour la conduite simulée (branche film/physique, dynamique.Plan(..., voie=voie_simulee)) : là,
# la voiture glisse, et la demande (2π × écart / durée²) peut passer l'adhérence. Mesuré par l'agent de la simulation
# à 80 km/h sur le mouillé : 0,65 g → 3,8° de glisse, à peine lisible ; 0,8 à 0,9 g → 6 à 8°, la glisse légère voulue ;
# 1,05 g → 12° et 0,8 m hors de la ligne ; jamais au-dessus de 1,0 g. La conduite dessinée, elle, ne glisse pas : à
# ces demandes elle prendrait 8 m/s² de latérale sans broncher et son roulis claquerait (Δ² 0,36 à 0,60°/image² pour
# 0,15, la coupe OUV → P1 à 1,07° de roulis d'écart) ; elle garde SLALOM, borné à 5 m/s².
# Chaque ligne est passée dans dynamique.simulate sur le film entier (diag/audit_trafic_sim.py, film/physique
# 0003718) et retenue là où ses voisines tiennent aussi (le dérapage du port bascule sinon : le déboîtement du pont
# pris 2 m plus tard l'ouvre de 0,6 à 1,6 m hors de la route, 3 m plus tard et 2 m plus court à 3,2 m) :
#  - l'avenue, vitesse tenue : 3 m à 0,82 et 0,75 g, glisse 6,5° et 5,9°, 0,17 m hors de la ligne au plus ;
#  - la rue et le pont, où le plan accélère à 2,8 m/s² : les roues arrière poussent déjà, la même glisse vient à
#    0,65 à 0,7 g (1,5 m en 1,25 s : 4,2° ; 3,8 m en 1,85 s : 6,4°, 0,15 m) ; plus sec, la berline prend du retard
#    sur l'horaire, entre trop vite dans le port et son dérapage s'ouvre ;
#  - la jetée : après s 402 (la berline simulée sort du dérapage du port 1 m large), retour fini avant le freinage
#    de la pointe (s 459) ; 0,63 et 0,71 g, glisse 4,5° et 6,3°.
# Reste à la simulation : sur la jetée le plan accélère à 2,8 m/s², le S coûte 2 à 3 m d'horaire et la berline
# arrive en retard dans le freinage de la pointe : elle passe l'arrêt de 0,66 m au pas (1 à 3 km/h de l'image 690 à
# l'image 723 ; à l'heure, image 692,7, sans slalom). Aucun des 50 dosages essayés de la jetée ne l'évite (0,45 à
# 0,9 g : arrêt entre 711 et 786) : à caler dans le freinage final de la simulation (SPEC §18.62).
SLALOM_SIMULE = (
    (8.0, 36.0, -3.0), (52.0, 40.0, 3.0, "doux"),
    (190.6, 24.5, -1.5), (216.6, 46.0, -2.3), (257.0, 52.0, 3.8),
    (402.5, 24.0, 2.8), (430.0, 29.0, -2.8),
)


def voie_simulee(s):
    """voie(s) pour la conduite simulée : la somme des manœuvres de SLALOM_SIMULE (l'entrée de dynamique.Plan.voie)."""
    return sum(m[2] * bascule((s - m[0]) / m[1], len(m) > 3 and m[3] == "doux") for m in SLALOM_SIMULE)


# Fusion v10 (SPEC §18.67) : la berline est la voiture simulée, il n'y a plus de conduite dessinée à l'image. LA ligne
# du slalom est donc celle dosée pour la simulation, pour tout ce qui la lit : le conducteur (dynamique.Plan.voie), le
# bras (travel_route, visee_u), l'hélicoptère (pos_route), la patrouille 1 du pont (p4_pont._voie_x), les contrôles
# (check, test_trafic). SLALOM et voie_dessinee restent la trace du dosage borné à 5 m/s² de film/trafic-audit.
voie = voie_simulee


# (fusion v10, SPEC §18.67 : pas de voie dans LIM. Ce plan dessiné n'est plus que l'horaire du conducteur, compté le
# long de la route ; le slalom entre dans la simulation, dynamique.Plan(..., voie=voie), plus bas.)
LIM = dict(slip_drag=0.07, counter=0.78, derapages=[DERAP2, DERAP5], pivot=1.4, pivot_tau=(0.6, 0.35),
           pivot_smooth=0.45, steer_geo=True, front_slip=4.0, steer_rate=90.0)
JERK = 12.0 * 0.72
T_SPAN = (-2.0, 40.0)                       # s : la table de la conduite (au-delà de l'arrêt, elle reste arrêtée)


def _ease(radius):
    """La longueur d'adoucissement d'un arc : celle que motion.drive prendrait pour lui seul."""
    lat = LIM.get("lat", 6.5) * LIM.get("margin", 0.92)
    return max(2.0, lat * math.sqrt(lat * radius) / JERK)       # 9,27 m pour 30 m ; 6,55 m pour 15 m


def _route(pieces, ds=0.1):
    """pieces = [(longueur, courbure, adoucissement)] : chaque arc lissé par deux moyennes glissantes de SA longueur
    (motion.make_route n'en prend qu'une pour toute la route : l'arc de 15 m y perdait son rayon). La courbure d'un
    arc est corrigée de l'arrondi de sa longueur au pas : il tourne de son angle exact (90,00° et non 89,95)."""
    n = sum(max(1, int(round(L / ds))) for L, _, _ in pieces)
    kappa, i = [0.0] * n, 0
    for L, k, ease in pieces:
        m = max(1, int(round(L / ds)))
        if k:
            k *= L / (m * ds)
            w = max(1, int(round(ease / ds)) | 1)
            pad = 2 * w
            raw = [0.0] * (i + pad) + [k] * m + [0.0] * (n - i - m + pad)
            sm = M._box(M._box(raw, w), w)[pad:pad + n]
            kappa = [a + b for a, b in zip(kappa, sm)]
        i += m
    return M.Route(0.0, 0.0, 0.0, kappa, ds)


def _drive():
    """(la route, la conduite)."""
    e2, e5 = _ease(R2), _ease(R5) * E5_GAIN
    k_lane = LANE / LANE_L ** 2                       # deux arcs opposés de LANE_L m : LANE m vers la droite
    a_mid = LANE_S - (S_ARC2 + L_ARC2)
    route = _route([(S_ARC2, 0.0, 0.0), (L_ARC2, 1.0 / R2, e2), (a_mid, 0.0, 0.0), (LANE_L, -k_lane, 15.0),
                    (LANE_L, k_lane, 15.0), (L_MID - a_mid - 2 * LANE_L, 0.0, 0.0), (L_ARC5, -1.0 / R5, e5),
                    (S_JETEE_FIN - S_ARC5 - L_ARC5, 0.0, 0.0), (L_ARR, 1.0 / ARR_R, 8.0), (ARR_END, 0.0, 0.0)])
    speed = [(0.0, V_LANCEE), (S_ARC2 + B2 - 0.1, V_LANCEE), (S_ARC2 + B2, VA2), (S_ARC2 + G2, VA2), (S_ARC2 + G2 + 0.1, V_MAX),
             (S_ARC5 + B5 - 0.1, V_MAX), (S_ARC5 + B5, VA5), (S_ARC5 + G5, VA5), (S_ARC5 + G5 + 0.1, V_MAX),
             (S_JETEE_FIN - 0.1, V_MAX), (S_JETEE_FIN, V_POINTE)]
    return route, M.drive(route, speed, t0=0.0, stop=True, kind="hero", drift=0.0, lim=LIM,
                          ease=max(e2, e5), t_span=T_SPAN)


ROUTE, PLAN = _drive()                      # le plan du conducteur : la conduite dessinée d'avant (vitesse, horaire)
T_PLAN = PLAN.t_stop                        # s : l'arrêt du plan sur la pointe (la durée de FIN6 en sort, figée)

# ---- les tronçons du rendu : une scène par lieu, sa fenêtre de la conduite (images). Leurs raccords tombent aux
# joints des lieux, là où la berline passe d'une scène à la suivante ; aucun n'est une coupe (même état des deux
# côtés, même monde : ville.py charge les voisins). Calculés sur la conduite depuis les joints (JOINTS, abscisses de
# la route : côté ville comptées depuis AV_AVANT, côté eau depuis le pied du pont) ; test_motion.test_parcours
# vérifie qu'ils tombent où ils doivent (python3 tools/film3d/parcours.py les imprime).
JOINTS = (("P1", 22.501 + AV_AVANT),                  # l'avenue, avant son freinage d'avant (OUV et P1 : scène A)
          ("P2", 53.263 + AV_AVANT),                  # l'avenue contre le rond-point (y_F −19)
          ("P3", 112.968 + AV_AVANT),                 # dans la rue, 11 m après le rond-point
          ("P4", 188.563 + AV_AVANT),                 # la tête de pont (y −328)
          ("P5", S_PIED + 0.39),                      # le pied de la rampe
          ("P6", S_PIED + 33.03),                     # le terre-plein du port contre la jetée
          ("FIN6", S_PIED + 119.07))                  # l'entrée de la pointe
_TS = []


def _t_at(s):
    """L'instant (s) où le plan passe l'abscisse s (sa vitesse intégrée au 1/240 de seconde) : les horaires figés."""
    if not _TS:
        h, acc, k = 1.0 / 240.0, 0.0, 0
        while k * h < T_PLAN + 1.0:
            _TS.append(acc)
            acc += 0.5 * (PLAN.speed(k * h) + PLAN.speed((k + 1) * h)) * h
            k += 1
    lo, hi = 0, len(_TS) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        lo, hi = (mid, hi) if _TS[mid] < s else (lo, mid)
    return (lo + (s - _TS[lo]) / max(1e-9, _TS[hi] - _TS[lo])) / 240.0


START = {"OUV": 0}                # première image globale de chaque tronçon (0 = OUV/1)
START.update({n: int(round(_t_at(s) * FPS)) for n, s in JOINTS})
_NOMS = ("OUV",) + tuple(n for n, _ in JOINTS)
SHOTS = tuple((a, START[b] - START[a]) for a, b in zip(_NOMS, _NOMS[1:-1] + ("FIN6",)))
TOTAL = START["FIN6"]             # la poursuite, jusqu'à l'entrée de la pointe
# la fin à six étoiles (fin6_orbite) prolonge la conduite sans coupe : le freinage, l'arrêt, puis l'orbite, et
# FIN6_TENUE images après l'arrêt (les mains levées, l'image posée) ; le film entier tient sous 30 s
FIN6_TENUE = 27
FIN6_FRAMES = int(math.ceil(T_PLAN * FPS)) + FIN6_TENUE - TOTAL


def _s_plan(t, _tab={}):
    """L'abscisse du plan à l'instant t (s) : la vitesse du plan intégrée au 1/240 de seconde."""
    if not _tab:
        h, k0 = 1.0 / 240.0, int(T_SPAN[0] * 240.0)
        s, out = 0.0, {0: 0.0}
        for k in range(1, int(T_SPAN[1] * 240.0)):
            s += 0.5 * (PLAN.speed((k - 1) * h) + PLAN.speed(k * h)) * h
            out[k] = s
        s = 0.0
        for k in range(-1, k0 - 1, -1):
            s -= 0.5 * (PLAN.speed((k + 1) * h) + PLAN.speed(k * h)) * h
            out[k] = s
        _tab.update(out)
    u = t * 240.0
    k = int(math.floor(u))
    a, b = _tab.get(k), _tab.get(k + 1)
    if a is None or b is None:
        return _tab[max(_tab) if u > 0 else min(_tab)]
    return a + (b - a) * (u - k)


# ---- la berline simulée (dynamique.simulate) sur la route du plan (SPEC §18.61). PLAN, la conduite dessinée d'avant,
# n'est plus que l'horaire du conducteur (vitesse au fil du temps : tronçons, étoiles et durée en sortent, inchangés) ;
# ses dérapages dessinés (LIM["derapages"]) ne servent plus qu'à cet horaire. Les deux dérapages du film sont des
# gestes du conducteur simulé (dynamique.Geste), aux instants des étoiles 2 et 5 :
#  - t : l'instant de la crête ; peak, sag : la glisse qu'il vise à la crête (°) et ce qu'il en rend pendant la tenue
#    (la voiture reste 1 à 4° sous sa visée : 30° au rond-point, 36° au port) ; tenue : s de la crête au rattrapage ;
#  - dv, dv_t : il arrive dv m/s sous l'horaire, pris en freinant dv_t s plus tôt (une berline en travers tient moins
#    de vitesse dans un virage que sur ses quatre roues) ; il les rend une fois posée, en ligne droite ;
#  - frein_jet : ce qu'il garde de frein au pied en la jetant (le freinage traîné : l'avant chargé mord, l'arrière
#    délesté part, aidé du frein à main) ; gaz_avant : s avant la crête où il passe du frein aux gaz (au port il
#    freine jusqu'à la crête : la berline arrive vite et se pose en travers pour ralentir) ;
#  - reaction : le gain du retard de l'opérateur (CAM_REACT) sur ce dérapage.
# Le reste sort de la simulation : la montée de la glisse, le contre-braquage, le lacet, le patinage, la ligne, le
# roulis. python3 tools/film3d/lab/dynamique/voir.py P2|P5 clé=valeur… pour essayer un geste, bilan.py pour le film.
DERAPAGES = [
    dict(side=1.0, t=153 / 24, peak=31.0, sag=3.0, tenue=0.35, gaz_avant=0.2, frein_jet=0.4, dv=1.2, dv_t=2.6,
         reaction=3.0),
    dict(side=-1.0, t=453 / 24, peak=40.5, sag=5.0, tenue=0.4, gaz_avant=0.0, frein_jet=0.4, dv=2.0, dv_t=4.0,
         reaction=0.4),
]
# Le slalom (voie, SPEC §18.62) est la ligne que vise le conducteur : roulis, dérive arrière et contre-braquage des
# changements de voie sortent de la simulation comme ceux des dérapages (DRIVE.voie_err, DRIVE.rear_slip).
DRIVE = D.simulate(D.Plan(ROUTE, _s_plan, PLAN.speed, PLAN.along, S_ARRET, voie=voie), DERAPAGES, t_span=T_SPAN)
T_ARRET = DRIVE.t_stop                      # s : l'arrêt de la berline simulée sur la pointe

# ---- les six étoiles : des instants de la conduite (images globales, 0 = la première ; temps = image / 24). Le site
# les lit ici (une à cinq étoiles : l'image gelée sur place à l'instant de la dernière étoile gagnée ; six : la fin
# FIN6 prolonge la conduite). Chacune à un moment lisible de la route, calculée sur la conduite ;
# test_motion.test_parcours les vérifie (dans leur tronçon, l'étoile 1 hors de tout freinage, 3 à 5 s d'écart).


def _etoiles():
    pas = [k / 240.0 for k in range(int(T_ARRET * 240))]
    frein = next(t for t in pas if PLAN.along(t) < -0.3)                   # le freinage du rond-point (le plan)
    y_crete = M.PONT_Y_CREST
    return {
        1: int(math.floor(frein * FPS)) - 4,                   # l'avenue, en croisière, le rond-point en vue
        2: int(round(DERAPAGES[0]["t"] * FPS)),                # le rond-point, à la crête du dérapage (le geste)
        3: int(round(_t_at(136.741 + AV_AVANT) * FPS)),        # la rue, la berline passe le barrage (s_B 126)
        4: int(round(_t_at(S_DECK + y_crete - M.PONT_Y_START) * FPS)),   # le pont, la crête
        5: int(round(DERAPAGES[1]["t"] * FPS)),                # le port, à la crête du dérapage (le geste)
        6: int(round(_t_at(S_P6_ANCRE + 360.0 - 344.42) * FPS)),         # la jetée, l'eau des deux côtés (y_D 360)
    }


ETOILES = _etoiles()
ETOILE_LIEUX = {1: "avenue", 2: "rond-point", 3: "barrage", 4: "pont", 5: "port", 6: "jetée"}


def t_of(shot, frame):
    """L'instant du parcours (s depuis OUV/1) de l'image `frame` (1 = la première) du tronçon."""
    return (START[shot] + frame - 1) / FPS


CAP_B = A2                                     # la droite après le rond-point : +90° exacts (la route le tient)
CAP_D = A2 - A5                                # la droite après le port : +40°
# tronçon : (référence, où la berline s'y trouve dans la scène, cap de la droite de la scène qui monte vers +y) ; la
# référence est un point de la route ("s", abscisse) : chaque lieu reste à sa place dans la ville quel que soit le
# profil de vitesse. Ce sont les ancres du 13 novembre (plan de ville §2.1), reportées en abscisses.
#  - OUV, P1 (l'avenue) : la berline en (1,75 ; 288,0) de la scène A 23,15 m après l'ancienne ouverture ;
#  - P2 : la voie de l'avenue (x 1,75), 20 m avant le début nominal du rond-point ; sortie sur y = 0,35 de son repère
#    (l'îlot en (0, 0)), la voie de P3 ;
#  - P3 : (0,35 ; 123,30) de la rue ; P4 : (1,80 ; −5,69) du pont, au pied de la rampe ; P5 : (5,25 ; 35,07) du port,
#    20 m avant le virage ; P6 : (81,75 ; 344,42) de la jetée.
_Y_EXIT2 = ROUTE.at(S_ARC2 + L_ARC2 + 15.0)[1]     # la droite de sortie du rond-point (route) : y
ANCHOR = {
    "OUV": (("s", 23.148148 + AV_AVANT), (1.75, 288.0), 0.0),
    "P1": (("s", 23.148148 + AV_AVANT), (1.75, 288.0), 0.0),
    "P2": (("s", S_ARC2 - 20.0), (1.75, 0.35 - (_Y_EXIT2 - (S_ARC2 - 20.0))), 0.0),          # (1,75 ; −49,81)
    "P3": (("s", 134.040859 + AV_AVANT), (0.35, 123.30), CAP_B),
    "P4": (("s", S_PIED), (1.80, Y_PIED), CAP_B),
    "P5": (("s", S_ARC5 - 20.0), (5.25, 35.066), CAP_B),
    "P6": (("s", S_P6_ANCRE), (81.75, 344.42), CAP_D),
}
ANCHOR["FIN6"] = ANCHOR["P6"]


def placer(shot):
    """(to_scene(x, y), cap) : la transformation du parcours vers la scène du tronçon, et le cap à retrancher."""
    ref, (tx, ty), cap = ANCHOR[shot]
    ax, ay = ROUTE.at(ref[1])[:2]
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))

    def to_scene(x, y):
        dx, dy = x - ax, y - ay
        return tx + c * dx + s * dy, ty - s * dx + c * dy
    return to_scene, cap


# ---- la ville : chaque tronçon dans son lieu, chaque lieu posé sur la route
LIEU = {"OUV": "A", "P1": "A", "P2": "F", "P3": "B", "P4": "C", "P5": "E", "P6": "D", "FIN6": "D"}
# CONTINU[(A, B)] : B reprend la conduite de A à l'image suivante, au même point de la ville. Tous les raccords le
# sont : plus d'ellipse (la montée du pont est roulée).
CONTINU = {(a, b): True for (a, _), (b, _) in zip(SHOTS, SHOTS[1:])}
# Le repère de ville est celui du pont (scène C, celle de P4). La rue des enseignes (scène B) y tombe par la route
# elle-même : son axe sur l'axe du pont, son mur de quai (s = 181) sur la rive du pont (y = −325) ; MONTEE et LANE
# sont réglés pour cela (plan de ville, section (b)) ; test_motion le vérifie à 1 cm.
B_VILLE = (0.0, -506.0)
# plus d'ellipse (17 novembre) : rien de sauté entre deux tronçons (gardés pour ville.py, qui les lit encore)
SAUT = {}


def _saut(a, b):
    """(m le long, m en travers) sautés entre A prolongé d'une image et B/1 : nuls partout."""
    return 0.0, 0.0


def _to_route(shot):
    """L'inverse de placer : la scène du tronçon vers le parcours."""
    ref, (tx, ty), cap = ANCHOR[shot]
    ax, ay = ROUTE.at(ref[1])[:2]
    c, s = math.cos(math.radians(cap)), math.sin(math.radians(cap))
    return lambda x, y: (ax + c * (x - tx) - s * (y - ty), ay + s * (x - tx) + c * (y - ty))


def vers_ville(shot):
    """(to_ville(x, y), rot) : la scène du tronçon vers le repère de ville ; rot (degrés, sens trigonométrique) : la
    rotation de la scène dans la ville (p_ville = R(rot) p_scène + t)."""
    back = _to_route(shot)
    fwd, cap = placer("P4")

    def to_ville(x, y):
        return fwd(*back(x, y))
    return to_ville, ANCHOR[shot][2] - cap


def pose_ville(shot):
    """(rot, tx, ty) : la pose du lieu du tronçon dans le repère de ville, p_ville = R(rot) p_lieu + (tx, ty)."""
    f, rot = vers_ville(shot)
    return (rot,) + f(0.0, 0.0)


def hero(shot):
    """Les fonctions de l'image du tronçon (décimale admise) : pos (scène), heading et travel (degrés, 0 = +y de la
    scène, positif à gauche), slip, steer, speed, along, alat, spin (le patinage des roues arrière)."""
    to_scene, cap = placer(shot)
    t = lambda f: t_of(shot, f)                                    # noqa: E731
    return dict(pos=lambda f: to_scene(*DRIVE.pos(t(f))), heading=lambda f: DRIVE.heading(t(f)) - cap,
                travel=lambda f: DRIVE.travel(t(f)) - cap, slip=lambda f: DRIVE.slip(t(f)),
                steer=lambda f: DRIVE.steer(t(f)), speed=lambda f: DRIVE.speed(t(f)),
                along=lambda f: DRIVE.along(t(f)), alat=lambda f: DRIVE.alat(t(f)),
                spin=lambda f: DRIVE.wheelspin(t(f)))


def frames(shot):
    """Le nombre d'images du tronçon (FIN6 compris)."""
    return FIN6_FRAMES if shot == "FIN6" else dict(SHOTS)[shot]


def s_of_t(t):
    """L'abscisse de la berline sur la route à l'instant t (s) : la projection de son centre (la simulation)."""
    return DRIVE.s(t)


def vitesse_voie(t):
    """La vitesse latérale de la berline dans le slalom à l'instant t (m/s, positive vers la gauche) : celle de la
    voiture simulée, mesurée (sa vitesse en travers du cap de la route), nulle hors des tronçons du slalom
    (slalom_w). (Avant la fusion v10 : la pente de voie(s) fois la vitesse, que la voiture simulée ne suit qu'en
    retard.)"""
    w = slalom_w(t)
    return w * DRIVE.speed(t) * math.sin(math.radians(ecart_cap(t))) if w else 0.0


def pos_route(t):
    """La berline sans son slalom à l'instant t (repère du parcours) : sa place moins voie(s) en travers de la
    route. Ce que suit ce qui ne slalome pas avec elle (l'hélicoptère de la poursuite, helicos.car)."""
    x, y = DRIVE.pos(t)
    s = s_of_t(t)
    n = voie(s)
    if not n:
        return x, y
    h = math.radians(ROUTE.at(s)[2])
    return x + n * math.cos(h), y + n * math.sin(h)


def t_of_s(s):
    """L'instant (s) où la berline passe l'abscisse s (dichotomie sur s_of_t)."""
    lo, hi = T_SPAN[0], T_ARRET
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if s_of_t(mid) < s:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ---- le bras commun de la caméra : deux pôles (tau 0,12 s) sur le cap de la vitesse, filtrés sur tout le parcours
CAM_TAU, CAM_BACK, CAM_LEFT, CAM_Z = 0.12, 7.5, 0.3, 2.4
_H, _T0 = 1.0 / 240.0, -1.5
# À l'entrée de l'anneau, le cap de la vitesse prend 24°/s en une seconde : le bras à deux pôles y tournait à
# 35°/s², 4,67 m/s² par rapport à la berline au bout de ses 7,5 m (plafond 4). Là seulement, le bras filtré est
# lissé une seconde fois par une gaussienne centrée : elle n'ajoute aucun retard (une rotation régulière passe telle
# quelle) et ne rabote que l'accélération du bras. Son écart monte de 0 à CAM_SMOOTH_S sur la droite avant l'anneau
# (abscisses CAM_SMOOTH_ON, où le bras ne tourne pas), puis redescend à 0 pendant la sortie de glisse (CAM_SMOOTH_OFF)
# : le bras devance le virage de quelques images ; ailleurs, il est celui de tout le parcours.
CAM_SMOOTH_ON = (36.802 + AV_AVANT, 47.261 + AV_AVANT)
CAM_SMOOTH_OFF = (77.704 + AV_AVANT, 92.895 + AV_AVANT)
CAM_SMOOTH_S = 0.22


def _smooth_sigma(t):
    """L'écart (s) de la gaussienne du bras à l'instant t du parcours."""
    s = s_of_t(t)
    (a, b), (c, d) = CAM_SMOOTH_ON, CAM_SMOOTH_OFF
    return CAM_SMOOTH_S * M.smoothstep(a, b, s) * (1.0 - M.smoothstep(c, d, s))


# le bras tourne avec une part du slalom, en retard : une caméra de poursuite qui suit la voiture (la berline reste
# dans le cadre commun, test_motion « décalage à gauche »), la ville glisse encore de côté. (Mesuré le 18 novembre,
# diag/audit_trafic.py : cette part ne change que l'angle sous lequel on voit la caisse, 16° au plus ; ce qui déplace
# la berline dans le cadre est la visée, CAM_DEPORT plus bas.)
CAM_VOIE, CAM_VOIE_RETARD = 0.65, 0.25
# Fusion v10 (SPEC §18.67) : la berline est simulée, elle ne suit la ligne du slalom qu'en retard (0,1 à 0,2 s, 0,2 m).
# Ôter la pente de voie(s) au cap de sa vitesse laissait donc au bras jusqu'à 6° de va-et-vient à chaque changement
# de voie (14 m/s² par rapport à la berline au bout de ses 7 m). Dans les tronçons du slalom (SLALOM_ZONES, où la
# route est droite ou presque), le bras suit le cap de la ROUTE à l'abscisse de la berline, plus CAM_VOIE de l'écart
# MESURÉ entre le cap de sa vitesse et celui de la route, pris CAM_VOIE_RETARD plus tôt ; ailleurs (les deux
# dérapages, la sortie du port où elle revient d'un mètre au large) il suit comme avant le cap de sa vitesse.
# (s où le fondu commence, s où le bras est tout à la route, s où il l'est encore, s où le fondu finit)
SLALOM_ZONES = (
    (SLALOM_SIMULE[0][0] - 10.0, SLALOM_SIMULE[0][0],
     SLALOM_SIMULE[1][0] + SLALOM_SIMULE[1][1], SLALOM_SIMULE[1][0] + SLALOM_SIMULE[1][1] + 12.0),     # l'avenue
    (SLALOM_SIMULE[2][0] - 10.0, SLALOM_SIMULE[2][0],
     SLALOM_SIMULE[4][0] + SLALOM_SIMULE[4][1], SLALOM_SIMULE[4][0] + SLALOM_SIMULE[4][1] + 12.0),     # la rue, le pont
    # la jetée : la berline y arrive en revenant du large du port (4,5° d'écart à s 400) ; le fondu se fait sur ce
    # retour et le début du premier changement de voie : de s 390,5 à s 422,5 (balayé : de −6,5 à +13,5, 7,5 m/s² par
    # rapport à la berline à P6/30 ; de −4 à +16, 8,3 ; de −10 à +20, 6,8 ; de −12 à +20, 6,3 ; de −13 à +22, 6,2)
    (SLALOM_SIMULE[5][0] - 12.0, SLALOM_SIMULE[5][0] + 20.0,
     SLALOM_SIMULE[6][0] + SLALOM_SIMULE[6][1], SLALOM_SIMULE[6][0] + SLALOM_SIMULE[6][1] + 12.0))


def slalom_w(t):
    """1 quand la berline est dans un tronçon du slalom (SLALOM_ZONES), 0 ailleurs, fondu en quintique : la part de ses changements de voie que le bras (cap, roulis, côté) ne lit pas sur elle."""
    s = s_of_t(t)
    w = 0.0
    for a0, a1, b1, b0 in SLALOM_ZONES:
        u = max(0.0, min(1.0, (s - a0) / (a1 - a0), (b0 - s) / (b0 - b1)))
        w = max(w, u * u * u * (10.0 + u * (6.0 * u - 15.0)))
    return w


def ecart_cap(t):
    """Le cap de la vitesse de la berline moins celui de la route à son abscisse (degrés, positif à gauche)."""
    return (DRIVE.travel(t) - ROUTE.at(s_of_t(t))[2] + 180.0) % 360.0 - 180.0


def travel_route(t):
    """La direction que suit le bras à l'instant t (degrés) : le cap de la vitesse de la berline ; dans le slalom,
    celui de la route, plus CAM_VOIE de l'écart de la berline à ce cap CAM_VOIE_RETARD plus tôt (SPEC §18.62 : le
    bras se déporte avec elle quand elle change de voie et tourne un peu après elle ; la ville glisse de côté dans
    le cadre)."""
    tr = t - CAM_VOIE_RETARD
    return DRIVE.travel(t) - slalom_w(t) * ecart_cap(t) + slalom_w(tr) * CAM_VOIE * ecart_cap(tr)


def _cam_table():
    a1 = a2 = travel_route(_T0)
    out = []
    t_end = (TOTAL + FIN6_FRAMES) / FPS + 1.0
    for k in range(int((t_end - _T0) / _H)):
        a = travel_route(_T0 + k * _H)
        a1 += (a - a1) * _H / CAM_TAU
        a2 += (a1 - a2) * _H / CAM_TAU
        out.append(a2)
    sm = list(out)
    for k in range(len(out)):
        sg = _smooth_sigma(_T0 + k * _H)
        if sg <= 1e-4:
            continue
        n = int(3.0 * sg / _H)
        num = den = 0.0
        for j in range(-n, n + 1):
            w = math.exp(-0.5 * (j * _H / sg) ** 2)
            num += w * out[max(0, min(len(out) - 1, k + j))]
            den += w
        sm[k] = num / den
    return sm


_CAM = _cam_table()


def cam_cap(shot, frame):
    """Le cap du bras (degrés, repère de la scène du tronçon) ; image décimale admise (interpolé à 1/240 s)."""
    u = (t_of(shot, frame) - _T0) / _H
    k = max(0, min(len(_CAM) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return _CAM[k] + (_CAM[k + 1] - _CAM[k]) * f - placer(shot)[1]


# ---- la vitesse à l'image (18 novembre : « 0 impression de vitesse ») : le bras commun vit avec la berline. Il était
# rivé à elle (même distance, même hauteur, même focale, visée exacte, horizon immobile) : la berline restait figée
# au centre du cadre et rien ne disait 107 km/h. Le même bras partout, sur le temps du film (donc le même des deux
# côtés de chaque jonction) :
#  - la vitesse (q, de 45 à 107 km/h) : le bras descend (DZ), se rapproche (BACK_SPEED), s'ouvre (LENS_PEAK, au-dessus
#    de V_FOCALE) ; au gros freinage la focale se resserre (LENS_FREIN, lissée : la ville se tasse) ;
#  - l'accélération : version 1, un retard filtré (ACC, TAU) ; version 2, un ressort amorti (SPRING) entre la
#    berline et le bras, qui respire ; il se relâche et se fond avant l'arrêt de la pointe (RIG_SPRING_*) ;
#  - le côté (version 2) : vers la bordure dans les lignes droites (SIDE), sur l'axe dans les virages et au gros
#    freinage, le passage lissé d'une gaussienne centrée ; le bras recule dans les virages (TURN_BACK) ;
#  - le virage : le bras penche (ROLL ° par m/s² de latérale, retardée) ;
#  - la route : un flottement lent de 0,2 à 0,6 Hz (FLOAT), éteint à l'arrêt ; la vibration fine, au carré de la
#    vitesse, est celle de l'opérateur (motion.OPERATOR["vib_bras"], motion.vib_bras_gain : VIB).
# Hauteur, distance et focale restent celles de Jacques (2,4 m, 7,5 m, 24 mm) au pas et à l'arrêt (FIN6).
# FILM3D_VITESSE est un seul bouton : 0 le bras rivé d'avant, 1 la première version (mesurée, 18 novembre midi),
# 2 (le défaut) la version franche demandée le 18 novembre au soir (« presque identiques » en gris) : à la pointe le
# bras à 1,65 m et 6,2 m, au 18,5 mm, décalé de 0,7 m vers la bordure dans les lignes droites ; un ressort amorti
# entre la berline et le bras (aux gaz elle s'échappe de 2 à 3 m, au freinage il la rattrape de 1,5 à 2 m, et ça
# respire) ; roulis jusqu'à 3° dans les virages, vibration fine deux fois plus forte (motion.camera_operator).
RIG_LEVELS = {
    1: dict(V=(12.5, 29.8), V_FOCALE=(20.0, 29.8), LENS_PEAK=22.0, LENS_FREIN=0.4, BACK_SPEED=0.35, DZ=-0.25,
            ACC=(0.07, 0.13), TAU=0.60, ROLL=0.25, ROLL_TAU=0.25, SPEED_TAU=0.6,
            FLOAT=(0.10, 0.12, 0.25, 0.04, 0.04), FLOAT_SEED=20.0, SIDE=0.0, TURN_BACK=0.0, BRAKE_LEFT=0.0, SPRING=None, VIB=1.0),
    2: dict(V=(12.5, 29.8), V_FOCALE=(15.0, 29.8), LENS_PEAK=17.5, LENS_FREIN=1.0, BACK_SPEED=1.9, DZ=-0.75,
            ACC=None, TAU=0.60, ROLL=0.50, ROLL_TAU=0.35, SPEED_TAU=0.8,
            FLOAT=(0.15, 0.15, 0.35, 0.06, 0.05), FLOAT_SEED=20.0, SIDE=-1.0, TURN_BACK=1.2, BRAKE_LEFT=0.0,
            # le ressort : pulsation (rad/s), amortissement, gain au freinage, gain aux gaz
            # ω 0,75 rad/s (une respiration de 8 s), ζ 0,7 : 2,5 m de retard à 3 m/s² de gaz, 1,6 m d'avance à
            # 7 m/s² de freinage, en régime ; plus vif (ω ≥ 0,9), le bras rattrape la berline à l'entrée du port et
            # cache la patrouille 1 qui la remonte à sa gauche (p5_virage.PATROL_SEEN)
            SPRING=(0.75, 0.7, 1.6 * 0.5625 / 7.0, 2.5 * 0.5625 / 3.0), VIB=2.0),
}
RIG_SPRING_STOP = (6.0, 1.0)      # s avant l'arrêt : l'entrée du ressort s'éteint
RIG_SPRING_FADE = (7.0, 1.5)      # s avant l'arrêt : son écart se fond
RIG_GATE = 12.0                   # m/s : sous cette vitesse, retard, roulis, décalage et flottement s'éteignent
RIG_SIDE_LAT = (0.5, 3.0)         # m/s² de latérale : la ligne droite (décalage vers la bordure entier) → le virage
RIG_SIDE_FREIN = (1.5, 5.0)       # m/s² de freinage (retardé) : le décalage de côté rendu à l'axe
RIG_LENS_FREIN_A = (0.5, 4.0)     # m/s² de freinage : la focale rendue (LENS_FREIN), lissée sur RIG_LENS_SIGMA
RIG_LENS_SIGMA = 0.7              # s
RIG_SIDE_SIGMA = 0.45             # s : le passage ligne droite ↔ virage lissé d'une gaussienne centrée (il anticipe)
RIG_FLOAT_HZ = (0.23, 0.37, 0.53)
RIG_VOIE = 0.5                    # la part de la latérale d'un changement de voie que prend le roulis du bras
# les clés de la version 1, gardées sous leur nom (les essais, test_motion)
RIG_V = RIG_LEVELS[1]["V"]
_RIG = {}


def vitesse_niveau():
    """FILM3D_VITESSE : 0, 1 ou 2 (défaut 2) ; « off », « non »… valent 0."""
    import os
    v = os.environ.get("FILM3D_VITESSE", "2").strip().lower()
    if v in ("0", "off", "non", "false", "no"):
        return 0
    return 1 if v == "1" else 2


def vitesse_on():
    return vitesse_niveau() > 0


def rig_params(level=None):
    return RIG_LEVELS[vitesse_niveau() if level is None else level]


def _rig_table(level):
    """Sur la grille du bras (_T0, _H) : la vitesse lissée, l'accélération longitudinale et latérale retardées, et
    l'écart du ressort berline-bras (m, positif quand elle s'échappe)."""
    if level in _RIG:
        return _RIG[level]
    P = RIG_LEVELS[level]
    t_end = (TOTAL + FIN6_FRAMES) / FPS + 1.0
    n = int((t_end - _T0) / _H)
    v1 = v2 = DRIVE.speed(_T0)
    a1 = a2 = DRIVE.along(_T0)
    l1 = l2 = DRIVE.alat(_T0)
    sp = P["SPRING"]
    t_stop = next((_T0 + k * _H for k in range(n) if DRIVE.speed(_T0 + k * _H) < 0.05 and _T0 + k * _H > 1.0), 1e9)

    def g(a):
        return (sp[3] if len(sp) > 3 else 1.0) * a if a > 0 else sp[2] * a
    d = g(a1) / sp[0] ** 2 if sp else 0.0
    dv = 0.0
    out = []
    for k in range(n):
        t = _T0 + k * _H
        v, a, l = DRIVE.speed(t), DRIVE.along(t), DRIVE.alat(t)
        # dans le slalom, le bras lit le virage de la ROUTE (v² κ), pas les changements de voie de la berline
        # (0,7 à 0,8 g alternés en 1,5 s : son roulis passait 8 °/s, il quittait sa bordure et reculait à chaque
        # déboîtement) ; il n'en prend que RIG_VOIE pour son roulis
        sw = slalom_w(t)
        l_route = v * v * ROUTE.at(s_of_t(t))[3]
        l_cote = l + sw * (l_route - l)
        l += sw * (1.0 - RIG_VOIE) * (l_route - l)
        c = _H / (P["SPEED_TAU"] / 2.0)
        v1 += (v - v1) * c
        v2 += (v1 - v2) * c
        c = _H / (P["TAU"] / 2.0)
        a1 += (a - a1) * c
        a2 += (a1 - a2) * c
        c = _H / (P["ROLL_TAU"] / 2.0)
        l1 += (l - l1) * c
        l2 += (l1 - l2) * c
        if sp:
            # d'' = g(a) − 2ζω d' − ω² d (l'entrée lissée a1 : pas d'à-coup de l'accélération brute)
            w, z = sp[0], sp[1]
            # avant l'arrêt de la pointe (RIG_SPRING_STOP s avant), l'entrée s'éteint : le ressort se relâche
            # pendant le dernier freinage, et le bras retrouve 7,5 m à l'arrêt
            gin = 1.0 - M.smoothstep(t_stop - RIG_SPRING_STOP[0], t_stop - RIG_SPRING_STOP[1], t)
            dv += (g(a1) * gin - 2.0 * z * w * dv - w * w * d) * _H
            d += dv * _H
        # la ligne droite : ni virage, ni gros freinage (la meute qui remonte la berline à sa gauche reste à côté
        # d'elle à l'écran, pas derrière elle)
        turn = M.smoothstep(RIG_SIDE_LAT[0], RIG_SIDE_LAT[1], abs(l_cote))
        brake = M.smoothstep(RIG_SIDE_FREIN[0], RIG_SIDE_FREIN[1], -a)
        out.append([v2, a2, l2, d, (1.0 - turn) * (1.0 - brake), turn, brake,
                    M.smoothstep(RIG_LENS_FREIN_A[0], RIG_LENS_FREIN_A[1], -a)])
    # la ligne droite (1) ou le virage (0), lissée d'une gaussienne centrée, au pas de 1/48 s : le bras quitte la
    # bordure avant le virage et y revient après, sans à-coup
    st = 5
    # la ligne droite (le côté), le virage (le recul), le gros freinage (le côté), le freinage (la focale, plus lent)
    for col, sigma in ((4, RIG_SIDE_SIGMA), (5, RIG_SIDE_SIGMA), (6, RIG_SIDE_SIGMA), (7, RIG_LENS_SIGMA)):
        sg = sigma / (_H * st)
        m = int(3 * sg)
        w = [math.exp(-0.5 * (j / sg) ** 2) for j in range(-m, m + 1)]
        sw = sum(w)
        raw = [out[k][col] for k in range(0, n, st)]
        sm = [sum(w[j + m] * raw[max(0, min(len(raw) - 1, i + j))] for j in range(-m, m + 1)) / sw
              for i in range(len(raw))]
        for k in range(n):
            u = k / st
            i = min(len(sm) - 2, int(u))
            out[k][col] = sm[i] + (sm[i + 1] - sm[i]) * (u - i)
    out = [tuple(r) for r in out]
    _RIG[level] = out
    _RIG["stop"] = t_stop
    return out


def _rig_at(t, level):
    tab = _rig_table(level)
    u = (t - _T0) / _H
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = max(0.0, min(1.0, u - k))
    return tuple(tab[k][j] + (tab[k + 1][j] - tab[k][j]) * f for j in range(8))


def _waves(t, hz, seed, amp=1.0):
    """Une somme de trois sinus aux fréquences hz (phases fixes, tirées de seed), d'amplitude crête ≈ amp."""
    ph = [(seed * 2.399 + i * 1.913) % (2 * math.pi) for i in range(3)]
    w = (0.5, 0.3, 0.2)
    return amp * sum(w[i] * math.sin(2 * math.pi * hz[i] * t + ph[i]) for i in range(3))


def rig(shot, frame):
    """Le bras commun à l'image `frame` du tronçon (décimale admise) : dict(back, left, z (au-dessus de la
    chaussée), lens, roll (° dans le virage), q (0 au pas, 1 à la pointe), speed (lissée), along, alat (retardées),
    spring (l'écart du ressort, m))."""
    t = t_of(shot, frame)
    level = vitesse_niveau()
    if not level:
        return dict(back=CAM_BACK, left=CAM_LEFT, z=CAM_Z, lens=VISEE_LENS, roll=0.0, q=0.0, speed=DRIVE.speed(t),
                    along=0.0, alat=0.0, spring=0.0, t=t)
    P = RIG_LEVELS[level]
    v, a, l, d, straight, turn, brake, frein = _rig_at(t, level)
    q = M.smoothstep(P["V"][0], P["V"][1], v)
    gate = M.smoothstep(0.0, RIG_GATE, v)                  # à l'arrêt, le bras d'origine
    # vers l'arrêt de la pointe, l'écart du ressort et le recul du virage se fondent (RIG_SPRING_FADE s avant) : le
    # bras est revenu à sa place quand la caméra passe le lampadaire de la pointe et tourne autour de la berline
    fin = 1.0 - M.smoothstep(_RIG["stop"] - RIG_SPRING_FADE[0], _RIG["stop"] - RIG_SPRING_FADE[1], t)
    if P["SPRING"]:
        lag = d * gate * fin
    else:
        k = P["ACC"][0] + (P["ACC"][1] - P["ACC"][0]) * 0.5 * (1.0 + math.tanh(a / 1.0))
        lag = k * a * gate
    # dans le virage, le bras recule (TURN_BACK) : la glisse élargit la berline à l'écran
    back = CAM_BACK - P["BACK_SPEED"] * q + lag + P["TURN_BACK"] * turn * gate * fin
    wide = M.smoothstep(P["V_FOCALE"][0], P["V_FOCALE"][1], v) * (1.0 - P["LENS_FREIN"] * frein)
    # le côté : vers la bordure (à droite) dans les lignes droites, sur l'axe dans les virages
    # au gros freinage, le bras passe à gauche (BRAKE_LEFT) : la berline qui pique du nez se voit de trois quarts, et
    # la meute qui la remonte à sa gauche se détache d'elle à l'écran (P5 : la patrouille 1, p5_virage.PATROL_SEEN)
    left = CAM_LEFT + P["SIDE"] * q * straight + P["BRAKE_LEFT"] * brake * gate
    return dict(back=back, left=left, z=CAM_Z + P["DZ"] * q, lens=VISEE_LENS + (P["LENS_PEAK"] - VISEE_LENS) * wide,
                roll=P["ROLL"] * l * gate, q=q, speed=v, along=a, alat=l, spring=lag, t=t)


def tremble(shot, frame):
    """Le flottement lent du bras : (dlacet, dsite, droulis en °, dcôté, dz en m) ; nul à l'arrêt."""
    level = vitesse_niveau()
    if not level:
        return 0.0, 0.0, 0.0, 0.0, 0.0
    P = RIG_LEVELS[level]
    r = rig(shot, frame)
    flo = M.smoothstep(0.0, RIG_GATE, r["speed"]) * (0.5 + 0.5 * r["q"])
    return tuple(_waves(r["t"], RIG_FLOAT_HZ, P["FLOAT_SEED"] + i, P["FLOAT"][i] * flo) for i in range(5))


def sol_ville(x, y):
    """La hauteur de la chaussée au point (x, y) de la ville : le tablier du pont (motion._bridge_z, la copie de
    scene_c.deck_z) sur son emprise, 0 ailleurs (tout le reste de la ville est à z = 0)."""
    return M._bridge_z(y, ville=True) if -330.0 < y < 12.0 and abs(x) < 12.0 else 0.0


def sol(shot, x, y):
    """La hauteur de la chaussée au point (x, y) de la scène du tronçon."""
    return sol_ville(*vers_ville(shot)[0](x, y))


def camera(shot, frame, back=None, left=None, z=None):
    """La position de la caméra dans la scène : `back` derrière le centre de la berline le long du bras, `left` à sa
    gauche, `z` au-dessus de la chaussée (le tronçon y ajoute la hauteur de son sol). Sans valeurs données : le bras
    commun vivant (rig : distance, hauteur selon la vitesse et l'accélération ; tremble : le flottement de côté et en
    hauteur)."""
    if back is None or left is None or z is None:
        r = rig(shot, frame)
        dside, dz = tremble(shot, frame)[3:]
        back = r["back"] if back is None else back
        left = r["left"] + dside if left is None else left
        z = r["z"] + dz if z is None else z
    x, y = hero(shot)["pos"](frame)
    a = math.radians(cam_cap(shot, frame))
    fx, fy = -math.sin(a), math.cos(a)             # l'avant du bras ; sa gauche : (-fy, fx)
    return x - back * fx - left * fy, y - back * fy + left * fx, z


# ---- la visée commune : définie une fois, sur le temps du film, pour tous les tronçons. Elle pose la boîte de la
# berline (glisse comprise, motion.hero_screen) au centre VISEE_U depuis la gauche, VISEE_V depuis le haut, au 24 mm,
# depuis le bras commun. Depuis le 17 novembre, la caméra de chaque tronçon EST ce bras et cette visée, de la
# première à la dernière image : plus d'écart propre à un plan (fenetre() vaut 0 partout), donc la même pose des
# deux côtés de chaque raccord, par construction.
VISEE_U, VISEE_V, VISEE_LENS = 0.50, 0.58, 24.0
RACCORD_IMAGES = 18.0             # (gardé pour les modules qui le citent : plus d'écart propre à fondre)
VISEE_SIGMA = 0.25                # s : la visée exacte lissée (les coins de la boîte changent pendant une glisse)
# le slalom à l'écran (SPEC §18.62, l'audit du 18 novembre : rivée à VISEE_U, la berline ne bougeait que de 2 à 6 %
# de la largeur pendant un changement de voie, l'écart ne se lisait que par la route qui glisse) : la visée est en
# retard sur le slalom, comme un opérateur. La berline se déporte dans le cadre du côté où elle va, de CAM_DEPORT
# largeur de cadre par m/s de vitesse latérale, et revient au centre quand elle se pose dans sa voie. Nul hors du
# slalom (dérapages, coupes de P2 et de P5, FIN6).
# 0,022 : 6,5 % de la largeur au milieu d'un changement de voie de 2,7 m (2,9 m/s). La berline tient 47 % de la
# largeur du cadre vertical : au-delà, le phare de l'ouverture sort du cadre utile (x 95 %, test_motion v3 OUV, dès
# 0,023) ; à 0, la patrouille 1 sortait du cadre à l'ouverture (OUV/30) avec l'écart de 2,7 m.
# Fusion v10 : la vitesse latérale est celle de la voiture simulée (3,2 m/s au plus fort de l'avenue, 2,7 sur la
# jetée) ; 0,018 garde le déport sous les 6 % de test_motion (5,8 %) et le phare de l'ouverture dans le cadre utile.
CAM_DEPORT = 0.018


def visee_u(t):
    """La place voulue du centre de la berline dans le cadre (fraction de la largeur depuis la gauche) à l'instant
    t du film : VISEE_U, déportée du côté de son changement de voie."""
    return VISEE_U - CAM_DEPORT * vitesse_voie(t)


_VQ = 4                           # échantillons par image
_VISEE = {}


def _visee_exacte(shot, frame, glisse=True):
    """(lacet, site) qui posent exactement la boîte de la berline à (VISEE_U, VISEE_V), depuis le bras commun ;
    glisse=False : la boîte d'une berline sans glisse (sa caisse dans l'axe de sa vitesse)."""
    h = hero(shot)
    x, y, z = camera(shot, frame)
    hx, hy = h["pos"](frame)
    z += sol(shot, x, y)
    hz = sol(shot, hx, hy)
    head = h["heading"](frame) if glisse else h["travel"](frame)
    yaw = math.degrees(math.atan2(-(hx - x), -(hy - y)))
    pitch = math.degrees(math.atan2(hz + M.HERO_BOX[2] / 2.0 - z, math.hypot(hx - x, hy - y)))
    lens = rig(shot, frame)["lens"]
    cible_u = visee_u(t_of(shot, frame))
    for _ in range(8):
        cam = (x, y, z, yaw, pitch, 0.0, lens)
        b0 = M.hero_screen(cam, hx, hy, hz, head)
        if not b0:
            break
        bu = M.hero_screen((x, y, z, yaw + 0.05, pitch, 0.0, lens), hx, hy, hz, head)
        bv = M.hero_screen((x, y, z, yaw, pitch + 0.05, 0.0, lens), hx, hy, hz, head)
        eu, ev = cible_u - b0["u"], VISEE_V - b0["v"]
        if abs(eu) < 1e-7 and abs(ev) < 1e-7:
            break
        yaw += 0.05 * eu / (bu["u"] - b0["u"])
        pitch += 0.05 * ev / (bv["v"] - b0["v"])
    return yaw, pitch


# ---- l'opérateur qui réagit au dérapage (« le dérapage est vraiment pas naturel », 17 novembre) : la visée commune
# suit la boîte de la berline sans retard (la visée exacte lissée par une gaussienne centrée). Quand l'arrière
# décroche, un opérateur la rattrape avec un temps de retard et la dépasse un peu avant de se poser. La part de la
# visée que la glisse seule déplace (visée exacte moins celle d'une berline sans glisse, lissée par la même
# gaussienne) passe par un second ordre causal (CAM_REACT : fréquence, amortissement) ; son retard (filtré moins
# lissé, × gain) s'ajoute à la visée commune, fondu à zéro aux bords de la fenêtre. Calculé sur le temps du film, dans
# le repère d'un tronçon de référence par dérapage (un écart d'angles ne dépend pas du repère) : le même de part et
# d'autre de chaque raccord. Nul hors des glisses. Le gain : ev["reaction"], sinon CAM_REACT["gain"]. Au port (0,4 :
# environ 0,8° ; 0,5 avant film/v8, le bras franc l'a fait passer de 44,4 à 44,0 %), il est borné par le cadre (le
# centre de la berline à 50 ± 6 %, la patrouille 1 vue) ; au rond-point
# (3 : environ 1°), la berline vue de dos déplace peu la visée en glissant. Borné aussi par l'accélération de
# panoramique des plans (test_v3).
# (avant 0,5 s, 0,8 avant la fusion v10 : la fenêtre du rond-point s'ouvrait sur la dérive que la berline garde en
# sortant du slalom de l'avenue, 1,26 largeur/s² de panoramique à P2/2 ; à 1,2 s : 1,56)
CAM_REACT = dict(hz=0.5, zeta=0.65, gain=0.5, avant=0.5, apres=2.4, fondu=0.6)
_REACT = {}


def _reaction_tables():
    """Les tables du retard, une par niveau de FILM3D_VITESSE : la visée exacte qu'elles lisent part du bras vivant
    (rig), dont la place et la focale changent avec le niveau ; le retard se pose sur la visée de ce bras-là."""
    level = vitesse_niveau()
    if level in _REACT:
        return _REACT[level]
    tables = _REACT[level] = []
    q = _VQ
    dt = 1.0 / (FPS * q)
    w = 2.0 * math.pi * CAM_REACT["hz"]
    sg = VISEE_SIGMA * FPS * q
    m = int(3 * sg)
    wts = [math.exp(-0.5 * (j / sg) ** 2) for j in range(-m, m + 1)]
    for ev in DERAPAGES:
        t_ev, t_fin = D.fenetre(ev)
        a = t_ev - CAM_REACT["avant"]
        b = t_fin + CAM_REACT["apres"]
        ref = max((n for n, _ in SHOTS if START[n] / FPS <= t_ev), key=lambda n: START[n])
        g_a, g_b = int(math.floor(a * FPS)), int(math.ceil(b * FPS))
        raw, prev = [], None
        for k in range(g_a * q - m, g_b * q + m + 1):
            fr = k / q - START[ref] + 1.0
            d = (_visee_exacte(ref, fr)[0] - _visee_exacte(ref, fr, glisse=False)[0] + 180.0) % 360.0 - 180.0
            d = d if prev is None else prev + (d - prev + 180.0) % 360.0 - 180.0
            prev = d
            raw.append(d)
        lis = [sum(wt * raw[i + j] for j, wt in zip(range(-m, m + 1), wts)) / sum(wts)
               for i in range(m, len(raw) - m)]
        x, v, out = lis[0], 0.0, []
        n = len(lis)
        nf = CAM_REACT["fondu"] * FPS * q
        for i, d in enumerate(lis):
            acc = w * w * (d - x) - 2.0 * CAM_REACT["zeta"] * w * v
            v += acc * dt
            x += v * dt
            # (fondu aux deux bouts. À l'entrée aussi depuis la fusion v10 : la berline sort du slalom de l'avenue
            # avec 1 à 4° de dérive qui s'éteint, le retard partait de 0,44° d'un coup à la première image de la
            # fenêtre, soit 276 °/s² de panoramique à P1/31)
            u = min(1.0, (n - 1 - i) / nf, i / nf)
            out.append(ev.get("reaction", CAM_REACT["gain"]) * (x - d) * u * u * (3.0 - 2.0 * u))
        tables.append((g_a, out))
    return tables


def reaction(g):
    """Le retard de l'opérateur sur la glisse (degrés de lacet à ajouter à la visée) à l'image globale g (décimale)."""
    for g_a, out in _reaction_tables():
        u = (g - g_a) * _VQ
        if 0.0 <= u < len(out) - 1:
            k = int(math.floor(u))
            return out[k] + (out[k + 1] - out[k]) * (u - k)
    return 0.0


def visee(shot, frame):
    """(lacet, site) en degrés (convention de motion.key_camera : 0 regarde -y, positif vers -x) de la visée commune
    à l'image `frame` du tronçon (décimale admise) : la visée exacte depuis le bras commun, lissée par une gaussienne
    centrée de VISEE_SIGMA sur le temps du film. Elle ne dépend que du bras et de la berline (tous deux posés par une
    rotation et une translation du parcours) et sa grille tombe sur les images : la même pose, au lacet de la
    rotation du lieu près, des deux côtés d'un raccord."""
    key = (shot, vitesse_niveau())
    if key not in _VISEE:
        n = frames(shot)
        k0 = -40 * _VQ
        raw, prev = [], None
        for k in range(k0, (n + 40) * _VQ + 1):
            yaw, pitch = _visee_exacte(shot, 1.0 + k / _VQ)
            yaw = yaw if prev is None else prev + (yaw - prev + 180.0) % 360.0 - 180.0
            prev = yaw
            raw.append((yaw, pitch))
        sg = VISEE_SIGMA * FPS * _VQ
        m = int(3 * sg)
        wts = [math.exp(-0.5 * (j / sg) ** 2) for j in range(-m, m + 1)]
        tab = []
        for i in range(len(raw)):
            sy = sp = sw = 0.0
            for j, w in zip(range(-m, m + 1), wts):
                r = raw[max(0, min(len(raw) - 1, i + j))]
                sy, sp, sw = sy + w * r[0], sp + w * r[1], sw + w
            tab.append((sy / sw, sp / sw))
        g0 = START.get(shot, START["FIN6"]) - 1
        tab = [(yw + reaction((g0 + 1.0 + k / _VQ)), pt) for k, (yw, pt) in zip(range(k0, k0 + len(tab)), tab)]
        _VISEE[key] = (k0, tab)
    k0, tab = _VISEE[key]
    u = (frame - 1.0) * _VQ - k0
    k = max(0, min(len(tab) - 2, int(math.floor(u))))
    f = min(1.0, max(0.0, u - k))
    return tuple(tab[k][j] + (tab[k + 1][j] - tab[k][j]) * f for j in range(2))


def chase(shot, frame):
    """(x, y, z, lacet, site, roulis, focale) : LA caméra du film à l'image `frame` du tronçon, le bras commun (rig :
    CAM_Z au-dessus de la chaussée au pas, sol() : le tablier du pont) visé par la visée commune, avec ce que la
    vitesse lui donne (focale, roulis dans le virage, vibration et flottement de la route)."""
    x, y, z = camera(shot, frame)
    yaw, pitch = visee(shot, frame)
    r = rig(shot, frame)
    dyaw, dpitch, droll = tremble(shot, frame)[:3]
    return x, y, z + sol(shot, x, y), yaw + dyaw, pitch + dpitch, r["roll"] + droll, r["lens"]


RACCORDS = tuple((a, b) for (a, _), (b, _) in zip(SHOTS, SHOTS[1:])) + (("P6", "FIN6"),)


def fenetre(shot, frame):
    """La part de l'écart propre d'un tronçon à la visée commune : nulle partout depuis le 17 novembre (une seule
    caméra, le bras commun, de la première à la dernière image)."""
    return 0.0


def raccord(shot, frame, cam):
    """La caméra `cam` (x, y, z, lacet, site, roulis, focale) d'un tronçon, ramenée à la visée commune : lacet et site
    de visee(), roulis nul. La position reste celle du tronçon (le bras commun), la focale doit être VISEE_LENS."""
    x, y, z, _yaw, _pitch, _roll, lens = cam
    vy, vp = visee(shot, frame)
    return x, y, z, vy, vp, 0.0, lens


def brake_windows(shot):
    """Les fenêtres des feux stop du tronçon, en images du tronçon : [(première, dernière)]."""
    return DRIVE.brake_windows(f0=1 - START[shot], frames=range(1, frames(shot) + 1))


# ---- les états aux raccords, au niveau du module (indépendamment des scènes) : les dérivées de motion.motion_state
# sur la fenêtre de chaque tronçon, prises vers l'intérieur ; roulis et tangage de M.sample sur tout le parcours
_BODY = {}


def body():
    """{image globale: pose de M.sample} sur tout le parcours (roulis, tangage) : ressorts chauffés avant OUV/1."""
    if not _BODY:
        ps = M.sample(DRIVE.pos, range(-12, TOTAL + FIN6_FRAMES + 12), heading=DRIVE.heading, steer=DRIVE.steer,
                      f0=0)
        _BODY.update({p["frame"]: p for p in ps})
    return _BODY


def state(shot, frame, side):
    """L'état de la berline et du bras à l'image `frame` du tronçon, dérivées d'ordre 2 décentrées prises dans le
    tronçon (side = -1 : en sortie, +1 : en entrée), comme motion.motion_state les prend sur les poses du plan."""
    h = hero(shot)
    fr = [frame + side * k for k in range(4)]
    dt = 1.0 / FPS
    xs, ys = zip(*(h["pos"](f) for f in fr))
    vx, vy = M._d1(xs, side, dt), M._d1(ys, side, dt)
    ax, ay = M._d2(xs, dt), M._d2(ys, dt)
    sp = math.hypot(vx, vy)
    ux, uy = vx / sp, vy / sp
    st = dict(speed=sp, along=ax * ux + ay * uy, alat=ux * ay - uy * ax, travel=M.heading_of(vx, vy))
    st["yaw"] = math.degrees(st["alat"] / sp)
    st["slip"] = M._unwrap(0.0, h["heading"](frame) - st["travel"])
    st["steer"] = h["steer"](frame)
    b = body()[START[shot] + frame - 1]
    st["roll"], st["pitch"] = b["roll"], b["pitch"]
    st["lamps"] = any(a <= frame <= z for a, z in brake_windows(shot))
    st["pan"] = M._d1([cam_cap(shot, f) for f in fr], side, dt)
    return st


def cut_states():
    """[(A, B, état de sortie de A, état d'entrée de B)] pour les raccords de la poursuite et celui de FIN6."""
    return [(a, b, state(a, frames(a), -1), state(b, 1, +1)) for a, b in RACCORDS]


def mesures():
    """Les nombres du trajet : longueur (m), durées, vitesses (moyenne, pointe, minimum de chaque virage), glisses."""
    n = TOTAL
    sp = [DRIVE.speed(f / FPS) for f in range(n)]
    out = dict(longueur=s_of_t(T_ARRET), longueur_poursuite=s_of_t(n / FPS), images=n, secondes=n / FPS,
               arret=T_ARRET, moyenne=s_of_t(n / FPS) / (n / FPS), pointe=max(sp))
    for nom, s0, s1 in (("rond-point", S_ARC2 - 10.0, S_ARC2 + L_ARC2 + 10.0),
                        ("port", S_ARC5 - 10.0, S_ARC5 + L_ARC5 + 10.0)):
        ta, tb = t_of_s(s0), t_of_s(s1)
        ks = range(int(ta * FPS), int(tb * FPS) + 1)
        out["min_" + nom] = min(DRIVE.speed(k / FPS) for k in ks)
        out["glisse_" + nom] = max(abs(DRIVE.slip(k / FPS)) for k in ks)
    return out


# ---- ce que le reste du film tient pour acquis : les durées des tronçons et les étoiles (le site, la bande-son, les
# rendus déjà faits). `python3 tools/film3d/parcours.py --check` échoue si la conduite les déplace ; le fichier du site
# (shared/film/parcours.json, s'il existe) doit les porter aussi.
FIGE = dict(START={"OUV": 0, "P1": 75, "P2": 108, "P3": 215, "P4": 318, "P5": 426, "P6": 486, "FIN6": 619},
            ETOILES={1: 77, 2: 153, 3: 255, 4: 375, 5: 453, 6: 567}, FIN6_FRAMES=101, IMAGES=720)
CRETES = ((28.0, 32.0), (34.0, 38.0))        # ° : la crête de la glisse au rond-point, au port
SITE_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "shared", "film", "parcours.json")


def verifie():
    """Les écarts aux durées et aux étoiles figées (liste vide : tout tient)."""
    out = []
    if START != FIGE["START"]:
        out.append(f"tronçons {START} au lieu de {FIGE['START']}")
    if ETOILES != FIGE["ETOILES"]:
        out.append(f"étoiles {ETOILES} au lieu de {FIGE['ETOILES']}")
    if FIN6_FRAMES != FIGE["FIN6_FRAMES"] or TOTAL + FIN6_FRAMES != FIGE["IMAGES"]:
        out.append(f"FIN6 {FIN6_FRAMES} images, {TOTAL + FIN6_FRAMES} en tout")
    # les deux dérapages : la crête dans sa plage, et l'étoile sur la crête (la glisse y vaut 97 % du plus fort)
    for ev, k, (lo, hi) in zip(DERAPAGES, (2, 5), CRETES):
        a, b = D.fenetre(ev)
        pk = max(abs(DRIVE.slip(a + q / 240.0)) for q in range(int((b - a) * 240)))
        ici = ev["side"] * DRIVE.slip(ETOILES[k] / FPS)
        if not lo <= pk <= hi or ici < 0.97 * pk:
            out.append(f"dérapage de l'étoile {k} : crête {pk:.1f}° (de {lo:g} à {hi:g}), {ici:.1f}° à l'étoile")
    if abs(T_ARRET - T_PLAN) * FPS > FIN6_TENUE - 6:
        out.append(f"l'arrêt simulé à {T_ARRET * FPS:.1f} (le plan : {T_PLAN * FPS:.1f}) : la tenue de FIN6 ne tient plus")
    if os.path.exists(SITE_JSON):
        import json
        d = json.load(open(SITE_JSON, encoding="utf-8"))
        want = [[a, k] for a, k in SHOTS + (("FIN6", FIN6_FRAMES),)]
        if d.get("troncons") != want or d.get("etoiles") != [ETOILES[k] for k in sorted(ETOILES)]:
            out.append(f"{os.path.normpath(SITE_JSON)} : tronçons ou étoiles différents")
    return out


# ---- les invariants du slalom (SPEC §18.62), contrôlés aussi par --check et par test_trafic.py. Le slalom ne touche
# ni aux durées ni aux étoiles (l'horaire du conducteur reste compté le long de la route, dynamique.Plan), il est nul
# dans les deux dérapages et dans le trou du barrage.
VOIE_NULLE = ((120, 205), (428, 492))       # images du film : le rond-point, le port (dérapages, entrée, sortie)
VOIE_BARRAGE = (184.4, 190.4)               # s : le trou des plots


def check():
    """[(contrôle, bon, détail)] : les invariants du slalom."""
    out = [("tronçons aux images fixées", START == FIGE["START"], str(START)),
           ("étoiles aux images fixées", ETOILES == FIGE["ETOILES"], str(ETOILES))]
    worst = max(abs(voie(s_of_t(g / FPS))) for a, b in VOIE_NULLE for g in range(a, b + 1))
    out.append(("slalom nul dans les dérapages", worst < 1e-9, f"{worst:.2e} m"))
    k = 200
    worst = max(abs(voie(VOIE_BARRAGE[0] + (VOIE_BARRAGE[1] - VOIE_BARRAGE[0]) * i / k)) for i in range(k + 1))
    out.append(("slalom nul dans le trou du barrage", worst < 1e-9, f"{worst:.2e} m"))
    return out


if __name__ == "__main__" and "--check" in sys.argv:
    err = verifie()
    for nom, ok, det in check():
        print(f"{'ok  ' if ok else 'ÉCHEC'} {nom} : {det}")
        if not ok:
            err.append(f"{nom} : {det}")
    if err:
        sys.exit("[parcours] " + " ; ".join(err))
    print(f"[parcours] durées et étoiles tenues : {TOTAL + FIN6_FRAMES} images, tronçons {dict(SHOTS)}, FIN6 "
          f"{FIN6_FRAMES}, étoiles {ETOILES} ; arrêt simulé à l'image {T_ARRET * FPS:.1f} (plan {T_PLAN * FPS:.1f})")
elif __name__ == "__main__":       # python3 tools/film3d/parcours.py : les tronçons, les étoiles, les raccords
    m = mesures()
    print(f"trajet {m['longueur']:.1f} m jusqu'à l'arrêt ({m['arret']:.2f} s), poursuite {m['longueur_poursuite']:.1f} m "
          f"en {m['images']} images ({m['secondes']:.2f} s) ; moyenne {m['moyenne'] * 3.6:.1f} km/h, pointe "
          f"{m['pointe'] * 3.6:.1f} km/h ; rond-point {m['min_rond-point'] * 3.6:.1f} km/h au plus lent, glisse "
          f"{m['glisse_rond-point']:.1f}° ; port {m['min_port'] * 3.6:.1f} km/h, glisse {m['glisse_port']:.1f}°")
    for name, n in SHOTS + (("FIN6", FIN6_FRAMES),):
        hh = hero(name)
        (x0, y0), (x1, y1) = hh["pos"](1), hh["pos"](n)
        print(f"{name:4s} {START[name]:4d}+{n:3d} s {s_of_t(t_of(name, 1)):6.1f} → {s_of_t(t_of(name, n)):6.1f} m, v "
              f"{hh['speed'](1) * 3.6:5.1f} → {hh['speed'](n) * 3.6:5.1f} km/h, ({x0:7.2f}, {y0:7.2f}) → "
              f"({x1:7.2f}, {y1:7.2f}), feux stop {brake_windows(name)}")
    print("\nétoiles :")
    for k, f in ETOILES.items():
        t = f / FPS
        print(f"  {k} {ETOILE_LIEUX[k]:10s} image {f:4d} ({t:5.2f} s), s {s_of_t(t):6.1f} m, "
              f"{DRIVE.speed(t) * 3.6:5.1f} km/h, glisse {DRIVE.slip(t):+5.1f}°")
    print("\nraccord       v              long           lat            lacet          glisse         braquage"
          "       roulis         tangage        feux  pano °/s")
    for a, b, sa, sb in cut_states():
        print(f"{a:4s} → {b:4s} " + "  ".join(f"{sa[k]:+6.2f}/{sb[k]:+6.2f}" for k in
                                              ("speed", "along", "alat", "yaw", "slip", "steer", "roll", "pitch"))
              + f"  {'X' if sa['lamps'] else '.'}/{'X' if sb['lamps'] else '.'}  {sa['pan']:+5.1f}/{sb['pan']:+5.1f}")
    print("\nla ville (repère du pont, scène C) : la pose de chaque lieu, p_ville = R(rot) p_lieu + t")
    for lieu in dict.fromkeys(LIEU.values()):
        shots = [n for n in LIEU if LIEU[n] == lieu]
        rot, tx, ty = pose_ville(shots[0])
        print(f"  {lieu} ({', '.join(shots)}) : rot {rot:+7.2f}°, t = ({tx:8.3f}, {ty:8.3f})")
