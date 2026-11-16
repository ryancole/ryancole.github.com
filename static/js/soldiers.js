// Tiny pixel soldiers that drop onto the page and fight across it.
// The top of every innermost block-level element is a one-way platform.
(function () {
  'use strict';

  var STORAGE_KEY = 'soldiers-enabled';
  var SW = 12, SH = 16;        // sprite size in art pixels
  var SCALE = 3;               // 12x16 sprite -> 36x48 CSS px (about half an inch)
  var GRAVITY = 0.45;
  var JUMP_VY = -9.6;          // ~100px jump
  var WALK_SPEED = 1.3;
  var BULLET_SPEED = 7;
  var SIGHT = 420;
  var MAX_FALL = 12;
  var CORPSE_TIME = 240;       // frames a body stays before blinking out (~4s)
  var FIRE_RANGE = 520;        // shoots at anything this close, any direction
  var SPREAD = 0.08;           // aim wobble in radians

  // ---------- sprites (original art, NES-style) ----------
  // Facing right. Three colors per sprite, like an NES sprite palette:
  // . transparent  S skin  T team color  K black (hair, eye, rifle, belt, boots)
  var TOP = [
    '....KKK.....',
    '...KKKKK....',
    '.TTTTTTT....',
    'T..KSSKS....',
    '...KSSSS....',
    '....SSS.....',
    '...SSSSS....',
    '..SSSSSKKKKK',
    '..SSSSKKKK..',
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
      'T..KSSKS..KK',
      '...KSSSS.KK.',
      '....SSS.KK..',
      '...SSSSKK...',
      '..SSSSSK....',
      '..SSSSS.....',
      '...SSSS.....',
      '...KKKK.....',
      '...TTTT.....'
    ],
    up: [
      '....KKK..K..',
      '...KKKKK.K..',
      '.TTTTTTT.K..',
      'T..KSSKSKK..',
      '...KSSSSKK..',
      '....SSS.SK..',
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
      '..SSSSSKK...',
      '...SSSS.KK..',
      '...KKKK..KK.',
      '...TTTT...KK'
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
    c.width = W * SCALE;
    c.height = H * SCALE;
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
        g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    return c;
  }

  // SPRITES[team][aim][pose] = [facingLeft, facingRight]
  var SPRITES = TEAMS.map(function (team) {
    var byAim = {};
    Object.keys(AIMS).forEach(function (aim) {
      var frames = {};
      Object.keys(LEGS).forEach(function (k) {
        var rows = AIMS[aim].concat(LEGS[k]);
        frames[k] = [buildFrame(rows, team, true), buildFrame(rows, team, false)];
      });
      byAim[aim] = frames;
    });
    return byAim;
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
      shootPose: 0
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
    s.aim = aimPose(aimDX, aimDY);
    if (s.cooldown <= 0 && Math.hypot(aimDX, aimDY) < FIRE_RANGE) {
      fire(s, Math.atan2(aimDY, aimDX));
      s.cooldown = 40 + Math.random() * 45;
    }

    if (Math.abs(dy) < 20 && Math.abs(dx) < SIGHT) {
      // Same level: hold position, sometimes hop.
      if (s.ground && s.jumpCooldown <= 0 && Math.random() < 0.006) jump(s);
      if (Math.abs(dx) > SIGHT * 0.6) s.vx = s.face * WALK_SPEED * 0.5;
      else if (Math.abs(dx) < 60) s.vx = -s.face * WALK_SPEED * 0.8; // too close: back off, keep aiming
      return;
    }

    s.vx = s.face * WALK_SPEED;

    if (dy < -20) {
      climb(s, t);
    } else if (dy > 20 && s.ground && !s.ground.floor && Math.random() < 0.01) {
      s.dropFrom = s.ground; // Target is below: drop through.
      s.ground = null;
      s.vy = 1;
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
    if (t.y - s.y < -160 && s.jumpCooldown <= 0 && Math.random() < 0.02 && throwHook(s, t)) return;

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
    if (s.jumpCooldown <= 0 && Math.random() < 0.05) throwHook(s, t);
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
  function throwHook(s, t) {
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

  function fire(s, angle) {
    angle += (Math.random() - 0.5) * 2 * SPREAD;
    s.shootPose = 12;
    var ox = s.x, oy = s.y - (SH - 7.5) * SCALE;
    bullets.push({
      team: s.team,
      x: ox, y: oy,
      ox: ox, oy: oy, // hidden until it clears the rifle
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      life: 100
    });
  }

  function step() {
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

      if (updateHook(s)) continue;

      think(s);

      var prevY = s.y;
      s.x += s.vx;
      if (s.x < 12) { s.x = 12; s.wander = 1; }
      if (s.x > docW - 12) { s.x = docW - 12; s.wander = -1; }

      if (s.ground) {
        if (!platformUnder(s.x, s.y)) s.ground = null; // walked off an edge
      }

      if (!s.ground) {
        s.vy = Math.min(s.vy + GRAVITY, MAX_FALL);
        s.y += s.vy;
        if (s.vy > 0) land(s, prevY);
      }

      if (s.y > docH + 200) soldiers.splice(i, 1);
      if (s.vx !== 0 && s.ground) s.step++;
    }

    for (var b = bullets.length - 1; b >= 0; b--) {
      var u = bullets[b];
      u.x += u.vx;
      u.y += u.vy;
      if (--u.life <= 0) { bullets.splice(b, 1); continue; }
      for (var n = 0; n < soldiers.length; n++) {
        var o = soldiers[n];
        if (o.dead || o.team === u.team) continue;
        if (Math.abs(u.x - o.x) < 4 * SCALE && u.y > o.y - (SH - 1) * SCALE && u.y < o.y) {
          o.dead = true;
          o.hook = null;
          o.ground = null;
          o.dropFrom = null;
          o.vy = -5;
          o.vx = u.vx > 0 ? 1.5 : -1.5;
          o.fallDir = u.vx > 0 ? 1 : -1;
          burst(u.x, u.y, TEAMS[o.team].T);
          bullets.splice(b, 1);
          break;
        }
      }
    }

    for (var q = sparks.length - 1; q >= 0; q--) {
      var sp = sparks[q];
      sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.2;
      if (--sp.life <= 0) sparks.splice(q, 1);
    }
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

      var frames = SPRITES[s.team][s.aim || 'fwd'];
      var pose;
      if (s.dead || !s.ground || (s.hook && s.hook.phase === 'reel')) pose = 'jump';
      else if (s.vx !== 0) pose = Math.floor(s.step / 8) % 2 ? 'walk1' : 'walk2';
      else pose = 'stand';
      var img = frames[pose][s.face > 0 ? 1 : 0];

      if (s.dead) {
        if (s.deadT > CORPSE_TIME - 60 && s.deadT % 6 < 3) continue; // blink before vanishing
        // Topple over: rotate a quarter turn and lower the pivot so the body
        // ends up lying flat on the ledge.
        var tip = Math.min(s.deadT / 12, 1);
        var pivotUp = (SH / 2) + (SW / 2 - SH / 2) * tip;
        ctx.save();
        ctx.translate(px, py - pivotUp * SCALE);
        ctx.rotate(s.fallDir * tip * Math.PI / 2);
        ctx.drawImage(img, -(SW / 2 + 1) * SCALE, -(SH / 2 + 1) * SCALE);
        ctx.restore();
        continue;
      }

      ctx.drawImage(img, px - (SW / 2 + 1) * SCALE, py - (SH + 1) * SCALE);

      if (s.shootPose > 8) {
        var m = MUZZLE[s.aim || 'fwd'];
        var mx = px + s.face * (m[0] - SW / 2) * SCALE;
        var my = py - (SH - m[1]) * SCALE;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(mx - SCALE), Math.round(my - SCALE), 2 * SCALE, 2 * SCALE);
      }
    }

    for (var b = 0; b < bullets.length; b++) {
      var u = bullets[b];
      if (Math.hypot(u.x - u.ox, u.y - u.oy) < (SW / 2) * SCALE) continue;
      ctx.fillStyle = '#d82800';
      ctx.fillRect(Math.round(u.x - sx) - SCALE, Math.round(u.y - sy) - SCALE, 2 * SCALE, 2 * SCALE);
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
    soldiers.length = bullets.length = sparks.length = 0;
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
