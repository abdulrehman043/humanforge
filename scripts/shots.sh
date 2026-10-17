#!/bin/sh
# Usage: scripts/shots.sh OUT_DIR name "query#code" ...  — headless Chrome screenshots of the demo.
OUT=$1; shift
while [ $# -ge 2 ]; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
    --window-size=${W:-860},${H:-800} --virtual-time-budget=3000 --screenshot="$OUT/$1.png" "http://localhost:5179/$2" >/dev/null 2>&1
  shift 2
done
