# Omnigit Mobile

**Omnigit on a phone — for reading, not cloning.**

The desktop app clones repositories and drives git. This one never clones: it reads the
hosting sites directly, the way the GitHub mobile app does, so you can check a pull
request from a queue or read an issue on a train without a working copy anywhere.

What makes it worth having is the same thing that makes the desktop worth having: it is
**not tied to one hosting site**. GitHub, Gitea, Forgejo and GitLab all work, self-hosted
instances included, and so does anything else you can describe in JSON.

> **Status: builds and typechecks, unverified on a device.** Every screen is written and
> the whole app bundles for iOS and Android, but nothing here has been run against a real
> server on real hardware yet. See [What to check first](#what-to-check-first).

## The point: one manifest, two apps

Omnigit describes a hosting site as **data, not code** — see
[`docs/host-manifests.md`](../docs/host-manifests.md). This app reads *the same format*.

```
src/Omnigit/HostProviders/Manifests/gitea.json     the desktop reads this
mobile/src/hosts/manifests/gitea.json              this app reads this
```

Every key the desktop uses is byte-identical in both, and `npm run check:manifests`
fails if they drift. The mobile copy adds keys the desktop has no use for — a phone that
never clones has to ask the site for issues, comments, file contents and the inbox, where
a clone would just ask git. Those keys are **additive**, so one file still serves both:
the desktop ignores what it does not recognise.

**GitHub has a manifest here for the first time.** On the desktop it is C# because its
browser sign-in is a multi-step conversation that endpoint descriptions could not express.
A phone has one browser and one shape of flow, so the conversation *is* describable — see
`deviceLogin` in [`src/hosts/manifests/github.json`](src/hosts/manifests/github.json).
Any site that copies GitHub's device flow now gets browser sign-in with no code at all.

Three things GitLab forced into the format, each of which any site can now use:

| Key | Why |
| --- | --- |
| `apiBaseUrl` | The API is not always where the website is. github.com's is on another host entirely. |
| `issueStates` | GitLab says `opened` where everyone else says `open` — and returns *everything* rather than failing when asked wrongly, so the closed filter would have silently done nothing. |
| `pullRequestComments` | A merge request's conversation lives at its own address. Everywhere else, `comments` serves both. |

## What it does

- **Every repository from every site in one list**, newest first, with a badge saying
  which site each came from
- **Pull requests** — state, branches, labels, the conversation, and the diff file by file
- **Issues** — open and closed, labels, comments
- **Browse the code** — the file tree with a tappable breadcrumb, and files rendered with
  syntax highlighting in the same seven colours the desktop uses
- **Commits**, branches, and the README rendered as Markdown
- **One inbox** merged across every site that has one (GitLab's todos count)
- **Search across all sites at once**
- **Sign in with your browser** on GitHub, or a token anywhere
- **Tokens go to the phone's keychain**, never into a settings file — `accounts.json` holds
  only site, login and display name, exactly as on the desktop

## Native on purpose

The brief was to use as many of the platform's own components as possible, and almost
nothing here is a JavaScript imitation:

| What | Component | iOS | Android |
| --- | --- | --- | --- |
| Tab bar | `NativeTabs` | `UITabBar`, Liquid Glass, minimises on scroll, search-tab role | Material tabs, keyboard-aware |
| Every list | `@expo/ui` `List` | SwiftUI `List` with `.refreshable` | Compose `LazyColumn` |
| Every row | `@expo/ui` `ListItem` | SwiftUI `Button`/`HStack` | Compose `ListItem` |
| Settings | `@expo/ui` `FieldGroup` | SwiftUI `Form` | Material settings list |
| Sign-out sheet | `@expo/ui` `BottomSheet` | native sheet with snap points | Material bottom sheet |
| Section switchers | `SegmentedControl` | `UISegmentedControl` | Material segmented button |
| Diff per file | `@expo/ui` `Collapsible` | SwiftUI `DisclosureGroup` | Compose expandable |
| File browser rows | `@expo/ui` `ListItem` | SwiftUI row | Compose `ListItem` |
| Header menus | `unstable_headerRightItems` | real `UIBarButtonItem` menus | native overflow |
| Icons | `@expo/ui` `Icon` | SF Symbols | Material Symbols vectors |
| Floating surfaces | `expo-glass-effect` | Liquid Glass (iOS 26) | tinted fallback |

Two of those needed real work rather than an import:

**Rich rows inside a native list.** `ListItem` puts its headline into a SwiftUI `VStack`,
where a React Native view has no intrinsic size and stretches to fill whatever it is
given. So the host badges, label chips and language dots go back through
`RNHostView matchContents`, which measures the RN content and pins the native host to it —
the same thing `ListItem` does for its own leading and trailing slots. See
[`src/ui/rows.tsx`](src/ui/rows.tsx).

**Material tab icons.** This SDK's `NativeTabs.Trigger.Icon` types offer `sf`, `xcasset`,
`drawable` and `src`, but the runtime also accepts an `md` prop the types have not caught
up with. Rather than cast past the types, the Android icons go through `src` with the
promise `expo-symbols` returns — which is exactly what `md` does internally. See
[`src/app/(tabs)/_layout.tsx`](src/app/(tabs)/_layout.tsx).

## Running it

```bash
cd mobile
npm install
npm start
```

Then press `i` or `a`, or scan the QR code with Expo Go.

`@expo/ui`, `expo-glass-effect` and native tabs all need native code, so **Expo Go will
only take you so far** — for the real thing, build a development client:

```bash
npx expo run:ios
npx expo run:android
```

Liquid Glass needs iOS 26; everywhere else `GlassSurface` falls back to a tinted, bordered
surface rather than the transparent `View` the library would give you.

## Checks

```bash
npm run check
```

That runs three things, and the first is the one that matters:

- `check:manifests` — every key the desktop's manifests define is present and identical
  here. Run it after touching either side.
- `typecheck` — including the SF Symbol names, which are a typed union, so a misspelt
  icon is a build error rather than an empty square on a device.
- `lint`

## Where things live

```
src/
  hosts/        Talking to a site, entirely from its manifest. No per-forge code.
    manifest.ts     the JSON format, as types
    provider.ts     one class, driven by whichever manifest it was handed
    sign-in.ts      tokens, and GitHub's device flow
    manifests/      github.json, gitea.json, gitlab.json
  storage/      accounts.json (plain) and tokens (keychain), split as on the desktop
  api/          React Query hooks: merged lists across sites, paged lists within one
  state/        Who is signed in
  theme/        tokens.ts = every colour, once per theme. Nothing else holds a hex.
  ui/           Rows, badges, diff, markdown, empty states
  app/          expo-router routes
```

Two files matter more than the rest, and they mirror the desktop's own two:

- **`theme/tokens.ts`** — every colour in the app. Restyling means editing only this.
- **`hosts/manifests/`** — every site the app can talk to. Adding one means editing only
  these, and no code at all.

## What to check first

Written but never run on hardware. In rough order of how likely each is to need a nudge:

1. **The diff view.** `Collapsible` inside `Host matchContents` inside a `ScrollView` has
   to re-measure when a file expands. If it does not, swap the native disclosure for a
   plain pressable header — it is a contained change in
   [`src/ui/diff.tsx`](src/ui/diff.tsx).
2. **Android tab icons**, for the reason above.
3. **Long lists.** The native list takes its children from React, so a paged list renders
   every row it has been given. Fine at the 30–50 per page the manifests ask for; if it
   drags, the answer is a windowed list rather than a bigger page.
4. **GitLab's changed files.** It describes a change with three booleans instead of a
   status word and sends no per-file line counts, so those are deliberately unmapped —
   the diff renders, the counts stay blank.

## What it does not do

- **No local git.** No clone, no commit, no push. That is the desktop's job and the reason
  it exists; duplicating it on a phone would mean shipping libgit2 to read a diff.
- **No writing.** No commenting, reviewing, merging or closing. Every one of those needs a
  write scope, a draft that survives backgrounding, and a confirmation step — a coherent
  second version rather than four half-features.
- **No CI status.** This is where the manifest format genuinely stops being enough:
  GitHub's check runs, Gitea's commit statuses and GitLab's pipelines agree on nothing.
  It is item 4 on the desktop's own roadmap for the same reason.

## Licence

MIT, with the rest of Omnigit — see [LICENSE](../LICENSE).
