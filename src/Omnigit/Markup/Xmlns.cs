using Avalonia.Metadata;

// So a view writes {Loc 'Fetch origin'} rather than {markup:Loc '...'} with a prefix
// declared at the top of every file. There are 189 of these across five views; the
// prefix would be noise on every one of them.
[assembly: XmlnsDefinition("https://github.com/avaloniaui", "Omnigit.Markup")]
