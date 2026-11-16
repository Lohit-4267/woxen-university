/* Interactive 3D hero: a faceted crystal (the "skill core") with orbiting career rings and a particle field.
   Loads three.js lazily after the page is interactive. Falls back to the static emblem when WebGL is
   unavailable or the visitor prefers reduced motion. Pauses when off-screen or the tab is hidden. */
(function () {
  'use strict';
  var host = document.querySelector('.form-side');
  if (!host) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { var c = document.createElement('canvas'); if (!(c.getContext('webgl2') || c.getContext('webgl'))) return; } catch (_) { return; }
  var conn = navigator.connection; if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;

  var THREE_URL = '/vendor/three-r128.min.js'; // self-hosted (MIT, see /vendor/three-LICENSE.txt)
  function load(cb) {
    if (window.THREE) return cb();
    var s = document.createElement('script'); s.src = THREE_URL; s.async = true;
    s.onload = cb; document.head.appendChild(s);
  }
  var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 600); };
  if (document.readyState === 'complete') idle(function () { load(init); });
  else addEventListener('load', function () { idle(function () { load(init); }); });

  function init() {
    var THREE = window.THREE; if (!THREE) return;
    var wrap = document.createElement('div'); wrap.className = 'hero3d'; wrap.setAttribute('aria-hidden', 'true');
    host.insertBefore(wrap, host.firstChild);

    var mobile = matchMedia('(max-width:1000px)').matches;
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    wrap.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, mobile ? 8.4 : 9.5);

    var world = new THREE.Group(); scene.add(world);

    // Lights
    scene.add(new THREE.AmbientLight(0x6f8fb8, 0.55));
    var key = new THREE.DirectionalLight(0xdcecff, 1.15); key.position.set(3, 4, 5); scene.add(key);
    var rim = new THREE.PointLight(0x3d8ade, 2.2, 20); rim.position.set(-4, -2, 3); scene.add(rim);
    var warm = new THREE.PointLight(0xe9b872, 0.9, 14); warm.position.set(4, -3, -2); scene.add(warm);

    // Core crystal
    var coreGeo = new THREE.IcosahedronGeometry(1.25, 0);
    var core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({
      color: 0x2f7fd8, emissive: 0x0b2a52, emissiveIntensity: 0.6, metalness: 0.35, roughness: 0.22, flatShading: true,
      transparent: true, opacity: 0.92
    }));
    world.add(core);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(coreGeo), new THREE.LineBasicMaterial({ color: 0x9cc9f3, transparent: true, opacity: 0.75 }));
    core.add(edges);
    // Outer wire shell
    var shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.75, 1)),
      new THREE.LineBasicMaterial({ color: 0x7fbcef, transparent: true, opacity: 0.16 }));
    world.add(shell);
    // Inner glow
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.85 }));
    world.add(glow);
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(120,185,245,0.55)', 'rgba(120,185,245,0)'), depthWrite: false, transparent: true }));
    halo.scale.set(6, 6, 1); world.add(halo);

    // Orbit rings with travelling nodes (each node = a career track)
    var rings = [];
    var defs = [
      { r: 2.35, tilt: [1.15, 0.2, 0], speed: 0.22, nodes: [0x9cc9f3, 0x4a93e3, 0xffffff] },
      { r: 2.85, tilt: [1.35, -0.55, 0.3], speed: -0.16, nodes: [0x7fbcef, 0xe9b872] },
      { r: 3.35, tilt: [0.95, 0.75, -0.2], speed: 0.11, nodes: [0x4a93e3, 0x9cc9f3, 0x6cc9a4] }
    ];
    defs.forEach(function (d) {
      var g = new THREE.Group(); g.rotation.set(d.tilt[0], d.tilt[1], d.tilt[2]);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.007, 8, 160), new THREE.MeshBasicMaterial({ color: 0x9cc9f3, transparent: true, opacity: 0.32 }));
      g.add(ring);
      var nodes = d.nodes.map(function (col, i) {
        var n = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 16), new THREE.MeshBasicMaterial({ color: col }));
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(hexA(col, 0.9), hexA(col, 0)), depthWrite: false, transparent: true }));
        s.scale.set(0.55, 0.55, 1); n.add(s);
        n.userData.a = (i / d.nodes.length) * Math.PI * 2; g.add(n); return n;
      });
      world.add(g); rings.push({ g: g, r: d.r, speed: d.speed, nodes: nodes });
    });

    // Particle field
    var N = mobile ? 160 : 320, pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var rr = 3.6 + Math.random() * 3.2, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = rr * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(th) * 0.7; pos[i * 3 + 2] = rr * Math.cos(ph) * 0.6;
    }
    var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.05, color: 0xbfdcf7, transparent: true, opacity: 0.7, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), depthWrite: false }));
    scene.add(points);

    // Pointer parallax
    var tx = 0, ty = 0, cx = 0, cy = 0;
    addEventListener('pointermove', function (e) { tx = (e.clientX / innerWidth - 0.5) * 0.6; ty = (e.clientY / innerHeight - 0.5) * 0.4; }, { passive: true });

    function resize() {
      var w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap); else addEventListener('resize', resize);
    resize();

    var visible = true, running = false, t0 = performance.now(), last = t0;
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; kick(); }).observe(wrap);
    document.addEventListener('visibilitychange', kick);
    function kick() { if (visible && !document.hidden && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

    function frame(now) {
      if (!visible || document.hidden) { running = false; return; }
      var dt = Math.min(0.05, (now - last) / 1000), t = (now - t0) / 1000; last = now;
      core.rotation.x += dt * 0.25; core.rotation.y += dt * 0.38;
      shell.rotation.y -= dt * 0.08; shell.rotation.z += dt * 0.04;
      var pulse = 1 + Math.sin(t * 2) * 0.06; glow.scale.setScalar(pulse); halo.material.opacity = 0.75 + Math.sin(t * 2) * 0.15;
      rings.forEach(function (R) {
        R.g.rotation.z += dt * R.speed * 0.4;
        R.nodes.forEach(function (n) { n.userData.a += dt * R.speed * 2; n.position.set(Math.cos(n.userData.a) * R.r, Math.sin(n.userData.a) * R.r, 0); });
      });
      points.rotation.y += dt * 0.03;
      cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
      world.rotation.y = cx; world.rotation.x = cy; world.position.y = Math.sin(t * 0.8) * 0.08;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    kick();
    requestAnimationFrame(function () { wrap.classList.add('on'); host.classList.add('has3d'); });

    function radialTexture(inner, outer) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64; var x = cv.getContext('2d');
      var g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(1, outer);
      x.fillStyle = g; x.fillRect(0, 0, 64, 64); var tex = new THREE.CanvasTexture(cv); return tex;
    }
    function hexA(hex, a) { return 'rgba(' + ((hex >> 16) & 255) + ',' + ((hex >> 8) & 255) + ',' + (hex & 255) + ',' + a + ')'; }
  }
})();
