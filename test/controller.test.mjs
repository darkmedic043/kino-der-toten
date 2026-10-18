import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trigger, buildCommon, buildReport, crc32, PLAYER_LEDS, isDualSenseDevice } from '../export/web/mods/controller/dualsense.js';
import { identify, glyph, glyphUrl, label, INDEX, BUTTONS, BRANDS } from '../export/web/mods/controller/glyphs.js';

test('trigger effects use the DualSense modes and zone encodings', () => {
  assert.equal(trigger.off()[0], 0x05);
  assert.equal(trigger.off().length, 11);
  // feedback from position 2 at strength 8: zones 2..9 active, force 7 in each 3-bit slot
  const fb = trigger.feedback(2, 8);
  assert.equal(fb[0], 0x21);
  assert.equal(fb[1] | (fb[2] << 8), 0b1111111100);
  let zones = 0; for (let i = 2; i < 10; i++) zones |= 7 << (3 * i);
  assert.equal((fb[3] | (fb[4] << 8) | (fb[5] << 16) | (fb[6] << 24)) >>> 0, zones >>> 0);
  assert.deepEqual(trigger.feedback(3, 0), trigger.off());
  // weapon: start and end bits, strength-1
  const w = trigger.weapon(2, 5, 6);
  assert.equal(w[0], 0x25); assert.equal(w[1], (1 << 2) | (1 << 5)); assert.equal(w[3], 5);
  // out-of-range inputs are clamped, the end stays past the start
  const w2 = trigger.weapon(9, 1, 20);
  assert.equal(w2[1] | (w2[2] << 8), (1 << 7) | (1 << 8)); assert.equal(w2[3], 7);
  // vibration carries its frequency in byte 9
  const v = trigger.vibration(3, 4, 12);
  assert.equal(v[0], 0x26); assert.equal(v[9], 12); assert.equal(v[1] | (v[2] << 8), 0b1111111000);
  // bow packs strength and snap into one pair
  const b = trigger.bow(1, 6, 8, 3);
  assert.equal(b[0], 0x22); assert.equal(b[1], (1 << 1) | (1 << 6)); assert.equal(b[3], 7 | (2 << 3));
  const m = trigger.machine(2, 7, 7, 1, 20, 3);
  assert.equal(m[0], 0x27); assert.equal(m[3], 7 | (1 << 3)); assert.equal(m[4], 20); assert.equal(m[5], 3);
  for (const t of [fb, w, v, b, m]) assert.equal(t.length, 11);
});

test('the common report puts every field where the controller reads it', () => {
  const c = buildCommon({ rumble: [1, .5], lightbar: [1, 0, .5], leds: PLAYER_LEDS[3], micLed: 1, right: trigger.weapon(2, 5, 6), left: trigger.feedback(4, 2) });
  assert.equal(c.length, 47);
  assert.equal(c[0], 0x0f); assert.equal(c[1], 0x15);
  assert.equal(c[3], 255); assert.equal(c[2], 128);      // left = strong, right = weak
  assert.equal(c[8], 1);
  assert.equal(c[10], 0x25); assert.equal(c[21], 0x21);  // right trigger at 10, left at 21
  assert.equal(c[43], 0x15);
  assert.deepEqual([c[44], c[45], c[46]], [255, 0, 128]);
  assert.equal(c[38], 0); assert.equal(c[41], 0);
  // the setup report resets the light bar instead of colouring it
  const s = buildCommon({}, true);
  assert.equal(s[1] & 0x04, 0); assert.equal(s[38], 0x02); assert.equal(s[41], 0x02);
});

test('USB and Bluetooth framing', () => {
  const usb = buildReport({ lightbar: [0, 1, 0] });
  assert.equal(usb.id, 0x02); assert.equal(usb.data.length, 47); assert.equal(usb.data[45], 255);
  const bt = buildReport({ lightbar: [0, 1, 0] }, { bluetooth: true, seq: 5 });
  assert.equal(bt.id, 0x31); assert.equal(bt.data.length, 77);
  assert.equal(bt.data[0], 5 << 4); assert.equal(bt.data[1], 0x10);
  assert.equal(bt.data[2 + 45], 255);
  // CRC-32 over the 0xA2 seed, the report id and the first 73 bytes, little-endian at the end
  const crc = crc32([0x31, ...bt.data.subarray(0, 73)], crc32([0xa2]));
  assert.equal(bt.data[73] | (bt.data[74] << 8) | (bt.data[75] << 16) | (bt.data[76] << 24), crc | 0);
  // a known CRC-32 ("123456789" -> cbf43926) checks the table
  assert.equal(crc32([...'123456789'].map(ch => ch.charCodeAt(0))) ^ 0xffffffff, 0xcbf43926 | 0);
});

test('DualSense models are recognised, Edge included, other pads are not', () => {
  assert.ok(isDualSenseDevice({ vendorId: 0x054c, productId: 0x0ce6 }));
  assert.ok(isDualSenseDevice({ vendorId: 0x054c, productId: 0x0df2 }));
  assert.ok(!isDualSenseDevice({ vendorId: 0x054c, productId: 0x09cc }));
  assert.ok(!isDualSenseDevice({ vendorId: 0x045e, productId: 0x0b12 }));
});

test('gamepad ids are identified by vendor and product, or by name', () => {
  const ds = identify('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)');
  assert.deepEqual([ds.brand, ds.kind, ds.vendor, ds.product, ds.name], ['ps', 'dualsense', 0x054c, 0x0ce6, 'DualSense Wireless Controller']);
  assert.equal(identify('054c-0df2-DualSense Edge Wireless Controller').kind, 'dualsense-edge');
  assert.equal(identify('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)').kind, 'dualshock4');
  const xb = identify('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)');
  assert.deepEqual([xb.brand, xb.kind], ['xbox', 'xbox-series']);
  assert.equal(identify('Xbox 360 Controller (XInput STANDARD GAMEPAD)').brand, 'xbox');
  assert.equal(identify('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)').brand, 'nintendo');
  assert.deepEqual([identify('Generic USB Joystick').brand, identify('').name], ['generic', 'Controller']);
});

test('every brand has a glyph for every button, in its own naming', () => {
  for (const brand of BRANDS) for (const button of BUTTONS) {
    const svg = glyph(brand, button);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${brand}/${button}`);
    assert.ok(glyphUrl(brand, button).startsWith("url('data:image/svg+xml,") && !glyphUrl(brand, button).includes('"'));
  }
  assert.deepEqual([label('xbox', 'south'), label('ps', 'south'), label('nintendo', 'south')], ['A', 'Cross', 'B']);
  assert.deepEqual([label('xbox', 'rb'), label('ps', 'rb'), label('nintendo', 'rt')], ['RB', 'R1', 'ZR']);
  assert.ok(glyph('xbox', 'south').includes('>A<'));
  assert.ok(glyph('nintendo', 'east').includes('>A<'));
  assert.ok(glyph('ps', 'north').includes('<path'));   // a drawn triangle, no letter
  assert.equal(INDEX[0], 'south'); assert.equal(INDEX[17], 'touchpad');
});
