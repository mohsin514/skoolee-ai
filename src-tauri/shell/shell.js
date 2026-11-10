// SKAI-736 desktop shell: health-check the hosted Skoolee AI app, then load it.
// The shell holds no data; all reads and writes go through the hosted app, so
// a reconnect never replays or duplicates an operation.
(function () {
  var APP_URL = "https://dev.skooleeai.com"; // change per release channel, see docs/operations/desktop-tauri.md
  var MAX_ATTEMPTS = 5;
  var TIMEOUT_MS = 8000;
  var statusEl = document.getElementById("status");
  var retryEl = document.getElementById("retry");
  var attempt = 0;

  function check() {
    attempt += 1;
    statusEl.textContent = "Connecting to Skoolee AI… (" + attempt + "/" + MAX_ATTEMPTS + ")";
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    fetch(APP_URL + "/login", { method: "HEAD", mode: "no-cors", cache: "no-store", signal: ctrl.signal })
      .then(function () { clearTimeout(timer); window.location.replace(APP_URL); })
      .catch(function () {
        clearTimeout(timer);
        if (attempt < MAX_ATTEMPTS) { setTimeout(check, Math.min(1000 * Math.pow(2, attempt), 15000)); return; }
        statusEl.textContent = "Skoolee AI can't be reached. Check your connection and try again.";
        retryEl.hidden = false;
        retryEl.focus();
      });
  }

  retryEl.addEventListener("click", function () { retryEl.hidden = true; attempt = 0; check(); });
  window.addEventListener("online", function () { if (!retryEl.hidden) { retryEl.hidden = true; attempt = 0; check(); } });
  check();
})();
