#!/usr/bin/env bash
# UI-thread smoothness on Android (the part JS can't measure): resets gfxinfo, lets you swipe /
# drag for 10 s, then prints frame stats. Usage: scripts/android-jank.sh <your.app.package>
set -euo pipefail
PKG="${1:?usage: android-jank.sh <app package>}"
adb shell dumpsys gfxinfo "$PKG" reset > /dev/null
echo "Now swipe the avatar through all angles and drag sliders for 10 s…"
sleep 10
adb shell dumpsys gfxinfo "$PKG" | grep -E "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile"
echo "Target: Janky frames < 5% and 95th percentile <= 17ms on a 60 Hz phone."
