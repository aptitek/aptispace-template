--[[
  bi-icons.lua  —  Quarto/Pandoc Lua filter
  ==========================================
  Automatically prepend a Bootstrap Icon to any element that carries a
  `.bi-<icon-name>` CSS class, using Quarto's native attribute syntax:

      ## My Heading {.bi-hash}
      [Some inline text]{.bi-star}

  The filter:
    1. Extracts the first `bi-*` class found on the element.
    2. Prepends  <i class="bi bi-<name>" aria-hidden="true"></i>  as raw HTML.
    3. Removes the `bi-*` class from the element so the output HTML stays clean.

  Works on: Span, Header, Div (useful for panel-tabset panes and card headers).

  Because this runs at compile time in the Pandoc AST, it works everywhere —
  including inside panel-tabset headings where Quarto shortcodes cannot.
  The icon is embedded in the heading content, so Quarto's tab-label also
  picks it up automatically (no JS injection needed).
--]]


--- Extract the first bi-* class from a class list.
--- Returns the icon class name (e.g. "bi-hash") and the remaining classes.
---@param classes pandoc.List<string>
---@return string|nil  bi_class
---@return table       remaining_classes
local function extract_bi_class(classes)
  local bi_class = nil
  local remaining = {}
  for _, cls in ipairs(classes) do
    if not bi_class and cls:match("^bi%-") then
      bi_class = cls
    else
      table.insert(remaining, cls)
    end
  end
  return bi_class, remaining
end


--- Build the Bootstrap Icon inline HTML element.
---@param bi_class string  e.g. "bi-hash"
---@return pandoc.RawInline
local function make_icon(bi_class)
  return pandoc.RawInline(
    "html",
    '<i class="bi ' .. bi_class .. '" aria-hidden="true"></i> '
  )
end


-- ── Span handler ───────────────────────────────────────────────────────────────
-- Handles: [text]{.bi-icon}  and  []{.bi-icon}  (empty span = icon only)
-- Empty spans return the icon RawInline directly, skipping the <span> wrapper.
function Span(el)
  local bi_class, remaining = extract_bi_class(el.classes)
  if not bi_class then return el end

  local icon = make_icon(bi_class)

  -- Empty span []{.bi-icon} — return just the icon, no wrapper
  if #el.content == 0 then
    return icon
  end

  -- Non-empty span [text]{.bi-icon} — prepend icon, keep the span
  el.classes = pandoc.List(remaining)
  el.content:insert(1, icon)
  return el
end


-- ── Header handler ────────────────────────────────────────────────────────────
-- Handles: ## Title {.bi-icon}
-- Also covers panel-tabset ## headings — the icon lands in the tab label too.
function Header(el)
  local bi_class, remaining = extract_bi_class(el.classes)
  if not bi_class then return el end

  el.classes = pandoc.List(remaining)
  el.content:insert(1, make_icon(bi_class))
  return el
end


-- ── Div handler ───────────────────────────────────────────────────────────────
-- Handles: ::: {.bi-icon}  (e.g. card headers or section divs)
-- Skips Bootstrap .tab-pane divs — those are handled by JS initTabIcons().
-- Wraps the first block's inlines with the icon prepended.
function Div(el)
  -- Panel-tabset panes: class is read at runtime by JS initTabIcons; skip here
  for _, cls in ipairs(el.classes) do
    if cls == "tab-pane" then return el end
  end

  local bi_class, remaining = extract_bi_class(el.classes)
  if not bi_class then return el end

  el.classes = pandoc.List(remaining)

  -- Prepend the icon to the first Para or Plain block found
  for _, block in ipairs(el.content) do
    if block.t == "Para" or block.t == "Plain" then
      block.content:insert(1, make_icon(bi_class))
      break
    end
  end

  return el
end
