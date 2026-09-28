using System;
using System.Threading;
using System.Threading.Tasks;

namespace Omnigit.Plugins;

/// <summary>
/// Everything a viewer is given to draw one changed file.
/// </summary>
/// <remarks>
/// The file's two versions are read only when asked for, off the UI thread, because
/// most of what a viewer is created for is a text file whose patch is already here.
/// Either side reads as null when it does not exist: the old side of an added file, the
/// new side of a deleted one.
/// </remarks>
public class ChangeContext
{
    private readonly Func<CancellationToken, Task<byte[]?>> _readOld;
    private readonly Func<CancellationToken, Task<byte[]?>> _readNew;

    public ChangeContext(
        ChangeInfo change,
        string unifiedPatch,
        Func<CancellationToken, Task<byte[]?>> readOld,
        Func<CancellationToken, Task<byte[]?>> readNew,
        CancellationToken closed)
    {
        Change = change;
        UnifiedPatch = unifiedPatch;
        _readOld = readOld;
        _readNew = readNew;
        Closed = closed;
    }

    public ChangeInfo Change { get; }

    /// <summary>
    /// git's own patch text for the file, or empty where git has none - an untracked file,
    /// or a binary one.
    /// </summary>
    public string UnifiedPatch { get; }

    /// <summary>
    /// Cancelled when the user moves to another file. Pass it to the reads, and stop
    /// anything slow when it fires: the control is about to be thrown away.
    /// </summary>
    public CancellationToken Closed { get; }

    /// <summary>The file as it was: at HEAD for a working-tree change, in the parent for a commit.</summary>
    /// <exception cref="FileTooLargeException">The file is over the size Omnigit will read into memory.</exception>
    public Task<byte[]?> ReadOldAsync(CancellationToken cancellation = default) => _readOld(Pick(cancellation));

    /// <summary>The file as it is: on disk for a working-tree change, in the commit for a commit.</summary>
    /// <exception cref="FileTooLargeException">The file is over the size Omnigit will read into memory.</exception>
    public Task<byte[]?> ReadNewAsync(CancellationToken cancellation = default) => _readNew(Pick(cancellation));

    private CancellationToken Pick(CancellationToken cancellation)
        => cancellation.CanBeCanceled ? cancellation : Closed;
}

/// <summary>Thrown by a read when the file is larger than Omnigit will hold in memory.</summary>
public sealed class FileTooLargeException(long size, long limit)
    : Exception($"The file is {size} bytes, over the {limit}-byte limit.")
{
    public long Size { get; } = size;
    public long Limit { get; } = limit;
}
