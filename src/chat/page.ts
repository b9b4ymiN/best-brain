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
      .hero p, .small { color: var(--muted); }
      .thread {
        display: grid;
        gap: 14px;
        min-height: 240px;
      }
      .composer {
        position: sticky;
        bottom: 0;
      }
      .composer-inner {
        display: grid;
        gap: 12px;
      }
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
      .bubble.pending {
        opacity: 0.85;
      }
      .label {
        font-weight: 700;
      }
      .message {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.6;
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

      <section id="thread" class="thread"></section>

      <section class="panel composer">
        <div class="composer-inner">
          <textarea id="message" placeholder="ถามได้เลย เช่น วันนี้วันอะไร หรือ อยากได้ระบบสแกนหุ้นที่ตรงกับแนวลงทุนของฉัน"></textarea>
          <button id="send">Send</button>
        </div>
      </section>
    </main>

    <script>
      const thread = document.getElementById('thread');
      const messageEl = document.getElementById('message');
      const sendButton = document.getElementById('send');

      function escapeHtml(value) {
        return value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
      }

      function addUserBubble(message) {
        const card = document.createElement('section');
        card.className = 'bubble user';
        card.innerHTML = '<div class="label">You</div><div class="message">' + escapeHtml(message) + '</div>';
        thread.appendChild(card);
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }

      function addPendingBubble() {
        const card = document.createElement('section');
        card.className = 'bubble pending';
        card.innerHTML = '<div class="label">best-brain</div><div class="message">กำลังคิด...</div>';
        thread.appendChild(card);
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
        return card;
      }

      function renderAssistantBubble(card, payload) {
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
        card.className = 'bubble';
        card.innerHTML = ''
          + '<div class="label">best-brain</div>'
          + meta
          + '<div class="message">' + escapeHtml(payload.answer) + '</div>'
          + links;
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }

      async function sendMessage() {
        const message = messageEl.value.trim();
        if (!message) return;
        addUserBubble(message);
        messageEl.value = '';
        sendButton.disabled = true;
        const pending = addPendingBubble();

        try {
          const response = await fetch('/chat/api/message', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message }),
          });
          const payload = await response.json();
          if (!response.ok) {
            renderAssistantBubble(pending, {
              answer: payload.error || 'Request failed.',
              decision_kind: 'chat',
              blocked_reason: payload.error || null,
              mission_status: null,
              control_room_path: null,
            });
            return;
          }
          renderAssistantBubble(pending, payload);
        } catch (error) {
          renderAssistantBubble(pending, {
            answer: error instanceof Error ? error.message : 'Request failed.',
            decision_kind: 'chat',
            blocked_reason: 'request_failed',
            mission_status: null,
            control_room_path: null,
          });
        } finally {
          sendButton.disabled = false;
          messageEl.focus();
        }
      }

      sendButton.addEventListener('click', sendMessage);
      messageEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });
    </script>
  </body>
</html>`;
}
