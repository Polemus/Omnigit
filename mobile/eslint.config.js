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
          ],
        },
      ],
    },
  },
]);
