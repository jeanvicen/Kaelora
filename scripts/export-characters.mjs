// Gera src/data/characters.json a partir do gerador determinístico.
// Uso: npm run characters   (Node 22+ roda o TypeScript do gerador direto)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCharacters } from '../src/content/generator.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const economy = JSON.parse(readFileSync(join(root, 'src/data/economy.json'), 'utf8'));
const chars = generateCharacters({ rarityMultiplier: economy.characters.rarityMultiplier });
const out = join(root, 'src/data/characters.json');
writeFileSync(out, JSON.stringify({ version: 1, count: chars.length, characters: chars }) + '\n');
const byRarity = {};
for (const c of chars) byRarity[c.rarity] = (byRarity[c.rarity] ?? 0) + 1;
console.log(`${chars.length} personagens gerados →`, out);
console.log('raridades:', byRarity);
