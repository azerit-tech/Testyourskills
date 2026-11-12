# Le mouvement des plans : des clés calculées à partir de la trajectoire, sans physique simulée, pour que le poids
# se sente. Le calcul est en Python pur (testable sans Blender : test_motion.py) ; la couche qui pose les clés
# (key_vehicle, key_camera, key_searchlight, flash_bars, spin_rotors) n'importe bpy qu'à l'appel.
#
#   import motion as M
#   poses = M.sample(pos, slip=slip, frames=range(0, 30), wheel_r=hero["wheel_r"])   # pos(t) -> (x, y)
#   M.key_vehicle(hero_rig, poses, wheels=L.hero_wheels(hero_rig), ground=sol)
#
# Repère et conventions : ceux de lieux.put. Le cap en degrés, 0 = l'avant vers +y, positif vers la gauche (-x).
# Roulis positif : la caisse penche à droite ; tangage positif : l'avant monte ; braquage positif : à gauche.
# Le temps t en secondes, t = 0 à la première image du plan (image F0 = 1 dans Blender), 24 images par seconde.
#
# Ce que donne sample(), image par image : la vitesse, les accélérations longitudinale et latérale (dérivées
# numériques lissées), la distance parcourue et la rotation des roues (distance / rayon), le braquage des roues
# avant (géométrie d'Ackermann plus la dérive : contre-braquage en glisse), le transfert de masse (roulis selon
# l'accélération latérale, tangage selon la longitudinale, bornés, en réponse du second ordre : la caisse suit
# avec ~0,15 s de retard et dépasse un peu, elle « s'assoit »), et un petit bruit de suspension lié à la vitesse.
import math

FPS = 24.0
F0 = 1                      # l'image Blender du temps 0

ROLL_PER_G = 6.0            # degrés de roulis par g d'accélération latérale (la borne arrive à 1 g)
PITCH_PER_G = 3.2           # degrés de tangage par g d'accélération longitudinale
ROLL_MAX, PITCH_MAX = 6.0, 3.0
SUSP_HZ, SUSP_ZETA = 1.6, 0.55   # la caisse sur ses ressorts : ~0,15 s pour 63 %, ~12 % de dépassement
STEER_LAG = 0.06            # s : les mains au volant
STEER_MAX = 35.0
G = 9.81


def t_of(frame, f0=F0, fps=FPS):
    return (frame - f0) / fps


