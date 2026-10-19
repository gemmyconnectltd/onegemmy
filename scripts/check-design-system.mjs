import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
export const root = fileURLToPath(new URL('../', import.meta.url));
const apps = ['frontend', 'website', 'super-admin'];
export function violations(source, file) {
  const rules = {
    'literal-color': /(?:bg|text|border|ring|from|via|to)-\[#[\da-fA-F]{3,8}\]/g,
    'competing-action': /<(?:button|a|Link)\b[^>]*className=(?:"[^"]*|\{`[^`]*)(?:bg-(?:green|emerald|purple|violet|blue|indigo)-\d{2,3})/gs,
    'custom-font': /font-\[(?!inherit)[^\]]*(?:family|serif|Arial|Roboto|Inter)[^\]]*\]/g,
    'table-style': /(?:^|\n)[^{}\n]*(?:\btable|\bth|\btd)\b[^{}\n]*\{/g,
    'font-family': /font-family:\s*["'](?!Twemoji Country Flags|Geist)[^;]+/g,
    'local-primary-token': /--(?:primary|accent)(?:-hover|-active|-light|-border)?:\s*[^;}]+/g,
  };
  if (!file.endsWith('.css')) delete rules['table-style'];
  if (file.endsWith('/Button.tsx') && !/^(frontend|super-admin)\/src\/components\/ui\/Button.tsx$/.test(file)) return { 'duplicate-button': 1 };
  // Charts may own categorical colors; status utilities are intentionally not prohibited.
  if (/\/charts\/|Chart\.tsx$/.test(file)) delete rules['literal-color'];
  return Object.fromEntries(Object.entries(rules).map(([name, pattern]) => [name, [...source.matchAll(pattern)].length]).filter(([, count]) => count));
}
function walk(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(directory, entry.name)) : /\.(tsx|css)$/.test(entry.name) ? [resolve(directory, entry.name)] : []); }
export function audit() {
  const result = {};
  for (const app of apps) for (const path of walk(resolve(root, app, 'src'))) {
    const file = relative(root, path).replaceAll('\\', '/');
    const found = violations(readFileSync(path, 'utf8'), file);
    if (Object.keys(found).length) result[file] = found;
  }
  return result;
}
export function check(current, baseline) {
  return Object.entries(current).flatMap(([file, rules]) => Object.entries(rules).filter(([name, count]) => count > (baseline[file]?.[name] ?? 0)).map(([name, count]) => `${file}: ${name} ${count} exceeds migration allowance ${baseline[file]?.[name] ?? 0}`));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  execFileSync(process.execPath, [resolve(root, 'scripts/generate-design-tokens.mjs'), '--check']);
  const baselinePath = resolve(root, 'design-system/legacy-baseline.json');
  const current = audit();
  if (process.argv.includes('--write-baseline')) { writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n'); console.log('Recorded explicit legacy migration inventory. Review changes; never refresh to bypass a failure.'); }
  else {
    const errors = check(current, JSON.parse(readFileSync(baselinePath, 'utf8')));
    for (const app of apps) {
      const css = readFileSync(resolve(root, app, 'src/app/globals.css'), 'utf8');
      if (app !== 'website' && !readFileSync(resolve(root, app, 'src/components/ui/Button.tsx'), 'utf8').includes('design-system/button')) errors.push(`${app} must reuse the shared button variants`);
      for (const name of ['tokens', 'components']) if (!css.includes(`design-system/${name}.css`)) errors.push(`${app} must import shared ${name}`);
    }
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('Design system passed: generated tokens, all three consumers, and no new legacy styling violations.');
  }
}
