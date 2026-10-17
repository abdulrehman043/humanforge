// Slider definitions for the realistic human. Shared by the asset build
// (tools/build-human.ts decides which MakeHuman targets to bake) and the runtime.
//
// Detail sliders range -1..1: negative applies `neg` targets, positive applies `pos`.
// Targets are MakeHuman target paths relative to data/targets (without .target.gz).

export interface DetailSlider {
  id: string;
  label: string;
  group: 'head' | 'eyes' | 'nose' | 'mouth' | 'ears' | 'body';
  neg: string[];
  pos: string[];
}

const lr = (dir: string, name: string) => [`${dir}/l-${name}`, `${dir}/r-${name}`];
const pair = (id: string, label: string, group: DetailSlider['group'], dir: string, base: string, n = 'decr', p = 'incr'): DetailSlider =>
  ({ id, label, group, neg: [`${dir}/${base}-${n}`], pos: [`${dir}/${base}-${p}`] });
const pairLR = (id: string, label: string, group: DetailSlider['group'], dir: string, base: string, n = 'decr', p = 'incr'): DetailSlider =>
  ({ id, label, group, neg: lr(dir, `${base}-${n}`), pos: lr(dir, `${base}-${p}`) });
const one = (id: string, label: string, group: DetailSlider['group'], target: string): DetailSlider =>
  ({ id, label, group, neg: [], pos: [target] });

export const DETAIL_SLIDERS: DetailSlider[] = [
  // head & face shape
  pair('headWidth', 'Head width', 'head', 'head', 'head-scale-horiz'),
  pair('headHeight', 'Head height', 'head', 'head', 'head-scale-vert'),
  pair('headDepth', 'Head depth', 'head', 'head', 'head-scale-depth'),
  pair('faceFat', 'Face fullness', 'head', 'head', 'head-fat'),
  one('headOval', 'Oval face', 'head', 'head/head-oval'),
  one('headRound', 'Round face', 'head', 'head/head-round'),
  one('headSquare', 'Square face', 'head', 'head/head-square'),
  one('headHeart', 'Heart face', 'head', 'head/head-invertedtriangular'),
  pair('foreheadHeight', 'Forehead height', 'head', 'forehead', 'forehead-scale-vert'),
  pair('foreheadSlope', 'Forehead slope', 'head', 'forehead', 'forehead-trans', 'backward', 'forward'),
  pair('jaw', 'Jaw width', 'head', 'chin', 'chin-bones'),
  pair('chinWidth', 'Chin width', 'head', 'chin', 'chin-width'),
  pair('chinHeight', 'Chin height', 'head', 'chin', 'chin-height'),
  pair('chinProminence', 'Chin prominence', 'head', 'chin', 'chin-prominent'),
  pair('chinCleft', 'Chin cleft', 'head', 'chin', 'chin-cleft'),
  pairLR('cheekBones', 'Cheekbones', 'head', 'cheek', 'cheek-bones'),
  pairLR('cheekVolume', 'Cheek volume', 'head', 'cheek', 'cheek-volume'),
  // eyes & brows
  pairLR('eyeSize', 'Eye size', 'eyes', 'eyes', 'eye-scale'),
  pairLR('eyeOpening', 'Eye opening', 'eyes', 'eyes', 'eye-height2'),
  pairLR('eyeSpacing', 'Eye spacing', 'eyes', 'eyes', 'eye-trans', 'in', 'out'),
  pairLR('eyeHeight', 'Eye height', 'eyes', 'eyes', 'eye-trans', 'down', 'up'),
  pairLR('eyeTilt', 'Eye tilt', 'eyes', 'eyes', 'eye-corner1', 'down', 'up'),
  pairLR('eyeFold', 'Eyelid fold', 'eyes', 'eyes', 'eye-epicanthus', 'in', 'out'),
  pairLR('eyeBags', 'Eye bags', 'eyes', 'eyes', 'eye-bag'),
  pair('browHeight', 'Brow height', 'eyes', 'eyebrows', 'eyebrows-trans', 'down', 'up'),
  pair('browAngle', 'Brow angle', 'eyes', 'eyebrows', 'eyebrows-angle', 'down', 'up'),
  pair('browDepth', 'Brow ridge', 'eyes', 'eyebrows', 'eyebrows-trans', 'backward', 'forward'),
  // nose
  pair('noseWidth', 'Nose width', 'nose', 'nose', 'nose-scale-horiz'),
  pair('noseLength', 'Nose length', 'nose', 'nose', 'nose-scale-vert'),
  pair('noseDepth', 'Nose projection', 'nose', 'nose', 'nose-scale-depth'),
  pair('noseBridge', 'Bridge width', 'nose', 'nose', 'nose-width1'),
  pair('noseHump', 'Nose hump', 'nose', 'nose', 'nose-hump'),
  pair('noseTip', 'Tip up/down', 'nose', 'nose', 'nose-point', 'down', 'up'),
  pair('noseTipWidth', 'Tip width', 'nose', 'nose', 'nose-point-width'),
  pair('nostrils', 'Nostril width', 'nose', 'nose', 'nose-nostrils-width'),
  pair('noseFlare', 'Nostril flare', 'nose', 'nose', 'nose-flaring'),
  // mouth
  pair('mouthWidth', 'Mouth width', 'mouth', 'mouth', 'mouth-scale-horiz'),
  pair('mouthHeight', 'Mouth position', 'mouth', 'mouth', 'mouth-trans', 'down', 'up'),
  pair('upperLip', 'Upper lip', 'mouth', 'mouth', 'mouth-upperlip-volume'),
  pair('lowerLip', 'Lower lip', 'mouth', 'mouth', 'mouth-lowerlip-volume'),
  pair('cupidsBow', "Cupid's bow", 'mouth', 'mouth', 'mouth-cupidsbow'),
  pair('mouthCorners', 'Mouth corners', 'mouth', 'mouth', 'mouth-angles', 'down', 'up'),
  pair('mouthDepth', 'Mouth depth', 'mouth', 'mouth', 'mouth-scale-depth'),
  pair('dimples', 'Dimples', 'mouth', 'mouth', 'mouth-dimples', 'in', 'out'),
  // ears
  pairLR('earSize', 'Ear size', 'ears', 'ears', 'ear-scale'),
  pairLR('earAngle', 'Ear angle', 'ears', 'ears', 'ear-rot', 'backward', 'forward'),
  pairLR('earLobe', 'Ear lobe', 'ears', 'ears', 'ear-lobe'),
  { id: 'earPointed', label: 'Pointed ears', group: 'ears', neg: [], pos: lr('ears', 'ear-shape-pointed') },
  // body detail
  pair('neckWidth', 'Neck width', 'body', 'neck', 'neck-scale-horiz'),
  pair('neckLength', 'Neck length', 'body', 'neck', 'neck-scale-vert'),
  pair('shoulders', 'Shoulders', 'body', 'torso', 'measure-shoulder-dist'),
  pair('chest', 'Chest', 'body', 'torso', 'measure-bust-circ'),
  pair('waist', 'Waist', 'body', 'torso', 'measure-waist-circ'),
  pair('hips', 'Hips', 'body', 'torso', 'measure-hips-circ'),
  pair('vShape', 'V-shape', 'body', 'torso', 'torso-vshape'),
  pair('belly', 'Belly', 'body', 'stomach', 'stomach-pregnant'),
  pair('buttocks', 'Buttocks', 'body', 'buttocks', 'buttocks-volume'),
];

