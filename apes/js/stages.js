/* Damn Dirty Apes: stage layouts.
 * World is 480 x 540, y grows downward, the ground is at y = 520.
 * plats: [x1, y1, x2, y2] walkable surfaces (x1 < x2).
 * rows: a sloped floor from `from` to `to` whose [a, b] stretch is made of
 *       crumbling 24-wide tiles.
 * vines: [x, topY, bottomY]; the ends snap to the floors at that x.
 * start / goal / items: [x, y] with y snapped to the floor under it.
 * boss: where the troop boss stands (unreachable) and how it throws.
 */
(function (factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { window.DDA = window.DDA || {}; window.DDA.STAGES = api; }
})(function () {
  "use strict";

  return [
    {
      key: "canopy",
      name: "Canopy",
      // Peaked decks alternate with dipped decks that have a hole in the
      // middle, so coconuts run out to the edges, then back to the middle.
      plats: [
        [0, 520, 480, 520],
        [24, 450, 240, 438], [240, 438, 456, 450],
        [0, 366, 226, 376], [254, 376, 480, 366],
        [24, 294, 240, 282], [240, 282, 456, 294],
        [0, 210, 226, 220], [254, 220, 480, 210],
        [96, 134, 300, 134]
      ],
      vines: [
        [90, 446, 520], [390, 446, 520],
        [160, 373, 442], [320, 373, 442],
        [50, 293, 368], [430, 293, 368],
        [150, 217, 287], [330, 217, 287],
        [200, 134, 219], [280, 134, 219]
      ],
      start: [40, 520],
      goal: [122, 134],
      boss: { x: 396, y: 96, perch: [352, 444], dirs: [-1], vx: [60, 95], vy: -70 },
      items: [
        ["net", 60, 447], ["banana", 300, 371],
        ["net", 400, 290], ["pineapple", 60, 212]
      ],
      durians: false,
      monkeys: false
    },
    {
      key: "temple",
      name: "Temple",
      // A stepped pyramid: every tier drops outward a step at a time, and
      // the troop boss sits on the shrine roof throwing both ways.
      plats: [
        [0, 520, 480, 520],
        [36, 458, 96, 458], [96, 452, 156, 452], [156, 446, 324, 446], [324, 452, 384, 452], [384, 458, 444, 458],
        [72, 382, 124, 382], [124, 376, 176, 376], [176, 370, 304, 370], [304, 376, 356, 376], [356, 382, 408, 382],
        [108, 306, 152, 306], [152, 300, 196, 300], [196, 294, 284, 294], [284, 300, 328, 300], [328, 306, 372, 306],
        [150, 218, 330, 218]
      ],
      vines: [
        [66, 458, 520], [414, 458, 520],
        [110, 382, 452], [370, 382, 452],
        [140, 306, 376], [340, 306, 376],
        [174, 218, 300], [306, 218, 300]
      ],
      start: [30, 520],
      goal: [240, 218],
      boss: { x: 240, y: 150, perch: [204, 276], dirs: [-1, 1], vx: [55, 80], vy: -60 },
      items: [
        ["banana", 240, 446], ["net", 240, 370], ["mango", 240, 294]
      ],
      durians: true,
      monkeys: false
    },
    {
      key: "bridges",
      name: "Rope Bridges",
      // Long rope bridges that tip one way, then the other, each with a
      // broken plank to jump. Monkeys come down to hunt you.
      plats: [
        [0, 520, 480, 520],
        [0, 440, 196, 446], [224, 447, 456, 454],
        [24, 374, 252, 367], [280, 366, 480, 360],
        [0, 290, 150, 294], [178, 295, 456, 302],
        [24, 220, 300, 212], [328, 211, 480, 206],
        [100, 136, 320, 136]
      ],
      vines: [
        [100, 443, 520], [380, 452, 520],
        [60, 373, 442], [420, 362, 453],
        [120, 293, 371], [330, 299, 365],
        [60, 219, 292], [400, 209, 301],
        [180, 136, 216], [280, 136, 213]
      ],
      start: [30, 520],
      goal: [120, 136],
      boss: { x: 400, y: 98, perch: [360, 450], dirs: [-1], vx: [65, 90], vy: -60 },
      items: [
        ["net", 300, 449], ["banana", 200, 368],
        ["net", 250, 298], ["pineapple", 440, 207]
      ],
      durians: false,
      monkeys: true
    },
    {
      key: "falls",
      name: "Waterfall",
      // Ledges across a waterfall. The wet rock in the middle of each ledge
      // crumbles a moment after you step on it, so keep moving.
      plats: [
        [0, 520, 480, 520],
        [140, 126, 340, 126]
      ],
      rows: [
        { from: [24, 452], to: [480, 440], crumble: [180, 300] },
        { from: [0, 362], to: [456, 374], crumble: [168, 312] },
        { from: [24, 290], to: [480, 278], crumble: [168, 312] },
        { from: [0, 200], to: [456, 212], crumble: [192, 288] }
      ],
      vines: [
        [420, 442, 520],
        [60, 364, 451],
        [420, 280, 373],
        [60, 202, 289],
        [300, 126, 208]
      ],
      start: [450, 520],
      goal: [160, 126],
      boss: { x: 64, y: 88, perch: [24, 104], dirs: [1], vx: [55, 85], vy: -60 },
      items: [
        ["banana", 120, 449], ["net", 400, 373], ["mango", 380, 281]
      ],
      durians: true,
      monkeys: true
    }
  ];
});
