/** Source inventory, not a claim of browser or live-data verification. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const ts = require('typescript');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const sources = [...walk('frontend/src/app/(erp)'), ...walk('frontend/src/app/(pos)'), ...walk('frontend/src/components')].filter(f => f.endsWith('.tsx'));
const records = [];
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let tables = 0, uncontainedTables = 0, formCount = 0;
  function visit(node) {
    if (ts.isJsxOpeningElement(node)) {
      const name = node.tagName.getText(ast);
      if (name === 'form') formCount++;
      if (name === 'table') {
        tables++;
        let parent = node.parent.parent, contained = false;
        while (parent) {
          if (ts.isJsxElement(parent)) {
            const tag = parent.openingElement.tagName.getText(ast);
            if (['TableScroll', 'TableWrap'].includes(tag)) contained = true;
          }
          parent = parent.parent;
        }
        if (!contained && !file.endsWith('/pos/ReceiptDocument.tsx')) uncontainedTables++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  records.push({ file, ...(file.endsWith('/page.tsx') ? { route: file.replace(/^frontend\/src\/app\/\((erp|pos)\)/, '').replace(/\/page.tsx$/, '') || '/' } : {}), tables, uncontainedTables, forms: formCount, redirect: /\bredirect\(/.test(text), explicitCards: /mobileLayout="cards"|aria-label="(?:Product|Customer|Sale) cards"/.test(text), sharedTable: /TableScroll|TableWrap/.test(text), sharedOverlay: /<Drawer\b|<ConfirmDialog\b|useConfirmDialog\(/.test(text), toolbar: text.includes('pesaa-responsive-toolbar') });
}
const report = { scope: 'ERP, desktop POS, and their shared components; static source audit', routes: records.filter(r => r.route), components: records.filter(r => !r.route) };
const target = 'docs/responsive/route-audit.json';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== JSON.stringify(report, null, 2) + '\n') throw Error('Responsive inventory is stale; run node scripts/audit-responsive.mjs');
} else { fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ routes: report.routes.length, sharedComponents: report.components.length, uncontainedTables: records.filter(r => r.uncontainedTables).map(r => ({file:r.file, count:r.uncontainedTables})) }));
