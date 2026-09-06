// Ad loader — the only place ads are configured. Every page carries one or more
// <div class="ad-slot"> placeholders; this script fills them (or hides them while
// unconfigured, so self-hosted copies stay ad-free).
//
// Setup, once AdSense approves airgappdf.com:
//   1. Put your publisher id in CLIENT and a display-unit id in SLOT.
//   2. Update ads.txt with the same publisher id.
//   3. EU/UK consent: turn on Google's built-in GDPR message in
//      AdSense → Privacy & messaging. It ships inside adsbygoogle.js, so no
//      extra banner code is needed here.
// Ads never see the user's files — processing stays in the page's own JS.
(function () {
  var CLIENT = 'ca-pub-XXXXXXXXXXXXXXXX';
  var SLOT = '0000000000';

  var slots = document.querySelectorAll('.ad-slot');
  if (!slots.length) return;
  if (/X{4}/.test(CLIENT) || !navigator.onLine) {
    slots.forEach(function (s) { s.hidden = true; });
    return;
  }

  var script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CLIENT;
  document.head.appendChild(script);

  slots.forEach(function (slot) {
    slot.textContent = '';
    slot.classList.add('ad-slot--live');
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', CLIENT);
    ins.setAttribute('data-ad-slot', SLOT);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    slot.appendChild(ins);
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
})();