def smoothstep(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    u = min(1.0, max(0.0, (x - a) / (b - a)))
    return u * u * (3.0 - 2.0 * u)


def soft_clamp(x, bound):
    return bound * math.tanh(x / bound)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def heading_of(vx, vy):
    """Le cap (convention de lieux.put) d'une direction (vx, vy)."""
    return math.degrees(math.atan2(-vx, vy))


def _unwrap(prev, ang):
    while ang - prev > 180.0:
        ang -= 360.0
    while ang - prev < -180.0:
        ang += 360.0
    return ang


def kinematics(pos, t, h=1.0 / 48.0):
    """Vitesse (vx, vy), accélération (ax, ay) en t, par différences centrées ; l'accélération est lissée sur
    ±h (poids 1-2-1), pour qu'un raccord d'arcs ne donne pas un pic d'une image."""
    def vel(u):
        a, b = pos(u + h / 2), pos(u - h / 2)
        return ((a[0] - b[0]) / h, (a[1] - b[1]) / h)

    def acc(u):
        a, b = vel(u + h / 2), vel(u - h / 2)
        return ((a[0] - b[0]) / h, (a[1] - b[1]) / h)

    v = vel(t)
    a = [acc(t + k * h) for k in (-1, 0, 1)]
    ax = 0.25 * a[0][0] + 0.5 * a[1][0] + 0.25 * a[2][0]
    ay = 0.25 * a[0][1] + 0.5 * a[1][1] + 0.25 * a[2][1]
    return v, (ax, ay)


def bumps(s, seed=0.0):
    """Le relief de la chaussée sous la voiture, en fonction de la distance parcourue : somme de sinus de
    longueurs d'onde premières entre elles, dans [-1, 1]."""
    return (0.5 * math.sin(2 * math.pi * s / 3.1 + 1.3 + seed) + 0.3 * math.sin(2 * math.pi * s / 1.7 + 0.4 + 2 * seed)
            + 0.2 * math.sin(2 * math.pi * s / 5.3 + 2.1 + 3 * seed))


class _Spring:
    """Une réponse du second ordre (pulsation w, amortissement z), intégrée à pas fixe."""

    def __init__(self, hz, zeta, x0=0.0):
        self.w, self.z, self.x, self.v = 2 * math.pi * hz, zeta, x0, 0.0

    def step(self, target, dt):
        a = self.w * self.w * (target - self.x) - 2 * self.z * self.w * self.v
        self.v += a * dt
        self.x += self.v * dt
        return self.x


def sample(pos, frames=range(0, 30), slip=None, heading=None, wheel_r=0.33, wheelbase=2.9, front=None, f0=F0,
           fps=FPS, noise=1.0, seed=0.0, warmup=0.6, roll_per_g=ROLL_PER_G, pitch_per_g=PITCH_PER_G):
    """Les poses d'un véhicule image par image.

    pos(t) -> (x, y) : la trajectoire du centre de la caisse, au sol.
    slip(t) -> degrés : la caisse par rapport à sa route (cap de la caisse - cap de la route ; une glisse à droite
    est négative : la caisse tourne plus à droite que sa route). Ou heading(t) -> degrés : le cap de la caisse.
    front : distance du centre à l'essieu avant (wheelbase / 2 par défaut). noise : 0 coupe le bruit de suspension.

    Renvoie une liste de dict (une par image) : frame, t, x, y, heading (la caisse), travel (la route), speed,
    a_long, a_lat (m/s², latérale positive vers la gauche), curvature (1/m, positive à gauche), dist (m),
    spin (rad, positif en avançant), steer, roll, pitch (degrés), heave (m)."""
    front = wheelbase / 2 if front is None else front
    frames = list(frames)
    t_first, t_last = t_of(frames[0], f0, fps), t_of(frames[-1], f0, fps)
    dt = 1.0 / (fps * 10)
    roll_s = pitch_s = steer_s = None
    out = []
    t = t_first - warmup
    n_steps = int(round((t_last - t) / dt))
    dist, prev_p, prev_travel, prev_head = 0.0, pos(t), None, None
    want = {round(t_of(f, f0, fps) / dt): f for f in frames}
    base_step = round(t / dt)
    for i in range(n_steps + 1):
        t = (base_step + i) * dt
        p = pos(t)
        dist += math.hypot(*_sub(p, prev_p)) if i else 0.0
        prev_p = p
        (vx, vy), (ax, ay) = kinematics(pos, t)
        speed = math.hypot(vx, vy)
        if speed > 1e-6:
            ux, uy = vx / speed, vy / speed
            travel = heading_of(vx, vy)
        else:
            ux, uy = 0.0, 1.0
            travel = prev_travel if prev_travel is not None else 0.0
        if prev_travel is not None:
            travel = _unwrap(prev_travel, travel)
        prev_travel = travel
        a_long = ax * ux + ay * uy
        a_lat = ux * ay - uy * ax                       # positive : vers la gauche de la route
        curv = a_lat / (speed * speed) if speed > 0.5 else 0.0
        if heading is not None:
            head = heading(t)
            if prev_head is not None:
                head = _unwrap(prev_head, head)
        else:
            head = travel + (slip(t) if slip else 0.0)
        prev_head = head
        beta = math.radians(travel - head)              # la route vue de la caisse (positif : à sa gauche)
        # le lacet de la caisse : sa dérivée, par différence avec l'image d'avant (sinon la courbure de la route)
        yaw_rate = speed * curv
        if heading is not None or slip:
            h2 = (heading(t + dt) if heading is not None else heading_of(*kinematics(pos, t + dt)[0])
                  + (slip(t + dt) if slip else 0.0))
            yaw_rate = math.radians(_unwrap(head, h2) - head) / dt
        # les roues avant visent la vitesse de l'essieu avant, vue de la caisse : la dérive, plus le lacet × front
        vxb, vyb = speed * math.cos(beta), speed * math.sin(beta) + yaw_rate * front
        steer_t = math.degrees(math.atan2(vyb, vxb)) if speed > 0.5 else 0.0
        steer_t = max(-STEER_MAX, min(STEER_MAX, steer_t))
        roll_t = soft_clamp(roll_per_g * a_lat / G, ROLL_MAX)       # virage à droite : a_lat < 0, roulis < 0 (à gauche)
        pitch_t = soft_clamp(pitch_per_g * a_long / G, PITCH_MAX)   # freinage : a_long < 0, l'avant plonge
        if roll_s is None:
            roll_s, pitch_s = _Spring(SUSP_HZ, SUSP_ZETA, roll_t), _Spring(SUSP_HZ, SUSP_ZETA, pitch_t)
            steer_s = steer_t
        roll = roll_s.step(roll_t, dt)
        pitch = pitch_s.step(pitch_t, dt)
        steer_s += (steer_t - steer_s) * min(1.0, dt / STEER_LAG)
        k = base_step + i
        if k in want:
            amp = noise * min(1.0, speed / 30.0)
            out.append(dict(
                frame=want[k], t=t, x=p[0], y=p[1], heading=head, travel=travel, speed=speed, a_long=a_long,
                a_lat=a_lat, curvature=curv, dist=dist, spin=dist / wheel_r, steer=steer_s,
                roll=max(-ROLL_MAX, min(ROLL_MAX, roll)) + 0.15 * amp * bumps(dist, seed + 1.0),
                pitch=max(-PITCH_MAX, min(PITCH_MAX, pitch)) + 0.12 * amp * bumps(dist * 1.3, seed + 2.0),
                heave=0.006 * amp * bumps(dist * 0.8, seed)))
    return out


def straight(x, y0, speed, accel=None):
    """Une trajectoire droite le long de +y, en x fixe : pos(t). `accel(t)` -> m/s² (0 par défaut), intégré."""
    if accel is None:
        return lambda t: (x, y0 + speed * t)
    prof = Profile(speed, accel)
    return lambda t: (x, y0 + prof.s(t))


class Profile:
    """Un profil de vitesse : v(0) = v0 et une accélération a(t), intégrés une fois (pas de 1/960 s, de -2 à
    +4 s) ; s(t) et v(t) lus par interpolation."""

    def __init__(self, v0, accel, t0=-2.0, t1=4.0, dt=1.0 / 960.0, vmin=0.0):
        self.t0, self.dt = t0, dt
        n = int((t1 - t0) / dt) + 1
        k0 = int(round(-t0 / dt))
        v, s = [0.0] * n, [0.0] * n
        v[k0] = v0
        for k in range(k0 + 1, n):
            v[k] = max(vmin, v[k - 1] + accel((k - 1 - k0) * dt + dt / 2) * dt)
            s[k] = s[k - 1] + (v[k - 1] + v[k]) / 2 * dt
        for k in range(k0 - 1, -1, -1):
            v[k] = max(vmin, v[k + 1] - accel((k + 1 - k0) * dt - dt / 2) * dt)
            s[k] = s[k + 1] - (v[k] + v[k + 1]) / 2 * dt
        self._v, self._s, self.k0 = v, s, k0

    def _lerp(self, arr, t):
        u = (t - self.t0) / self.dt
        k = max(0, min(len(arr) - 2, int(math.floor(u))))
        f = u - k
        return arr[k] * (1 - f) + arr[k + 1] * f

    def v(self, t):
        return self._lerp(self._v, t)

    def s(self, t):
        return self._lerp(self._s, t)


def min_gap(tracks, frames=range(0, 30), f0=F0, fps=FPS):
    """La plus petite distance entre les centres de deux véhicules sur le plan : tracks = {nom: pos(t)}.
    Renvoie (distance, image, nom1, nom2)."""
    best = (float("inf"), None, None, None)
    names = sorted(tracks)
    for f in frames:
        t = t_of(f, f0, fps)
        ps = {n: tracks[n](t) for n in names}
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                d = math.hypot(*_sub(ps[a], ps[b]))
                if d < best[0]:
                    best = (d, f, a, b)
    return best


def handheld(t, amp=0.6, rotor=0.12, seed=0.0):
    """La caméra à l'épaule : (dyaw, dpitch, droll en degrés, dx, dy, dz en m). Un bruit lent (0,4 à 1,3 Hz,
    d'amplitude `amp` degrés) et le souffle du rotor (8 Hz, `rotor` degrés)."""
    def wob(k, f1, f2, f3):
        return (0.55 * math.sin(2 * math.pi * f1 * t + 1.7 * k + seed) + 0.3 * math.sin(2 * math.pi * f2 * t + 0.9 * k)
                + 0.15 * math.sin(2 * math.pi * f3 * t + 2.3 * k + 2 * seed))

    buf = lambda k: math.sin(2 * math.pi * 7.9 * t + 1.1 * k + seed) * 0.6 + math.sin(2 * math.pi * 11.3 * t + k) * 0.4
    return (amp * wob(1, 0.41, 0.93, 1.31) + rotor * buf(1),
            amp * 0.8 * wob(2, 0.37, 0.87, 1.23) + rotor * buf(2),
            amp * 0.6 * wob(3, 0.29, 0.71, 1.17) + rotor * 0.5 * buf(3),
            0.012 * wob(4, 0.33, 0.77, 1.1), 0.012 * wob(5, 0.31, 0.81, 1.4), 0.008 * wob(6, 0.43, 1.03, 1.6))


def bar_phase(frame, period=12, offset=0):
    """Le clignotement des rampes : « corail » la première moitié de la période, « lilas » la seconde (2 Hz
    chacun à 24 images par seconde, comme le carré de la radio). `offset` décale un véhicule de la meute."""
    return "corail" if ((frame + offset) % period) < period // 2 else "lilas"


# ---------------------------------------------------------------- la couche Blender (bpy importé à l'appel)

def _clear(ob):
    if ob.animation_data and ob.animation_data.action:
        ob.animation_data.action = None


def key_vehicle(root, poses, wheels=(), ground=None, pivot=(0.0, 0.0, 0.5), body=None):
    """Pose les clés d'un véhicule déjà construit (un rig de lieux : root, son enfant body["body"]).

    Le rig porte la position, le cap et la pente du sol (`ground(x, y)` -> (z, pente en degrés), plat par défaut) ;
    la caisse (body) porte le roulis, le tangage et le pompage autour de `pivot` (repère du rig, m) ; les roues
    (`wheels`, enfants de la caisse) restent au sol, droites, et ne prennent que leur rotation et, à l'avant, le
    braquage. Les roues avant sont celles qui sont du côté de l'avant de la caisse. Un véhicule sans roues
    séparées (patrouilles, fourgon) penche tout entier : ses roues bougent avec la caisse. Remplace toutes les clés
    déjà posées (les clés de flou faites à la main) : le flou de mouvement vient de ces clés."""
    import bpy
    from mathutils import Matrix, Vector
    body = body or bpy.data.objects[root["body"]]
    for ob in (root, body, *wheels):
        _clear(ob)
    root.rotation_mode = body.rotation_mode = "XYZ"
    rest = body.get("motion_rest")
    if rest is None:
        rest = [list(r) for r in body.matrix_basis]
        body["motion_rest"] = [v for r in rest for v in r]
    else:
        rest = [list(rest[i * 4:i * 4 + 4]) for i in range(4)]
    B0 = Matrix(rest)
    fwd_b = (B0.to_3x3().inverted() @ Vector((0.0, 1.0, 0.0))).normalized()
    axle = Vector((0.0, 0.0, 1.0)).cross(fwd_b).normalized()        # l'axe de rotation des roues en avançant
    info = []
    for w in wheels:
        _clear(w)
        if "motion_rest" not in w:
            w["motion_rest"] = list(w.location)
        p_b = Vector(w["motion_rest"])
        info.append((w, p_b, p_b.dot(fwd_b) > 0.0))
        w.rotation_mode = "XYZ"
    c = Vector(pivot)
    prev_b, prev_w = None, {}
    for ps in poses:
        f = ps["frame"]
        z, slope = ground(ps["x"], ps["y"]) if ground else (0.0, 0.0)
        root.location = (ps["x"], ps["y"], z)
        root.rotation_euler = (math.radians(slope), 0.0, math.radians(ps["heading"]))
        root.keyframe_insert("location", frame=f)
        root.keyframe_insert("rotation_euler", frame=f)
        tilt = Matrix.Rotation(math.radians(ps["pitch"]), 4, "X") @ Matrix.Rotation(math.radians(ps["roll"]), 4, "Y")
        Mb = Matrix.Translation(c + Vector((0.0, 0.0, ps["heave"]))) @ tilt @ Matrix.Translation(-c) @ B0
        loc, rot, _s = Mb.decompose()
        e = rot.to_euler("XYZ", prev_b) if prev_b else rot.to_euler("XYZ")
        prev_b = e
        body.location, body.rotation_euler = loc, e
        body.keyframe_insert("location", frame=f)
        body.keyframe_insert("rotation_euler", frame=f)
        Mb_inv = Mb.inverted()
        for w, p_b, is_front in info:
            R = Matrix.Rotation(ps["spin"], 4, axle)
            if is_front:
                R = Matrix.Rotation(math.radians(ps["steer"]), 4, "Z") @ R
            Mw = Mb_inv @ B0 @ Matrix.Translation(p_b) @ R
            wl, wr, _ = Mw.decompose()
            pe = prev_w.get(w.name)
            we = wr.to_euler("XYZ", pe) if pe else wr.to_euler("XYZ")
            prev_w[w.name] = we
            w.location, w.rotation_euler = wl, we
            w.keyframe_insert("location", frame=f)
            w.keyframe_insert("rotation_euler", frame=f)
    return root


def key_object(ob, frames, fn, f0=F0, fps=FPS):
    """Clés de position et d'orientation d'un objet quelconque : fn(t) -> (x, y, z, cap, tangage, roulis) dans la
    convention de lieux.put (hélicoptère, objets portés)."""
    _clear(ob)
    ob.rotation_mode = "XYZ"
    for f in frames:
        x, y, z, h, p, r = fn(t_of(f, f0, fps))
        ob.location = (x, y, z)
        ob.rotation_euler = (math.radians(p), math.radians(r), math.radians(h))
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_euler", frame=f)


def key_camera(cam, frames, fn, f0=F0, fps=FPS):
    """Clés d'une caméra : fn(t) -> (x, y, z, lacet, tangage, roulis en degrés, focale en mm). Lacet compté de -y
    vers -x (comme les plans des lieux), tangage positif vers le haut, roulis autour de l'axe de visée."""
    from mathutils import Matrix, Vector
    _clear(cam)
    if cam.data.animation_data:
        cam.data.animation_data.action = None
    cam.rotation_mode = "QUATERNION"
    prev = None
    for f in frames:
        x, y, z, yaw, pitch, roll, lens = fn(t_of(f, f0, fps))
        a, b = math.radians(yaw), math.radians(pitch)
        d = Vector((-math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b)))
        q = d.to_track_quat("-Z", "Y") @ Matrix.Rotation(math.radians(roll), 4, "Z").to_quaternion()
        if prev is not None and prev.dot(q) < 0:
            q.negate()
        prev = q
        cam.location = (x, y, z)
        cam.rotation_quaternion = q
        cam.data.lens = lens
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_quaternion", frame=f)
        cam.data.keyframe_insert("lens", frame=f)


