#!/usr/bin/env bash
#
# Register Omaski in the desktop app list: installs the icon and a
# .desktop entry pointing at this plugin's launcher. Safe to re-run;
# run again after moving the plugin directory.

set -euo pipefail

plugin_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

icon_dir="$HOME/.local/share/icons/hicolor/256x256/apps"
app_dir="$HOME/.local/share/applications"
mkdir -p "$icon_dir" "$app_dir"

cp "$plugin_dir/assets/icon.png" "$icon_dir/omaski.png"

cat > "$app_dir/omaski.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Omaski
Comment=Ski the endless slope. Avoid the yeti.
Exec=$plugin_dir/launch.sh
Icon=omaski
Terminal=false
Categories=Game;ArcadeGame;
StartupWMClass=io.github.tyrichards.omaski
EOF

command -v update-desktop-database >/dev/null &&
  update-desktop-database "$app_dir" 2>/dev/null || true

echo "installed: $app_dir/omaski.desktop (icon: $icon_dir/omaski.png)"
