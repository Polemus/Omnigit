#!/usr/bin/env python3
"""
Converts one release's notes between the three places they appear.

    notes.py entry    <version> <notes.md>      print the metainfo <release> entry
    notes.py markdown <metainfo> <version>      print that entry back as markdown

The notes are written once, as a small markdown file, and stored once, in the
metainfo's <release> entry - the only place Flathub reads and the only place that
travels inside the tagged commit. The GitHub release page and the app's About page are
both derived from that entry, so there is no second copy to forget.

The notes file is deliberately a small subset of markdown:

    One or two sentences saying what this release is about.

    ### New
    - A thing you can now do, in the words of someone using it.
    - Another, with `code` where a file name or key needs it.

    ### Fixed
    - What was wrong, said as what now works.

AppStream has no headings, so a heading is stored as a paragraph ending in a colon
followed by its list - "New:" - which is also how a software centre shows it well.
Reading the entry back, a paragraph ending in a colon that is directly followed by a
list becomes a heading again. `code` is stored as <code>; nothing else inline is kept,
because AppStream allows <em> and <code> and nothing more.
"""

import html
import re
import sys
import textwrap
import xml.etree.ElementTree as ET
from datetime import date

INDENT = " " * 10
CODE = re.compile(r"`([^`]+)`")


def inline_to_xml(text):
    """Escapes text for XML, turning `code` into <code>."""
    parts = CODE.split(text)
    out = []
    for i, part in enumerate(parts):
        escaped = html.escape(part, quote=False)
        out.append(f"<code>{escaped}</code>" if i % 2 else escaped)
    return "".join(out)


def parse(notes):
    """The notes file as a list of blocks: ("p", text), ("h", text), ("ul", [items])."""
    blocks, paragraph, items = [], [], []

    def flush():
        if paragraph:
            blocks.append(("p", " ".join(paragraph)))
            paragraph.clear()
        if items:
            blocks.append(("ul", list(items)))
            items.clear()

    for raw in notes.splitlines():
        line = raw.strip()
        if not line:
            flush()
        elif line.startswith("#"):
            flush()
            blocks.append(("h", line.lstrip("#").strip().rstrip(":")))
        elif line.startswith(("- ", "* ")):
            if paragraph:
                flush()
            items.append(line[2:].strip())
        elif items:
            # A wrapped continuation of the last bullet.
            items[-1] += " " + line
        else:
            paragraph.append(line)
    flush()

    if not blocks or blocks[0][0] != "p":
        sys.exit("notes must open with a summary paragraph, before any heading or list")
    for i, (kind, _) in enumerate(blocks):
        if kind == "h" and (i + 1 == len(blocks) or blocks[i + 1][0] != "ul"):
            sys.exit(f"heading '{blocks[i][1]}' must be followed by a list")
    return blocks


def entry(version, notes_path):
    blocks = parse(open(notes_path, encoding="utf-8").read())
    body = []

    for kind, value in blocks:
        if kind == "p" or kind == "h":
            text = value + ":" if kind == "h" else value
            wrapped = textwrap.fill(inline_to_xml(text), width=72,
                                    initial_indent=INDENT, subsequent_indent=INDENT)
            body.append(f"        <p>\n{wrapped}\n        </p>")
        else:
            lines = ["        <ul>"]
            for item in value:
                wrapped = textwrap.fill(inline_to_xml(item), width=70,
                                        initial_indent=" " * 12, subsequent_indent=" " * 12)
                lines.append(f"          <li>\n{wrapped}\n          </li>")
            lines.append("        </ul>")
            body.append("\n".join(lines))

    return (
        f'    <release version="{version}" date="{date.today().isoformat()}">\n'
        f'      <url type="details">https://github.com/Polemus/Omnigit/releases/tag/v{version}</url>\n'
        f'      <description>\n'
        + "\n".join(body) + "\n"
        f'      </description>\n'
        f'    </release>\n'
    )


def text_of(node):
    """The element's text with whitespace collapsed and <code> back as backticks."""
    parts = [node.text or ""]
    for child in node:
        inner = "".join(child.itertext())
        parts.append(f"`{inner}`" if child.tag == "code" else inner)
        parts.append(child.tail or "")
    return " ".join("".join(parts).split())


def markdown(metainfo, version):
    root = ET.parse(metainfo).getroot()
    release = next((r for r in root.findall("./releases/release") if r.get("version") == version), None)
    if release is None:
        sys.exit(f'no <release version="{version}"> in {metainfo} - did build/release.sh run?')

    description = release.find("description")
    if description is None:
        sys.exit(f"the {version} entry in {metainfo} has no <description>")

    nodes = list(description)
    out = []
    for i, node in enumerate(nodes):
        if node.tag == "p":
            text = text_of(node)
            follows_list = i + 1 < len(nodes) and nodes[i + 1].tag in ("ul", "ol")
            if text.endswith(":") and follows_list and i > 0:
                out.append(f"### {text[:-1]}")
            elif text:
                out.append(text)
        elif node.tag in ("ul", "ol"):
            # Numbered lists render as bullets: the ordering an AppStream <ol> carries is
            # not meaningful in a changelog, and markdown renumbers its own anyway.
            items = [f"- {text_of(li)}" for li in node.findall("li") if text_of(li)]
            if items:
                out.append("\n".join(items))

    if not out:
        sys.exit(f"the {version} entry in {metainfo} describes nothing")
    return "\n\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "entry":
        sys.stdout.write(entry(sys.argv[2], sys.argv[3]))
    elif len(sys.argv) == 4 and sys.argv[1] == "markdown":
        print(markdown(sys.argv[2], sys.argv[3]))
    else:
        sys.exit(__doc__)
