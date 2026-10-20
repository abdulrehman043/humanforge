// react-native-web plus the few native-only exports that react-native-svg's (unused on web) fabric modules import.
// @ts-ignore react-native-web ships no types here
export * from 'react-native-web';
export const TurboModuleRegistry = { get: () => null, getEnforcing: () => ({}) };
export const codegenNativeComponent = (name: string) => name;
