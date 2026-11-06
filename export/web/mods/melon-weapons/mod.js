// Melon Zombies' own weapons (fork originals, not rebuilt from another game): docs/fork/melon-weapons.md.
// Each gun is its own module with prepare(data) (the weapon def) and setup(api) (its mechanics).
import { prepareDebt, setupDebt } from './debt.js';
import { prepareHive, setupHive } from './hive.js';

export function prepare(data) {
  prepareDebt(data);
  prepareHive(data);
}

export default function setup(api) {
  setupDebt(api);
  setupHive(api);
}