/** Macro sliders (0..1), mirroring MakeHuman's macro modifiers. */
export const MACRO_SLIDERS = [
  { id: 'gender', label: 'Gender', min: 'Female', max: 'Male' },
  { id: 'age', label: 'Age', min: '18', max: '90' },
  { id: 'muscle', label: 'Muscle', min: 'Soft', max: 'Muscular' },
  { id: 'weight', label: 'Weight', min: 'Thin', max: 'Heavy' },
  { id: 'height', label: 'Height', min: 'Short', max: 'Tall' },
  { id: 'proportions', label: 'Proportions', min: 'Uncommon', max: 'Ideal' },
  { id: 'cupSize', label: 'Bust', min: 'Small', max: 'Large' },
  { id: 'firmness', label: 'Firmness', min: 'Low', max: 'High' },
  { id: 'african', label: 'African', min: '0', max: '1' },
  { id: 'asian', label: 'Asian', min: '0', max: '1' },
  { id: 'caucasian', label: 'European', min: '0', max: '1' },
] as const;

export type MacroId = (typeof MACRO_SLIDERS)[number]['id'];

/**
 * FACS-style expression units shipped with MPFB, mapped to the closest ARKit
 * blendshape names so ARKit/MediaPipe face-tracking data can drive them.
 */
export const EXPRESSION_UNITS: Record<string, string> = {
  'eye-left-closure': 'eyeBlinkLeft',
  'eye-right-closure': 'eyeBlinkRight',
  'eye-left-opened-up': 'eyeWideLeft',
  'eye-right-opened-up': 'eyeWideRight',
  'eye-left-slit': 'eyeSquintLeft',
  'eye-right-slit': 'eyeSquintRight',
  'eyebrows-left-down': 'browDownLeft',
  'eyebrows-right-down': 'browDownRight',
  'eyebrows-left-extern-up': 'browOuterUpLeft',
  'eyebrows-right-extern-up': 'browOuterUpRight',
  'eyebrows-left-inner-up': 'browInnerUpLeft',
  'eyebrows-right-inner-up': 'browInnerUpRight',
  'eyebrows-left-up': 'browUpLeft',
  'eyebrows-right-up': 'browUpRight',
  'mouth-open': 'jawOpen',
  'mouth-corner-puller': 'mouthSmile',
  'mouth-depression': 'mouthFrown',
  'mouth-depression-retraction': 'mouthLowerDown',
  'mouth-elevation': 'mouthUpperUp',
  'mouth-compression': 'mouthPress',
  'mouth-pursing': 'mouthPucker',
  'mouth-protusion': 'mouthFunnel',
  'mouth-retraction': 'mouthStretch',
  'mouth-upward-retraction': 'mouthDimple',
  'mouth-eversion': 'mouthRollOut',
  'mouth-parling': 'mouthClose',
  'mouth-part-later': 'mouthLeft',
  'nose-compression': 'noseCompress',
  'nose-depression': 'noseDepress',
  'nose-left-elevation': 'noseSneerLeft',
  'nose-right-elevation': 'noseSneerRight',
  'nose-left-dilatation': 'nostrilFlareLeft',
  'nose-right-dilatation': 'nostrilFlareRight',
  'neck-platysma': 'neckTense',
};
