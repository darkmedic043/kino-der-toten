import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePatch, resolveWeapons } from '../export/web/mod-loader.js';

test('data patches merge objects, replace arrays and delete with null', () => {
  const base = {rules: {a: 1, b: 2}, list: [1, 2], gone: true};
  assert.deepEqual(mergePatch(base, {rules: {b: 3, c: 4}, list: [9], gone: null}), {rules: {a: 1, b: 3, c: 4}, list: [9]});
  assert.deepEqual(base, {rules: {a: 1, b: 2}, list: [1, 2], gone: true});
});

test('array add/remove patches edit the box pool in place', () => {
  assert.deepEqual(mergePatch(['a', 'b', 'c'], {add: ['d', 'a'], remove: ['b']}), ['a', 'c', 'd']);
});

test('weapons can extend other weapons, including chains and upgrades', () => {
  const data = {weapons: {
    base_zm: {id: 'base_zm', name: 'Base', damage: 10, model: 'm.glb', upgrade: {name: 'Up', damage: 20, clipSize: 5}},
    child_zm: {extends: 'base_zm', name: 'Child', upgrade: {name: 'Child Up'}},
    grandchild_zm: {extends: 'child_zm', damage: 99},
  }};
  resolveWeapons(data);
  assert.deepEqual(data.weapons.child_zm, {id: 'child_zm', name: 'Child', damage: 10, model: 'm.glb', upgrade: {name: 'Child Up', damage: 20, clipSize: 5}});
  assert.equal(data.weapons.grandchild_zm.damage, 99);
  assert.equal(data.weapons.grandchild_zm.name, 'Child');
  assert.equal(data.weapons.grandchild_zm.id, 'grandchild_zm');
  assert.equal(data.weapons.base_zm.name, 'Base');
});

test('unknown or circular weapon bases are reported', () => {
  assert.throws(() => resolveWeapons({weapons: {a: {extends: 'missing'}}}), /unknown base/);
  assert.throws(() => resolveWeapons({weapons: {a: {extends: 'b'}, b: {extends: 'a'}}}), /circular/);
});
