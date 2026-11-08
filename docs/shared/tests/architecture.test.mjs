import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
for (const platform of ['tds/fourier', 'tds/convolution', 'tds/correlation', 'tds/signaux', 'tds/filtrage', 'tim/contours', 'tim/filtrage', 'tim/morphologie', 'tim/couleurs', 'tim/histogrammes', 'tim/quantification']) {
  test(`${platform}: local assets and dependencies resolve`, async () => {
    const visited = new Set();
    async function visit(url) {
      url.search = '';
      url.hash = '';
      if (visited.has(url.href)) return;
      visited.add(url.href);
      const source = await readFile(url, 'utf8');
      if (url.pathname.endsWith('.html')) {
        for (const match of source.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) {
          assert.match(new URL(match[1], url).pathname, /\.css$/, 'Stylesheet links must target CSS');
        }
        for (const match of source.matchAll(/<script\b[^>]*src="([^"]+)"/g)) {
          assert.match(new URL(match[1], url).pathname, /\.js$/, 'Scripts must target JavaScript');
        }
      }
      const patterns = url.pathname.endsWith('.html')
        ? [/(?:src|href)=["'](\.[^"']+)["']/g]
        : url.pathname.endsWith('.css')
          ? [/url\(["']?(\.[^"')]+)["']?\)/g]
          : url.pathname.endsWith('.js')
            ? [/(?:from\s*|import\s*|fetch\(\s*)["'](\.[^"']+)["']/g]
            : [];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          const dependency = new URL(match[1], url);
          // Shared layers must not depend on platforms or another course.
          const scope = url.href.slice(root.href.length).split('/');
          const target = dependency.href.slice(root.href.length).split('/');
          if (scope[0] === 'shared') assert.equal(target[0], 'shared');
          if (scope[1] === 'shared') assert.ok(target[0] === 'shared' || (target[0] === scope[0] && target[1] === 'shared'));
          await visit(dependency);
        }
      }
      // Worker URLs in applications are relative to the document, not the module.
      if (url.pathname.endsWith('/scripts/app.js')) {
        for (const match of source.matchAll(/new Worker\(["']([^"']+)["']/g)) {
          await visit(new URL(match[1], new URL('../', url)));
        }
      }
    }
    await visit(new URL(`${platform}/index.html`, root));
  });
}
