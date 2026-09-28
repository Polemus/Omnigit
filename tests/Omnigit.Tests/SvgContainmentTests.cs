using System.Text;
using Omnigit.Views.Viewers;

namespace Omnigit.Tests;

/// <summary>
/// Drawing an SVG from a repository must not reach outside it. Svg.Skia fetches an
/// external <c>&lt;image href&gt;</c> while loading - that was measured against a local
/// listener - so everything that could point outside is removed first.
/// </summary>
public class SvgContainmentTests
{
    private static string Contained(string svg)
        => Encoding.UTF8.GetString(SvgRaster.Contain(Encoding.UTF8.GetBytes(svg)));

    [Fact]
    public void External_hrefs_are_removed_and_internal_ones_kept()
    {
        var result = Contained("""
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
              <image href="http://example.com/track.png"/>
              <image xlink:href="file:///etc/passwd"/>
              <use href="#shape"/>
              <image href="data:image/png;base64,AAAA"/>
            </svg>
            """);

        Assert.DoesNotContain("example.com", result);
        Assert.DoesNotContain("/etc/passwd", result);
        Assert.Contains("#shape", result);
        Assert.Contains("data:image/png", result);
    }

    [Fact]
    public void Css_imports_and_external_urls_are_removed_but_internal_urls_survive()
    {
        var result = Contained("""
            <svg xmlns="http://www.w3.org/2000/svg">
              <style>@import url("http://example.com/a.css"); .a { fill: url('#grad'); }</style>
              <rect style="fill: url(https://example.com/p.svg#x)" />
              <rect fill="url(http://example.com/q.svg#y)" />
              <rect fill="url( '#grad' )" />
            </svg>
            """);

        Assert.DoesNotContain("example.com", result);
        Assert.Contains("url('#grad')", result);
        Assert.Contains("url( '#grad' )", result);
    }

    [Fact]
    public void Entities_are_not_expanded_and_a_doctype_does_not_stop_the_drawing()
    {
        var result = Contained("""
            <?xml version="1.0"?>
            <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
              <!ENTITY secret SYSTEM "file:///etc/hostname">
            ]>
            <svg xmlns="http://www.w3.org/2000/svg"><text>&amp;</text></svg>
            """);

        Assert.Contains("<svg", result);
    }

    [Fact]
    public async Task Drawing_an_svg_that_points_at_a_server_never_calls_it()
    {
        // Without Contain this listener was hit once per external href.
        using var listener = new System.Net.HttpListener();
        var port = Random.Shared.Next(20000, 60000);
        listener.Prefixes.Add($"http://127.0.0.1:{port}/");
        listener.Start();

        var hits = 0;
        _ = Task.Run(async () =>
        {
            while (listener.IsListening)
            {
                try
                {
                    var context = await listener.GetContextAsync();
                    Interlocked.Increment(ref hits);
                    context.Response.StatusCode = 404;
                    context.Response.Close();
                }
                catch (Exception)
                {
                    return;
                }
            }
        });

        var png = SvgRaster.ToPng(Encoding.UTF8.GetBytes($"""
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
              <image href="http://127.0.0.1:{port}/tracker.png" width="16" height="16"/>
              <rect width="8" height="8" fill="red"/>
            </svg>
            """));

        await Task.Delay(300);
        listener.Stop();

        Assert.Equal(0, hits);
        Assert.Equal([0x89, (byte)'P', (byte)'N', (byte)'G'], png[..4]);
    }

    [Fact]
    public void Something_that_is_not_xml_is_refused_as_invalid_data()
        => Assert.Throws<InvalidDataException>(() => SvgRaster.Contain("not an svg"u8.ToArray()));
}
