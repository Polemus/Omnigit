using System.Collections.Generic;
using Avalonia.Controls;
using Omnigit.Models;
using Omnigit.Services;

namespace Omnigit.Views.Viewers;

public partial class SideBySideView : UserControl
{
    /// <summary>Design-time only.</summary>
    public SideBySideView() => InitializeComponent();

    public SideBySideView(IReadOnlyList<DiffLine> lines)
    {
        InitializeComponent();
        Rows.ItemsSource = SideBySide.Rows(lines);
    }
}
