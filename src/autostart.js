const fs = require('node:fs');
const path = require('node:path');

// Linux has no Electron login-item API, so the app writes a freedesktop autostart entry.
function autostartEntry({ exec, icon }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Morph Browser',
    'Comment=Multi-profile browser manager',
    `Exec=${exec}`,
    `Icon=${icon}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function applyAutoStart({ enabled, app, isPackaged }) {
  if (process.platform === 'linux') {
    const dir = path.join(app.getPath('home'), '.config', 'autostart');
    const file = path.join(dir, 'morph-browser.desktop');
    if (!enabled) {
      fs.rmSync(file, { force: true });
      return;
    }
    const exec = isPackaged
      ? `"${process.execPath}"`
      : `"${process.execPath}" "${path.join(__dirname, '..')}" --no-sandbox`;
    // Inside a packaged app asar paths are not usable by the desktop shell, so the installed icon name is used.
    const icon = isPackaged ? 'morph-browser' : path.join(__dirname, '..', 'build', 'icon.png');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, autostartEntry({ exec, icon }));
    return;
  }

  // Windows and macOS register the packaged executable as a login item.
  if (!isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: false });
}

function isAutoStartEnabled({ app, isPackaged }) {
  if (process.platform === 'linux') {
    return fs.existsSync(path.join(app.getPath('home'), '.config', 'autostart', 'morph-browser.desktop'));
  }
  if (!isPackaged) return false;
  return Boolean(app.getLoginItemSettings().openAtLogin);
}

module.exports = { applyAutoStart, isAutoStartEnabled, autostartEntry };
