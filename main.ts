// NEON HARBOR — make.fun gta6-01 entry program (Node 22, standard library only).
//
// Copies game/ and screenshots/ from this repository into the output directory
// and writes /output/dossier.json with the kit's buildDossier, byte for byte
// the way the scorer rebuilds it. Runs twice; both runs write identical bytes.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function copyTreeInto(srcDir: string, destDir: string): void {
  if (!existsSync(srcDir)) {
    throw new Error(`NEON HARBOR: missing directory ${srcDir}`);
  }
  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, dereference: false });
}

function main(): void {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  copyTreeInto(join(REPO_ROOT, 'game'), join(OUT_DIR, 'game'));
  copyTreeInto(join(REPO_ROOT, 'screenshots'), join(OUT_DIR, 'screenshots'));
  const dossier = buildDossier(OUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);
  console.log(`NEON HARBOR: wrote ${OUT_DIR}/dossier.json (${dossier.length} bytes)`);
}

main();
