using System;
using Avalonia.Data;
using Avalonia.Markup.Xaml;
using Omnigit.Services;

namespace Omnigit.Markup;

/// <summary>
/// The XAML side of <see cref="Strings"/>: <c>Content="{Loc 'Fetch origin'}"</c>.
/// </summary>
/// <remarks>
/// It returns a binding rather than a string so that the text follows the language while
/// the app is running. The source is the cached <see cref="LocalizedText"/> for this
/// key, which every use of the same English shares.
///
/// The binding is deliberately a reflection binding and not a compiled one, even though
/// the project sets AvaloniaUseCompiledBindingsByDefault: compiled bindings resolve
/// against the DataContext's type, and this one has a source of its own that has nothing
/// to do with whatever view model is in scope.
/// </remarks>
public sealed class LocExtension : MarkupExtension
{
    public LocExtension()
    {
    }

    public LocExtension(string key) => Key = key;

    /// <summary>The English text. It is the key as well, so there is nothing else to say.</summary>
    public string Key { get; set; } = string.Empty;

    public override object ProvideValue(IServiceProvider serviceProvider) =>
        new Binding(nameof(LocalizedText.Value))
        {
            Source = Localizer.Text(Key),
            Mode = BindingMode.OneWay,
        };
}
