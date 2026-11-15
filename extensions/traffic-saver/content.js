(() => {
  if (window.__morphTrafficSaver) return;
  try { Object.defineProperty(window, '__morphTrafficSaver', { value: true }); } catch {}

  // Autoplay is a large hidden proxy cost. Media may start only after the user interacts with the page.
  try {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      const active = navigator.userActivation && navigator.userActivation.hasBeenActive;
      if (!active) {
        return Promise.reject(new DOMException('Autoplay paused by Morph Traffic Saver', 'NotAllowedError'));
      }
      return originalPlay.apply(this, args);
    };
  } catch {}

  // A hidden tab that keeps playing video keeps downloading. Pause it until the tab is visible again.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const media of document.querySelectorAll('video,audio')) {
      try { media.pause(); } catch {}
    }
  });

  // Speculative prefetch/prerender pulls full pages the user may never open.
  const strip = (root) => {
    if (!root || !root.querySelectorAll) return;
    for (const link of root.querySelectorAll('link[rel="prefetch"],link[rel="prerender"]')) link.remove();
  };
  const start = () => {
    strip(document);
    if (!document.documentElement) return;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) strip(node);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
