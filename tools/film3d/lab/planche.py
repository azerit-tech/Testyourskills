#!/usr/bin/env python3
# planche avant / après : planche.py <sortie.png> <largeur cellule> <ligne1: a.png,b.png,...> <ligne2: ...>
# chaque ligne est une rangée d'images, mises à la même taille (cellule w × 16/9 w), assemblées par ffmpeg
import os
import subprocess
import sys

out, w = sys.argv[1], int(sys.argv[2])
rows = [r.split(",") for r in sys.argv[3:]]
h = w * 16 // 9
inputs, filt, labels, layout = [], [], [], []
k = 0
for j, row in enumerate(rows):
    for i, p in enumerate(row):
        if not os.path.exists(p):
            inputs += ["-f", "lavfi", "-i", f"color=c=black:s={w}x{h}"]
        else:
            inputs += ["-i", p]
        filt.append(f"[{k}:v]scale={w}:{h}[v{k}]")
        labels.append(f"[v{k}]")
        layout.append(f"{i * w}_{j * h}")
        k += 1
fc = ";".join(filt) + ";" + "".join(labels) + f"xstack=inputs={k}:layout={'|'.join(layout)}:fill=black[o]"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", fc, "-map", "[o]", "-frames:v", "1", out],
               check=True)
print(out)
