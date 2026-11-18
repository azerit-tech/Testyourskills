#!/bin/bash
set -u
B=/root/blender-5.2.2-linux-x64/blender
R=/root/promo/tools/film3d
O=/root/promo-out
export FILM3D_ASSETS=/root/film/assets FILM3D_CACHE_GB=40 FILM3D_HERO=w111 FILM3D_VITESSE=2 FILM3D_VIE=1 \
  FILM3D_FX=OUV,P1,P2,P3,P4,P5,P6,FIN6 FILM3D_FX_ONLY=eau,derapage,choc
for P in FIN6 P6 P3; do date "+%H:%M:%S r2 $P" >> $O/decor.t; CUDA_VISIBLE_DEVICES=1 nice $B -b --factory-startup \
  -P $R/lab/promo_decor.py -- --plan $P --out $O/decor --ville /root/ville-v11 --essai bras=B --res 1080x1350 \
  --samples 128 --promo $O/spec2-$P.json > $O/decor2-$P.log 2>&1; done; date "+%H:%M:%S fin r2" >> $O/decor.t
