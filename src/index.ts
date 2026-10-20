// The root entry targets React Native: the realistic MakeHuman-based human (preload uses the Expo disk cache and mobile textures).
// The 2D avatar creator lives at 'humanforge/forge2d' (and 'humanforge/forge2d/native' for React Native).
export * from './human';
export * from './native';
export { preloadHumanPackage } from './native';
