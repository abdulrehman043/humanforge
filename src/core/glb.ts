// Tiny dependency-free GLB (binary glTF 2.0) writer. Avoids three's GLTFExporter,
// which depends on Blob/FileReader APIs that React Native doesn't fully provide.
import { Color } from 'three';
import { AvatarConfig } from './config';
import { BuildOptions, buildAvatarGeometry } from './build';

export function avatarToGLB(config: Partial<AvatarConfig>, opts?: BuildOptions): Uint8Array {
  const { parts } = buildAvatarGeometry(config, opts);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const pushView = (data: ArrayBufferView, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, target });
    chunks.push(bytes, new Uint8Array(pad));
    byteLength += bytes.byteLength + pad;
    return bufferViews.length - 1;
  };

  const meshes: object[] = [];
  const materials: object[] = [];
  const nodes: object[] = [{ name: 'avatar', children: [] as number[] }];

  parts.forEach(({ role, geometry, color }, i) => {
    const pos = geometry.attributes.position.array as Float32Array;
    const nor = geometry.attributes.normal.array as Float32Array;
    const idx = geometry.index!.array as Uint16Array | Uint32Array;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < pos.length; j++) {
      const k = j % 3;
      if (pos[j] < min[k]) min[k] = pos[j];
      if (pos[j] > max[k]) max[k] = pos[j];
    }
    const count = pos.length / 3;
    accessors.push({ bufferView: pushView(pos, 34962), componentType: 5126, count, type: 'VEC3', min, max });
    accessors.push({ bufferView: pushView(nor, 34962), componentType: 5126, count, type: 'VEC3' });
    accessors.push({
      bufferView: pushView(idx, 34963),
      componentType: idx instanceof Uint32Array ? 5125 : 5123,
      count: idx.length,
      type: 'SCALAR',
    });
    const lin = new Color(color); // three's Color stores linear values when built from hex
    materials.push({
      name: role,
      pbrMetallicRoughness: { baseColorFactor: [lin.r, lin.g, lin.b, 1], metallicFactor: 0, roughnessFactor: 0.85 },
      doubleSided: true,
    });
    meshes.push({ name: role, primitives: [{ attributes: { POSITION: i * 3, NORMAL: i * 3 + 1 }, indices: i * 3 + 2, material: i }] });
    nodes.push({ name: role, mesh: i });
    (nodes[0] as { children: number[] }).children.push(i + 1);
    geometry.dispose();
  });

  const json = {
    asset: { version: '2.0', generator: 'humanforge' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes, meshes, materials, accessors, bufferViews,
    buffers: [{ byteLength }],
  };
  // JSON is pure ASCII here, so a byte-per-char copy avoids needing TextEncoder.
  const str = JSON.stringify(json);
  const jsonBytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) jsonBytes[i] = str.charCodeAt(i) & 0x7f;
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true);
  dv.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
  let o = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(o, byteLength, true);
  dv.setUint32(o + 4, 0x004e4942, true); // 'BIN\0'
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Base64 without Buffer/btoa (React Native safe) — e.g. for expo-file-system writes. */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    s += B64[n >> 18] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return s;
}
