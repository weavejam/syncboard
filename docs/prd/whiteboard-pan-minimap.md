# Whiteboard Pan and Minimap Navigation

## Overview

The whiteboard should be navigable without visible scrollbars. Users can hold the right mouse button and drag the canvas with a hand-style cursor, and a minimap in the lower-left corner shows where components live on the larger board and lets users jump to a location.

## Motivation

The current large canvas technically scrolls, but it still feels like a web page because users must drag browser scrollbars. Whiteboard tools typically hide scrollbars and use direct panning. As the board grows, users also need spatial awareness and fast navigation between distant component clusters.

## Requirements

1. Hide the canvas scrollbars while preserving programmatic scrolling.
2. Support right-mouse-button hold + drag to pan the canvas in both axes.
3. Show a hand/grabbing cursor while panning.
4. Suppress the browser context menu while right-drag panning over the canvas.
5. Keep existing component drag/resize behavior intact.
6. Add a minimap fixed in the lower-left of the canvas viewport.
7. Render each board element as a marker/rectangle in the minimap.
8. Render the current viewport rectangle in the minimap.
9. Clicking the minimap recenters the main canvas on that minimap position.
10. The minimap should use only lightweight DOM/SVG; no iframe screenshots.

## Acceptance Criteria

1. The canvas no longer displays scrollbars.
2. Right-click dragging on the canvas pans the whiteboard smoothly.
3. The cursor changes to a grabbing/hand affordance while panning.
4. Component selection, drag, resize, and iframe interaction remain usable.
5. The minimap appears in the lower-left corner.
6. The minimap shows component positions and the current viewport.
7. Clicking the minimap moves the main canvas to the clicked board area.
8. `pnpm -r build` passes.

## Technical Approach

Add a `hide-scrollbar` CSS utility. In `Canvas`, keep using the existing scroll container and logical coordinate system, but add right-button pointer handlers that adjust `scrollLeft`/`scrollTop` directly.

The minimap computes a bounding world from visible components plus the current viewport and maps those logical coordinates into a fixed-size SVG. This avoids trying to visualize the entire 200,000px virtual plane, which would make all markers too tiny. Clicking the minimap converts the click to logical board coordinates and scrolls the main canvas so that point is centered.

## Testing Strategy

1. Type/build validation with `pnpm -r build`.
2. Manual validation:
   - scrollbars are hidden
   - right-drag pans in both axes
   - component drag/resize still works
   - minimap markers and viewport move as the canvas scrolls
   - minimap click jumps to the expected area

## Out of Scope

1. Touch/two-finger panning.
2. Zoom controls.
3. True screenshot previews in the minimap.
