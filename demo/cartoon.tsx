// Cartoon avatar harness (react-native-web): the same <CartoonEditor> the Expo app uses.
//   npx vite --config vite.rnw.config.ts   ->  /cartoon.html  (?modest=1&gender=female, ?pkg=cartoon-g3d or ?url=<package URL>)
//   ?pkg=cartoon-kit loads another package from assets/ (npm run demo:kit imports the fake art kit there)
import React, { useEffect, useState } from 'react';
import { AppRegistry, Text, View } from 'react-native';
import { CartoonEditor } from '../src/cartoon/CartoonEditor';
import { CartoonBench } from '../src/cartoon/CartoonBench';
import { CartoonPackage, loadCartoonPackage } from '../src/cartoon/package';

const qp = new URLSearchParams(location.search);
function App() {
  const [pkg, setPkg] = useState<CartoonPackage | null>(null);
  useEffect(() => {
    loadCartoonPackage(qp.get('url') || `/${qp.get('pkg') || 'cartoon'}`, { density: Number(qp.get('density') || 2) }).then((p) => {
      // ?slow: every layer takes 1.5 s to arrive (network simulation)
      if (qp.has('slow')) { const uri = p.uri; p.uri = (f) => `${uri(f)}?slow=1`; }
      (window as any).__pkg = p;
      setPkg(p);
    });
  }, []);
  if (!pkg) return <Text style={{ padding: 20 }}>Loading…</Text>;
  if (qp.has('bench')) return <View style={{ flex: 1, maxWidth: 430 }}><CartoonBench pkg={pkg} /></View>;
  return (
    <View style={{ flex: 1, maxWidth: 430, height: '100%', borderRightWidth: 1, borderColor: '#eee' }}>
      <CartoonEditor
        pkg={pkg}
        options={{ gender: (qp.get('gender') as any) || 'any', modest: qp.has('modest') }}
        onChange={(c) => ((window as any).__config = c)}
        onSave={(c) => console.log('saved', JSON.stringify(c))}
      />
    </View>
  );
}
AppRegistry.registerComponent('cartoon', () => App);
AppRegistry.runApplication('cartoon', { rootTag: document.getElementById('root') });