def key_searchlight(heli_dict, frames, target_fn, f0=F0, fps=FPS):
    """Le projecteur d'hélicoptère (cast_vehicles.load_helicopter) qui vise target_fn(t) -> (x, y, z) monde à
    chaque image ; l'hélicoptère doit déjà avoir ses clés (son pivot suit sa cellule)."""
    import bpy
    from mathutils import Matrix, Vector
    piv = heli_dict["searchlight_pivot"]
    _clear(piv)
    piv.rotation_mode = "XYZ"
    sc = bpy.context.scene
    prev = None
    for f in frames:
        sc.frame_set(f)
        p = piv.matrix_world.translation.copy()
        d = (Vector(target_fn(t_of(f, f0, fps))) - p).normalized()
        piv.matrix_world = Matrix.Translation(p) @ d.to_track_quat("-Z", "Y").to_matrix().to_4x4()
        bpy.context.view_layer.update()
        e = piv.rotation_euler.copy()
        if prev is not None:
            e.make_compatible(prev)
            piv.rotation_euler = e
        prev = e.copy()
        piv.keyframe_insert("location", frame=f)
        piv.keyframe_insert("rotation_euler", frame=f)


def _tone(color):
    """« corail » ou « lilas » pour une couleur de lumière (linéaire), None sinon."""
    r, g, b = color[:3]
    if r > 0.5 and b < 0.25 * r and g < 0.35 * r:
        return "corail"
    if b > 0.5 and r < 0.75 * b and g < 0.6 * b:
        return "lilas"
    return None


