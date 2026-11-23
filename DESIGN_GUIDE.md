# Notes — design guide

Nov 22, 2026 · @Alex

## The idea

Notes is a tool for reading technical notes, so the text of the note is always the main thing on the screen. Navigation and buttons help the reader find and read a note, and they do not compete with it.

Four principles, and everything else follows from them:

- **A quiet interface.** Everything that is not the text of the note is smaller, lighter, and calmer than the text.
- **One scale.** Font sizes and spaces come from one scale and are expressed through each other.
- **Structure through space and alignment.** Frames, lines, and colour are used only when space is not enough.
- **Dense where people search, loose where people read.** The tree is compact, and the text of the note has air.

The content is built from Markdown automatically. So the styles must work equally well on any note, without manual tuning for a particular page.

The guide describes ratios, not exact values. The reference point is the same everywhere: the size of the body text of the note. The [mockups](https://claude.ai/artifact/5QAZxPqaHcsu7F693QLq3P#page-type) show how this looks in practice.

## Three levels of attention

Every element of the page belongs to one of three levels, and the level sets its size, contrast, and density.

| Level | What it includes | How it looks |
| --- | --- | --- |
| 1. Text of the note | Title, paragraphs, code, diagrams | The largest and the most contrasting, with the largest spaces |
| 2. Navigation | The notes tree, "On this page" | One step smaller than the text, calmer in colour, denser |
| 3. Controls | Search, buttons, sorting, theme | The smallest and the quietest on the page |

An element of a lower level is never larger, bolder, or brighter than an element of a higher level. There is one exception: the current note in the tree, because it answers the question "where am I".

If a button or a menu item competes with the title of the note, the mistake is in the button, not in the title.

## Typography

All text on the page is built from one size: the size of the body text of the note. The other sizes are steps relative to it.

Above the body text a step of the scale is about a quarter: the eye does not read a smaller difference between headings. Below it the steps are shorter, about one eighth, because small text loses legibility quickly.

| Role | Size relative to the body text | Weight | Line height relative to the font size |
| --- | --- | --- | --- |
| Body text of the note | The reference point | Regular | Loose: about 1.7 times larger |
| Page title | About twice as large | Bold | Tight: about 1.2 times larger |
| Section heading | About one and a half times as large | Semibold | About 1.25 times larger |
| Subheading | One step larger | Semibold | About 1.3 times larger |
| Navigation: tree, contents | One step smaller | Regular; semibold for folders and the current note | About 1.4 times larger |
| Buttons, captions, service text | Two steps smaller | Medium | One line |
| Inline code | Slightly smaller than the text around it | Regular | The same as the text around it |

The rules that hold the scale together:

- **Line length.** A line of body text has 65–80 characters. The column does not stretch with the window. The reader may choose a longer line, see "Page proportions".
- **The larger, the tighter.** Large headings have a smaller line height and letter spacing, and small text has larger ones.
- **Three weights, no more.** Weight shows structure: headings, folders, the current note. It does not emphasise separate words in the interface.
- **Two families.** A sans serif for everything, and a monospace only for code, paths, and identifiers. Ordinary words and descriptions are not set in monospace.
- **The lower limit.** Service text is not smaller than about three quarters of the body text. Below that it stops being readable, especially with digits and slashes.
- **Headings of adjacent levels** differ in both size and weight, not in one of them.

## Spacing and rhythm

All spaces come from one scale, where each step is one and a half to two times larger than the previous one. There are no values in between.

The unit of the scale is half the size of the body text. Below it is called a "step".

| What is separated | Space |
| --- | --- |
| Parts of one element: an icon and its label | 1 step |
| Adjacent rows of a list or the tree | Almost none: the line height itself gives the air |
| Groups inside a panel | 2 steps |
| The lines of one paragraph that the author broke | 1 step |
| Paragraphs | 3 steps, a little less than the line height |
| A block inside the text: code, diagram, table, callout | 4 steps above and below |
| The page title and the first paragraph | 6–8 steps |
| Sections | 10–12 steps |

Rules:

- **Proximity.** Related elements stand at least twice as close to each other as to unrelated ones. This is the main tool of structure.
- **From the inside out.** The space inside an element is smaller than the space between elements, which is smaller than the space between groups, which is smaller than the space between sections.
- **A heading belongs to the text below it.** The space above a section heading is three to four times larger than the space below it.
- **The margins of the text column** on the sides are at least three to four line heights. The top margin is smaller than the side margins.
- **The margins of the panels** are about half the margins of the text column.
- **A line instead of space** is used when space is not enough, for example between the header of a section and its content. The space is the same on both sides of the line.
- **Alignment.** The left edges of the text inside one zone coincide. Icons and disclosure marks are not part of this edge: they hang to the left of it.

## Page proportions

The page has three zones, and the main one is the text column, whose width is set by the line length and not by the width of the window.

- **The text column** stands in the centre of the space between the panels. Spare width of the window goes into the margins around it, not into the length of the lines.
- **The tree** takes about a third of the width of the text column.
- **The page contents** are slightly narrower than the tree: they have short lines and fewer levels.
- **The two panels together** are narrower than the text column. If they are not, the navigation starts to dominate.
- **The header** is thin: its height is about two line heights of the body text.
- **One line at the top.** The first row of the tree, the first line of the note, and the heading of the contents start at the same height.

The panels can be narrowed, widened, or hidden. While the text column has enough room, its width does not change, and only the margins change.

The reader can change the width of the column with a button in the header. A click moves to the next of three values, and the button shows the current one: the regular column, a wide one that is one step of the type scale wider, and the full width between the panels. A note with long list items, wide code, or many tables reads better in a wider column on a large screen, and only the reader knows the screen. The regular column is the starting state, and the panels keep their proportions to it at any choice.

On a narrow screen the panels become drawers over the text. The column takes the whole width, and its side margins are at least one line height.

## The navigation tree

People scan the tree and do not read it, so it is denser and smaller than the text of the note. Each row still stays a comfortable target for a click.

- **The row height** is slightly more than two sizes of its font. Below that the rows merge, and above that the tree stops fitting on the screen.
- **A folder and a file** differ in weight and in the disclosure mark, not in font size.
- **Nesting** is shown by an indent and a thin guide line. Each level shifts by the same step, equal to the width of the disclosure mark with its gap.
- **A long note name** takes two lines at most, then it is cut, and the tooltip shows the whole name. It must not be cut to one line: names in a folder often start the same way and differ at the end.
- **A folder name** always takes one line.
- **The current note** has a light background of the accent colour and accent text. A solid bright fill is too heavy for a list item.
- **An open folder** is separated from the next one by an extra space, so that its content reads as a group.
- **Sorting** is a quiet button above the tree that shows the current order. It also serves as the heading of the list.
- **There is no label above the tree** that repeats the name of the site or of the folder.

The tree is pinned by default: for documentation it is the main navigation. A hidden tree is the choice of the reader, not the starting state.

## The header and controls

The header is thin and always on the screen. It holds what belongs to the whole site and the actions for the open note: they must be at hand at any scroll depth. Every other control lives next to the thing it controls.

| What it controls | Where it stands |
| --- | --- |
| The whole site: search, theme, width of the text column, visibility of the panels | In the header |
| The tree: sorting | Above the tree |
| The note: "Copy page" and its menu | In the header, in the right group |
| A section: folding | In the margin, to the left of its heading |
| A block: the fold, the copy, and the zoom of a diagram | In the header of the block itself |

Rules:

- **The panel buttons stand on the side of their panel.** The tree button is the first on the left, and the contents button is the last on the right. They do not move away on scroll.
- **One height inside a zone.** All buttons and fields in the header have one height, and all buttons in the note have one height.
- **The height of a button** is about two and a half times the size of its text. An icon button is a square with a side equal to this height.
- **An icon** is slightly taller than a capital letter of the adjacent text and has the same stroke width as the other icons.
- **A quiet look by default.** Service buttons have no fill or have a thin border. They have no accent fill.
- **The search** is the widest element of the header, about half the text column.
- **One entry point for each function.** The same action is not repeated in two places.
- **The current value is visible without a click.** A switch with two or three options shows the selected option on the button itself.

## Floating panels and menus

Everything that floats is attached to the element that opened it and takes the minimum of room, so that it covers as little text as possible.

- **Anchoring.** A menu aligns with the edge of its button and opens directly below it.
- **Width.** A menu is not wider than half the text column.
- **A menu item** has a name and an explanation. The name is set as navigation text, semibold; the explanation is one step smaller and calmer in colour.
- **Surface.** The page background, a thin border, a soft shadow. The corner radius is about one and a half times larger than that of buttons.
- **Closing.** A click outside the layer and the Esc key close it.
- **A separate settings window** is justified when there are three settings or more. One or two settings live right where they act.

The floating tree follows the same rules and three more:

1. It appears when the pointer is on the tree button, after a short delay, and disappears after a delay about twice as long. Without the delays the panel jumps out on every move of the mouse.
2. A click on the button pins the tree into the layout or unpins it.
3. Touch screens have no hover, so only the click works there.

## Colour

The interface is neutral, and there is one accent colour, which means only two things: "this is a link" and "this is selected".

| Role | How many tones | Where it is used |
| --- | --- | --- |
| Text | Three: ink, body, muted | Headings; paragraphs and navigation; service text and captions |
| Surfaces | Three: page, panel, layer | The background of the note; the background of the tree, barely different from the page; menus and floating panels with a shadow |
| Lines | One | The lightest tone that is still visible |
| Accent | One colour and its light background | Links, the current item, keyboard focus |

Rules:

- **The accent does not decorate.** It is not used for headings, for the background of large areas, or for service buttons.
- **Contrast.** Ink and body text contrast with the background. Muted text stays readable: not below the standard accessibility threshold of 4.5 to 1.
- **The difference between surfaces** is minimal. Space separates the zones first of all, and tone only supports it.
- **The dark theme** keeps the same roles and the same contrast ratios. It is a separate selection of tones, not an inversion of the light theme.
- **Diagrams** are drawn in the palette of the site: neutral lines, and boxes that are white or slightly tinted with the accent. The default palette of the library looks foreign.

## Blocks inside the text

Code, diagrams, tables, and callouts are part of the text: they stand in the text column and follow its rhythm.

- **Width.** A block is not wider than the text column. Wide content scrolls inside the block, and the page does not move sideways.
- **The exception: tables and diagrams.** Narrowing them costs more than narrowing text: a table loses its rows, and a diagram loses readable labels. So they take their room in three steps:
  1. First the block tries to fit in the column. A table is set one step smaller than the text, its cells stand closer, ordinary text in a cell wraps, and code and identifiers do not.
  2. If the block does not fit, it grows into the margins of the column and stays aligned with its centre. Its limit is the space between the panels; if a panel is unpinned, there is more space.
  3. If the margins are not enough either, a table scrolls inside the block, and its first column stays in place. A diagram shrinks to the available width.
- **Into the margins only when needed.** A block that fits in the column stands in the column. A block in the margins is not wider than its content. Code, callouts, and quotes do not grow into the margins.
- **On a narrow screen and in print** there are no margins, so only the first and the third steps remain.
- **Inline code** is set in monospace slightly smaller than the text, on a quiet background that still shows the edges of the identifier. It does not increase the line height.
- **A table** has no frame and no fill: a thin line separates the rows, and the column headings are set as captions, small and muted. The first and the last cells stand on the edges of the column, as the lines of text do.
- **A diagram** stands in a frame with its own thin header: the caption on the left, the copy button and the zoom controls on the right. The buttons there have the same height as the other buttons in the note.
- **A diagram folds.** The caption with a disclosure mark before it is the button. A folded diagram is its header alone, in the text column, with the copy button: the zoom has nothing to act on. The copy button gives the source of the diagram as the author wrote it, in its `mermaid` code fence, and says so the way the copy button of a code block does.
- **A callout** is a light background, an icon, and a semibold title. It is not brighter or more contrasting than the text around it.
- **Lists.** The space between items is half the space between paragraphs.
- **A section** reads as a unit: a line and a large space separate its heading from the text above.
- **A section folds.** Every heading has a disclosure mark that hides the section: everything below the heading, up to the next heading of the same or a higher level. The mark hangs in the margin to the left of the heading, shows when the pointer is on the heading, and stays visible while the section is folded. A link into a folded section opens it.
- **Corner radii** come from two values. The small one is for buttons and code backgrounds; the large one, one and a half to two times larger, is for blocks, menus, and floating panels.

## States and behaviour

The states of every interactive element are distinguishable at a glance and look the same in all zones.

| State | How it is shown |
| --- | --- |
| Rest | No background |
| Hover | A barely visible neutral background |
| Open or pressed | A neutral background slightly denser than on hover |
| Selected | A light accent background and accent text |
| Keyboard focus | An outline ring of the accent colour, visible on any background |

Behaviour:

- **The width of the panels** changes when the reader drags the border. The border looks like an ordinary thin line, and the cursor tells that it can be dragged.
- **Width limits.** A panel cannot be narrowed until it is unreadable, or widened until it is wider than the text column.
- **Memory.** The pinning of the panels, their width, the width of the text column, and the sort order persist between notes. Folded sections and folded diagrams persist for their note.
- **Motion.** Only the appearance and disappearance of layers is animated, briefly. The text of the note does not shift.
- **Keyboard.** Everything that opens with the mouse also opens from the keyboard.

## How to check decisions

Every new decision goes through five questions. If the answer to at least one is "no", the decision needs more work.

1. If you squint, does the text of the note stay the most noticeable thing on the screen?
2. Is every font size and every space taken from the scale, and not chosen by eye?
3. Do related elements stand at least twice as close as unrelated ones?
4. Does the decision survive the extreme cases: the longest name, the longest note, an empty folder, a narrow window?
5. If this element, line, or colour is removed, is anything lost? If not, it is removed.

What to avoid:

- Lines of text across the whole width of the window, unless the reader chose the full width.
- Navigation of the same size and weight as the text of the note.
- Solid accent fills on list items and service buttons.
- Frames around everything instead of space.
- A monospace font for ordinary words.
- Labels that repeat the obvious or the name of the site.
- A separate window for a single setting.
- Controls that move away on scroll.
- Two almost equal font sizes or spaces next to each other.
