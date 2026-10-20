# Changelog

## 0.8.0

**Breaking: focus on two avatar systems, the realistic human and the new Forge2D creator.**

### Added
- **Forge2D** (`humanforge/forge2d`): a women-first, full-body 2D avatar creator drawn entirely as SVG.
  25 hairstyles, 15 head coverings (8 hijab wraps in 4 fabrics, turbans, hats), 18 tops, 9 jackets, 16 bottoms, 10 dresses
  (abaya, jalabiya, kaftan, shalwar kameez...), 9 shoes, 27 accessories, 7 expressions and 7 poses; a versioned JSON
  configuration, an asset manifest with source and licence per asset, compatibility rules, validation with graceful fallback,
  seeded randomisation with curated looks, save / restore, plug-in SVG assets and combination statistics.
- Editors: `ForgeEditor` (React) and `ForgeEditorNative` / `ForgeAvatarNative` (React Native, `react-native-svg`).
  React Native uses a filter-free portable renderer (`renderAvatarSvg(config, { portable: true })`).
- QA: `npm run qa:forge2d` (pixel checks on every asset and random avatars, both render modes) and a 67-check test suite.
- Demo landing page (`npm run demo`).

### Removed
- `humanforge/core` (stylized low-poly mode), `AvatarView`, `AvatarCreator`.
- `humanforge/cartoon` (layered-PNG cartoon avatar, art-kit importer, `cartoon-g3d` pack and build tools).
- The matching demos, scripts and assets. Use git tags `v0.7.0` and earlier if you still need them.

### Changed
- The root entry (`humanforge`) now exports only the realistic human (`./human` and its React Native components).
- Package description and keywords.

### Notes
- The React Native Forge2D components are verified on react-native-web, not yet on a physical device.
- `react-native-svg` (>= 13) is an optional peer dependency, needed only for the React Native Forge2D components.
