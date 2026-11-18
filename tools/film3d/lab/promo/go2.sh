#!/bin/bash
# promo, la rotation : après les photos de la berline (carte 0), dans la lumière écrite dans $O/light (neon sinon),
# le carré 1080 puis la verticale 1080 × 1920, deux Blender sur la carte 0 ; les mp4 en boucle
set -u
B=/root/blender-5.2.2-linux-x64/blender
R=/root/promo/tools/film3d
O=/root/promo-out
export FILM3D_ASSETS=/root/film/assets FILM3D_HERO=w111
until [ "$(grep -c photos $O/car.t 2>/dev/null)" -ge 2 ] 2>/dev/null; do sleep 10; done
L=$(cat $O/light 2>/dev/null || echo neon)
S=$(cat $O/samples 2>/dev/null || echo 128)
rot() { CUDA_VISIBLE_DEVICES=${GPU:-0} nice $B -b --factory-startup -P $R/lab/promo_car.py -- --mode rot --light $L \
  --samples $S --fill 0.64 --disc 2.7,3.8 "$@"; }
date "+%H:%M:%S rotation $L $S" >> $O/rot.t
rot --res 1080x1080 --frames 1-72 --out $O/rot-1080 > $O/rot-a.log 2>&1 &
rot --res 1080x1080 --frames 73-144 --out $O/rot-1080 > $O/rot-b.log 2>&1 &
wait
ffmpeg -loglevel error -y -framerate 24 -i $O/rot-1080/%04d.png -vf "geq=r='r(X,Y)*clip((0.5*W-hypot(X-W/2,Y-H/2))/(0.12*W),0,1)':g='g(X,Y)*clip((0.5*W-hypot(X-W/2,Y-H/2))/(0.12*W),0,1)':b='b(X,Y)*clip((0.5*W-hypot(X-W/2,Y-H/2))/(0.12*W),0,1)',format=yuv420p" -c:v libx264 -pix_fmt yuv420p -crf 14 \
  -preset slow -movflags +faststart $O/rotation-1080.mp4
date "+%H:%M:%S carré fini" >> $O/rot.t
rot --res 1080x1920 --frames 1-72 --out $O/rot-1920 > $O/rotv-a.log 2>&1 &
rot --res 1080x1920 --frames 73-144 --out $O/rot-1920 > $O/rotv-b.log 2>&1 &
wait
ffmpeg -loglevel error -y -framerate 24 -i $O/rot-1920/%04d.png -vf "geq=r='r(X,Y)*clip((0.5*W-hypot(X-W/2,Y-H/2))/(0.12*W),0,1)':g='g(X,Y)*clip((0.5*W-hypot(X-W/2,Y-H/2))/(0.12*W),0,1)':b='b(X,Y)*clip((0.5*W-hypot(X-W/2,Y-H/2))/(0.12*W),0,1)',format=yuv420p" -c:v libx264 -pix_fmt yuv420p -crf 14 \
  -preset slow -movflags +faststart $O/rotation-1080x1920.mp4
date "+%H:%M:%S verticale finie" >> $O/rot.t
