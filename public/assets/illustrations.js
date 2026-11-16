/* Isometric SVG illustrations, generated in code so they stay sharp, tiny and on-palette.
   window.ARZON_ILLO.render(kind) → SVG string. kinds: business, data, tech, pharma, ladder */
(function () {
  'use strict';
  var uid = 0;
  var C = { top: '#9cc9f3', left: '#3d8ade', right: '#1f5fa8', deep: '#0f2c52', sky: '#bfe0ff', warm: '#e9b872', mint: '#6cc9a4', line: 'rgba(156,201,243,.45)' };
  var P = function (pts) { return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); };

  // Isometric box standing on ground point (x, y): half-width w, height h.
  function box(x, y, w, h, o) {
    o = o || {}; var d = w / 2;
    var top = o.top || C.top, l = o.left || C.left, r = o.right || C.right;
    return '<g' + (o.cls ? ' class="' + o.cls + '"' : '') + '>' +
      '<polygon points="' + P([[x - w, y], [x, y + d], [x, y + d - h], [x - w, y - h]]) + '" fill="' + l + '"/>' +
      '<polygon points="' + P([[x, y + d], [x + w, y], [x + w, y - h], [x, y + d - h]]) + '" fill="' + r + '"/>' +
      '<polygon points="' + P([[x, y - d - h], [x + w, y - h], [x, y + d - h], [x - w, y - h]]) + '" fill="' + top + '"/>' +
      '</g>';
  }
  function platform(id) {
    return '<ellipse cx="200" cy="262" rx="150" ry="52" fill="url(#' + id + 'sh)"/>' +
      box(200, 226, 128, 18, { top: 'url(#' + id + 'pt)', left: '#123a6b', right: '#0b2547' }) +
      grid(200, 208, 128);
  }
  function grid(cx, cy, w) { // faint lines on the platform top
    var s = '', d = w / 2, n = 6;
    for (var i = 1; i < n; i++) {
      var t = i / n;
      s += '<line x1="' + (cx - w + w * t) + '" y1="' + (cy - d * t) + '" x2="' + (cx + w * t) + '" y2="' + (cy + d - d * t) + '" />';
      s += '<line x1="' + (cx - w + w * t) + '" y1="' + (cy + d * t) + '" x2="' + (cx + w * t) + '" y2="' + (cy - d + d * t) + '" />';
    }
    return '<g stroke="rgba(191,224,255,.16)" stroke-width="1">' + s + '</g>';
  }
  function defs(id) {
    return '<defs>' +
      '<radialGradient id="' + id + 'sh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2f7fd8" stop-opacity=".45"/><stop offset="1" stop-color="#2f7fd8" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'pt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c4f8c"/><stop offset="1" stop-color="#143c6e"/></linearGradient>' +
      '<linearGradient id="' + id + 'gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#4a93e3"/></linearGradient>' +
      '<linearGradient id="' + id + 'card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(156,201,243,.22)"/><stop offset="1" stop-color="rgba(47,127,216,.08)"/></linearGradient>' +
      '<filter id="' + id + 'blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>' +
      '</defs>';
  }
  function card(x, y, w, h, inner, cls) { // floating glass card
    return '<g class="' + (cls || 'fl') + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12" fill="url(#ID' + 'card)" stroke="rgba(191,224,255,.35)"/>' + inner + '</g>';
  }
  function dot(x, y, r, col, glow) {
    return (glow ? '<circle cx="' + x + '" cy="' + y + '" r="' + r * 2.6 + '" fill="' + col + '" opacity=".35" filter="url(#IDblur)"/>' : '') +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '"/>';
  }

  var scenes = {
    business: function () {
      return box(150, 222, 26, 46) + box(196, 246, 26, 82) + box(242, 222, 26, 124, { top: C.sky }) +
        // trend line + arrow
        '<g class="fl"><polyline points="118,120 168,104 208,78 256,52" fill="none" stroke="' + C.warm + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<polygon points="256,40 270,56 250,60" fill="' + C.warm + '"/>' + dot(118, 120, 5, C.warm) + dot(168, 104, 5, C.warm) + dot(208, 78, 5, C.warm) + '</g>' +
        // coin
        '<g class="fl2"><ellipse cx="320" cy="140" rx="24" ry="24" fill="' + C.warm + '"/><ellipse cx="320" cy="140" rx="17" ry="17" fill="none" stroke="#fff3dc" stroke-width="2"/>' +
        '<text x="320" y="147" text-anchor="middle" font-family="Geist,system-ui,sans-serif" font-weight="700" font-size="20" fill="#5a3b0c">₹</text></g>' +
        // KPI card
        card(46, 60, 92, 56, '<rect x="58" y="74" width="40" height="6" rx="3" fill="' + C.sky + '"/><rect x="58" y="88" width="66" height="14" rx="4" fill="' + C.left + '"/><rect x="58" y="88" width="44" height="14" rx="4" fill="' + C.mint + '"/>', 'fl3');
    },
    data: function () {
      var nodes = [[140, 70], [140, 120], [140, 170], [200, 55], [200, 105], [200, 155], [260, 80], [260, 135]];
      var links = [[0, 3], [0, 4], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 6], [4, 6], [4, 7], [5, 7]];
      var s = '<g class="fl" stroke="rgba(191,224,255,.5)" stroke-width="1.5">' + links.map(function (l) { var a = nodes[l[0]], b = nodes[l[1]]; return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }).join('') + '</g>';
      s += '<g class="fl">' + nodes.map(function (n, i) { return dot(n[0], n[1], i === 4 ? 9 : 6, i === 4 ? C.warm : (i > 5 ? C.mint : C.sky), i === 4); }).join('') + '</g>';
      // chip on platform
      var chip = box(200, 222, 54, 14, { top: '#1f5fa8', left: '#123a6b', right: '#0b2547' }) + box(200, 208, 30, 10, { top: C.sky });
      var pins = ''; for (var i = 0; i < 5; i++) { pins += '<line x1="' + (160 + i * 8) + '" y1="' + (203 + i * 4) + '" x2="' + (148 + i * 8) + '" y2="' + (209 + i * 4) + '" stroke="' + C.top + '" stroke-width="2"/>'; }
      // beam from chip to network
      var beam = '<polygon points="186,196 214,196 230,170 170,170" fill="url(#IDgl)" opacity=".25"/>';
      return beam + chip + pins + s +
        card(292, 168, 80, 48, '<polyline points="302,204 316,192 330,198 344,182 360,186" fill="none" stroke="' + C.mint + '" stroke-width="3" stroke-linecap="round"/><rect x="302" y="178" width="30" height="5" rx="2.5" fill="' + C.sky + '"/>', 'fl2');
    },
    tech: function () {
      var srv = box(150, 236, 34, 22) + box(150, 214, 34, 22, { top: '#7fbcef' }) + box(150, 192, 34, 22, { top: C.sky });
      var leds = '<g>' + [0, 1, 2].map(function (k) { return dot(130, 214 - k * 22, 2.4, k === 1 ? C.warm : C.mint); }).join('') + '</g>';
      var win = card(198, 70, 150, 104,
        '<rect x="198" y="70" width="150" height="20" rx="12" fill="rgba(191,224,255,.18)"/>' + dot(212, 80, 3.5, '#f08a95') + dot(224, 80, 3.5, C.warm) + dot(236, 80, 3.5, C.mint) +
        '<text x="214" y="122" font-family="Geist Mono,monospace" font-size="24" font-weight="600" fill="' + C.sky + '">&lt;/&gt;</text>' +
        '<rect x="270" y="104" width="62" height="6" rx="3" fill="' + C.left + '"/><rect x="270" y="118" width="44" height="6" rx="3" fill="' + C.top + '"/><rect x="214" y="138" width="118" height="6" rx="3" fill="rgba(191,224,255,.35)"/><rect x="214" y="152" width="80" height="6" rx="3" fill="rgba(191,224,255,.25)"/>');
      var cloud = '<g class="fl2"><path d="M76 92a22 22 0 0 1 40-12 18 18 0 0 1 26 16 14 14 0 0 1-2 28H82a16 16 0 0 1-6-32z" fill="url(#IDgl)" opacity=".9"/></g>';
      var cube = box(262, 236, 22, 30, { top: C.warm, left: '#c9913e', right: '#9c6b24' });
      return srv + leds + cube + win + cloud;
    },
    pharma: function () {
      var capsule = '<g class="fl" transform="rotate(-32 150 130)"><rect x="104" y="112" width="92" height="38" rx="19" fill="' + C.sky + '"/><path d="M150 112h27a19 19 0 0 1 0 38h-27z" fill="' + C.left + '"/><rect x="112" y="118" width="30" height="6" rx="3" fill="#fff" opacity=".6"/></g>';
      var hex = function (cx, cy, r) { var pts = []; for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return pts; };
      var h = hex(268, 104, 30), mol = '<g class="fl2"><polygon points="' + P(h) + '" fill="none" stroke="' + C.top + '" stroke-width="3"/>' +
        '<line x1="' + h[0][0] + '" y1="' + h[0][1] + '" x2="' + (h[0][0] + 30) + '" y2="' + (h[0][1] + 14) + '" stroke="' + C.top + '" stroke-width="3"/>' +
        '<line x1="' + h[4][0] + '" y1="' + h[4][1] + '" x2="' + (h[4][0] + 6) + '" y2="' + (h[4][1] - 30) + '" stroke="' + C.top + '" stroke-width="3"/>' +
        h.map(function (p, i) { return dot(p[0], p[1], 6, i % 2 ? C.mint : C.sky); }).join('') + dot(h[0][0] + 30, h[0][1] + 14, 7, C.warm, true) + dot(h[4][0] + 6, h[4][1] - 30, 6, C.sky) + '</g>';
      var shield = '<g><path d="M200 128l46 16v34c0 26-20 42-46 50-26-8-46-24-46-50v-34z" fill="url(#IDgl)" opacity=".95" transform="translate(0,4)"/><path d="M182 182l13 13 25-27" fill="none" stroke="#0b2547" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,4)"/></g>';
      return box(200, 236, 46, 8, { top: '#1f5fa8', left: '#123a6b', right: '#0b2547' }) + shield + capsule + mol;
    },
    ladder: function () {
      var s = '', steps = [[104, 250, 30], [148, 228, 52], [192, 206, 76], [236, 184, 100], [280, 162, 124]];
      steps.forEach(function (st, i) { s += box(st[0], st[1], 26, st[2], i === 4 ? { top: C.sky } : null); });
      var flag = '<g class="fl"><line x1="280" y1="' + (162 - 124 - 14) + '" x2="280" y2="' + (162 - 124 - 64) + '" stroke="' + C.sky + '" stroke-width="3"/><path d="M280 ' + (162 - 124 - 64) + 'h40l-10 12 10 12h-40z" fill="' + C.warm + '"/></g>';
      var figure = '<g class="fl2">' + dot(236, 184 - 100 - 34, 9, C.sky) + '<path d="M226 ' + (184 - 100 - 6) + 'q10 -18 20 0z" fill="' + C.left + '"/></g>';
      var sparkles = dot(84, 96, 3, C.sky, true) + dot(330, 210, 3, C.mint, true) + dot(140, 60, 2.5, C.warm, true);
      return s + flag + figure + sparkles;
    }
  };

  function render(kind) {
    var id = 'il' + (++uid) + '_', body = (scenes[kind] || scenes.ladder)();
    return '<svg class="illo" viewBox="0 0 400 300" role="img" aria-hidden="true" focusable="false">' +
      defs(id) + platform(id) + body.replace(/IDcard/g, id + 'card').replace(/IDblur/g, id + 'blur').replace(/IDgl/g, id + 'gl') + '</svg>';
  }
  window.ARZON_ILLO = { render: render, kinds: Object.keys(scenes) };
})();
