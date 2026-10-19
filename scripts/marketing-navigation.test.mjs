import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${root}website/package.json`);
const ts = require('typescript');
const source = readFileSync(`${root}website/src/lib/navigation.ts`, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const navigation = {};
new Function('require', 'exports', compiled.outputText)(require, navigation);

test('desktop and mobile navigation share complete, unique sections', () => {
  assert.deepEqual(navigation.marketingMenus.map(menu => menu.key), ['product', 'solutions', 'resources']);
  assert.equal(navigation.products.length, 12);
  assert.equal(navigation.marketingMenus[1].sections.length, 2);
  for (const menu of navigation.marketingMenus) {
    for (const section of menu.sections) {
      assert.equal(new Set(section.items.map(item => item.title)).size, section.items.length);
      for (const item of section.items) {
        assert.ok(item.description.trim());
        assert.ok(item.icon, `${item.title} has an existing Lucide icon`);
      }
    }
  }
});

test('every marketing destination resolves to a public page and an existing anchor or article', () => {
  const blog = readFileSync(`${root}website/src/lib/blogPosts.ts`, 'utf8');
  for (const menu of navigation.marketingMenus) {
    for (const section of menu.sections) {
      for (const item of section.items) {
        assert.match(item.href, /^\/(?!\/)/);
        const [pathname, anchor] = item.href.split('#');
        const file = `${root}website/src/app${pathname === '/' ? '' : pathname}/page.tsx`;
        if (/^\/(products|industries)\//.test(pathname)) {
          const group = pathname.split('/')[1];
          assert.ok(existsSync(`${root}website/src/app/${group}/[slug]/page.tsx`));
          const entries = group === 'products' ? navigation.products : navigation.industries;
          assert.ok(entries.some(entry => entry.href === pathname));
        } else if (pathname.startsWith('/resources/')) {
          assert.ok(existsSync(`${root}website/src/app/resources/[slug]/page.tsx`));
          assert.ok(blog.includes(`slug: "${pathname.split('/').at(-1)}"`), item.href);
        } else {
          assert.ok(existsSync(file), item.href);
          if (anchor) {
            const page = readFileSync(file, 'utf8');
            assert.ok(page.includes(`id: "${anchor}"`) || page.includes(`id="${anchor}"`), item.href);
          }
        }
      }
    }
  }
});

test('preview IDs are unique and every product/solution has an existing, accessible image and fallback', () => {
  const ids = new Set();
  for (const menu of navigation.marketingMenus) {
    for (const section of menu.sections) {
      for (const item of section.items) {
        assert.ok(item.id);
        assert.ok(!ids.has(item.id), item.id);
        ids.add(item.id);
        if (menu.key === 'resources') continue;
        assert.ok(item.image, item.id);
        for (const key of ['src', 'fallback']) {
          assert.match(item.image[key], /^\/(marketing|screenshots)\//);
          assert.ok(existsSync(`${root}website/public${item.image[key]}`), item.image[key]);
        }
        assert.ok(item.image.alt.trim());
        assert.ok(item.image.fallbackAlt.trim());
        if (item.image.kind === 'screenshot') assert.match(item.image.src, /-menu-current\.webp$/);
      }
    }
  }
});

test('asset content changes invalidate image URLs and the checked-in manifest matches public assets', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { buildMediaManifest, syncMediaManifest } = await import('../website/scripts/navigation-media.mjs');
  const temp = mkdtempSync(join(tmpdir(), 'pesaa-media-'));
  try {
    mkdirSync(join(temp, 'marketing')); mkdirSync(join(temp, 'screenshots'));
    const image = join(temp, 'screenshots', 'preview.webp');
    writeFileSync(image, 'first image content');
    const first = buildMediaManifest(temp);
    assert.deepEqual(buildMediaManifest(temp), first);
    writeFileSync(image, 'updated image content');
    const second = buildMediaManifest(temp);
    assert.notEqual(first['/screenshots/preview.webp'], second['/screenshots/preview.webp']);
    assert.match(second['/screenshots/preview.webp'], /\?v=[a-f0-9]{12}$/);
    syncMediaManifest(`${root}website`, { check: true });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('all products and industries have dedicated routes and distinct detailed content', () => {
  const source = readFileSync(`${root}website/src/lib/marketing-details.ts`, 'utf8');
  const details = {};
  new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(details);
  const entries = [...navigation.products, ...navigation.industries];
  assert.equal(new Set(entries.map(item => item.href)).size, 24);
  assert.equal(new Set(entries.map(item => details.marketingDetails[item.id].headline)).size, 24);
  for (const item of entries) {
    const detail = details.marketingDetails[item.id];
    assert.equal(detail.steps.length, 3);
    assert.ok(detail.intro.length > 40);
    for (const id of detail.related) assert.ok(navigation.products.some(product => product.id === id));
  }
});

test('industry heroes use business photos while product previews remain redacted screenshots', () => {
  for (const item of navigation.industries) {
    assert.equal(item.image.kind, 'photo', item.id);
    assert.match(item.image.src, /^\/marketing\//);
  }
  for (const item of navigation.products) assert.equal(item.image.kind, 'screenshot', item.id);
});
