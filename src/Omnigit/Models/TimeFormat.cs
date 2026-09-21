using System;
using Omnigit.Services;

namespace Omnigit.Models;

/// <summary>Short, git-client-flavoured relative timestamps ("12 minutes ago").</summary>
/// <remarks>
/// Six separate plural strings rather than one that takes the unit as a parameter, which
/// is what this did: it appended an "s" to whichever noun it was handed. That works in
/// English and nowhere else - Russian needs three forms of "minute" and Arabic six, and
/// no rule about the word "minute" can be derived from the word "minute". Each unit is
/// now its own sentence, which is also what lets a language put the number after it.
///
/// This is the app's entire date presentation. There is no absolute date anywhere, which
/// is the other half of why the csproj can keep InvariantGlobalization: nothing here ever
/// asks the platform how to write a date.
/// </remarks>
public static class TimeFormat
{
    public static string Relative(DateTimeOffset when)
    {
        var delta = DateTimeOffset.Now - when;

        if (delta < TimeSpan.FromMinutes(1))
            return Strings.Get("just now");
        if (delta < TimeSpan.FromHours(1))
            return Strings.Plural("{0} minute ago", "{0} minutes ago", (int)delta.TotalMinutes);
        if (delta < TimeSpan.FromDays(1))
            return Strings.Plural("{0} hour ago", "{0} hours ago", (int)delta.TotalHours);
        if (delta < TimeSpan.FromDays(30))
            return Strings.Plural("{0} day ago", "{0} days ago", (int)delta.TotalDays);
        if (delta < TimeSpan.FromDays(365))
            return Strings.Plural("{0} month ago", "{0} months ago", (int)(delta.TotalDays / 30));

        return Strings.Plural("{0} year ago", "{0} years ago", (int)(delta.TotalDays / 365));
    }
}
