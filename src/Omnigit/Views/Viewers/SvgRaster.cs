using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using SkiaSharp;
using Svg.Skia;

namespace Omnigit.Views.Viewers;

/// <summary>
/// Draws an SVG into a PNG, so the image viewer can compare two versions of one exactly
/// as it compares two photographs - swipe, onion skin and all - with no second viewer
/// to keep in step with the first.
/// </summary>
internal static class SvgRaster
{
    /// <summary>
    /// An icon is commonly 16 or 24 units across. A raster that small is drawn at its
    /// real size and never enlarged, which is right for a photograph and useless for an
    /// icon, so a small drawing is rasterised larger instead. That is not the blur the
    /// image viewer refuses to make: a vector drawn at 256 is as sharp as at 16.
    /// </summary>
    private const float SmallestSide = 256;

    /// <summary>A drawing declaring itself a mile wide is capped, rather than allocated.</summary>
    private const float LargestSide = 4096;

    /// <exception cref="InvalidDataException">The file is not an SVG that can be drawn.</exception>
    public static byte[] ToPng(byte[] svgBytes)
    {
        using var svg = new SKSvg();
        using var input = new MemoryStream(Contain(svgBytes));

        if (svg.Load(input) is not { } picture)
            throw new InvalidDataException("Not an SVG that can be drawn.");

        var bounds = picture.CullRect;
        var longest = Math.Max(bounds.Width, bounds.Height);
        if (longest <= 0)
            throw new InvalidDataException("The SVG has no size.");

        var scale = Math.Clamp(Math.Max(1, SmallestSide / longest), 0, LargestSide / longest);

        using var output = new MemoryStream();
        if (!svg.Save(output, SKColors.Transparent, SKEncodedImageFormat.Png, 100, scale, scale))
            throw new InvalidDataException("The SVG could not be drawn.");

        return output.ToArray();
    }

    private static readonly Regex CssImport = new(@"@import[^;]*;?", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly Regex CssExternalUrl = new(
        @"url\((?>\s*)(?!['""]?\s*(?:#|data:))[^)]*\)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// The SVG with every reference to anything outside itself removed.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Measured, not assumed: an <c>&lt;image href="http://…"&gt;</c> made Svg.Skia
    /// issue the request while loading, and <c>file://</c> is read the same way. This
    /// runs because someone clicked a file in a repository - which may be anybody's -
    /// and drawing it must not make a network request or read another file on the
    /// machine on the author's say-so. So the document is parsed here first with DTDs
    /// ignored and no resolver (no external entities, no entity expansion), and
    /// anything pointing outside - an <c>href</c> that is not <c>#fragment</c> or
    /// <c>data:</c>, a CSS <c>@import</c>, a CSS <c>url()</c> to anything but those
    /// two - is dropped before the library ever sees it.
    /// </para>
    /// <para>
    /// A drawing that relied on an outside image renders without it, which is also the
    /// honest picture of what is in the repository.
    /// </para>
    /// </remarks>
    internal static byte[] Contain(byte[] svgBytes)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Ignore,
            XmlResolver = null,
        };

        XDocument document;
        try
        {
            using var reader = XmlReader.Create(new MemoryStream(svgBytes), settings);
            document = XDocument.Load(reader);
        }
        catch (XmlException ex)
        {
            throw new InvalidDataException(ex.Message, ex);
        }

        foreach (var element in document.Descendants())
        {
            foreach (var attribute in element.Attributes().ToList())
            {
                if (attribute.Name.LocalName == "href" && !IsInternal(attribute.Value))
                    attribute.Remove();
                else if (attribute.Name.LocalName == "style"
                         || attribute.Value.Contains("url(", StringComparison.OrdinalIgnoreCase))
                    attribute.Value = Scrub(attribute.Value);
            }

            if (element.Name.LocalName == "style")
                element.Value = Scrub(element.Value);
        }

        using var output = new MemoryStream();
        document.Save(output, SaveOptions.DisableFormatting);
        return output.ToArray();
    }

    private static bool IsInternal(string reference)
    {
        var value = reference.Trim();
        return value.StartsWith('#') || value.StartsWith("data:", StringComparison.OrdinalIgnoreCase);
    }

    private static string Scrub(string css)
        => CssExternalUrl.Replace(CssImport.Replace(css, string.Empty), "none");
}
