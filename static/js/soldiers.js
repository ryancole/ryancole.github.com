// Tiny pixel soldiers that drop onto the page and fight across it.
// The top of every innermost block-level element is a one-way platform.
(function () {
  'use strict';

  var STORAGE_KEY = 'soldiers-enabled';
  var SW = 12, SH = 16;        // sprite size in art pixels
  var SCALE = 1.5;             // 12x16 sprite -> 18x24 CSS px (about a quarter inch)
  var GRAVITY = 0.45;
  var JUMP_VY = -9.6;          // ~100px jump
  var WALK_SPEED = 1.3;
  var SIGHT = 420;
  var MAX_FALL = 12;
  var CORPSE_TIME = 240;       // frames a body stays before blinking out (~4s)
  var SPREAD = 0.08;           // aim wobble in radians

  // Each soldier spawns with one of these at random.
  var WEAPONS = {
    rifle:        { color: '#000000', range: 700, speed: 13 },  // single fast, accurate shots
    machinegun:   { color: '#7c7c7c', range: 230, speed: 6 },   // short-range bursts of 6, more spread
    flamethrower: { color: '#e45c10', range: 170 },  // short-range continuous fire
    launcher:     { color: '#007800', range: 400 }   // lobbed grenades that explode
  };
  var WEAPON_NAMES = Object.keys(WEAPONS);
  var GRENADE_SPEED = 9;
  var GRENADE_GRAVITY = 0.25;
  var BLAST_RADIUS = 40;
  var GRENADE_FUSE = 180;      // frames (3s) of bouncing before it goes off
  var GRENADE_BOUNCE = 0.55;   // fraction of fall speed kept on each bounce

  // Each soldier also spawns with one movement item at random.
  //   grapple: hook a ledge above and reel up
  //   jetpack: fly up on a limited tank that refills on the ground
  //   roll:    dodge-roll through incoming fire (invulnerable while rolling),
  //            plus a big spinning leap to reach high ledges
  var MOVES = ['grapple', 'jetpack', 'roll'];
  var JET_FUEL = 150;          // frames of thrust
  var JET_THRUST = 0.9;        // upward accel (gravity is 0.45)
  var JET_MAX_RISE = 5;
  var ROLL_FRAMES = 22;
  var ROLL_SPEED = 4.5;

  // ---------- sprites (original art, NES-style) ----------
  // Facing right. Three colors per sprite, like an NES sprite palette:
  // . transparent  S skin  T team color  K black (hair, eye, belt, boots)
  // G weapon (colored per weapon type)
  var TOP = [
    '....KKK.....',
    '...KKKKK....',
    '.TTTTTTT....',
    'T..KSSKS....',
    '...KSSSS....',
    '....SSS.....',
    '...SSSSS....',
    '..SSSSSGGGGG',
    '..SSSSGGGG..',
    '...SSSS.....',
    '...KKKK.....',
    '...TTTT.....'
  ];
  // Arm/rifle variants for aiming. Each replaces TOP rows 0-11.
  var AIMS = {
    fwd: TOP,
    diagUp: [
      '....KKK.....',
      '...KKKKK....',
      '.TTTTTTT....',
      'T..KSSKS..GG',
      '...KSSSS.GG.',
      '....SSS.GG..',
      '...SSSSGG...',
      '..SSSSSG....',
      '..SSSSS.....',
      '...SSSS.....',
      '...KKKK.....',
      '...TTTT.....'
    ],
    up: [
      '....KKK..G..',
      '...KKKKK.G..',
      '.TTTTTTT.G..',
      'T..KSSKSGG..',
      '...KSSSSGG..',
      '....SSS.SG..',
      '...SSSSSS...',
      '..SSSSSS....',
      '..SSSSS.....',
      '...SSSS.....',
      '...KKKK.....',
      '...TTTT.....'
    ],
    diagDown: [
      '....KKK.....',
      '...KKKKK....',
      '.TTTTTTT....',
      'T..KSSKS....',
      '...KSSSS....',
      '....SSS.....',
      '...SSSSS....',
      '..SSSSSS....',
      '..SSSSSGG...',
      '...SSSS.GG..',
      '...KKKK..GG.',
      '...TTTT...GG'
    ]
  };
  // Where the muzzle is for each aim (art pixels from the sprite's top-left, facing right).
  var MUZZLE = { fwd: [12, 7.5], diagUp: [12, 3], up: [9.5, -0.5], diagDown: [12, 12] };

  var LEGS = {
    stand: [
      '...TT.TT....',
      '...TT.TT....',
      '...TT.TT....',
      '..KKK.KKK...'
    ],
    walk1: [
      '..TT...TT...',
      '..TT....TT..',
      '.TT.....TT..',
      'KKK.....KKK.'
    ],
    walk2: [
      '...TTTT.....',
      '....TT.T....',
      '....TT.T....',
      '...KKK.KK...'
    ],
    jump: [
      '..TTTTTT....',
      '..TT..KKK...',
      '.KKK........',
      '............'
    ]
  };

  // NES palette.
  var TEAMS = [
    { name: 'blue', T: '#0058f8' },
    { name: 'red',  T: '#d82800' }
  ];
  var SHARED = { S: '#fca044', K: '#000000' };
  var OUTLINE = null; // set to a color to outline sprites

  function buildFrame(rows, team, flip) {
    // Pad by one art pixel on every side for the outline.
    var W = SW + 2, H = SH + 2;
    var grid = [];
    for (var y = 0; y < H; y++) {
      grid.push([]);
      for (var x = 0; x < W; x++) {
        var sy = y - 1, sx = x - 1;
        var ch = sy >= 0 && sy < SH && sx >= 0 && sx < SW ? rows[sy][flip ? SW - 1 - sx : sx] : '.';
        grid[y].push(ch);
      }
    }
    var c = document.createElement('canvas');
    c.width = Math.ceil(W * SCALE);
    c.height = Math.ceil(H * SCALE);
    var g = c.getContext('2d');
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var cell = grid[y][x];
        var color = null;
        if (cell !== '.') {
          color = team[cell] || SHARED[cell];
        } else if (OUTLINE && ((grid[y - 1] && grid[y - 1][x] !== '.') || (grid[y + 1] && grid[y + 1][x] !== '.') ||
                   (grid[y][x - 1] && grid[y][x - 1] !== '.') || (grid[y][x + 1] && grid[y][x + 1] !== '.'))) {
          color = OUTLINE;
        }
        if (!color) continue;
        g.fillStyle = color;
        var x0 = Math.floor(x * SCALE), y0 = Math.floor(y * SCALE);
        g.fillRect(x0, y0, Math.floor((x + 1) * SCALE) - x0, Math.floor((y + 1) * SCALE) - y0);
      }
    }
    return c;
  }

  // SPRITES[team][weapon][aim][pose] = [facingLeft, facingRight]
  var SPRITES = TEAMS.map(function (team) {
    var byWeapon = {};
    WEAPON_NAMES.forEach(function (w) {
      var palette = { T: team.T, G: WEAPONS[w].color };
      var byAim = {};
      Object.keys(AIMS).forEach(function (aim) {
        var frames = {};
        Object.keys(LEGS).forEach(function (k) {
          var rows = AIMS[aim].concat(LEGS[k]);
          frames[k] = [buildFrame(rows, palette, true), buildFrame(rows, palette, false)];
        });
        byAim[aim] = frames;
      });
      byWeapon[w] = byAim;
    });
    return byWeapon;
  });

  // ---------- page geometry ----------
  var platforms = [];
  var docW = 0, docH = 0;

  // Platforms are the top edges of the innermost block-level boxes on the page
  // (block, inline-block, list-item, flex, grid, table... plus images).
  // Inline text is never split into lines or words, so a paragraph is one ledge.
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, NOSCRIPT: 1, TEMPLATE: 1, BR: 1, WBR: 1, IFRAME: 1 };
  var REPLACED = { IMG: 1, SVG: 1, VIDEO: 1, CANVAS: 1, PICTURE: 1 };

  function isBox(el) {
    if (SKIP_TAGS[el.tagName] || el === canvas || el === toggle) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.display === 'contents' || cs.visibility === 'hidden') return false;
    if (cs.position === 'fixed') return false;
    return cs.display !== 'inline' || !!REPLACED[el.tagName.toUpperCase()];
  }

  function measure() {
    var sx = window.scrollX, sy = window.scrollY;
    var boxes = [];
    var notLeaf = new Set();
    var els = document.body.getElementsByTagName('*');

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!isBox(el)) continue;
      boxes.push(el);
      // Any box inside another makes the outer one a container, not a ledge.
      for (var a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (notLeaf.has(a)) break;
        notLeaf.add(a);
      }
    }

    var list = [];
    for (var j = 0; j < boxes.length; j++) {
      if (notLeaf.has(boxes[j])) continue;
      var r = boxes[j].getBoundingClientRect();
      if (r.width < 24 || r.height === 0) continue;
      list.push({ left: r.left + sx, right: r.right + sx, top: Math.round(r.top + sy) });
    }

    docW = document.documentElement.scrollWidth;
    docH = document.documentElement.scrollHeight;
    list.push({ left: 0, right: docW, top: docH - 2, floor: true }); // page bottom
    platforms = list;
  }

  function platformUnder(x, y) {
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (x >= p.left && x <= p.right && Math.abs(p.top - y) < 1) return p;
    }
    return null;
  }

  // ---------- actors ----------
  var soldiers = [];
  var bullets = [];
  var sparks = [];
  var blasts = [];
  var tick = 0;                // simulation frame counter
  var firstBlood = false;
  var MULTI_WINDOW = 150;      // frames (~2.5s) between kills to chain a multi-kill
  var STREAKS = {
    3: 'KILLING SPREE', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE', 15: 'LEGENDARY',
    // ...and then it gets out of hand.
    20: 'TOUCH GRASS',
    25: 'CALL YOUR MOTHER',
    30: 'HR WANTS A WORD',
    35: 'THIS IS A BLOG',
    40: 'PLEASE READ MY POSTS',
    45: 'RYAN IS CONCERNED',
    50: 'THE PAGE FEARS YOU',
    55: 'GENEVA IS CALLING',
    60: 'DELETE THE INTERNET',
    65: 'ASCENDED TO HTML'
  };
  var STREAK_BEYOND = 'SEEK HELP'; // every 5 kills after the last one

  // Killstreak rewards: each streak callout also calls in perks.
  //   armor:     absorbs the next hit, for 10 seconds
  //   sentry:    auto-turret dropped on the soldier's ledge
  //   airstrike: a jet crosses the screen carpet-bombing the enemy
  //   drone:     hovers over its owner and shoots at enemies
  //   orbital:   targeting laser, then a beam from the sky
  var PERK_LADDER = {
    3: ['armor'], 5: ['sentry'], 7: ['airstrike'], 10: ['drone'], 15: ['orbital'],
    20: ['drone', 'drone'], 25: ['airstrike', 'airstrike'], 30: ['sentry', 'sentry', 'armor'],
    35: ['orbital', 'orbital', 'orbital'], 40: ['drone', 'drone', 'drone'],
    45: ['airstrike', 'airstrike', 'airstrike'], 50: ['orbital', 'orbital', 'orbital', 'orbital', 'orbital'],
    55: ['sentry', 'sentry', 'sentry', 'armor'], 60: ['armor', 'sentry', 'airstrike', 'drone', 'orbital'],
    65: ['armor', 'sentry', 'sentry', 'airstrike', 'airstrike', 'drone', 'drone', 'orbital', 'orbital']
  };
  var PERK_BEYOND = ['armor', 'sentry', 'airstrike', 'drone', 'orbital'];
  var SENTRY_LIFE = 900, DRONE_LIFE = 1200;  // frames (15s, 20s)
  var ARMOR_LIFE = 600;                      // frames (10s); armor wears off after this
  var MULTIS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL' };
  var respawnAt = [0, 0];

  function teamSize() {
    return 1; // 1v1
  }

  // Drop in above a random ledge, preferring ones on screen and not right
  // next to an enemy. Falls back to anywhere on screen if there are no ledges.
  function spawnPoint(team) {
    var top = window.scrollY, bottom = top + window.innerHeight;
    var enemies = soldiers.filter(function (o) { return o.team !== team && !o.dead; });
    var ledges = platforms.filter(function (p) { return !p.floor; });
    var onScreen = ledges.filter(function (p) { return p.top > top + 40 && p.top < bottom - 10; });
    var pool = onScreen.length ? onScreen : ledges;

    for (var tries = 0; tries < 12 && pool.length; tries++) {
      var p = pool[Math.floor(Math.random() * pool.length)];
      var x = p.left + 10 + Math.random() * Math.max(0, p.right - p.left - 20);
      var clear = enemies.every(function (o) { return Math.abs(o.x - x) > 150 || Math.abs(o.y - p.top) > 60; });
      if (clear || tries === 11) return { x: x, y: Math.max(p.top - 160, top - 10) };
    }
    return { x: window.scrollX + 30 + Math.random() * (window.innerWidth - 60), y: top - 10 };
  }

  function spawn(team) {
    var at = spawnPoint(team);
    soldiers.push({
      team: team,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      face: team === 0 ? 1 : -1,
      ground: null,
      dropFrom: null,
      dead: false,
      deadT: 0,
      cooldown: 40 + Math.random() * 60,
      jumpCooldown: 0,
      wander: (Math.random() < 0.5 ? -1 : 1),
      wanderT: 0,
      step: Math.random() * 100,
      shootPose: 0,
      kills: 0,
      weapon: WEAPON_NAMES[Math.floor(Math.random() * WEAPON_NAMES.length)],
      burst: 0,
      burstT: 0,
      move: MOVES[Math.floor(Math.random() * MOVES.length)],
      fuel: JET_FUEL,
      jetting: false,
      jetGoalY: 0,
      roll: 0,
      rollDir: 1,
      rollCooldown: 0,
      spin: false
    });
  }

  function nearestEnemy(s) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < soldiers.length; i++) {
      var o = soldiers[i];
      if (o.team === s.team || o.dead) continue;
      var d = Math.abs(o.x - s.x) + Math.abs(o.y - s.y) * 1.5;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  function think(s) {
    var t = nearestEnemy(s);
    s.vx = 0;
    if (s.jumpCooldown > 0) s.jumpCooldown--;
    if (s.cooldown > 0) s.cooldown--;
    if (s.shootPose > 0) s.shootPose--;

    if (!t) {
      // Patrol.
      if (--s.wanderT <= 0) { s.wander = -s.wander; s.wanderT = 120 + Math.random() * 200; }
      s.face = s.wander;
      s.vx = s.wander * WALK_SPEED * 0.6;
      return;
    }

    var dx = t.x - s.x;
    var dy = t.y - s.y;
    s.face = dx < 0 ? -1 : 1;

    // Aim at the enemy's chest from anywhere and shoot whenever in range,
    // whatever we're doing with our legs.
    var aimDX = t.x - s.x;
    var aimDY = (t.y - SH * SCALE * 0.55) - (s.y - (SH - 7.5) * SCALE);
    var canHit = attack(s, aimDX, aimDY);

    var w = WEAPONS[s.weapon];
    if (Math.abs(dy) < 20 && Math.abs(dx) < SIGHT) {
      // Same level: hold at a good distance for this weapon, sometimes hop.
      var holdAt = Math.min(SIGHT * 0.6, w.range * 0.75);
      var minGap = s.weapon === 'launcher' ? 120 : s.weapon === 'flamethrower' ? 30 : 60;
      if (s.ground && s.jumpCooldown <= 0 && Math.random() < 0.006) jump(s);
      if (Math.abs(dx) > holdAt) s.vx = s.face * WALK_SPEED * (holdAt < 200 ? 1 : 0.5);
      else if (Math.abs(dx) < minGap) s.vx = -s.face * WALK_SPEED * 0.8; // too close: back off, keep aiming
      return;
    }

    // Enemy is on another level but within this weapon's reach: hold this
    // ledge and fight instead of chasing (which made both soldiers swap
    // levels forever). Strafe a little so it doesn't look frozen.
    if (canHit) {
      if (--s.strafeT <= 0) {
        s.strafeDir = Math.random() < 0.35 ? 0 : Math.random() < 0.5 ? -1 : 1;
        s.strafeT = 40 + Math.random() * 60;
      }
      s.vx = (s.strafeDir || 0) * WALK_SPEED * 0.6;
      if (s.ground && !platformUnder(s.x + s.vx * 10, s.y)) { s.strafeDir = -(s.strafeDir || 0); s.vx = 0; } // stay on the ledge
      if (s.ground && s.jumpCooldown <= 0 && Math.random() < 0.006) jump(s);
      return;
    }

    s.vx = s.face * WALK_SPEED;

    if (dy < -20) {
      climb(s, t);
    } else if (dy > 20) {
      descend(s, t);
    }
  }

  // Target is below: pick a lower ledge close to the enemy's height, walk
  // until we're over it, then drop through our ledge onto it.
  function descend(s, t) {
    if (!s.ground) {
      if (s.goalX != null) {
        s.face = s.goalX < s.x ? -1 : 1;
        s.vx = Math.abs(s.goalX - s.x) > 2 ? s.face * WALK_SPEED : 0;
      }
      return;
    }
    s.goalX = null;
    if (s.ground.floor) return; // nowhere lower to go

    var best = null, bestCost = Infinity;
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (p === s.ground || p.top <= s.y + 10 || p.top > t.y + 20) continue; // below us, not past the enemy
      if (p.right - p.left < 30) continue;
      var nx = Math.max(p.left + 12, Math.min(p.right - 12, s.x));
      var cost = Math.abs(nx - s.x) + Math.abs(p.top - t.y) * 0.8 + Math.abs(nx - t.x) * 0.2;
      if (cost < bestCost) { bestCost = cost; best = p; }
    }
    if (!best) return; // keep walking toward the enemy

    var over = s.x > best.left + 12 && s.x < best.right - 12;
    if (over && s.jumpCooldown <= 0) {
      s.dropFrom = s.ground;
      s.ground = null;
      s.vy = 1;
      s.jumpCooldown = 30;
      s.goalX = Math.max(best.left + 12, Math.min(best.right - 12, t.x));
    } else if (!over) {
      var aimX = Math.max(best.left + 12, Math.min(best.right - 12, s.x));
      s.face = aimX < s.x ? -1 : 1;
      s.vx = s.face * WALK_SPEED;
    }
  }

  // Target is above: head for the nearest ledge within jump reach and hop up.
  // If there's nothing in reach (e.g. stranded at the page bottom), do a big leap.
  function climb(s, t) {
    if (!s.ground) {
      if (s.goalX != null) {
        s.face = s.goalX < s.x ? -1 : 1;
        s.vx = Math.abs(s.goalX - s.x) > 2 ? s.face * WALK_SPEED : 0;
      }
      return;
    }
    s.goalX = null;

    var reach = (JUMP_VY * JUMP_VY) / (2 * GRAVITY) - 8;
    var best = null, bestCost = Infinity, bestX = 0;
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var rise = s.y - p.top;
      if (rise < 10 || rise > reach) continue;
      var nx = Math.max(p.left + 8, Math.min(p.right - 8, s.x));
      var cost = Math.abs(nx - s.x) + Math.abs(nx - t.x) * 0.3;
      if (cost < bestCost) { bestCost = cost; best = p; bestX = nx; }
    }

    // Far below the enemy: sometimes grapple straight up instead of hopping.
    if (t.y - s.y < -160 && s.jumpCooldown <= 0 && Math.random() < 0.02 && useMove(s, t)) return;

    if (best) {
      var gap = bestX - s.x;
      s.face = gap < 0 ? -1 : gap > 0 ? 1 : s.face;
      s.vx = Math.abs(gap) > 2 ? s.face * WALK_SPEED : 0;
      if (Math.abs(gap) < 28 && s.jumpCooldown <= 0) {
        s.goalX = bestX;
        jump(s);
      }
      return;
    }

    // Nothing in jump reach (e.g. stranded at the page bottom): grapple up.
    if (s.jumpCooldown <= 0 && Math.random() < 0.05) useMove(s, t);
  }

  // ---------- grappling hook ----------
  var HOOK_SPEED = 16;   // how fast the hook flies out
  var REEL_SPEED = 7;    // how fast the soldier is pulled up
  var HOOK_RANGE = 900;  // max rope length

  function handPos(s) {
    return { x: s.x + s.face * (SW / 2 - 1) * SCALE, y: s.y - (SH - 7.5) * SCALE };
  }

  // Pick a ledge above, as close to straight up as possible and as near the
  // enemy's height as possible, and fire the hook at it.
  function ledgeAbove(s, t) {
    var best = null, bestCost = Infinity;
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      var rise = s.y - p.top;
      if (rise < 60) continue;
      var nx = Math.max(p.left + 10, Math.min(p.right - 10, s.x + (t.x - s.x) * 0.3));
      var dx = Math.abs(nx - s.x);
      if (dx > 360 || Math.hypot(dx, rise) > HOOK_RANGE) continue;
      var cost = dx * 1.2 + Math.abs(p.top - t.y) * 0.6;
      if (cost < bestCost) { bestCost = cost; best = { x: nx, y: p.top }; }
    }
    return best;
  }

  // Get up to a high ledge using whatever movement item this soldier has.
  function useMove(s, t) {
    if (s.move === 'grapple') return throwHook(s, t);
    var goal = ledgeAbove(s, t);
    if (!goal) return false;
    if (s.move === 'jetpack') {
      if (s.fuel < JET_FUEL * 0.5) return false; // wait for a decent tank
      s.jetting = true;
      s.jetGoalY = goal.y;
      s.goalX = goal.x;
      s.ground = null;
      s.vy = Math.min(s.vy, -2);
      s.jumpCooldown = 60;
      return true;
    }
    // roll: a big spinning leap, just high enough to clear the ledge
    var h = s.y - goal.y + 30;
    s.vy = -Math.min(Math.sqrt(2 * GRAVITY * h), 22);
    s.ground = null;
    s.spin = true;
    s.goalX = goal.x;
    s.jumpCooldown = 60;
    return true;
  }

  // Roll-users dodge: if an enemy shot is about to hit, roll through it.
  function maybeDodge(s) {
    if (s.move !== 'roll' || !s.ground || s.roll > 0 || s.rollCooldown > 0) return;
    var cy = s.y - SH * SCALE / 2;
    for (var b = 0; b < bullets.length; b++) {
      var u = bullets[b];
      if (u.team === s.team) continue;
      var rx = s.x - u.x, ry = cy - u.y;
      var d = Math.hypot(rx, ry);
      if (d > 130 || d < 1) continue;
      if ((rx * u.vx + ry * u.vy) / (d * Math.hypot(u.vx, u.vy)) < 0.85) continue; // not heading at us
      s.roll = ROLL_FRAMES;
      s.rollDir = Math.random() < 0.5 ? -1 : 1;
      s.rollCooldown = 70 + Math.random() * 40;
      return;
    }
  }

  function throwHook(s, t) {
    var best = ledgeAbove(s, t);
    if (!best) return false;

    var hand = handPos(s);
    s.face = best.x < s.x ? -1 : best.x > s.x ? 1 : s.face;
    s.hook = { phase: 'fly', ax: best.x, ay: best.y, hx: hand.x, hy: hand.y };
    s.vx = 0;
    s.jumpCooldown = 60;
    return true;
  }

  // Returns true while the hook is in control of the soldier.
  function updateHook(s) {
    var h = s.hook;
    if (!h) return false;
    if (s.cooldown > 0) s.cooldown--;
    s.vx = 0;

    if (h.phase === 'fly') {
      var dx = h.ax - h.hx, dy = h.ay - h.hy;
      var d = Math.hypot(dx, dy);
      if (d <= HOOK_SPEED) {
        h.hx = h.ax; h.hy = h.ay;
        h.phase = 'reel';
        s.ground = null;
        s.vy = 0;
      } else {
        h.hx += (dx / d) * HOOK_SPEED;
        h.hy += (dy / d) * HOOK_SPEED;
      }
      return true;
    }

    // Reel in: pull the soldier's feet up to the ledge.
    var rx = h.ax - s.x, ry = h.ay - s.y;
    var rd = Math.hypot(rx, ry);
    if (rd <= REEL_SPEED) {
      s.x = h.ax;
      s.y = h.ay;
      s.vy = 0;
      s.ground = platformUnder(s.x, s.y);
      s.dropFrom = null;
      s.hook = null;
      if (!s.ground) s.vy = -2; // ledge moved (page reflowed): just drop and land normally
    } else {
      s.x += (rx / rd) * REEL_SPEED;
      s.y += (ry / rd) * REEL_SPEED;
    }
    return true;
  }

  // One-way platform landing: if the feet crossed a ledge's top this frame, stand on it.
  function land(s, prevY) {
    var landing = null;
    for (var k = 0; k < platforms.length; k++) {
      var p = platforms[k];
      if (p === s.dropFrom) continue;
      if (s.x < p.left || s.x > p.right) continue;
      if (prevY <= p.top && s.y >= p.top && (!landing || p.top < landing.top)) landing = p;
    }
    if (landing) {
      s.y = landing.top;
      s.vy = 0;
      s.ground = landing;
      s.dropFrom = null;
    }
  }

  function jump(s) {
    s.vy = JUMP_VY;
    s.ground = null;
    s.jumpCooldown = 40;
  }

  // Snap a direction to the nearest drawable arm pose (the bullet itself
  // still flies at the exact angle).
  function aimPose(dx, dy) {
    var elev = Math.atan2(-dy, Math.abs(dx)) * 180 / Math.PI;
    if (elev > 67.5) return 'up';
    if (elev > 22.5) return 'diagUp';
    if (elev < -22.5) return 'diagDown';
    return 'fwd';
  }

  // Decide whether to shoot this frame, based on the weapon.
  function attack(s, dx, dy) {
    var w = WEAPONS[s.weapon];
    var dist = Math.hypot(dx, dy);
    var angle = Math.atan2(dy, dx);
    s.aim = aimPose(dx, dy);

    var inReach = dist < w.range * 0.85;
    if (s.weapon === 'launcher') inReach = inReach && lobAngle(dx, dy, GRENADE_SPEED, GRENADE_GRAVITY) !== null;

    if (s.weapon === 'machinegun') {
      if (s.burst > 0) {
        if (--s.burstT <= 0) { shoot(s, angle, 0.16, w.speed, w.range * 1.15); s.burst--; s.burstT = 5; }
      } else if (s.cooldown <= 0 && dist < w.range) {
        s.burst = 6; s.burstT = 0;
        s.cooldown = 90 + Math.random() * 50;
      }
    } else if (s.weapon === 'flamethrower') {
      if (dist < w.range && s.cooldown <= 0) {
        flame(s, angle);
        s.cooldown = 2;
      }
    } else if (s.weapon === 'launcher') {
      if (s.cooldown <= 0 && dist < w.range) {
        var lob = lobAngle(dx, dy, GRENADE_SPEED, GRENADE_GRAVITY);
        if (lob !== null) {
          s.aim = aimPose(Math.cos(lob), Math.sin(lob));
          grenade(s, lob);
          s.cooldown = 110 + Math.random() * 50;
        }
      }
    } else if (s.cooldown <= 0 && dist < w.range) {
      shoot(s, angle, SPREAD, w.speed, w.range * 1.15);
      s.cooldown = 40 + Math.random() * 45;
    }
    return inReach;
  }

  // Low-arc launch angle that lands a projectile at (dx, dy), or null if out of reach.
  function lobAngle(dx, dy, v, g) {
    var x = Math.abs(dx), y = -dy; // y up
    var v2 = v * v;
    var root = v2 * v2 - g * (g * x * x + 2 * y * v2);
    if (root < 0) return null;
    var a = Math.atan2(v2 - Math.sqrt(root), g * x); // elevation above horizontal
    return dx >= 0 ? -a : Math.PI + a;
  }

  // World position of the weapon's muzzle for the current aim pose.
  function muzzle(s) {
    var m = MUZZLE[s.aim || 'fwd'];
    return { x: s.x + s.face * (m[0] - SW / 2) * SCALE, y: s.y - (SH - m[1]) * SCALE };
  }

  // Bullets fizzle out a little past the weapon's range.
  function shoot(s, angle, spread, speed, reach) {
    angle += (Math.random() - 0.5) * 2 * spread;
    s.shootPose = 12;
    var ox = s.x, oy = s.y - (SH - 7.5) * SCALE;
    bullets.push({
      kind: 'bullet',
      team: s.team,
      shooter: s,
      x: ox, y: oy,
      ox: ox, oy: oy, // hidden until it clears the weapon
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: Math.ceil(reach / speed)
    });
  }

  function flame(s, angle) {
    angle += (Math.random() - 0.5) * 0.35;
    var speed = 4 + Math.random() * 1.5;
    var m = muzzle(s);
    s.shootPose = 9;
    bullets.push({
      kind: 'flame',
      team: s.team,
      shooter: s,
      x: m.x, y: m.y, ox: m.x, oy: m.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 26 + Math.random() * 8,
      age: 0
    });
  }

  function grenade(s, angle) {
    var m = muzzle(s);
    s.shootPose = 12;
    bullets.push({
      kind: 'grenade',
      team: s.team,
      shooter: s,
      x: m.x, y: m.y, ox: m.x, oy: m.y,
      vx: Math.cos(angle) * GRENADE_SPEED,
      vy: Math.sin(angle) * GRENADE_SPEED,
      life: GRENADE_FUSE
    });
  }

  function kill(o, shooter, fromX) {
    if (o.armor > 0 && tick < o.armorUntil) {
      o.armor--;
      o.armorFlash = 20;
      burst(o.x, o.y - SH * SCALE / 2, '#bcbcbc');
      return;
    }
    o.dead = true;
    o.jetting = false;
    o.spin = false;
    o.roll = 0;
    if (shooter) {
      var victimStreak = o.kills;
      shooter.kills++;
      announce(shooter, victimStreak);
    }
    o.hook = null;
    o.ground = null;
    o.dropFrom = null;
    var dir = o.x >= fromX ? 1 : -1;
    o.vy = -5;
    o.vx = dir * 1.5;
    o.fallDir = dir;
  }

  // The soldier (on another team) whose body contains (x, y), if any.
  function hitSoldier(team, x, y, pad) {
    for (var n = 0; n < soldiers.length; n++) {
      var o = soldiers[n];
      if (o.dead || o.team === team || o.roll > 0) continue;
      if (Math.abs(x - o.x) < 4 * SCALE + pad && y > o.y - (SH - 1) * SCALE - pad && y < o.y + pad) return o;
    }
    return null;
  }

  function explode(g) {
    for (var n = 0; n < soldiers.length; n++) {
      var o = soldiers[n];
      if (o.dead || o.team === g.team || o.roll > 0) continue;
      if (Math.hypot(o.x - g.x, (o.y - SH * SCALE / 2) - g.y) < BLAST_RADIUS) kill(o, g.shooter, g.x);
    }
    for (var i = 0; i < 28; i++) {
      var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      sparks.push({
        x: g.x, y: g.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.5,
        life: 18 + Math.random() * 20,
        color: ['#fcfcfc', '#f8b800', '#e45c10', '#d82800'][Math.floor(Math.random() * 4)]
      });
    }
    blasts.push({ x: g.x, y: g.y, t: 0 });
  }

  // Queue the banners a kill earns: first blood, shutdown, multi-kill, streak.
  function announce(k, victimStreak) {
    var color = TEAMS[k.team].T;
    k.callouts = k.callouts || [];
    var fresh = 0;
    function say(text) {
      k.callouts.push({ text: text, color: color, t: 0, delay: fresh++ * 8 });
    }

    if (!firstBlood) { firstBlood = true; say('FIRST BLOOD'); }
    if (victimStreak >= 3) say('SHUTDOWN');

    k.multi = tick - (k.lastKillT || -1e9) < MULTI_WINDOW ? (k.multi || 1) + 1 : 1;
    k.lastKillT = tick;
    if (k.multi >= 2) say(MULTIS[k.multi] || 'MULTI KILL');

    if (STREAKS[k.kills]) say(STREAKS[k.kills]);
    else if (k.kills > 65 && k.kills % 5 === 0) say(STREAK_BEYOND);

    var reward = PERK_LADDER[k.kills] || (k.kills > 65 && k.kills % 5 === 0 ? PERK_BEYOND : null);
    if (reward) {
      reward.forEach(function (kind, i) { activatePerk(k, kind, i); });
    }

    if (k.callouts.length > MAX_CALLOUTS) k.callouts.splice(0, k.callouts.length - MAX_CALLOUTS); // oldest go first
  }

  // ---------- killstreak perks ----------
  var perks = [];

  function enemyOf(team, nearX, nearY) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < soldiers.length; i++) {
      var o = soldiers[i];
      if (o.dead || o.team === team) continue;
      var d = Math.hypot(o.x - nearX, o.y - nearY);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  function perkShot(owner, x, y, tx, ty, speed, spread) {
    var a = Math.atan2(ty - y, tx - x) + (Math.random() - 0.5) * 2 * spread;
    bullets.push({
      kind: 'bullet', team: owner.team, shooter: owner,
      x: x, y: y, ox: x, oy: y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: Math.ceil(450 / speed)
    });
  }

  function activatePerk(k, kind, index) {
    var team = k.team;
    if (kind === 'armor') {
      k.armor = (k.armor || 0) + 1;
      k.armorUntil = tick + ARMOR_LIFE; // a new grant refreshes the timer
    } else if (kind === 'sentry') {
      var ledge = k.ground || platformUnder(k.x, k.y);
      perks.push({
        kind: 'sentry', team: team, owner: k,
        x: k.x + (index % 2 ? 1 : -1) * (20 + index * 16), y: ledge ? ledge.top : k.y,
        face: k.face, life: SENTRY_LIFE, cool: 30
      });
    } else if (kind === 'drone') {
      perks.push({
        kind: 'drone', team: team, owner: k,
        x: k.x, y: k.y - 60, slot: index, life: DRONE_LIFE, cool: 40 + index * 12
      });
    } else if (kind === 'airstrike') {
      var fromLeft = (index + team) % 2 === 0;
      var vw = window.innerWidth;
      perks.push({
        kind: 'plane', team: team, owner: k,
        x: window.scrollX + (fromLeft ? -60 - index * 140 : vw + 60 + index * 140),
        y: window.scrollY + 26 + index * 14,
        vx: fromLeft ? 6 : -6, drop: 0, life: 400
      });
    } else if (kind === 'orbital') {
      perks.push({
        kind: 'orbital', team: team, owner: k,
        x: k.x, t: -index * 45, life: 150 // staggered when several are called in
      });
    }
  }

  function updatePerks() {
    for (var i = perks.length - 1; i >= 0; i--) {
      var p = perks[i];
      p.life--;

      if (p.kind === 'sentry') {
        var e = enemyOf(p.team, p.x, p.y);
        var gy = p.y - 4;
        if (e) p.face = e.x < p.x ? -1 : 1;
        if (e && --p.cool <= 0 && Math.hypot(e.x - p.x, e.y - p.y) < 380) {
          perkShot(p.owner, p.x + p.face * 4, gy, e.x, e.y - SH * SCALE * 0.55, 9, 0.08);
          p.cool = 26;
        }
      } else if (p.kind === 'drone') {
        // Hover over the owner (or where they fell), bobbing, and shoot.
        var o = p.owner;
        var hx = o.x + (p.slot - 1) * 34, hy = o.y - SH * SCALE - 34 - (p.slot % 2) * 12;
        hy = Math.max(hy, window.scrollY + 14 + (p.slot % 2) * 12); // stay on screen
        p.x += (hx - p.x) * 0.06;
        p.y += (hy + Math.sin((tick + p.slot * 20) / 12) * 4 - p.y) * 0.06;
        var t = enemyOf(p.team, p.x, p.y);
        if (t && --p.cool <= 0 && Math.hypot(t.x - p.x, t.y - p.y) < 420) {
          perkShot(p.owner, p.x, p.y + 3, t.x, t.y - SH * SCALE * 0.55, 8, 0.1);
          p.cool = 45;
        }
      } else if (p.kind === 'plane') {
        p.x += p.vx;
        var target = enemyOf(p.team, p.x, p.y);
        var aimX = target ? target.x : p.owner.x + p.vx * 30;
        if (Math.abs(p.x - aimX) < 170 && ++p.drop % 7 === 0) {
          bullets.push({
            kind: 'grenade', bomb: true, team: p.team, shooter: p.owner,
            x: p.x, y: p.y + 8, ox: p.x, oy: p.y,
            vx: p.vx * 0.25, vy: 1.5, life: 400
          });
        }
      } else if (p.kind === 'orbital') {
        p.t++;
        if (p.t < 0) { p.life++; continue; }       // waiting its turn
        var tgt = enemyOf(p.team, p.x, 0);
        if (p.t < 70 && tgt) p.x += (tgt.x - p.x) * 0.12; // lock on
        if (p.t >= 80 && p.t < 110) {
          for (var n = 0; n < soldiers.length; n++) {
            var v = soldiers[n];
            if (!v.dead && v.team !== p.team && Math.abs(v.x - p.x) < 7 * SCALE) kill(v, p.owner, p.x);
          }
          if (p.t % 3 === 0) {
            var gyb = (tgt && Math.abs(tgt.x - p.x) < 40) ? tgt.y : window.scrollY + window.innerHeight - 10;
            sparks.push({ x: p.x + (Math.random() - 0.5) * 30, y: gyb, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4,
                          life: 15 + Math.random() * 10, color: Math.random() < 0.5 ? '#fcfcfc' : TEAMS[p.team].T });
          }
        }
        if (p.t >= 115) p.life = 0;
      }

      if (p.life <= 0) perks.splice(i, 1);
    }
  }

  function step() {
    tick++;
    for (var ci = 0; ci < soldiers.length; ci++) {
      var q = soldiers[ci].callouts;
      if (!q) continue;
      for (var qi = q.length - 1; qi >= 0; qi--) {
        if (q[qi].delay > 0) { q[qi].delay--; continue; }
        if (++q[qi].t > CALLOUT_FRAMES) q.splice(qi, 1);
      }
    }

    // Keep both teams staffed.
    for (var team = 0; team < 2; team++) {
      var alive = soldiers.filter(function (s) { return s.team === team && !s.dead; }).length;
      if (alive < teamSize()) {
        if (respawnAt[team] === 0) respawnAt[team] = 60 + Math.random() * 90;
        else if (--respawnAt[team] <= 0) { respawnAt[team] = 0; spawn(team); }
      }
    }

    for (var i = soldiers.length - 1; i >= 0; i--) {
      var s = soldiers[i];

      if (s.dead) {
        // Bodies fall onto the same ledges the living walk on, lie there a
        // while, then blink out.
        s.deadT++;
        if (!s.ground) {
          var prevDeadY = s.y;
          s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);
          s.x += s.vx;
          s.y += s.vy;
          if (s.vy > 0) land(s, prevDeadY);
          if (s.ground) s.vx = 0;
        }
        if (s.deadT > CORPSE_TIME || s.y > docH + 200) soldiers.splice(i, 1);
        continue;
      }

      if (s.armor > 0 && tick >= s.armorUntil) s.armor = 0; // armor wore off
      if (updateHook(s)) continue;

      think(s);

      if (s.rollCooldown > 0) s.rollCooldown--;
      maybeDodge(s);
      if (s.roll > 0) { s.roll--; s.vx = s.rollDir * ROLL_SPEED; }
      if (s.ground && s.fuel < JET_FUEL) s.fuel++;

      var prevY = s.y;
      s.x += s.vx;
      if (s.x < 12) { s.x = 12; s.wander = 1; }
      if (s.x > docW - 12) { s.x = docW - 12; s.wander = -1; }

      if (s.ground) {
        if (!platformUnder(s.x, s.y)) s.ground = null; // walked off an edge
      }

      if (!s.ground) {
        if (s.jetting) {
          // Thrust until we're above the target ledge or out of fuel, then drop onto it.
          if (s.fuel > 0 && s.y > s.jetGoalY - 24) {
            s.fuel--;
            s.vy = Math.max(s.vy + GRAVITY - JET_THRUST, -JET_MAX_RISE);
            exhaust(s);
          } else {
            s.jetting = false;
          }
        }
        if (!s.jetting) s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);
        s.y += s.vy;
        if (s.vy > 0) land(s, prevY);
        if (s.ground) { s.spin = false; s.jetting = false; }
      }

      if (s.y > docH + 200) soldiers.splice(i, 1);
      if (s.vx !== 0 && s.ground) s.step++;
    }

    for (var b = bullets.length - 1; b >= 0; b--) {
      var u = bullets[b];
      var prevUY = u.y;

      if (u.kind === 'grenade') {
        if (u.rest) {
          // Rolling along a ledge: friction, and fall off the end.
          u.vx *= 0.94;
          if (u.x < u.rest.left || u.x > u.rest.right) u.rest = null;
        } else {
          u.vy += GRENADE_GRAVITY;
        }
      } else if (u.kind === 'flame') {
        u.vx *= 0.96; u.vy = u.vy * 0.96 - 0.05; // slows and rises
        u.age++;
      }
      u.x += u.vx;
      u.y += u.vy;

      if (u.kind === 'grenade') {
        var boom = --u.life <= 0 || hitSoldier(u.team, u.x, u.y, 2) || u.y > docH + 50;
        if (!boom && !u.rest && u.vy > 0) {
          // Ledges are one-way, like for the soldiers: grenades fly up through
          // them and only hit them on the way down. Airstrike bombs explode on
          // impact; launcher grenades bounce until the fuse runs out.
          for (var k = 0; k < platforms.length; k++) {
            var p = platforms[k];
            if (u.x >= p.left && u.x <= p.right && prevUY <= p.top && u.y >= p.top) {
              u.y = p.top;
              if (u.bomb) { boom = true; break; }
              u.vy = -u.vy * GRENADE_BOUNCE;
              u.vx *= 0.8;
              if (Math.abs(u.vy) < 1.2) { u.vy = 0; u.rest = p; }
              break;
            }
          }
        }
        if (!u.bomb && (u.x < 4 || u.x > docW - 4)) { u.vx = -u.vx; u.x = Math.max(4, Math.min(docW - 4, u.x)); }
        if (boom) { explode(u); bullets.splice(b, 1); }
        continue;
      }

      if (--u.life <= 0) { bullets.splice(b, 1); continue; }
      var o = hitSoldier(u.team, u.x, u.y, u.kind === 'flame' ? 3 : 0);
      if (o) {
        kill(o, u.shooter, u.x - u.vx * 4);
        burst(u.x, u.y, TEAMS[o.team].T);
        bullets.splice(b, 1);
      }
    }

    for (var e = blasts.length - 1; e >= 0; e--) {
      if (++blasts[e].t > 14) blasts.splice(e, 1);
    }

    updatePerks();

    for (var q = sparks.length - 1; q >= 0; q--) {
      var sp = sparks[q];
      sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.2;
      if (--sp.life <= 0) sparks.splice(q, 1);
    }
  }

  function exhaust(s) {
    var bx = s.x - s.face * 5 * SCALE;
    sparks.push({
      x: bx + (Math.random() - 0.5) * SCALE,
      y: s.y - 5 * SCALE,
      vx: (Math.random() - 0.5) * 0.6,
      vy: 2 + Math.random() * 1.5,
      life: 8 + Math.random() * 6,
      color: Math.random() < 0.5 ? '#f8b800' : '#e45c10'
    });
  }

  function burst(x, y, color) {
    for (var i = 0; i < 10; i++) {
      sparks.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3,
        life: 20 + Math.random() * 15,
        color: Math.random() < 0.5 ? color : '#fbbf24'
      });
    }
  }

  // ---------- rendering ----------
  var canvas = document.createElement('canvas');
  canvas.className = 'soldiers-layer';
  canvas.setAttribute('aria-hidden', 'true');
  var ctx = canvas.getContext('2d');
  var dpr = 1;

  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function render() {
    var sx = window.scrollX, sy = window.scrollY;
    var vw = window.innerWidth, vh = window.innerHeight;
    ctx.clearRect(0, 0, vw, vh);

    for (var i = 0; i < soldiers.length; i++) {
      var s = soldiers[i];
      var px = Math.round(s.x - sx), py = Math.round(s.y - sy);
      if (px < -60 || px > vw + 60 || py < -60 || py > vh + 60) continue;

      if (s.hook && !s.dead) drawHook(s, sx, sy);

      var frames = SPRITES[s.team][s.weapon][s.aim || 'fwd'];
      var pose;
      if (s.dead || !s.ground || s.roll > 0 || (s.hook && s.hook.phase === 'reel')) pose = 'jump';
      else if (s.vx !== 0) pose = Math.floor(s.step / 8) % 2 ? 'walk1' : 'walk2';
      else pose = 'stand';
      var img = frames[pose][s.face > 0 ? 1 : 0];

      if (s.dead) {
        if (s.callouts && s.callouts.length) drawCallouts(s, px, py, vw);
        if (s.deadT > CORPSE_TIME - 60 && s.deadT % 6 < 3) continue; // blink before vanishing
        // Topple over: rotate a quarter turn and lower the pivot so the body
        // ends up lying flat on the ledge.
        var tip = Math.min(s.deadT / 12, 1);
        var pivotUp = (SH / 2) + (SW / 2 - SH / 2) * tip;
        ctx.save();
        ctx.translate(px, py - pivotUp * SCALE);
        ctx.rotate(s.fallDir * tip * Math.PI / 2);
        ctx.drawImage(img, Math.round(-(SW / 2 + 1) * SCALE), Math.round(-(SH / 2 + 1) * SCALE));
        ctx.restore();
        continue;
      }

      if (s.move === 'jetpack') drawJetpack(s, px, py);

      var spinning = s.roll > 0 || (s.spin && !s.ground);
      if (spinning) {
        // Tucked somersault around the body's center.
        var turn = s.roll > 0 ? (1 - s.roll / ROLL_FRAMES) * s.rollDir : (s.spinT = (s.spinT || 0) + 1) / 18 * s.face;
        ctx.save();
        ctx.translate(px, py - (SH / 2) * SCALE);
        ctx.rotate(turn * Math.PI * 2);
        ctx.drawImage(img, Math.round(-(SW / 2 + 1) * SCALE), Math.round(-(SH / 2 + 1) * SCALE));
        ctx.restore();
      } else {
        ctx.drawImage(img, Math.round(px - (SW / 2 + 1) * SCALE), Math.round(py - (SH + 1) * SCALE));
      }
      drawNumber(s.kills, px, py - (SH + 2) * SCALE, TEAMS[s.team].T);
      if (s.armor > 0 || s.armorFlash > 0) drawArmor(s, px, py);
      if (s.callouts && s.callouts.length) drawCallouts(s, px, py, vw);

      if (s.shootPose > 8 && s.weapon !== 'flamethrower') {
        var m = muzzle(s);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(m.x - sx - SCALE), Math.round(m.y - sy - SCALE), 2 * SCALE, 2 * SCALE);
      }
    }

    drawPerks(sx, sy, vw, vh);

    for (var b = 0; b < bullets.length; b++) {
      var u = bullets[b];
      var bx = Math.round(u.x - sx), by = Math.round(u.y - sy);
      if (u.kind === 'flame') {
        // Grows and cools from white-hot to red as it ages.
        var f = u.age / 30;
        var size = Math.round(1.5 + f * 2.5) * SCALE;
        ctx.fillStyle = f < 0.3 ? '#fcfcfc' : f < 0.55 ? '#f8b800' : f < 0.8 ? '#e45c10' : '#d82800';
        ctx.fillRect(Math.round((bx - size / 2) / SCALE) * SCALE, Math.round((by - size / 2) / SCALE) * SCALE, size, size);
      } else if (u.bomb) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(bx - SCALE, by - 2 * SCALE, 2 * SCALE, 3 * SCALE);
        ctx.fillRect(bx - 2 * SCALE, by - 3 * SCALE, 4 * SCALE, SCALE); // fins
      } else if (u.kind === 'grenade') {
        ctx.fillStyle = u.life < 90 && (u.life >> (u.life < 40 ? 1 : 2)) % 2 ? '#d82800' : '#007800';
        ctx.fillRect(bx - SCALE, by - SCALE, 2 * SCALE, 2 * SCALE);
        ctx.fillStyle = '#000000';
        ctx.fillRect(bx - SCALE, by - SCALE, SCALE, SCALE);
      } else {
        if (Math.hypot(u.x - u.ox, u.y - u.oy) < (SW / 2) * SCALE) continue;
        ctx.fillStyle = '#d82800';
        ctx.fillRect(bx - SCALE, by - SCALE, 2 * SCALE, 2 * SCALE);
      }
    }

    // Grenade blasts: a chunky ring that expands and cools.
    for (var e = 0; e < blasts.length; e++) {
      var bl = blasts[e];
      var r = 8 + bl.t * 3.5;
      var cx = Math.round(bl.x - sx), cy = Math.round(bl.y - sy);
      ctx.fillStyle = bl.t < 5 ? '#fcfcfc' : bl.t < 10 ? '#f8b800' : '#e45c10';
      for (var a = 0; a < 16; a++) {
        var ang = a / 16 * Math.PI * 2;
        ctx.fillRect(Math.round((cx + Math.cos(ang) * r) / SCALE) * SCALE, Math.round((cy + Math.sin(ang) * r) / SCALE) * SCALE, 2 * SCALE, 2 * SCALE);
      }
    }

    for (var q = 0; q < sparks.length; q++) {
      var sp = sparks[q];
      ctx.globalAlpha = Math.min(sp.life / 15, 1);
      ctx.fillStyle = sp.color;
      ctx.fillRect(Math.round(sp.x - sx), Math.round(sp.y - sy), 3, 3);
    }
    ctx.globalAlpha = 1;

  }

  // Chunky NES-style rope: a dotted line of square pixels, plus a little claw.
  // A small gray tank on the soldier's back (behind the shoulders).
  function drawJetpack(s, px, py) {
    var left = s.face > 0 ? px - (SW / 2) * SCALE : px + (SW / 2 - 2) * SCALE;
    var top = py - (SH - 6) * SCALE;
    ctx.fillStyle = '#7c7c7c';
    ctx.fillRect(left, top, 2 * SCALE, 5 * SCALE);
    ctx.fillStyle = '#000000';
    ctx.fillRect(left, top + 5 * SCALE, 2 * SCALE, SCALE); // nozzle
  }

  // ---------- kill-streak banners ----------
  var CALLOUT_FRAMES = 120;
  var MAX_CALLOUTS = 6;
  // 5x5 pixel font (rows top to bottom).
  var FONT = {
    A: '.###.#...#######...##...#', B: '####.#...#####.#...#####.', C: '.#####....#....#.....####',
    D: '####.#...##...##...#####.', E: '######....####.#....#####', F: '######....####.#....#....',
    G: '.#####....#..###...#.####', H: '#...##...#######...##...#', I: '#####..#....#....#..#####',
    J: '..###...#....#.#..#..##..', K: '#...##..#.###..#..#.#...#', L: '#....#....#....#....#####',
    M: '#...###.###.#.##...##...#', N: '#...###..##.#.##..###...#', O: '.###.#...##...##...#.###.',
    P: '####.#...#####.#....#....', Q: '.###.#...##.#.##..#..##.#', R: '####.#...#####.#..#.#...#',
    S: '.#####.....###.....#####.', T: '#####..#....#....#....#..', U: '#...##...##...##...#.###.',
    V: '#...##...##...#.#.#...#..', W: '#...##...##.#.###.###...#', X: '#...#.#.#...#...#.#.#...#',
    Y: '#...#.#.#...#....#....#..', Z: '#####...#...#...#...#####', '!': '..#....#....#.........#..',
    ' ': '.........................'
  };

  function textWidth(str, px) { return str.length * 6 * px - px; }

  function drawText(str, x, y, px, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str[i]] || FONT[' '];
      for (var k = 0; k < 25; k++) {
        if (g[k] === '#') ctx.fillRect(x + (i * 6 + k % 5) * px, y + Math.floor(k / 5) * px, px, px);
      }
    }
  }

  // A soldier's active streak callouts: small plain text in the team color,
  // stacked under the feet with the newest closest.
  function drawCallouts(k, cx, feetY, vw) {
    var sy = feetY + 4;
    for (var i = k.callouts.length - 1; i >= 0; i--) {
      var c = k.callouts[i];
      if (c.delay > 0) continue;
      drawStreakText(c, cx, sy, vw);
      sy += 5 * STREAK_PX + 3;
    }
  }

  var STREAK_PX = 1; // 5px-tall letters

  function drawStreakText(c, cx, top, vw) {
    var w = textWidth(c.text, STREAK_PX);
    var x = Math.round(Math.max(4, Math.min(vw - w - 4, cx - w / 2)));
    ctx.globalAlpha = c.t > CALLOUT_FRAMES - 15 ? Math.max(0, (CALLOUT_FRAMES - c.t) / 15) : 1;
    drawText(c.text, x, Math.round(top), STREAK_PX, c.t % 8 < 4 && c.t < 24 ? '#f8b800' : c.color); // flash then team color
    ctx.globalAlpha = 1;
  }



  // ---------- perk art (original, NES-style) ----------
  var PERK_ART = {
    sentry: ['..TTT..', '.TTTKKK', '..TTT..', '..K.K..', '.K...K.'],
    drone:  ['KKK.KKK', '...K...', '.GGGGG.', '..GRG..'],
    plane:  ['.......G....', 'GG....GGGG..', 'GGGGGGGGGGGG', '.TT...GG....']
  };

  function drawArt(rows, x, y, unit, flip, colors) {
    for (var r = 0; r < rows.length; r++) {
      var w = rows[r].length;
      for (var c = 0; c < w; c++) {
        var ch = rows[r][flip ? w - 1 - c : c];
        if (ch === '.') continue;
        ctx.fillStyle = colors[ch];
        ctx.fillRect(x + c * unit, y + r * unit, unit, unit);
      }
    }
  }

  function drawPerks(sx, sy, vw, vh) {
    for (var i = 0; i < perks.length; i++) {
      var p = perks[i];
      var team = TEAMS[p.team].T;
      var colors = { T: team, K: '#000000', G: '#7c7c7c', R: (tick >> 3) % 2 ? '#d82800' : '#fcfcfc' };
      var blink = p.life < 90 && (tick >> 2) % 2; // about to expire
      if (p.kind === 'sentry' && !blink) {
        drawArt(PERK_ART.sentry, Math.round(p.x - sx) - 4, Math.round(p.y - sy) - 5, 1, p.face < 0, colors);
      } else if (p.kind === 'drone' && !blink) {
        var art = PERK_ART.drone.slice();
        if ((tick >> 1) % 2) art[0] = '.KK.KK.'; // spinning rotors
        drawArt(art, Math.round(p.x - sx) - 7, Math.round(p.y - sy) - 4, 2, false, colors);
      } else if (p.kind === 'plane') {
        drawArt(PERK_ART.plane, Math.round(p.x - sx) - 12, Math.round(p.y - sy) - 4, 2, p.vx < 0, colors);
      } else if (p.kind === 'orbital' && p.t >= 0) {
        var bx = Math.round(p.x - sx);
        if (p.t < 80) {
          // Targeting laser: a blinking dashed line that locks on.
          if ((p.t >> 2) % 2 || p.t > 60) {
            ctx.fillStyle = team;
            for (var y = 0; y < vh; y += 12) ctx.fillRect(bx - 1, y, 3, 6);
          }
        } else if (p.t < 110) {
          var wdt = (p.t < 84 ? 4 : 7) * SCALE * 2;
          ctx.fillStyle = team;
          ctx.fillRect(bx - wdt / 2 - SCALE, 0, wdt + 2 * SCALE, vh);
          ctx.fillStyle = '#fcfcfc';
          ctx.fillRect(bx - wdt / 2 + SCALE, 0, wdt - 2 * SCALE, vh);
        }
      }
    }
  }

  // Armor: NES-style corner brackets around the soldier; flashes when it breaks.
  function drawArmor(s, px, py) {
    if (s.armorFlash > 0) s.armorFlash--;
    var color = s.armorFlash > 0 ? ((s.armorFlash >> 1) % 2 ? '#fcfcfc' : '#bcbcbc') : '#7c7c7c';
    if (!s.armor && s.armorFlash <= 0) return;
    if (!s.armorFlash && s.armorUntil - tick < 120 && (tick >> 2) % 2) return; // about to wear off
    var l = px - (SW / 2 + 1) * SCALE, r = px + (SW / 2 + 1) * SCALE;
    var t = py - (SH + 1) * SCALE, b = py;
    var a = 3 * SCALE, th = 2;
    ctx.fillStyle = color;
    [[l, t, 1, 1], [r, t, -1, 1], [l, b, 1, -1], [r, b, -1, -1]].forEach(function (c) {
      ctx.fillRect(c[2] > 0 ? c[0] : c[0] - a, c[3] > 0 ? c[1] : c[1] - th, a, th);
      ctx.fillRect(c[2] > 0 ? c[0] : c[0] - th, c[3] > 0 ? c[1] : c[1] - a, th, a);
    });
  }

  // Tiny 3x5 pixel digits for the kill counters.
  var DIGITS = [
    '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'
  ];
  var DIGIT_PX = 1; // CSS px per digit pixel

  // Draws n centered on cx with its bottom edge at by.
  function drawNumber(n, cx, by, color) {
    var str = String(n);
    var w = str.length * 4 * DIGIT_PX - DIGIT_PX;
    var x0 = Math.round(cx - w / 2), y0 = Math.round(by - 5 * DIGIT_PX);
    ctx.fillStyle = color;
    for (var i = 0; i < str.length; i++) {
      var bits = DIGITS[+str[i]];
      for (var k = 0; k < 15; k++) {
        if (bits[k] === '1') {
          ctx.fillRect(x0 + (i * 4 + k % 3) * DIGIT_PX, y0 + Math.floor(k / 3) * DIGIT_PX, DIGIT_PX, DIGIT_PX);
        }
      }
    }
  }

  function drawHook(s, sx, sy) {
    var hand = handPos(s);
    var x0 = hand.x - sx, y0 = hand.y - sy;
    var x1 = s.hook.hx - sx, y1 = s.hook.hy - sy;
    var len = Math.hypot(x1 - x0, y1 - y0);
    var n = Math.max(1, Math.floor(len / (2 * SCALE)));
    ctx.fillStyle = '#000000';
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * (i / n);
      var y = y0 + (y1 - y0) * (i / n);
      ctx.fillRect(Math.round(x / SCALE) * SCALE, Math.round(y / SCALE) * SCALE, SCALE, SCALE);
    }
    // Claw: a 3x2 art-pixel prong shape sitting on the hook point.
    var cx = Math.round(x1 / SCALE) * SCALE, cy = Math.round(y1 / SCALE) * SCALE;
    ctx.fillStyle = '#7c7c7c';
    ctx.fillRect(cx - SCALE, cy - SCALE, 3 * SCALE, SCALE);
    ctx.fillRect(cx - SCALE, cy, SCALE, SCALE);
    ctx.fillRect(cx + SCALE, cy, SCALE, SCALE);
  }

  // ---------- loop and controls ----------
  var running = false;
  var frame = null;
  var last = 0, acc = 0;
  var measureTimer = null;

  function loop(t) {
    if (!last) last = t;
    acc += Math.min(t - last, 100);
    last = t;
    while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
    render();
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    document.body.appendChild(canvas);
    resizeCanvas();
    measure();
    measureTimer = setInterval(measure, 2000);
    last = 0; acc = 0;
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (frame) cancelAnimationFrame(frame);
    clearInterval(measureTimer);
    frame = null;
    soldiers.length = bullets.length = sparks.length = blasts.length = perks.length = 0;
    respawnAt = [0, 0];
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  function saved() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function save(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'soldier-toggle';

  function setEnabled(on) {
    on ? start() : stop();
    toggle.textContent = on ? 'Ceasefire' : 'Deploy troops';
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  toggle.addEventListener('click', function () {
    var on = !running;
    save(on);
    setEnabled(on);
  });

  window.addEventListener('resize', function () {
    if (!running) return;
    resizeCanvas();
    measure();
  });

  document.addEventListener('visibilitychange', function () {
    if (!running) return;
    if (document.hidden) { cancelAnimationFrame(frame); frame = null; }
    else if (!frame) { last = 0; frame = requestAnimationFrame(loop); }
  });

  function init() {
    document.body.appendChild(toggle);
    var pref = saved();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setEnabled(pref === null ? !reduce : pref === '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('load', function () { if (running) measure(); });
})();
