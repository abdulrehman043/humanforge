// Minimal Expo usage: `npx create-expo-app`, `npx expo install expo-gl expo-file-system three`,
// copy/link open-avatar, then use this as App.tsx.
import React, { useState } from 'react';
import { Pressable, SafeAreaView, Text } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { AvatarCreator, AvatarView, decodeAvatar } from 'open-avatar';

export default function App() {
  const [code, setCode] = useState<string | null>(null); // persist this string in your backend
  const [editing, setEditing] = useState(true);

  if (editing) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <AvatarCreator
          initialConfig={code ? decodeAvatar(code) : null}
          onCancel={code ? () => setEditing(false) : undefined}
          onSave={async (config, newCode, view) => {
            setCode(newCode);
            setEditing(false);
            // Optional: profile picture + 3D model files
            const png = await view?.snapshot();
            const glb = view?.toGLBBase64();
            if (glb) await FileSystem.writeAsStringAsync(FileSystem.documentDirectory + 'avatar.glb', glb, { encoding: 'base64' });
            console.log('saved', newCode, png);
          }}
        />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <AvatarView config={decodeAvatar(code!)} framing="bust" style={{ width: 220, height: 220, borderRadius: 110 }} />
      <Pressable onPress={() => setEditing(true)} style={{ marginTop: 16 }}>
        <Text>Edit avatar</Text>
      </Pressable>
    </SafeAreaView>
  );
}
