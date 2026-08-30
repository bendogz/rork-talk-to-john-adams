#!/usr/bin/env bash
# Stitch the generated Adams source clips into one 60s+ training video,
# then upload it to a public host D-ID can fetch.
set -euo pipefail
cd tmp/stitch

# 1) Normalize every clip to identical 9:16 parameters so concat is lossless.
i=0
: > list.txt
for url in "$@"; do
  i=$((i+1))
  echo ">> normalizing clip $i"
  curl -sL "$url" -o "raw_$i.mp4"
  ffmpeg -y -loglevel error -i "raw_$i.mp4" -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=25,setsar=1" -c:v libx264 -crf 20 -preset fast -pix_fmt yuv420p -an "norm_$i.mp4"
  echo "file 'norm_$i.mp4'" >> list.txt
done

# 2) Concat.
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c copy adams_source_full.mp4
ffmpeg -loglevel error -i adams_source_full.mp4 2>&1 | grep Duration || ffprobe -v error -show_entries format=duration -of csv=p=0 adams_source_full.mp4

# 3) Upload for a permanent public URL.
echo ">> uploading"
curl -s -F reqtype=fileupload -F "fileToUpload=@adams_source_full.mp4" https://catbox.moe/user/api.php
echo
