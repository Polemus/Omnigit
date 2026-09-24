// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Icon, ListItem and Text come from src/ui, whose iOS versions apply colour in the one
    // form every native version of @expo/ui reads - see src/ui/swiftui-colour.ts. Taken
    // straight from @expo/ui, their colours come out white on iOS, and nothing says so.
    //
    // Host comes from src/ui too, whose Android version tells each Compose host the palette's
    // light or dark. Left to itself, a host that was off screen when the phone changed theme
    // keeps the old one - dark cards in light mode - and nothing says so either.
    //
    // FieldGroup comes from src/ui as well, whose Android version makes each row the card
    // rather than wrapping it in another - see src/ui/field-group.android.tsx.
    //
    // React Native's own Text comes from src/ui/scaled-text too: it draws at the size the
    // reader chose in Settings, and ignores the phone's own text size, which an app that
    // follows it inherits at whatever size the person set for messages and mail.
    //
    // src/ui/icons.ts and src/ui/file-icons.ts are the exceptions, the other way round: they
    // only call Icon.select, which @expo/ui's Babel plugin strips per platform solely for an
    // Icon imported from @expo/ui. See the comment at the top of icons.ts.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/ui/icon*.tsx',
      'src/ui/list-item*.tsx',
      'src/ui/text*.tsx',
      'src/ui/icons.ts',
      'src/ui/file-icons.ts',
      'src/ui/host*.tsx',
      'src/ui/field-group*.tsx',
      'src/ui/scaled-text.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@expo/ui',
              importNames: ['Icon', 'ListItem', 'Text'],
              message:
                "Import it from src/ui ('@/ui/icon', '@/ui/list-item', '@/ui/text') - see src/ui/swiftui-colour.ts.",
            },
            {
              name: '@expo/ui',
              importNames: ['Host'],
              message: "Import it from '@/ui/host' - see src/ui/host.android.tsx.",
            },
            {
              name: '@expo/ui',
              importNames: ['FieldGroup'],
              message: "Import it from '@/ui/field-group' - see src/ui/field-group.android.tsx.",
            },
            {
              name: 'react-native',
              importNames: ['Text'],
              message: "Import it from '@/ui/scaled-text' - see src/state/text-scale.tsx.",
            },
            {
              name: '@expo/ui/jetpack-compose',
              importNames: ['Host'],
              message: "Import it from '@/ui/host' - see src/ui/host.android.tsx.",
            },
          ],
        },
      ],
    },
  },
]);
