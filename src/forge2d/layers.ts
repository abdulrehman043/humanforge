// Fixed layer order. Every template renders into exactly one of these slots.
export const LAYER_ORDER = {
  'ground.shadow': 5,
  'hair.back': 10,
  'headwear.back': 12,
  'legs': 20,
  'torso': 21,
  'shoes': 22,
  'dress': 24,
  'bottoms': 26,
  'top': 30,
  'outer': 34,
  'accessory.body': 36,
  'arms.mid': 40,
  'accessory.bag': 42,
  'ears': 50,
  'face': 52,
  'face.features': 54,
  'hair.front': 60,
  'headwear.front': 64,
  'accessory.head': 68,
  'arms.front': 80,
} as const;
export type LayerId = keyof typeof LAYER_ORDER;

/** Vertical extent (canvas y, padding included) every layer can ever paint in: used to skip layers a cropped render never shows. */
export const LAYER_Y: Record<LayerId, [number, number]> = {
  'ground.shadow': [655, 700], 'hair.back': [0, 380], 'headwear.back': [0, 380], 'legs': [420, 700], 'torso': [176, 480], 'shoes': [540, 700],
  'dress': [170, 700], 'bottoms': [310, 700], 'top': [178, 600], 'outer': [178, 640], 'accessory.body': [178, 500], 'accessory.bag': [250, 500],
  'arms.mid': [190, 520], 'ears': [90, 190], 'face': [40, 210], 'face.features': [50, 210], 'hair.front': [0, 380], 'headwear.front': [0, 380],
  'accessory.head': [0, 220], 'arms.front': [120, 520],
};
