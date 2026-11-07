# UI Module Refactor Plan and Results

## Goals and constraints

- Split the 1,783-line `js/ui.js` by rendering responsibility without changing
  exported names, UI text, layout constants, or rendering behavior.
- Keep `js/ui.js` as a compatibility facade so existing imports remain intact.
- Keep mutable UI state in one internal `js/ui/state.js` object so the modules
  retain the original shared state semantics; only responsibility modules
  mutate it, and cross-page reset behavior remains explicit.
- Remove duplicated layout/rendering in the two codex pages and three purchase
  confirmation dialogs only after the move-only split passes the full suite.

## Target structure

| Module | Responsibility |
| --- | --- |
| `js/ui.js` | Re-export the established public API from the modules below. |
| `js/ui/state.js` | Internal shared mutable state for menu, codex, overlay, dialog, and effect modules. |
| `js/ui/common.js` | Shared timing, page title, title rule, back button, and button hit test. |
| `js/ui/effects.js` | Damage-number and star state/update/drawing. |
| `js/ui/menus.js` | Page transitions, main menu, shop, hangar, talent, settings, achievements, and menu button/card getters. |
| `js/ui/codex.js` | Skill/powerup codex pages, shared grid clipping/scrolling/card-hit helpers, and powerup descriptions. |
| `js/ui/overlays.js` | Game-over, level-up, pause, revive, and toast rendering/state. |
| `js/ui/dialogs.js` | Detail, clear-cache, hangar, and talent confirmation state/rendering; shared confirmation panel/button helpers. |

## State and dependency boundaries

- `state.js` preserves the original single-module state identity across the
  extracted renderers; API getters continue returning the same live arrays and
  objects.
- `menus.js` dispatches to codex renderers. `setMenuPage` invokes dialog setters
  and codex reset APIs so existing cross-page cleanup and scroll behavior remain
  unchanged.
- Drawing helpers shared by modules live in `common.js`; existing config,
  theme, assets, and metadata modules remain the sources of game data.
- The facade re-exports public symbols only; game code and tests continue to
  import from `js/ui.js`.

## Implementation results

1. Extracted the implementation into responsibility modules and retained the
   `js/ui.js` facade. The facade's public export set matches the pre-refactor
   module.
2. The two codex pages now share grid sizing, clipping, hit-rectangle, and
   scrollbar helpers while keeping page-specific text, card dimensions, icons,
   and colors.
3. The three confirmation dialogs now share backdrop, panel, and button
   rendering while retaining each dialog's dimensions, labels, fields, and
   spacing.
4. Validation: the UI and Canvas stack tests pass after each structural stage;
   the full test suite and browser smoke test are run after the final review.
