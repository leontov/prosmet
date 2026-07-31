import { mkdir, writeFile } from "node:fs/promises";
await mkdir(new URL("../dist", import.meta.url), { recursive: true });
await writeFile(new URL("../dist/index.html", import.meta.url), `<!doctype html>
<html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Просметчик</title>
<style>html,body{height:100%;margin:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20201e}.root{height:100%;display:grid;place-items:center}.mark{width:42px;height:42px;border-radius:14px;background:#232321;color:white;display:grid;place-items:center;font-weight:700;margin:auto}.muted{color:#777770;font-size:13px;margin-top:14px}</style></head>
<body><div class="root"><div><div class="mark">П</div><div class="muted">Открываем защищённое рабочее пространство…</div></div></div>
<script>const origin=localStorage.getItem("prosmet.origin")||"https://kolibriai.online";location.replace(origin);</script></body></html>`);