def flash_bars(roots, frames, period=12, low=0.06):
    """Le clignotement des rampes de la meute : chaque lumière corail ou lilas d'un véhicule (descendance du rig :
    lueurs de rampe, faisceaux, flaques) s'allume la moitié de la période, en alternance corail / lilas, clés
    constantes ; chaque véhicule est décalé de quelques images. Les lentilles émissives restent allumées."""
    n = 0
    for i, root in enumerate(roots):
        offset = (i * 5) % period
        for ob in [root, *root.children_recursive]:
            if ob.type != "LIGHT":
                continue
            tone = _tone(ob.data.color)
            if tone is None:
                continue
            d = ob.data
            if d.animation_data and d.animation_data.action:
                d.animation_data.action = None
            full = d.get("motion_energy", d.energy)
            d["motion_energy"] = full
            for f in frames:
                d.energy = full if bar_phase(f, period, offset) == tone else full * low
                d.keyframe_insert("energy", frame=f)
            for fc in fcurves(d):
                for kp in fc.keyframe_points:
                    kp.interpolation = "CONSTANT"
            n += 1
    return n


def fcurves(idblock):
    """Les courbes de l'action d'un bloc (Blender 5 : rangées dans les tranches de l'action)."""
    ad = idblock.animation_data
    act = ad.action if ad else None
    if act is None:
        return []
    curves = list(getattr(act, "fcurves", []) or [])
    if not curves:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves += list(bag.fcurves)
    return curves


def spin_rotors(heli_dict, rpm_main=380.0, rpm_tail=2200.0):
    """Les rotors d'un hélicoptère de cast_vehicles, en tours par minute (pilotes sur l'image)."""
    import cast_vehicles as cv
    cv.spin_rotors(heli_dict, rpm_main=rpm_main, rpm_tail=rpm_tail)
