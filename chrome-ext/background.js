const api = globalThis.browser ?? globalThis.chrome;
const ENDPOINT = "http://127.0.0.1:6060/url";

let lastSent = "";
let timer = null;

async function currentUrl() {
  try {
    const wins = await api.windows.getAll({ populate: false });
    const focused = wins.find((w) => w.focused);
    const query = focused
      ? { active: true, windowId: focused.id }
      : { active: true, lastFocusedWindow: true };
    const tabs = await api.tabs.query(query);
    const tab = tabs[0];
    return tab && tab.url ? tab.url : "";
  } catch {
    return "";
  }
}

async function report() {
  const url = await currentUrl();
  if (url === lastSent) return;
  lastSent = url;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: url,
    });
  } catch {}
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(report, 150);
}

api.tabs.onActivated.addListener(schedule);
api.tabs.onUpdated.addListener((id, info) => {
  if (info.url || info.status === "complete") schedule();
});
api.windows.onFocusChanged.addListener(schedule);

report();
