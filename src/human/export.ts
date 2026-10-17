// Optional GLB export (web). Kept out of runtime.ts so React Native bundles never include gltf-transform.
import type { MeshStandardMaterial, SkinnedMesh } from 'three';
import type { HumanAvatar } from './runtime';

/**
 * Export the current avatar (reshaped mesh, Mixamo skeleton, ARKit-named blendshapes, textures)
 * as a compressed binary glTF: sparse morph targets, quantized vertices (KHR_mesh_quantization),
 * JPEG for opaque textures. Web only: GLTFExporter re-encodes textures through a canvas.
 */
export async function exportHumanGLB(avatar: HumanAvatar): Promise<Uint8Array> {
  const [{ GLTFExporter }, { WebIO }, { KHRMeshQuantization }, { sparse, quantize, dedup, prune }] = await Promise.all([
    import('three/examples/jsm/exporters/GLTFExporter.js'),
    import('@gltf-transform/core'),
    import('@gltf-transform/extensions'),
    import('@gltf-transform/functions'),
  ]);
  const names = avatar.expressionNames;
  avatar.group.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isMesh) return;
    if (m.morphTargetInfluences) m.morphTargetDictionary = Object.fromEntries(names.map((n, i) => [n, i]));
    const mat = m.material as MeshStandardMaterial;
    const alpha = mat.transparent || mat.alphaTest > 0;
    for (const t of [mat.map, mat.normalMap]) if (t) t.userData.mimeType = alpha ? 'image/png' : 'image/jpeg';
  });
  // the hair's soft-tip pass is a render-time duplicate; export the mesh once
  const tips: SkinnedMesh[] = [];
  avatar.group.traverse((o) => { if (o.userData.softPass && o.visible) { tips.push(o as SkinnedMesh); o.visible = false; } });
  const raw = (await new GLTFExporter().parseAsync(avatar.group, { binary: true, onlyVisible: true }).finally(() => tips.forEach((t) => (t.visible = true)))) as ArrayBuffer;
  const io = new WebIO().registerExtensions([KHRMeshQuantization]);
  const doc = await io.readBinary(new Uint8Array(raw));
  // quantize first: it rewrites accessors, which would drop the sparse flag set by sparse()
  await doc.transform(dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), sparse({ ratio: 0.3 }));
  return io.writeBinary(doc);
}
