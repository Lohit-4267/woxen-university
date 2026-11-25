/* Isometric SVG illustrations, generated in code so they stay sharp, tiny and on-palette.
   window.ARZON_ILLO.render(kind) → SVG string. kinds: business, data, events, scholarship, ladder */
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
    events: function () {
      var beam = '<polygon points="70,10 120,10 236,214 116,236" fill="url(#IDgl)" opacity=".16"/>';
      var cal = card(70, 46, 112, 104,
        '<rect x="70" y="46" width="112" height="28" rx="12" fill="#e5484d"/><rect x="70" y="62" width="112" height="12" fill="#e5484d"/>' +
        '<circle cx="96" cy="46" r="4" fill="' + C.sky + '"/><circle cx="156" cy="46" r="4" fill="' + C.sky + '"/>' +
        '<text x="126" y="122" text-anchor="middle" font-family="Geist,system-ui,sans-serif" font-weight="700" font-size="40" fill="#fff">19</text>' +
        '<text x="126" y="140" text-anchor="middle" font-family="Geist Mono,monospace" font-size="10" letter-spacing="2" fill="' + C.sky + '">SKILL SPRINT</text>', 'fl');
      var stage = box(200, 230, 70, 10, { top: '#1f5fa8', left: '#123a6b', right: '#0b2547' });
      var mic = '<g><line x1="214" y1="216" x2="214" y2="150" stroke="' + C.top + '" stroke-width="4" stroke-linecap="round"/>' +
        '<ellipse cx="214" cy="218" rx="16" ry="6" fill="' + C.left + '"/>' +
        '<rect x="203" y="112" width="22" height="40" rx="11" fill="url(#IDgl)"/><line x1="203" y1="128" x2="225" y2="128" stroke="#0b2547" stroke-width="2" opacity=".5"/>' +
        '<path d="M197 138a17 17 0 0 0 34 0" fill="none" stroke="' + C.top + '" stroke-width="3"/></g>';
      var trophy = '<g class="fl2"><path d="M282 104h50v14a25 25 0 0 1-50 0z" fill="' + C.warm + '"/>' +
        '<path d="M282 110h-10a10 10 0 0 0 12 16M332 110h10a10 10 0 0 1-12 16" fill="none" stroke="' + C.warm + '" stroke-width="4"/>' +
        '<rect x="301" y="142" width="12" height="12" fill="#c9913e"/><rect x="292" y="154" width="30" height="8" rx="2" fill="' + C.warm + '"/>' +
        '<path d="M300 112l7 5 7-5" fill="none" stroke="#fff3dc" stroke-width="2" opacity=".7"/></g>';
      var chairs = box(140, 250, 14, 12, { top: '#7fbcef' }) + box(176, 266, 14, 12, { top: '#7fbcef' }) + box(266, 250, 14, 12, { top: '#7fbcef' });
      var sparks = dot(350, 60, 3, C.sky, true) + dot(60, 190, 2.5, C.warm, true) + dot(250, 70, 2.5, C.mint, true);
      return beam + stage + chairs + mic + cal + trophy + sparks;
    },
    scholarship: function () {
      var coin = function (x, y) { return '<g><rect x="' + (x - 30) + '" y="' + (y - 8) + '" width="60" height="8" fill="#c9913e"/><ellipse cx="' + x + '" cy="' + y + '" rx="30" ry="12" fill="#9c6b24"/><ellipse cx="' + x + '" cy="' + (y - 8) + '" rx="30" ry="12" fill="' + C.warm + '"/><ellipse cx="' + x + '" cy="' + (y - 8) + '" rx="20" ry="7" fill="none" stroke="#fff3dc" stroke-width="1.5" opacity=".7"/></g>'; };
      var stack = ''; for (var i = 0; i < 5; i++) stack += coin(140, 232 - i * 10);
      var stack2 = ''; for (var j = 0; j < 3; j++) stack2 += coin(196, 252 - j * 10);
      var books = box(262, 224, 44, 16, { top: '#e9eef7', left: C.left, right: C.right }) + box(262, 208, 38, 16, { top: '#e9eef7', left: '#6cc9a4', right: '#3f9a78' });
      var cap = '<g class="fl"><polygon points="' + P([[262, 142], [318, 164], [262, 186], [206, 164]]) + '" fill="#123a6b"/>' +
        '<polygon points="' + P([[236, 172], [236, 190], [262, 200], [288, 190], [288, 172], [262, 182]]) + '" fill="#0b2547"/>' +
        '<polygon points="' + P([[262, 142], [318, 164], [262, 186], [206, 164]]) + '" fill="none" stroke="' + C.top + '" stroke-width="1.5" opacity=".6"/>' +
        '<line x1="262" y1="164" x2="300" y2="176" stroke="' + C.warm + '" stroke-width="2.5"/><line x1="300" y1="176" x2="300" y2="198" stroke="' + C.warm + '" stroke-width="2.5"/>' + dot(300, 200, 4, C.warm) + dot(262, 164, 4, C.warm) + '</g>';
      var medal = '<g class="fl2"><path d="M86 54l14 30M114 54l-14 30" stroke="' + C.left + '" stroke-width="8"/>' +
        '<circle cx="100" cy="102" r="24" fill="' + C.warm + '"/><circle cx="100" cy="102" r="17" fill="none" stroke="#fff3dc" stroke-width="2" opacity=".75"/>' +
        '<path d="M100 90l3.5 7.5 8 .8-6 5.4 1.8 8-7.3-4.2-7.3 4.2 1.8-8-6-5.4 8-.8z" fill="#fff3dc"/></g>';
      var sparks = dot(340, 80, 3, C.sky, true) + dot(170, 70, 2.5, C.warm, true) + dot(350, 230, 2.5, C.mint, true);
      return stack2 + stack + books + cap + medal + sparks;
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
