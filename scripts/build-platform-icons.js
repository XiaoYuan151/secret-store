const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const platform = path.join(assets, 'platform');
const source = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
const paths = [...source.matchAll(/<path\b[^>]*\/>/g)].map(match => match[0]).join('');
const iconColor = '#203F7D';
const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${content}</svg>\n`;
const write = (name, data) => { fs.mkdirSync(path.dirname(name), { recursive: true }); fs.writeFileSync(name, data); };
const raster = (input, size, opaque = false) => execFileSync('magick', ['-background', 'none', '-density', '256', input, '-resize', `${size}x${size}`, ...(opaque ? ['-alpha', 'off'] : []), '-depth', '8', opaque ? 'PNG24:-' : 'PNG32:-'], { maxBuffer: 8 * 1024 * 1024 });

const apple = path.join(platform, 'apple');
const lightSource = path.join(apple, 'background-light.svg');
const darkSource = path.join(apple, 'background-dark.svg');
const foreground = path.join(apple, 'foreground.svg');
write(lightSource, svg(`<rect width="1024" height="1024" fill="${iconColor}"/>`));
write(darkSource, svg(`<rect width="1024" height="1024" fill="${iconColor}"/>`));
write(foreground, svg(paths));
write(path.join(apple, 'foreground-mono.svg'), svg(paths.replaceAll('fill="#fff"', 'fill="#000"')));
const makeAppleIcon = (background, output) => {
  const combined = path.join(apple, `icon-${background}.svg`);
  write(combined, svg(`<rect width="1024" height="1024" fill="${iconColor}"/>${paths}`));
  write(output, raster(combined, 1024, true));
};
const ios = path.join(platform, 'ios', 'AppIcon.appiconset');
makeAppleIcon('light', path.join(ios, 'AppIcon-Light.png'));
makeAppleIcon('dark', path.join(ios, 'AppIcon-Dark.png'));
write(path.join(ios, 'Contents.json'), JSON.stringify({
  images: [
    { filename: 'AppIcon-Light.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'AppIcon-Dark.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }
  ],
  info: { author: 'xcode', version: 1 }
}, null, 2) + '\n');

write(path.join(assets, 'icon.png'), raster(path.join(assets, 'icon.svg'), 1024));
const darkRounded = path.join(assets, 'icon-dark.svg');
write(darkRounded, source);
write(path.join(assets, 'icon-dark.png'), raster(darkRounded, 1024));
for (const size of [16, 32]) write(path.join(assets, `icon-${size}.png`), raster(path.join(assets, 'icon.svg'), size));
const icnsTypes = [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']];
const chunks = icnsTypes.map(([size, type]) => {
  const png = raster(path.join(assets, 'icon.svg'), size);
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
});
const body = Buffer.concat(chunks);
const header = Buffer.alloc(8);
header.write('icns', 0, 'ascii');
header.writeUInt32BE(body.length + 8, 4);
write(path.join(assets, 'icon.icns'), Buffer.concat([header, body]));
write(path.join(platform, 'macos', 'AppIcon.icns'), Buffer.concat([header, body]));
makeAppleIcon('light', path.join(platform, 'macos', 'AppIcon-Source-1024.png'));

execFileSync('magick', [path.join(assets, 'icon.png'), '-define', 'icon:auto-resize=256,128,64,48,32,16', path.join(assets, 'icon.ico')]);
write(path.join(platform, 'windows', 'AppIcon.ico'), fs.readFileSync(path.join(assets, 'icon.ico')));
for (const [name, size] of [['Square44x44Logo.scale-100', 44], ['Square44x44Logo.scale-200', 88], ['Square44x44Logo.scale-400', 176], ['Square150x150Logo.scale-100', 150], ['Square150x150Logo.scale-200', 300], ['Square150x150Logo.scale-400', 600]]) {
  write(path.join(platform, 'windows', `${name}.png`), raster(path.join(assets, 'icon.svg'), size));
}
for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  write(path.join(platform, 'linux', 'hicolor', `${size}x${size}`, 'apps', 'secret-store.png'), raster(path.join(assets, 'icon.svg'), size));
}
write(path.join(platform, 'linux', 'hicolor', 'scalable', 'apps', 'secret-store.svg'), source);
