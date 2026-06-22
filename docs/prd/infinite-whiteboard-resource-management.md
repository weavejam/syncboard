# Infinite Whiteboard and Resource Management

## Overview

SyncBoard's canvas should behave more like an infinite whiteboard: users can scroll far beyond the initial viewport and place components anywhere on a large virtual plane. To keep memory usage bounded, iframe apps that are far outside the viewport or rendered too small should be unloaded and replaced with a lightweight placeholder until the user interacts with them again.

## Motivation

The current canvas is a fixed viewport with `overflow-hidden`, so it does not feel like a whiteboard and users cannot navigate across a larger board. Each component is also always mounted as a live iframe, even when it is far offscreen. As boards accumulate more generated apps, always-live iframes can consume excessive memory/CPU.

## Requirements

1. The canvas must support large, whiteboard-like scrolling in both axes.
2. Existing board element coordinates must keep working without a data migration.
3. Elements must remain draggable and resizable after the canvas becomes scrollable.
4. Off-viewport components should not be unloaded immediately; they should be unloaded only after a grace period.
5. Selected, dragged, or resized components must remain live even if near viewport boundaries.
6. Very small components may be shown as a lightweight preview/placeholder until user interaction.
7. Placeholder components must clearly indicate that the live app is paused/unloaded and can be clicked to reload.
8. The implementation must preserve Fluid state synchronization for live iframes.
9. The implementation must not attempt costly or unreliable iframe screenshot capture in V1.

## Acceptance Criteria

1. The canvas scrolls horizontally and vertically over a large virtual surface.
2. New and existing elements render around the initial viewport after page load.
3. Drag/resize still updates element coordinates correctly.
4. When an element is outside the viewport beyond a preload margin for the configured delay, its iframe unmounts.
5. When the element returns near the viewport or is selected, its iframe remounts.
6. When an element is below the small-preview threshold and is not selected/interacting, it renders a lightweight placeholder instead of a live iframe.
7. Clicking/selecting a placeholder remounts the live iframe.
8. `pnpm -r build` passes.

## Technical Approach

### Infinite-ish virtual plane

V1 uses a very large scrollable world (for example 200,000 x 200,000 px) with an origin offset in the middle. Fluid board coordinates remain in logical world coordinates. Rendering maps logical coordinates to DOM coordinates via `domX = ORIGIN + x`, `domY = ORIGIN + y`. On initial mount, the scroll container is positioned around the origin so existing elements at small coordinates are visible.

This is not mathematically infinite, but it provides a whiteboard-scale working area without introducing viewport transform math, zoom, or coordinate migrations.

### Viewport-aware iframe lifecycle

`Canvas` tracks the scroll container viewport and computes whether each element intersects an expanded viewport (`preloadMargin`). When an element is outside that expanded viewport, the canvas records the time it went offscreen. Once it has been offscreen longer than `UNLOAD_AFTER_MS`, it passes `renderMode="placeholder"` to the element, which unmounts the iframe.

Selected elements and actively interacted-with elements are always live.

### Small-size optimization

When an element's width/height are below a threshold and the user has not selected/interacted with it, V1 renders a lightweight placeholder instead of the live iframe. This acts as a low-cost preview state. True image snapshot replacement is out of scope for V1 because reliable screenshotting of sandboxed `srcdoc` iframes requires extra rendering/capture infrastructure and is likely brittle.

## Testing Strategy

1. Type/build validation with `pnpm -r build`.
2. Manual browser validation:
   - scroll far in all directions
   - confirm generated elements appear near the initial origin
   - drag/resize and verify positions persist
   - scroll an element out of view, wait, scroll back, confirm it remounts
   - resize small and confirm placeholder mode

## Out of Scope

1. True infinite coordinate rebasing.
2. Zoom controls.
3. Minimap/navigation UI.
4. Reliable iframe-to-image screenshot capture for placeholders.
5. Virtualizing React wrappers themselves; V1 only unloads iframe app resources.
