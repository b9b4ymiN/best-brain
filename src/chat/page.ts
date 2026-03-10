export function renderChatPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>best-brain chat</title>
    <style>
      :root {
        --bg: #f4efe6;
        --panel: #fffaf1;
        --ink: #1f1b16;
        --muted: #6d655b;
        --line: #d5c8b3;
        --accent: #9f4f16;
        --accent-soft: #f0d9c7;
        --good: #24613a;
        --warn: #8a2f1f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(159,79,22,0.12), transparent 30%),
          linear-gradient(180deg, #faf6ef, var(--bg));
        color: var(--ink);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 24px;
        display: grid;
        gap: 20px;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--panel);
        padding: 18px;
        box-shadow: 0 12px 30px rgba(31,27,22,0.06);
      }
      .hero {
        display: grid;
        gap: 8px;
      }
      .hero p, .meta, .small { color: var(--muted); }
      textarea, button {
        width: 100%;
        font: inherit;
      }
      textarea {
        min-height: 92px;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 14px;
        background: #fffdf8;
        color: var(--ink);
        resize: vertical;
      }
      button {
        border: none;
        border-radius: 14px;
        padding: 12px 16px;
        background: var(--accent);
        color: white;
        font-weight: 600;
        cursor: pointer;
      }
      .thread {
        display: grid;
        gap: 14px;
      }
      .bubble {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px;
        background: #fffdf8;
        display: grid;
        gap: 10px;
      }
      .bubble.user {
        background: linear-gradient(135deg, #fff5e8, #fffaf1);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        background: #efe7da;
        font-size: 12px;
      }
      .chip.good { color: var(--good); background: rgba(36,97,58,0.12); }
      .chip.warn { color: var(--warn); background: rgba(138,47,31,0.12); }
      .links {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, monospace;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel hero">
        <h1>best-brain chat</h1>
        <p>Ask normally. The AI manager decides whether to answer directly, do light work, or turn the request into a mission internally.</p>
        <div class="links">
          <a href="/control-room">Open control room</a>
        </div>
      </section>

      <section class="panel">
        <div style="display:grid; gap:12px;">
          <textarea id="message" placeholder="ถามได้เลย เช่น วันนี้วันอะไร หรือ อยากได้ระบบสแกนหุ้นที่ตรงกับแนวลงทุนของฉัน"></textarea>
          <button id="send">Send</button>
        </div>
      </section>

      <section id="thread" class="thread"></section>
    </main>

    <script>
      const thread = document.getElementById('thread');
      const messageEl = document.getElementById('message');

      function escapeHtml(value) {
        return value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
      }

      function addUserBubble(message) {
        const card = document.createElement('section');
        card.className = 'bubble user';
        card.innerHTML = '<strong>You</strong><pre>' + escapeHtml(message) + '</pre>';
        thread.prepend(card);
      }

      function addAssistantBubble(payload) {
        const card = document.createElement('section');
        card.className = 'bubble';
        const showMissionMeta = payload.decision_kind !== 'chat';
        const chips = showMissionMeta
          ? [
              '<span class="chip">' + payload.decision_kind + '</span>',
              payload.mission_status ? '<span class="chip ' + (payload.mission_status === 'verified_complete' ? 'good' : 'warn') + '">' + payload.mission_status + '</span>' : '',
              payload.blocked_reason ? '<span class="chip warn">blocked</span>' : '',
            ].filter(Boolean).join('')
          : '';
        const links = payload.control_room_path
          ? '<div class="links"><a href="' + payload.control_room_path + '">Inspect in control room</a></div>'
          : '';
        const meta = showMissionMeta
          ? ('<div class="chips">' + chips + '</div>'
            + (payload.blocked_reason ? '<div class="small">Blocked reason: ' + escapeHtml(payload.blocked_reason) + '</div>' : ''))
          : '';
        card.innerHTML = ''
          + '<strong>best-brain</strong>'
          + meta
          + '<pre>' + escapeHtml(payload.answer) + '</pre>'
          + links;
        thread.prepend(card);
      }

      async function sendMessage() {
        const message = messageEl.value.trim();
        if (!message) return;
        addUserBubble(message);
        messageEl.value = '';

        const response = await fetch('/chat/api/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message }),
        });
        const payload = await response.json();
        if (!response.ok) {
          addAssistantBubble({
            answer: payload.error || 'Request failed.',
            decision_kind: 'chat',
            blocked_reason: payload.error || null,
            mission_status: null,
            control_room_path: null,
            trace_id: 'n/a',
            citations: [],
          });
          return;
        }
        addAssistantBubble(payload);
      }

      document.getElementById('send').addEventListener('click', sendMessage);
      messageEl.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          sendMessage();
        }
      });
    </script>
  </body>
</html>`;
}
