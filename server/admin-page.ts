export const adminPageHtml = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ibiza Reise-Cockpit — Admin</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif; background: #f4f1ea; color: #22322d; }
  header { padding: 20px 28px; border-bottom: 1px solid #dedbd2; background: #fffdf8; }
  header h1 { margin: 0; font-size: 18px; }
  header p { margin: 4px 0 0; color: #718079; font-size: 12px; }
  main { max-width: 900px; margin: 24px auto; padding: 0 20px 60px; }
  textarea { width: 100%; height: 60vh; font-family: ui-monospace, monospace; font-size: 12px; padding: 14px; border: 1px solid #dedbd2; border-radius: 8px; background: #fffdf8; color: #22322d; }
  .actions { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
  button { border: 0; background: #d95845; color: white; padding: 10px 18px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; }
  button.secondary { background: transparent; border: 1px solid #dedbd2; color: #22322d; }
  button:disabled { opacity: .5; cursor: default; }
  .message { margin-top: 12px; font-size: 13px; padding: 10px 14px; border-radius: 6px; white-space: pre-wrap; }
  .message.error { background: #f7e5e1; color: #a13a26; }
  .message.success { background: #dbe9de; color: #365a44; }
</style>
</head>
<body>
<header>
  <h1>Ibiza Reise-Cockpit — Admin</h1>
  <p>Reisedaten als JSON bearbeiten. Änderungen werden serverseitig validiert und mit Backup gespeichert.</p>
</header>
<main>
  <textarea id="editor" spellcheck="false"></textarea>
  <div class="actions">
    <button id="save">Speichern</button>
    <button id="reload" class="secondary">Neu laden</button>
    <span id="status"></span>
  </div>
  <div id="message"></div>
</main>
<script>
  const editor = document.getElementById("editor");
  const messageEl = document.getElementById("message");
  const saveBtn = document.getElementById("save");
  const reloadBtn = document.getElementById("reload");

  function showMessage(text, kind) {
    messageEl.textContent = text;
    messageEl.className = "message " + kind;
  }

  async function load() {
    showMessage("Lädt …", "success");
    const response = await fetch("/api/trip", { cache: "no-store" });
    const data = await response.json();
    editor.value = JSON.stringify(data, null, 2);
    showMessage("", "success");
  }

  saveBtn.addEventListener("click", async () => {
    let parsed;
    try {
      parsed = JSON.parse(editor.value);
    } catch (error) {
      showMessage("Ungültiges JSON: " + error.message, "error");
      return;
    }
    saveBtn.disabled = true;
    try {
      const response = await fetch("/admin/api/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await response.json();
      if (!response.ok) {
        showMessage("Fehler: " + body.error, "error");
      } else {
        editor.value = JSON.stringify(body.trip, null, 2);
        showMessage("Gespeichert.", "success");
      }
    } catch (error) {
      showMessage("Netzwerkfehler: " + error.message, "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  reloadBtn.addEventListener("click", load);
  load();
</script>
</body>
</html>
`;
