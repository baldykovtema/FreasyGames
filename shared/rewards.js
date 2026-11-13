'use strict';
// Rewarded ads for FreasyGames and FreasyGames 3D: "watch an ad — get a reward" buttons on top of
// Google AdSense H5 Games ads (the Ad Placement API, adBreak({ type: 'reward' })).
//
// <script src="../shared/rewards.js"></script>          (3D games: ../../shared/rewards.js)
// const chance = FreasyRewards.offer({
//   host: '#over .box',                        // where the button goes
//   before: '#again',                          // optional: put it before this element (default: the first .play button)
//   name: 'liana-continue',                    // ad placement name, for AdSense reports
//   label: '🎬 Продолжить за рекламу',
//   onReward: () => { … },                     // the player watched the ad to the end
// });
// chance.show();   // ask AdSense for an ad; the button appears only if one is ready
// chance.hide();   // e.g. when a new game starts
//
// While AD_CLIENT is empty no ads are loaded and the buttons never appear, so the site works as before.
// For testing without AdSense open a game on localhost with ?adtest=1 — a fake 3-second "ad" is shown instead.
// The switch only works on a local server, so nobody can get rewards for free on the real site.
(() => {
  // The AdSense publisher id, like 'ca-pub-1234567890123456'.
  const AD_CLIENT = '';

  const params = new URLSearchParams(location.search);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let fake = false;
  if (local) {
    try {
      if (params.has('adtest')) localStorage.setItem('freasy-adtest', params.get('adtest') === '0' ? '0' : '1');
      fake = localStorage.getItem('freasy-adtest') === '1';
    } catch { fake = params.get('adtest') === '1'; }
  }

  const enabled = fake || !!AD_CLIENT;

  if (AD_CLIENT && !fake) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(AD_CLIENT);
    s.dataset.adClient = AD_CLIENT;
    if (local) s.dataset.adbreakTest = 'on';
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = window.adConfig || function (o) { window.adsbygoogle.push(o); };
    window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
  }

  const style = document.createElement('style');
  style.textContent = `
  .fr-reward { margin-top: 18px; width: 100%; font: inherit; font-family: Manrope, system-ui, sans-serif; font-size: 16px; font-weight: 800; color: #1b1405;
    background: linear-gradient(135deg, #ffe27a, #ffb84a); border: 0; border-radius: 14px; padding: 15px; cursor: pointer; box-shadow: 0 12px 35px #ffb84a40; }
  .fr-reward:hover { filter: brightness(1.06); }
  .fr-reward[hidden] { display: none; }
  .fr-reward + .play { margin-top: 10px; }
  .fr-fake { position: fixed; inset: 0; z-index: 100001; display: grid; place-items: center; background: #05060cee; color: #f8f7ff; font-family: Manrope, system-ui, sans-serif; text-align: center; }
  .fr-fake b { display: block; font-size: 22px; margin-bottom: 8px; }
  .fr-fake span { color: #b9b6c9; font-size: 14px; }
  .fr-fake button { margin-top: 18px; font: inherit; font-weight: 700; color: #d1cde5; background: none; border: 1px solid #ffffff2e; border-radius: 12px; padding: 10px 16px; cursor: pointer; }
  @media (max-height: 520px) and (orientation: landscape) { .fr-reward { margin-top: 10px; padding: 11px; } }`;
  document.head.appendChild(style);

  // A stand-in for the real ad while testing.
  function fakeAd(name, done) {
    const el = document.createElement('div');
    el.className = 'fr-fake';
    el.innerHTML = '<div><b>Тестовая реклама</b><span></span><br><button type="button">Закрыть без награды</button></div>';
    document.body.appendChild(el);
    let left = 3;
    const tick = () => { el.querySelector('span').textContent = `«${name}» · награда через ${left} с`; };
    tick();
    const t = setInterval(() => { left--; if (left <= 0) { clearInterval(t); el.remove(); done(true); } else tick(); }, 1000);
    el.querySelector('button').addEventListener('click', () => { clearInterval(t); el.remove(); done(false); });
    for (const k of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) el.addEventListener(k, (e) => e.stopPropagation());
  }

  let playing = false;
  function offer(opts) {
    const host = typeof opts.host === 'string' ? document.querySelector(opts.host) : opts.host;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fr-reward'; btn.hidden = true;
    btn.textContent = opts.label || '🎬 Награда за рекламу';
    if (host) host.insertBefore(btn, host.querySelector(opts.before || '.play'));

    // Taps on the button must not reach the game under it.
    for (const k of ['pointerdown', 'touchstart', 'mousedown']) btn.addEventListener(k, (e) => e.stopPropagation());
    let showAd = null, wanted = false, pending = false;
    const name = opts.name || 'reward';

    function rewarded() { btn.hidden = true; wanted = false; showAd = null; try { opts.onReward(); } catch (e) { console.error(e); } }
    function show() {
      if (!enabled || !host) return;
      // Already have an ad ready, or already asking for one: no second request.
      if (fake || showAd) { wanted = true; btn.hidden = false; return; }
      wanted = true;
      if (pending) return;
      pending = true;
      window.adBreak({
        type: 'reward', name,
        beforeAd: () => { playing = true; window.dispatchEvent(new Event('freasy-ad-start')); },
        afterAd: () => { playing = false; window.dispatchEvent(new Event('freasy-ad-end')); },
        // An ad is ready: only now is the button shown.
        beforeReward: (fn) => { pending = false; showAd = fn; if (wanted) btn.hidden = false; },
        adDismissed: () => { btn.hidden = true; },
        adViewed: rewarded,
        adBreakDone: () => { pending = false; if (!showAd) btn.hidden = true; },

      });
    }
    function hide() { wanted = false; btn.hidden = true; showAd = null; }
    btn.addEventListener('click', () => {
      if (playing) return;
      if (fake) { btn.hidden = true; playing = true; window.dispatchEvent(new Event('freasy-ad-start')); fakeAd(name, (ok) => { playing = false; window.dispatchEvent(new Event('freasy-ad-end')); if (ok) rewarded(); else btn.hidden = false; }); return; }
      if (showAd) { const fn = showAd; showAd = null; btn.hidden = true; fn(); }
    });
    return { show, hide, button: btn };
  }

  window.FreasyRewards = { offer, enabled: () => enabled, playing: () => playing };
})();
