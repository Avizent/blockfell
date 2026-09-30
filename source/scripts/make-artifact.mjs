// Converts the single-file build into an Artifact page body (no doctype/html/head/body).
import fs from 'node:fs';
const src = fs.readFileSync('dist-single/index.html', 'utf8');
const styles = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...src.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('no module script found');
const out = `<title>Blockfell</title>
<style>
:root { color-scheme: dark; }
html, body { background: #101014; }
${styles}
</style>
<div id="root"></div>
<noscript>Blockfell needs JavaScript and WebGL 2.</noscript>
${scripts.map((s) => `<script type="module">${s}</script>`).join('\n')}
`;
fs.mkdirSync('dist-artifact', { recursive: true });
fs.writeFileSync('dist-artifact/blockfell.html', out);
console.log('artifact page', (out.length / 1024).toFixed(0), 'KB');
