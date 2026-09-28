# Writing a plugin

Omnigit's plugins add new ways to show a changed file. Out of the box a file is shown
as a line diff, and an image as the old picture over the new one with a swipe or a fade.
A plugin can add a grid for a spreadsheet, a scene tree for a Godot file, or anything
else a desktop control can draw.

Omnigit's own two viewers are written against exactly the interface described here.
A plugin is a peer of the built-ins, not a guest.

## What a plugin can do, and what it can reach

A plugin is a .NET assembly loaded into Omnigit's own process. **Nobody reviews
plugins, and there is no store.** Whoever installs one is trusting its author, the same
way they would trust any program they install.

Omnigit only *hands* a plugin what the job needs. A viewer gets a file's path, what
happened to it, git's patch text, and a way to read the file's two versions. It is never
given accounts, tokens, or anything about the repository beyond that file. But a plugin
runs with the same access Omnigit has, so it could go and fetch more for itself. Settings
says this in one sentence, and nothing runs until the user switches a plugin on.

## Layout

Plugins live in a folder of folders, one per plugin:

| Platform | Plugins folder |
| --- | --- |
| Linux | `~/.config/Omnigit/plugins/` |
| Windows | `%APPDATA%\Omnigit\plugins\` |
| macOS | `~/Library/Application Support/Omnigit/plugins/` |

Settings → Plugins has a button that opens it.

```
plugins/
  acme-spreadsheets/
    plugin.json
    Acme.Spreadsheets.dll
    SomeLibraryItUses.dll
```

Omnigit reads the folder when it starts. A plugin that has just been copied in appears
in Settings after a restart. Switching one **on** takes effect at once. Switching one
**off** takes effect at the next launch, because its controls may still be on screen and
.NET cannot reliably unload code that is still in use.

## plugin.json

```json
{
  "id": "acme.spreadsheets",
  "name": "Spreadsheets",
  "version": "1.2.0",
  "author": "Acme",
  "assembly": "Acme.Spreadsheets.dll",
  "apiVersion": "1.0"
}
```

- **`id`**: stable and unique. Whether the plugin is switched on is remembered against it,
  so changing it switches the plugin off for everyone who had it on.
- **`assembly`**: the DLL to load, relative to the plugin's own folder. It may not point
  outside that folder.
- **`apiVersion`**: the version of `Omnigit.Plugins` the plugin was built against
  (`PluginApi.Version`). A plugin built against a newer major version, or a newer minor
  version of the same major, is listed as needing a newer Omnigit and is not loaded.

This file is read without loading any code, which is how Settings can list a plugin
that is switched off, or one that is broken.

## The project

Reference the SDK with `Private="false"`. Omnigit already has it loaded, along with
Avalonia, and it shares both with every plugin. A copy of either in the plugin's folder
is ignored. This matters: a plugin with its own `Omnigit.Plugins.dll` would define an
`IChangeViewer` that is not Omnigit's, and none of its viewers would ever be found.

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="path/to/Omnigit.Plugins.csproj" Private="false" />
  </ItemGroup>
</Project>
```

Any other library the plugin uses goes in its folder beside it, and is loaded for that
plugin alone. Two plugins can each bring their own version of the same library.

## A viewer

```csharp
public sealed class SpreadsheetViewer : IChangeViewer
{
    public string Id => "acme.spreadsheets.grid";
    public string Name => "Spreadsheet";

    public int Match(ChangeInfo change)
        => change.Extension is "xlsx" or "ods" or "csv" ? 20 : 0;

    public Control Create(ChangeContext context)
    {
        var grid = new MyGridControl();
        _ = grid.LoadAsync(context);   // return at once; read inside
        return grid;
    }
}
```

- **`Match`** is called for every file the user selects, so it must be quick and must
  not read the file. It returns 0 for "can't show this". Omnigit's text view scores 1 for
  everything and its image view scores 10 for the formats it decodes, so 20 comfortably
  beats both. Ties go to whichever registered first, which is always the built-ins.
- **`Create`** runs on the UI thread. Return the control straight away and load inside it.
  A viewer that reads the file here freezes the window.
- `ReadOldAsync` / `ReadNewAsync` return the file as bytes, and return `null` for a side
  that doesn't exist (before an addition, after a deletion). The old side is the file at
  HEAD, or in the commit's parent. The new side is the file on disk, or in the commit.
  Over 50 MB a read throws `FileTooLargeException` instead.
- **`context.Closed`** is cancelled when the user moves to another file. The reads
  already honour it. Anything slow of the plugin's own should stop when it fires.
- A viewer instance is created once and kept for the whole session, so it must hold no
  per-file state. That belongs in the control.
- Every public, non-abstract class with a parameterless constructor that implements
  `IChangeViewer` is registered. One plugin can carry several.

If `Match` or `Create` throws, Omnigit logs it once under the plugin's name and falls
back to the text view. A plugin can still crash the process outright, for example with
a stack overflow, because it is running inside it.

## Worked example

`samples/SizeViewer` is a complete plugin in about sixty lines. It shows how many bytes
the file had before and after. The loader's tests install and load that exact DLL, so
the example is known to work rather than believed to.

```bash
dotnet build samples/SizeViewer
mkdir -p ~/.config/Omnigit/plugins/sizes
cp samples/SizeViewer/bin/Debug/net10.0/{SizeViewer.dll,plugin.json} ~/.config/Omnigit/plugins/sizes/
```

Restart Omnigit, switch it on in Settings → Plugins, and "Sizes" appears in the picker
above any diff.
