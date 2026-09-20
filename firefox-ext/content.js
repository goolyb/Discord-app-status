function ping() {
  if (document.hidden) return;
  try {
    browser.runtime.sendMessage({ type: "wakeup" }).catch(() => {});
  } catch {}
}

ping();

document.addEventListener("visibilitychange", ping);
window.addEventListener("pageshow", ping);
window.addEventListener("hashchange", ping);
window.addEventListener("popstate", ping);

const origPush = history.pushState;
history.pushState = function (...args) {
  origPush.apply(this, args);
  ping();
};
const origReplace = history.replaceState;
history.replaceState = function (...args) {
  origReplace.apply(this, args);
  ping();
};

setInterval(ping, 3000);
