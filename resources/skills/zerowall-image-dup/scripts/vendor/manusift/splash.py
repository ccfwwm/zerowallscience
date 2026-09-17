"""Cyber / vaporwave splash banner (Step T1).

A self-contained, zero-dependency banner for
``manusift`` CLI / optional workspace TUI
(``manusift-workspace``). Conversational chat
TUI entry points were removed. The banner is hand-
crafted 7-row block letters using
``\u2588`` (U+2588, full block).
The border uses box-drawing
``\u256d \u2500 \u256e \u2502 \u2570
\u256f`` (U+2500-257F). The scan
lines at the top and bottom use
the heavy-block / shade gradient
``\u2591 \u2592 \u2593 \u2588``
(U+2591-2594, Block Elements).

Visual sketch (80 columns wide)::

    \u256d\u2500\u2500\u2500\u2500\u2500\u2500...\u2500\u2500\u256e
    \u2502  \u2591\u2592\u2593\u2588\u2588\u2588...\u2588\u2588\u2583\u2592\u2591  \u2502
    \u2502                          \u2502
    \u2502   MANUSIFT (6 rows)        \u2502
    \u2502                          \u2502
    \u2502   [label1] [label2] [label3]  \u2502
    \u2502   [label4] [label5] [label6]  \u2502
    \u2502                          \u2502
    \u2502  \u2591\u2592\u2593\u2588\u2588... (bottom scan)        \u2502
    \u2570\u2500\u2500\u2500\u2500\u2500\u2500...\u2500\u2500\u256f

Guarantees:

  1. ``render_splash()`` is a pure
     function of ``(use_color,)``.
  2. The banner is 80 columns wide
     so it does not wrap on a
     default-sized terminal.
  3. ``use_color=True`` emits valid
     ANSI-256 escape sequences
     (``\x1b[38;5;{N}m``); the
     ``NO_COLOR`` environment
     variable forces color off.
  4. The banner degrades to plain
     text when stdout is not a TTY
     so piping into ``head`` /
     ``grep`` does not produce
     escape codes.
  5. ``render_compact_splash()`` is
     the shorter 4-row variant
     used by the ``manusift`` CLI's
     Typer help.

Color choices (cyber / vaporwave):

  * Cyan (ANSI 51) for the border
    and scan lines.
  * Purple (ANSI 99) \u2192 Magenta
    (ANSI 201) for the letter
    gradient.
  * Light cyan (ANSI 195) for the
    capability labels.
"""
from __future__ import annotations

import os
import sys
from typing import List


# ---------- 1. The 7-row block-letter glyphs ----------
#
# Each letter is a list of 7
# strings, each 5 cells wide. We
# use only ``\u2588`` (full block)
# and the regular ASCII space;
# the half-block / quarter-block
# characters are not used because
# not every terminal renders them
# with the expected height. The
# space is a true space (not a
# non-breaking space) so the
# cells line up under ``wc -L``
# and ``stty cols``.
#
# Each row of the word is built by
# concatenating the i-th row of
# each letter with a 1-cell
# separator. The result is then
# centered inside the 80-col
# frame.

LETTER_W: int = 5

_M: List[str] = [
    "█   █",
    "██ ██",
    "█ █ █",
    "█   █",
    "█   █",
    "█   █",
    "█   █",
]
_A: List[str] = [
    " ███ ",
    "█   █",
    "█   █",
    "█████",
    "█   █",
    "█   █",
    "█   █",
]
_N: List[str] = [
    "█   █",
    "██  █",
    "█ █ █",
    "█  ██",
    "█   █",
    "█   █",
    "█   █",
]
_U: List[str] = [
    "\u2588   \u2588",
    "\u2588   \u2588",
    "\u2588   \u2588",
    "\u2588   \u2588",
    "\u2588   \u2588",
    "\u2588   \u2588",
    " \u2588\u2588\u2588 ",
]
_S: List[str] = [
    "████ ",
    "█    ",
    "█    ",
    " ███ ",
    "    █",
    "    █",
    "████ ",
]
_I: List[str] = [
    "\u2588\u2588\u2588\u2588\u2588",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
    "\u2588\u2588\u2588\u2588\u2588",
]
_F: List[str] = [
    "████",
    "█    ",
    "█    ",
    "███ ",
    "█    ",
    "█    ",
    "█    ",
]
_T: List[str] = [
    "\u2588\u2588\u2588\u2588\u2588",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
    "  \u2588  ",
]


