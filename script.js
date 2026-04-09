const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, Number(delay));
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));

document.querySelectorAll('.code-block__copy').forEach((btn) => {
  btn.addEventListener('click', () => {
    const code = btn.closest('.code-block').querySelector('code');
    const text = code.innerText;
    navigator.clipboard.writeText(text).then(() => {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E63946" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
      }, 2000);
    });
  });
});

const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 50) {
    nav.style.borderBottomColor = 'rgba(30,30,46,0.8)';
    nav.style.background = 'rgba(10,10,15,0.95)';
  } else {
    nav.style.borderBottomColor = 'rgba(30,30,46,0.3)';
    nav.style.background = 'rgba(10,10,15,0.8)';
  }
}, { passive: true });

const terminal = document.querySelector('.terminal__body');
if (terminal) {
  terminal.addEventListener('click', () => {
    const lines = terminal.querySelectorAll('.terminal__line');
    lines.forEach((line) => {
      line.style.animation = 'none';
      line.offsetHeight;
      line.style.animation = '';
    });
  });
}

(function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const PARTICLE_COUNT = 600;
  const NOISE_INTENSITY = 0.003;
  const TRAIL_LENGTH = 20;
  const SPEED = 1.8;

  const perm = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,
    36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,
    62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,
    171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
    60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,
    216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,
    100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,
    82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,
    248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,
    108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,
    210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,
    199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,
    114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];

  const p = new Array(512);
  for (let i = 0; i < 256; i++) p[256 + i] = p[i] = perm[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function noise3(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(w,
      lerp(v,
        lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
        lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
      lerp(v,
        lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
        lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();

  function spawnParticle() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    return {
      trail: Array.from({ length: TRAIL_LENGTH }, () => ({ x, y })),
      life: Math.random() * 200,
      maxLife: 200 + Math.random() * 100,
      width: 0.4 + Math.random() * 1.2,
    };
  }

  const particles = Array.from({ length: PARTICLE_COUNT }, spawnParticle);

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const time = Date.now() * 0.0001;

    for (const pt of particles) {
      pt.life += 1;
      if (pt.life > pt.maxLife) {
        const fresh = spawnParticle();
        pt.trail = fresh.trail;
        pt.life = 0;
        pt.maxLife = fresh.maxLife;
        pt.width = fresh.width;
      }

      const head = pt.trail[0];
      const n = noise3(head.x * NOISE_INTENSITY, head.y * NOISE_INTENSITY, time);
      const angle = n * Math.PI * 4;
      const nx = head.x + Math.cos(angle) * SPEED;
      const ny = head.y + Math.sin(angle) * SPEED;

      pt.trail.pop();
      pt.trail.unshift({
        x: nx < 0 ? canvas.width : nx > canvas.width ? 0 : nx,
        y: ny < 0 ? canvas.height : ny > canvas.height ? 0 : ny,
      });

      const lifeAlpha = Math.sin((pt.life / pt.maxLife) * Math.PI);

      ctx.beginPath();
      ctx.moveTo(pt.trail[0].x, pt.trail[0].y);
      for (let i = 1; i < pt.trail.length; i++) {
        const prev = pt.trail[i - 1];
        const curr = pt.trail[i];
        if (Math.abs(prev.x - curr.x) > canvas.width / 2 || Math.abs(prev.y - curr.y) > canvas.height / 2) {
          ctx.moveTo(curr.x, curr.y);
        } else {
          ctx.lineTo(curr.x, curr.y);
        }
      }
      ctx.strokeStyle = `rgba(251, 121, 98, ${lifeAlpha * 0.3})`;
      ctx.lineWidth = pt.width;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    requestAnimationFrame(animate);
  }

  animate();
  window.addEventListener('resize', resize);
})();
