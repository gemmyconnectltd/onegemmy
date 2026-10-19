import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const designApps = ['frontend', 'website', 'super-admin'];
export const designArtifacts = ['tokens.json', 'tokens.css', 'components.css', 'button.ts'];

/** Checked-in build artifacts allow each app's Docker context to stand alone.
 * Canonical files remain in /design-system; CI rejects edited or stale copies. */
export function syncDesignSystem({ check = false, projectRoot = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
  for (const app of designApps) {
    const target = resolve(projectRoot, app, 'src/design-system');
    if (!check) mkdirSync(target, { recursive: true });
    for (const name of designArtifacts) {
      const source = readFileSync(resolve(projectRoot, 'design-system', name));
      const destination = resolve(target, name);
      if (check) {
        if (!existsSync(destination) || !source.equals(readFileSync(destination))) {
          throw Error(`${app}/src/design-system/${name} is missing or stale. Run node scripts/generate-design-tokens.mjs`);
        }
      } else writeFileSync(destination, source);
    }
  }
}