def _build_row(idx: int) -> str:
    """Build the i-th word row by
    concatenating the i-th row of
    each letter with a 1-cell
    separator. The result is
    ``LETTER_W * 8 + 7 = 47``
    cells wide."""
    parts = [
        _M[idx], _A[idx], _N[idx], _U[idx],
        _S[idx], _I[idx], _F[idx], _T[idx],
    ]
    return " ".join(p.strip().center(LETTER_W) for p in parts)


_LETTER_ROWS: List[str] = [
    _build_row(i) for i in range(7)
]

# Word is 47 cells wide. Centered
# inside the 80-col frame with
# ``(80 - 47) // 2 = 16`` cells of
# padding on each side.
WORD_W = LETTER_W * 8 + 7
FRAME_W = 80
PAD = (FRAME_W - WORD_W) // 2


# The capability labels were removed in revision 2 of the
# splash (T1.1) per the user's request: the box border and
# labels were too "busy" and pushed the user's first
# interaction further from the input field. The MANUSIFT
# word + the scan line + the box border are enough to
# establish the brand.


# ---------- 3. Color helpers ----------

# Purple \u2192 magenta gradient palette
# (7 stops, row-aligned to the
# 7-row word). Each entry is
# (R, G, B) in 0-255.
_GRADIENT: List[tuple[int, int, int]] = [
    (95, 0, 130),    # 0 deep purple
    (122, 0, 160),  # 1
    (148, 0, 190),  # 2 bright purple
    (180, 0, 215),  # 3 orchid
    (215, 30, 200), # 4 pink-purple
    (235, 90, 160), # 5 hot magenta
    (245, 120, 140),# 6 magenta
]


