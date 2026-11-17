import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import pkg from '../package.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const REPO_URL = 'https://github.com/moraxyc/gemini-mendeleev';
const DOWNLOAD_URL = `${REPO_URL}/releases/latest/download/gemini-mendeleev.user.js`;

const banner = [
  '// ==UserScript==',
  '// @name         Gemini Mendeleev',
  `// @namespace    ${REPO_URL}`,
  `// @version      ${pkg.version}`,
  `// @description  ${pkg.description}`,
  '// @match        https://gemini.google.com/*',
  '// @run-at       document-idle',
  '// @grant        none',
  `// @downloadURL  ${DOWNLOAD_URL}`,
  `// @updateURL    ${DOWNLOAD_URL}`,
  '// ==/UserScript==',
].join('\n');

const options = {
  entryPoints: [resolve(root, 'src/main.ts')],
  outfile: resolve(root, 'dist/gemini-mendeleev.user.js'),
  bundle: true,
  format: 'iife',
  target: ['esnext'],
  minify: false,
  charset: 'utf8',
  loader: { '.css': 'text' },
  banner: { js: banner },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching src/ -> dist/gemini-mendeleev.user.js');
} else {
  await esbuild.build(options);
  console.log('Built dist/gemini-mendeleev.user.js');
}
