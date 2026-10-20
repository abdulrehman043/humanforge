// The React Native editor running on react-native-web (checks layout and logic; device performance must still be measured on phones).
//   npx vite --config vite.rnw.config.ts  ->  /forge2d-native.html
import React from 'react';
import { AppRegistry, View } from 'react-native';
import { ForgeEditorNative } from '../src/forge2d/native/ForgeEditorNative';

function App() {
  return (
    <View style={{ flex: 1, height: '100%' }}>
      <ForgeEditorNative onChange={(c) => ((window as any).__config = c)} />
    </View>
  );
}
AppRegistry.registerComponent('forge', () => App);
AppRegistry.runApplication('forge', { rootTag: document.getElementById('root') });
