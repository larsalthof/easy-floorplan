# Shared floorplans

A card can read its drawing from another Easy Floorplan card. The source remains the only place to edit the shared architecture and furniture; other cards can choose their own view and add devices without duplicating the drawing. No backend integration is required.

```yaml
type: custom:easy-floorplan-card
source:
  dashboard: lovelace-home
  view: house
  floor_id: floor_main
view: 3d
```

`dashboard` is the dashboard's URL path. Omit it for the default dashboard. `view` is the view's path, or its numeric index written as a string when the view has no path. Nested stacks, conditional cards and section cards are searched. If the view contains several Easy Floorplan cards, specify `card_index` (zero-based, in traversal order).

The logged-in user must be allowed to read the source dashboard. A missing or inaccessible source produces an error and a Retry button. Circular references are rejected. Source cards need not be mounted or visible. A saved dashboard triggers a reload through Home Assistant's `lovelace_updated` event; reopening the card also reloads its source. Device state updates do not refetch dashboards.

## Independent views and extra entities

Settings written on the receiving card override the source settings, including `view`, rotation and appearance. Omitted settings inherit the source value. Source geometry is read-only here. The visual editor edits the reference, default view and local entities; other presentation options remain available in YAML.

Local `items` are appended, rather than replacing source items:

```yaml
type: custom:easy-floorplan-card
source:
  dashboard: lovelace-home
  view: house
  floor_id: floor_main
view: 2d
items:
  - id: local_temperature
    kind: sensor
    entity: sensor.bedroom_temperature
    x: 720
    "y": 360
```

Coordinates are the original source-plan coordinates. Use unique item IDs. A top-level `items` list requires a single selected floor. To add items to several source floors, use local `floors` entries with matching `id` values and `items` lists. Local symbols are merged by symbol ID. The receiving card never writes to the source.

## Render one room

Add the floorplan area's ID (not its linked Home Assistant area ID):

```yaml
source:
  dashboard: lovelace-home
  view: house
  floor_id: floor_main
  area_id: bedroom
```

This filters the data before entity collection and rendering, in both 2D and 3D. Only the selected floor and area remain. Walls are split and clipped against the room polygon, including concave rooms. Windows, furniture, text, panels and badges are included when their anchor lies inside or on the room boundary; trackers use their rectangle's center. Local entities are subject to the same filter. Objects anchored in the room retain their complete symbol, even if part of it crosses the boundary.

The card frames the selected room automatically. Whole-floor background images, roofs and floor summaries are omitted in room-only mode, so they do not introduce information from other rooms. This is not a privacy boundary: Home Assistant still returns the source dashboard's complete configuration before the client filters it. The other rooms are not rendered or watched for normal device-state updates by this card.
