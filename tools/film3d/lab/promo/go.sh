#!/bin/bash
# promo : attend la fin du rendu du film, puis les essais de lumière de la rotation et les photos de la berline sur
# la carte 0, les photos de décor sur la carte 1 (deux Blender par carte au plus)
set -u
B=/root/blender-5.2.2-linux-x64/blender
R=/root/promo/tools/film3d
O=/root/promo-out
export FILM3D_ASSETS=/root/film/assets FILM3D_CACHE_GB=40 FILM3D_HERO=w111 FILM3D_VITESSE=2 FILM3D_VIE=1 \
  FILM3D_FX=OUV,P1,P2,P3,P4,P5,P6,FIN6 FILM3D_FX_ONLY=eau,derapage,choc
unset FILM3D_DRAFT
until grep -q "===== fini" /root/machine-v11-final.log; do sleep 20; done
date "+%H:%M:%S fini vu" > $O/t0
car() { CUDA_VISIBLE_DEVICES=0 nice $B -b --factory-startup -P $R/lab/promo_car.py -- "$@"; }
decor() { for P in "$@"; do date "+%H:%M:%S $P" >> $O/decor.t; CUDA_VISIBLE_DEVICES=1 nice $B -b --factory-startup \
  -P $R/lab/promo_decor.py -- --plan $P --out $O/decor --ville /root/ville-v11 --essai bras=B --res 1080x1350 \
  --samples 128 --promo $O/spec-$P.json > $O/decor-$P.log 2>&1; done; date "+%H:%M:%S fin $*" >> $O/decor.t; }
decor FIN6 P3 OUV &
decor P6 P4 &
for L in neon ambre; do
  ( car --mode rot --light $L --res 1080x1080 --samples 64 --frames 1,49,97 --out $O/test-$L > $O/test-$L.log 2>&1
    date "+%H:%M:%S test $L" >> $O/car.t
    car --mode photo --light $L --res 1080x1350 --samples 256 --out $O/voiture > $O/photo-$L.log 2>&1
    date "+%H:%M:%S photos $L" >> $O/car.t ) &
done
wait
date "+%H:%M:%S tout" >> $O/car.t
