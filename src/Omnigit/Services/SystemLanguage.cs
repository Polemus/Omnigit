using System;
using System.Runtime.InteropServices;

namespace Omnigit.Services;

/// <summary>
/// What language the machine is set to, worked out without ICU.
/// </summary>
/// <remarks>
/// The obvious answer - CultureInfo.CurrentUICulture - is always the invariant culture
/// here, because the csproj sets InvariantGlobalization and keeping it set is the point
/// (see Strings). So each platform is asked in its own terms: the POSIX environment on
/// Linux and macOS, and Windows through the one call that returns names rather than the
/// numeric language ids everything else there deals in.
///
/// Whatever comes back is a hint. <see cref="Strings.Use"/> decides what to do with it,
/// and a language this build does not carry leaves the app in English.
/// </remarks>
public static class SystemLanguage
{
    /// <summary>Asks for names like "en-GB" rather than LANGIDs.</summary>
    private const uint MuiLanguageName = 0x8;

    // DllImport rather than LibraryImport: the source generator emits unsafe code even
    // for a signature as plain as this one, and turning AllowUnsafeBlocks on for the
    // whole app to save a marshalling attribute is the wrong trade - the same reason
    // fcntl in DesktopIntegration is declared this way.
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetUserPreferredUILanguages(
        uint flags, out uint count, char[]? buffer, ref uint size);

    /// <summary>The machine's language, or null if it will not say.</summary>
    public static string? Detect()
    {
        try
        {
            return OperatingSystem.IsWindows() ? FromWindows() : FromEnvironment();
        }
        catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException)
        {
            // Not worth failing a launch over. English is a working answer.
            return null;
        }
    }

    /// <summary>
    /// LC_ALL beats LC_MESSAGES beats LANG, which is the order POSIX gives them. Values
    /// look like "pt_BR.UTF-8"; Strings.Use does the tidying, since it is the one that
    /// knows what tidying would make a catalogue match.
    /// </summary>
    private static string? FromEnvironment()
    {
        foreach (var name in new[] { "LC_ALL", "LC_MESSAGES", "LANG" })
        {
            var value = Environment.GetEnvironmentVariable(name);

            // "C" and "POSIX" are the absence of a language, not a language.
            if (string.IsNullOrWhiteSpace(value) || value is "C" or "POSIX" or "C.UTF-8")
                continue;

            return value;
        }

        return null;
    }

    /// <summary>
    /// The first of the user's preferred languages. The call is made twice, which is the
    /// documented shape: once with no buffer to be told how big one has to be.
    /// </summary>
    private static string? FromWindows()
    {
        uint size = 0;

        if (!GetUserPreferredUILanguages(MuiLanguageName, out _, null, ref size) || size == 0)
            return null;

        var buffer = new char[size];

        if (!GetUserPreferredUILanguages(MuiLanguageName, out var count, buffer, ref size) || count == 0)
            return null;

        // A double-null-terminated list; the first entry is the one the user prefers.
        var first = new string(buffer);
        var end = first.IndexOf('\0');

        return end > 0 ? first[..end] : null;
    }
}
