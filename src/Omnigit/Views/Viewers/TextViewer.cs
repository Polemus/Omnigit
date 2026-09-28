using Avalonia.Controls;
using Omnigit.Models;
using Omnigit.Plugins;
using Omnigit.Services;
using Omnigit.ViewModels;

namespace Omnigit.Views.Viewers;

/// <summary>
/// The red-and-green line diff. Matches every file at the lowest score, so it is always
/// on offer and anything more specific wins.
/// </summary>
public sealed class TextViewer : IChangeViewer
{
    public const string ViewerId = "omnigit.text";

    public string Id => ViewerId;

    public string Name => Strings.Get("Text");

    public int Match(ChangeInfo change) => 1;

    public Control Create(ChangeContext context)
    {
        // A change from our own list arrives with its rows already parsed and
        // highlighted; parsing the patch again would give the same rows, slower.
        var change = context is RepositoryChangeContext ours
            ? ours.FileChange
            : new FileChange
            {
                Path = context.Change.Path,
                Status = ChangeStatus.Modified,
                Diff = UnifiedDiffParser.Parse(context.UnifiedPatch, context.Change.Path),
            };

        return new LineDiffView { DataContext = change };
    }
}
