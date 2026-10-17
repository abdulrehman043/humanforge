// Smoke test: every option builds, codec round-trips, GLB is well-formed.
import { writeFileSync } from 'node:fs';
import {
  DEFAULT_AVATAR, ENUMS, AvatarConfig, avatarToGLB, buildAvatarGeometry, decodeAvatar, encodeAvatar, randomAvatar,
} from '../src/core';

let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.error('FAIL', msg); } };

for (const [key, opts] of Object.entries(ENUMS)) {
  for (const v of opts!) {
    const g = buildAvatarGeometry({ ...DEFAULT_AVATAR, [key]: v } as AvatarConfig);
    const bad = g.parts.some((p) => (p.geometry.attributes.position.array as Float32Array).some((n) => !isFinite(n)));
    check(!bad, `${key}=${v} produced NaN`);
  }
}

let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let maxTris = 0;
for (let i = 0; i < 200; i++) {
  const a = randomAvatar(rng);
  const code = encodeAvatar(a);
  const b = decodeAvatar(code);
  check(encodeAvatar(b) === code, `codec round-trip ${code}`);
  maxTris = Math.max(maxTris, buildAvatarGeometry(a).metrics.triangles);
}

const glb = avatarToGLB(DEFAULT_AVATAR);
const dv = new DataView(glb.buffer);
check(dv.getUint32(0, true) === 0x46546c67 && dv.getUint32(8, true) === glb.length, 'GLB header');
writeFileSync('demo/sample.glb', glb);

const m = buildAvatarGeometry(DEFAULT_AVATAR).metrics;
console.log(`code: ${encodeAvatar(DEFAULT_AVATAR)} (${encodeAvatar(DEFAULT_AVATAR).length} chars)`);
console.log(`default: ${m.triangles} tris, height ${m.height.toFixed(2)}m, GLB ${(glb.length / 1024).toFixed(0)} KB; max tris over 200 random: ${maxTris}`);
console.log(fails ? `${fails} failures` : 'all checks passed');
process.exit(fails ? 1 : 0);
