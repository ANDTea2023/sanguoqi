import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectDirectory, '三国弈.html');

const result = await build({
  configFile: false,
  root: projectDirectory,
  publicDir: false,
  logLevel: 'warn',
  build: {
    write: false,
    emptyOutDir: false,
    cssCodeSplit: false,
    target: 'es2020',
    minify: 'esbuild',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: resolve(projectDirectory, 'src/chess.ts'),
      name: 'ThreeKingdomsChess',
      formats: ['iife'],
      fileName: () => 'three-kingdoms-chess.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output ?? []);
const chunks = outputs.filter(item => item.type === 'chunk');
const styles = outputs.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
const otherAssets = outputs.filter(item => item.type === 'asset' && !item.fileName.endsWith('.css'));

if (chunks.length !== 1 || !styles.length || chunks[0].imports.length || chunks[0].dynamicImports.length || otherAssets.length) {
  throw new Error('Standalone export must contain exactly one self-contained JavaScript bundle and inline CSS.');
}

const css = styles.map(item => typeof item.source === 'string'
  ? item.source : new TextDecoder().decode(item.source)).join('\n');
const cssUrls = [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map(match => match[2]);
if (/@import\b/i.test(css) || cssUrls.some(url => !/^(?:data:|#)/i.test(url))) {
  throw new Error('Standalone CSS contains an external asset reference. Inline the asset before exporting.');
}

// HTML raw-text elements close even when their end tag occurs inside a code string.
const inlineScript = chunks[0].code.replace(/<\/script/gi, closing => closing.replace('/', '\\/')).replace(/<!--/g, '<\\!--');
const inlineStyle = css.replace(/<\/style/gi, closing => closing.replace('/', '\\/'));
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#f4f1e9">
  <meta name="description" content="三国弈：保留传统中国象棋元素，魏、蜀、吴三人同屏对弈。支持经典象棋与棋子调色，双击即可离线游玩。">
  <title>三国弈 · 魏蜀吴三人象棋</title>
  <style>${inlineStyle}</style>
</head>
<body>
  <div id="app"></div>
  <noscript>三国弈需要浏览器开启 JavaScript 才能对弈。</noscript>
  <script>${inlineScript}
ThreeKingdomsChess.mountChessGame(document.getElementById('app'));
  </script>
</body>
</html>
`;

await writeFile(outputPath, html, 'utf8');
console.log(`Standalone game ready: ${outputPath}`);
