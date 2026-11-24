"""Render notes as Markdown."""
import re


def anchor(title):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def render_markdown(note):
    heading = f"# {note['title']}"
    link = f"Anchor: #{anchor(note['title'])}"
    return "\n".join([heading, "", note["body"], "", link]) + "\n"