def _rgb_to_ansi256(r: int, g: int, b: int) -> int:
    """Snap an (R, G, B) triple to
    the closest ANSI 256 color code.

    The 256-color palette has:
      * 0-15: standard colors.
      * 16-231: a 6x6x6 RGB cube.
      * 232-255: a 24-step grayscale
        ramp.

    We snap to the 6x6x6 cube,
    indexed by
    ``16 + 36*r + 6*g + b`` where
    each channel is in 0-5. We map
    0-255 to 0-5 by ``x // 51`` (51
    * 5 = 255, exactly the max)."""
    cube_r = min(5, r // 51)
    cube_g = min(5, g // 51)
    cube_b = min(5, b // 51)
    return 16 + 36 * cube_r + 6 * cube_g + cube_b


def _esc(code: int) -> str:
    """Wrap ``code`` in an ANSI-256
    foreground escape sequence. The
    ``38;5;n`` form is supported by
    every terminal that claims
    256-color support (Windows
    Terminal, macOS Terminal,
    iTerm2, gnome-terminal,
    xterm-256color)."""
    return f"\x1b[38;5;{code}m"


_RESET = "\x1b[0m"

# Rich markup color names. We map
# our 5 roles to standard Rich
# color names so the textual
# widget (which renders through
# Rich) shows the right colors
# without us emitting raw ANSI
# escapes.
#
# Rich supports both named colors
# (e.g. "cyan", "magenta") and
# hex RGB. We use the named
# colors when they are close
# enough to our ANSI-256 codes.
_RICH_COLOR_NAMES = {
    51: "cyan",
    54: "purple",
    195: "cyan",
    91: "purple",
    99: "purple",
    128: "magenta",
    141: "magenta",
    163: "bright_magenta",
    169: "bright_magenta",
    174: "pink",
    201: "bright_magenta",
    208: "orange",
    220: "yellow",
}

def _color_open(code: int, markup: bool = False) -> str:
    """Wrap a segment of text in
    the foreground color."""
    if markup:
        name = _RICH_COLOR_NAMES.get(code)
        if name is not None:
            return f"[{name}]"
        return f"[color({code})]"
    return _esc(code)

def _color_close(markup: bool = False) -> str:
    """Close a color segment."""
    if markup:
        return "[/]"
    return _RESET


# Color codes for the four roles
# used in the banner.
COLOR_BORDER: int = 51      # cyan
COLOR_LABEL: int = 195      # kept for backward compat (labels removed in T1.1)
COLOR_CYBER_YELLOW: int = 220
COLOR_CYBER_ORANGE: int = 208
COLOR_CYBER_MAGENTA: int = 201
COLOR_CYBER_CYAN: int = 51
COLOR_GRADIENT: List[int] = [
    _rgb_to_ansi256(*c) for c in _GRADIENT
]


_COMPACT_WORDMARK_ROWS: List[str] = [
    "███╗   ███╗ █████╗ ███╗   ██╗██╗   ██╗███████╗██╗███████╗████████╗ ▓▓▓",
    "████╗ ████║██╔══██╗████╗  ██║██║   ██║██╔════╝██║██╔════╝╚══██╔══╝ ▓▓▓",
    "██╔████╔██║███████║██╔██╗ ██║██║   ██║███████╗██║█████╗     ██║    ▓▓▓",
    "██║╚██╔╝██║██╔══██║██║╚██╗██║██║   ██║╚════██║██║██╔══╝     ██║    ▒▒▒",
    "██║ ╚═╝ ██║██║  ██║██║ ╚████║╚██████╔╝███████║██║██║        ██║    ▒▒▒",
    "╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚═╝╚═╝        ╚═╝    ░░░",
]

_COMPACT_VAPORWAVE_TAGLINE = (
    "MANUSIFT :: source tracing // figure ghosts // metadata drift"
)

_COMPACT_VAPORWAVE_COLORS: List[int] = [
    COLOR_CYBER_CYAN,
    COLOR_CYBER_MAGENTA,
    COLOR_CYBER_CYAN,
    COLOR_CYBER_MAGENTA,
    COLOR_CYBER_YELLOW,
    COLOR_CYBER_MAGENTA,
    COLOR_CYBER_CYAN,
]


# ---------- 4. TTY / color gating ----------

def _should_color() -> bool:
    """Color is on by default when
    stdout is a TTY. The user can
    force it off with ``NO_COLOR=1``
    (https://no-color.org) or force
    it on with ``MANUSIFT_FORCE_COLOR=1``."""
    if os.environ.get("MANUSIFT_FORCE_COLOR") == "1":
        return True
    if os.environ.get("NO_COLOR"):
        return False
    return sys.stdout.isatty()


# ---------- 5. Component builders ----------

def _scan_line(width: int, markup: bool = False) -> str:
    """A scan line is the heavy-block
    gradient ``\u2591\u2592\u2593\u2588``
    ramped left-to-right, sized to
    ``width`` cells. The visual
    effect is a "CRT scan line" at
    the top and bottom of the
    banner. When ``markup=True``,
    the line is wrapped in the
    cyan color tag."""
    # 4-cell gradient, repeated.
    cell = "\u2591\u2592\u2593\u2588"
    inner = width
    if inner <= 0:
        return ""
    pattern = cell * (inner // len(cell) + 1)
    pattern = pattern[:inner]
    if markup:
        return _color_open(COLOR_BORDER, markup) + pattern + _color_close(markup)
    return pattern


def _border_line_plain(width: int, top: bool) -> str:
    """A box-drawing border
    line in plain text, with
    no colour markup. The
    textual widget that
    contains this border
    will render the
    surrounding box in the
    theme colour via the
    Static widget's own
    border."""
    if top:
        return chr(0x256d) + chr(0x2500) * (width - 2) + chr(0x256e)
    return chr(0x2570) + chr(0x2500) * (width - 2) + chr(0x256f)


def _border_line(width: int, top: bool, markup: bool = False) -> str:
    """A box-drawing border line. The
    ``top=True`` variant uses
    ``\u256d / \u2500 / \u256e`` corners;
    ``top=False`` uses ``\u2570 /
    \u2500 / \u256f``. A single space
    of padding is reserved on each
    side so the border does not
    touch the terminal edge. When
    ``markup=True``, the border
    characters are wrapped in the
    cyan color tag."""
    if width < 6:
        if markup:
            return _colorize('-' * width, COLOR_BORDER, markup)
        return f"{_esc(COLOR_BORDER)}{'-' * width}{_RESET}"
    inner = width - 2
    if top:
        c1 = _color_open(COLOR_BORDER, markup) + chr(0x256d) + _color_close(markup)
        c2 = _color_open(COLOR_BORDER, markup) + (chr(0x2500) * inner) + _color_close(markup)
        c3 = _color_open(COLOR_BORDER, markup) + chr(0x256e) + _color_close(markup)
        return c1 + c2 + c3
    c1 = _color_open(COLOR_BORDER, markup) + chr(0x2570) + _color_close(markup)
    c2 = _color_open(COLOR_BORDER, markup) + (chr(0x2500) * inner) + _color_close(markup)
    c3 = _color_open(COLOR_BORDER, markup) + chr(0x256f) + _color_close(markup)
    return c1 + c2 + c3


def _vertical_pipe(markup: bool = False) -> str:
    """A single box-drawing vertical
    pipe. When ``markup=True`` the
    pipe is wrapped in the cyan
    color tag so it shows in
    color inside the textual TUI."""
    if markup:
        return _color_open(COLOR_BORDER, markup) + chr(0x2502) + _color_close(markup)
    return _esc(COLOR_BORDER) + chr(0x2502)


def _label(name: str) -> str:
    """Render a single capability
    label as ``[ NAME ]`` with the
    brackets and the name in the
    label color."""
    text = f"[ {name} ]"
    return _esc(COLOR_LABEL) + text + _RESET


def _colorize(text: str, color: int, markup: bool = False) -> str:
    """Colorize ``text`` with the
    given ANSI-256 ``color`` and
    reset at the end. The text is
    assumed to be free of existing
    escape sequences. When
    ``markup=True`` the function
    emits Rich markup tags
    (``[color]...[/]``) instead
    of raw ANSI escapes -- this
    is the right mode for the
    textual TUI's ``Static``
    widget, which renders through
    Rich and would otherwise show
    the escape codes as literal
    text."""
    return _color_open(color, markup) + text + _color_close(markup)


def _fit_line(text: str, width: int) -> str:
    """Pad or trim ``text`` to the
    requested visible cell width.

    The compact banner uses one-cell
    terminal glyphs, so Python string
    length is a good fit for the
    renderer contract tested here."""
    if width <= 0:
        return ""
    if len(text) > width:
        return text[:width]
    return text.center(width)


def _style_line(
    text: str,
    color: int,
    *,
    use_color: bool,
    markup: bool,
) -> str:
    """Apply either Rich markup,
    ANSI color, or no styling to a
    fitted visible line."""
    if markup:
        return _colorize(text, color, markup=True)
    if use_color:
        return _colorize(text, color, markup=False)
    return text


# ---------- 6. Public renderers ----------

def render_splash(
    use_color: bool | None = None,
    markup: bool = False,
    width: int | None = None,
) -> str:
    """Render the full cyber /
    vaporwave splash banner.

    ``use_color=None`` (the default)
    means "use the TTY + NO_COLOR +
    MANUSIFT_FORCE_COLOR rules".
    ``use_color=True`` forces color;
    ``use_color=False`` forces plain.

    The output is a single string
    with embedded newlines and ANSI
    escape sequences.
    """
    if use_color is None:
        use_color = _should_color()
    w = width if width is not None else FRAME_W
    lines: List[str] = []
    if use_color or markup:
        # Top border.
        lines.append(_border_line(w, top=True, markup=markup))        # Top scan line. We pad the
        # scan-line content with one
        # cell on each side so it
        # does not touch the border.
        scan = _scan_line(w - 4, markup=markup)
        lines.append(
            f"{_vertical_pipe(markup=markup)} {scan} {_vertical_pipe(markup=markup)}"
        )
        # Blank line.
        lines.append(
            f"{_vertical_pipe(markup=markup)}{' ' * (w - 2)}{_vertical_pipe(markup=markup)}"
        )
        # Seven letter rows with the
        # purple-to-magenta gradient.
        for i, row in enumerate(_LETTER_ROWS):
            centered = row.center(w - 4)
            lines.append(
                f"{_vertical_pipe(markup=markup)} {_colorize(centered, COLOR_GRADIENT[i], markup=markup)} {_vertical_pipe(markup=markup)}"
            )
        # Blank line.
        lines.append(
            f"{_vertical_pipe(markup=markup)}{' ' * (w - 2)}{_vertical_pipe(markup=markup)}"
        )
        # (Capability labels removed in
        # T1.1; see the docstring near
        # the top of this file.)
        # Blank line.
        lines.append(
            f"{_vertical_pipe(markup=markup)}{' ' * (w - 2)}{_vertical_pipe(markup=markup)}"
        )
        # Bottom scan line.
        lines.append(
            f"{_vertical_pipe(markup=markup)} {scan} {_vertical_pipe(markup=markup)}"
        )
        # Bottom border.
        lines.append(_border_line(w, top=False, markup=markup))
    else:
        # Plain-text fallback. No
        # escape codes. Useful for
        # piping into ``head`` /
        # ``grep`` and for terminals
        # that do not support ANSI 256.
        top_border = chr(0x256d) + chr(0x2500) * (w - 2) + chr(0x256e)
        bot_border = chr(0x2570) + chr(0x2500) * (w - 2) + chr(0x256f)
        pipe = chr(0x2502)
        lines.append(top_border)
        # Top scan line. We use the
        # 4-cell gradient \u2591\u2592\u2593\u2588
        # repeated to fill the inner
        # width minus 2 for padding.
        scan_pattern = _scan_line(w - 4)
        lines.append(f"{pipe} {scan_pattern} {pipe}")
        lines.append(f"{pipe}{' ' * (w - 2)}{pipe}")
        for row in _LETTER_ROWS:
            centered = row.center(w - 4)
            lines.append(f"{pipe} {centered} {pipe}")
        lines.append(f"{pipe}{' ' * (w - 2)}{pipe}")
        # (Capability labels removed
        # in T1.1.)
        lines.append(f"{pipe}{' ' * (w - 2)}{pipe}")
        lines.append(f"{pipe} {scan_pattern} {pipe}")
        lines.append(bot_border)
    return chr(10).join(lines)


def render_mini_splash(
    use_color: bool = False, width: int = 60
) -> str:
    """A 1-line version of
    the splash suitable for
    the in-TUI header. It
    keeps the scan-line bar
    but drops the giant
    letter rows -- the
    in-TUI banner is a
    secondary brand mark,
    not the first thing the
    user sees.

    The text is centred in
    the given width. We
    include the scan bar
    above and below the
    word mark for visual
    continuity with the
    full splash."""
    NL = chr(10)
    bar = "─" * width
    text = "[ MANUSIFT ]"
    pad = max(0, (width - len(text)) // 2)
    line = " " * pad + text
    return f"{bar}{NL}{line}{NL}{bar}"


def render_compact_splash(
    use_color: bool | None = None,
    markup: bool = False,
    width: int = 80,
) -> str:
    """A compact cyberwave splash
    used by the in-TUI banner and
    CLI help.

    The output is seven visible rows:
    six heavy MANUSIFT wordmark
    rows and one forensic tagline.
    The wordmark keeps a stable
    block-shadow extrusion instead
    of a chromatic offset/glitch
    effect.
    Every visible row is padded or
    trimmed to ``width`` cells.
    """
    if use_color is None:
        use_color = _should_color()
    raw_lines = [
        *_COMPACT_WORDMARK_ROWS,
        _COMPACT_VAPORWAVE_TAGLINE,
    ]
    lines = [
        _style_line(
            _fit_line(row.rstrip(), width),
            _COMPACT_VAPORWAVE_COLORS[i],
            use_color=use_color,
            markup=markup,
        )
        for i, row in enumerate(raw_lines)
    ]
    return chr(10).join(lines)
