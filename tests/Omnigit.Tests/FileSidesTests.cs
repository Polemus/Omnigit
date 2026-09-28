using Omnigit.Models;
using Omnigit.Plugins;
using Omnigit.Services;

namespace Omnigit.Tests;

/// <summary>
/// What a viewer is handed as "before" and "after". The image viewer draws exactly these
/// bytes, so a side read from the wrong tree is a picture of the wrong file - and nothing
/// on screen would say so.
/// </summary>
public class FileSidesTests
{
    private const long Plenty = 1024 * 1024;

    private static readonly byte[] Before = [0x89, 0x50, 0x4E, 0x47, 0x00, 0x01, 0x02];
    private static readonly byte[] After = [0x89, 0x50, 0x4E, 0x47, 0x00, 0x09, 0x08, 0x07];

    [Fact]
    public void A_modified_binary_in_the_working_tree_reads_HEAD_and_the_disk()
    {
        using var temp = new TempRepository();
        WriteBytes(temp, "logo.png", Before);
        temp.Commit("add logo");
        WriteBytes(temp, "logo.png", After);

        var git = new GitService();
        var change = Assert.Single(git.GetWorkingChanges(temp.Path));

        Assert.Equal(Before, git.ReadSide(temp.Path, change, FileSide.Old, Plenty));
        Assert.Equal(After, git.ReadSide(temp.Path, change, FileSide.New, Plenty));
    }

    [Fact]
    public void An_added_file_has_no_old_side_and_a_deleted_one_no_new_side()
    {
        using var temp = new TempRepository();
        WriteBytes(temp, "gone.png", Before);
        temp.Commit("first");
        File.Delete(Path.Combine(temp.Path, "gone.png"));
        WriteBytes(temp, "new.png", After);

        var git = new GitService();
        var changes = git.GetWorkingChanges(temp.Path);
        var added = changes.Single(c => c.Path == "new.png");
        var deleted = changes.Single(c => c.Path == "gone.png");

        Assert.Null(git.ReadSide(temp.Path, added, FileSide.Old, Plenty));
        Assert.Equal(After, git.ReadSide(temp.Path, added, FileSide.New, Plenty));
        Assert.Equal(Before, git.ReadSide(temp.Path, deleted, FileSide.Old, Plenty));
        Assert.Null(git.ReadSide(temp.Path, deleted, FileSide.New, Plenty));
    }

    [Fact]
    public void A_commit_reads_its_parent_and_itself_not_the_working_tree()
    {
        using var temp = new TempRepository();
        WriteBytes(temp, "logo.png", Before);
        temp.Commit("first");
        WriteBytes(temp, "logo.png", After);
        temp.Commit("second");

        // Something else on disk, which a commit's sides must ignore.
        WriteBytes(temp, "logo.png", [1, 2, 3]);

        var git = new GitService();
        var change = Assert.Single(git.GetCommitFiles(temp.Path, temp.HeadSha()));

        Assert.Equal(temp.HeadSha(), change.Commit);
        Assert.Equal(Before, git.ReadSide(temp.Path, change, FileSide.Old, Plenty));
        Assert.Equal(After, git.ReadSide(temp.Path, change, FileSide.New, Plenty));
    }

    [Fact]
    public void A_root_commit_has_nothing_before_it()
    {
        using var temp = new TempRepository();
        WriteBytes(temp, "logo.png", Before);
        temp.Commit("first");

        var git = new GitService();
        var change = Assert.Single(git.GetCommitFiles(temp.Path, temp.HeadSha()));

        Assert.Null(git.ReadSide(temp.Path, change, FileSide.Old, Plenty));
        Assert.Equal(Before, git.ReadSide(temp.Path, change, FileSide.New, Plenty));
    }

    [Fact]
    public void A_renamed_file_reads_its_old_side_under_the_old_name()
    {
        using var temp = new TempRepository();
        WriteBytes(temp, "old-name.png", Before);
        temp.Commit("first");
        File.Delete(Path.Combine(temp.Path, "old-name.png"));
        WriteBytes(temp, "new-name.png", After);
        temp.Commit("rename and change");

        // Built by hand: whether libgit2 pairs these into a rename depends on its
        // similarity scoring, and what is under test is where a rename is read from.
        var change = new FileChange
        {
            Path = "new-name.png",
            OldPath = "old-name.png",
            Status = ChangeStatus.Renamed,
            Commit = temp.HeadSha(),
        };

        var git = new GitService();
        Assert.Equal(Before, git.ReadSide(temp.Path, change, FileSide.Old, Plenty));
        Assert.Equal(After, git.ReadSide(temp.Path, change, FileSide.New, Plenty));
    }

    [Fact]
    public void A_side_over_the_limit_is_refused_rather_than_read()
    {
        using var temp = new TempRepository();
        WriteBytes(temp, "big.bin", new byte[4096]);
        temp.Commit("first");
        WriteBytes(temp, "big.bin", new byte[8192]);

        var git = new GitService();
        var change = Assert.Single(git.GetWorkingChanges(temp.Path));

        var committed = Assert.Throws<FileTooLargeException>(
            () => git.ReadSide(temp.Path, change, FileSide.Old, 1000));
        Assert.Equal(4096, committed.Size);

        var onDisk = Assert.Throws<FileTooLargeException>(
            () => git.ReadSide(temp.Path, change, FileSide.New, 1000));
        Assert.Equal(8192, onDisk.Size);
    }

    private static void WriteBytes(TempRepository temp, string relativePath, byte[] bytes)
        => File.WriteAllBytes(Path.Combine(temp.Path, relativePath), bytes);
}
