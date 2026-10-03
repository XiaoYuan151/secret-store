const fs = require('node:fs');
const path = require('node:path');
const brands = require('@fortawesome/free-brands-svg-icons');
const solid = require('@fortawesome/free-solid-svg-icons');

const icons = {
  github: [brands, 'faGithub'],
  gitlab: [brands, 'faGitlab'],
  gitee: [brands, 'faGitee'],
  'hugging-face': [brands, 'faHuggingFace'],
  openai: [brands, 'faOpenai'],
  aws: [brands, 'faAws'],
  cloudflare: [brands, 'faCloudflare'],
  discord: [brands, 'faDiscord'],
  twitch: [brands, 'faTwitch'],
  stripe: [brands, 'faStripe'],
  qq: [brands, 'faQq'],
  cloud: [solid, 'faCloud'],
  robot: [solid, 'faRobot'],
  brain: [solid, 'faBrain'],
  key: [solid, 'faKey'],
  route: [solid, 'faRoute'],
  'network-wired': [solid, 'faNetworkWired'],
  microchip: [solid, 'faMicrochip'],
  globe: [solid, 'faGlobe'],
  'layer-group': [solid, 'faLayerGroup'],
  clock: [solid, 'faClock'],
  'magnifying-glass': [solid, 'faMagnifyingGlass'],
  lock: [solid, 'faLock'],
  moon: [solid, 'faMoon'],
  sun: [solid, 'faSun'],
  fingerprint: [solid, 'faFingerprint'],
  plus: [solid, 'faPlus'],
  copy: [solid, 'faCopy'],
  eye: [solid, 'faEye']
};
const output = path.join(__dirname, '..', 'assets', 'fontawesome');
fs.mkdirSync(output, { recursive: true });
for (const [name, [pack, symbol]] of Object.entries(icons)) {
  const definition = pack[symbol];
  if (!definition) throw new Error(`Missing Font Awesome icon: ${symbol}`);
  const [width, height, , , paths] = definition.icon;
  const elements = (Array.isArray(paths) ? paths : [paths]).map(d => `<path d="${d}"/>`).join('');
  fs.writeFileSync(path.join(output, `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${elements}</svg>\n`);
}
const css = Object.keys(icons).map(name => `.fa-${name}{--fa-mask:url("./${name}.svg")}`).join('\n');
fs.writeFileSync(path.join(output, 'icons.css'), `.fa-icon{display:inline-block;width:1em;height:1em;flex:none;background:currentColor;-webkit-mask:var(--fa-mask) center/contain no-repeat;mask:var(--fa-mask) center/contain no-repeat}\n${css}\n`);
fs.copyFileSync(path.join(__dirname, '..', 'node_modules', '@fortawesome', 'free-brands-svg-icons', 'LICENSE.txt'), path.join(output, 'LICENSE.txt'));
