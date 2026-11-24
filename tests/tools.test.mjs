import test from 'node:test';
import assert from 'node:assert/strict';
import { compareIds } from '../tools/ids.mjs';
import { analyze, whereToFix } from '../tools/flags.mjs';
import { bumpVersion, uploadBatches, diffManifests } from '../tools/release.mjs';
import { loadFromDisk } from '../tools/validate.mjs';

test('id guard: a shipped id that disappears is reported, a retired one is not, new ones are listed', () => {
  const lock = { shipped: ['a.1', 'a.2', 'a.3'], retired: ['a.3'] };
  const { missing, added } = compareIds(lock, ['a.1', 'b.1']);
  assert.deepEqual(missing, ['a.2']);
  assert.deepEqual(added, ['b.1']);
  assert.deepEqual(compareIds(lock, ['a.1', 'a.2']).missing, []);
});

test('the lock file covers the content as it stands', async () => {
  const { readLock, currentIds } = await import('../tools/ids.mjs');
  const { missing } = compareIds(await readLock(), await currentIds());
  assert.deepEqual(missing, [], 'a shipped sentence id is missing; run node tools/ids.mjs check');
});

test('release: version bumps', () => {
  assert.equal(bumpVersion('0.6.0', 'patch'), '0.6.1');
  assert.equal(bumpVersion('0.6.3', 'minor'), '0.7.0');
  assert.equal(bumpVersion('0.6.3', 'major'), '1.0.0');
  assert.equal(bumpVersion('0.6.3', '2.1.0'), '2.1.0');
  assert.throws(() => bumpVersion('0.6.3', 'huge'));
});

test('flags: groups flags by sentence, finds repeat misses, says where to fix each', async () => {
  const content = await loadFromDisk();
  const handId = 'core.1.01';
  const genId = [...content.itemsById.keys()].find((id) => id.startsWith('swap.1.'));
  assert.ok(genId, 'a generated swap sentence exists');
  const data = {
    app: 'latin-app',
    flags: [{ itemId: handId, kind: 'problem', given: 'x' }, { itemId: handId, kind: 'problem', given: 'y' }, { itemId: 'gone.9', kind: 'problem' }],
    mistakes: [
      { itemId: genId, tags: ['word:habeo'] }, { itemId: genId, tags: ['word:habeo', 'spelling'] },
      { itemId: handId, tags: [] },
    ],
  };
  const r = analyze(data, content);
  assert.equal(r.flagged.length, 2);
  assert.equal(r.flagged.find((f) => f.id === handId).flags.length, 2);
  assert.deepEqual(r.unknown, ['gone.9']);
  assert.equal(r.trouble.length, 1, 'only the sentence missed twice is listed');
  assert.equal(r.trouble[0].id, genId);
  assert.equal(r.trouble[0].tags[0], 'word:habeo');
  assert.match(whereToFix(content, genId), /gen\/1\.json/);
  assert.match(whereToFix(content, handId), /core\/u1\.json/);
});

test('release: upload batches stay under GitHub\'s limit and lose no file', () => {
  const files = [
    ...Array.from({ length: 7 }, (_, i) => `root${i}.txt`),
    ...Array.from({ length: 72 }, (_, i) => `content/${i % 5}/f${i}.json`),
    ...Array.from({ length: 22 }, (_, i) => `js/f${i}.js`),
    ...Array.from({ length: 12 }, (_, i) => `tests/t${i}.js`),
  ];
  const batches = uploadBatches(files, 90);
  assert.ok(batches.every((b) => b.files.length <= 90));
  assert.equal(batches.flatMap((b) => b.files).length, files.length);
  assert.equal(new Set(batches.flatMap((b) => b.files)).size, files.length);
  assert.equal(batches.length, 2);
  const big = Array.from({ length: 250 }, (_, i) => `content/a/f${i}.json`);
  const bb = uploadBatches(big, 90);
  assert.ok(bb.every((b) => b.files.length <= 90) && bb.flatMap((b) => b.files).length === 250);
});

test('release: the delta lists new and edited files, and files that were removed', () => {
  const before = { 'a.js': '1', 'b.js': '2', 'gone.js': '3' };
  const after = { 'a.js': '1', 'b.js': '9', 'new.js': '4' };
  assert.deepEqual(diffManifests(before, after), { changed: ['b.js', 'new.js'], removed: ['gone.js'] });
  assert.deepEqual(diffManifests({}, after).changed.length, 3, 'with no earlier manifest everything is new');
  assert.deepEqual(diffManifests(after, after), { changed: [], removed: [] });
});
