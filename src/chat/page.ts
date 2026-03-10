export function renderChatPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>best-brain chat</title>
    <style>
      :root {
        --bg: #0b0f14;
        --panel: #111823;
        --panel-strong: #0f151f;
        --panel-soft: #171f2c;
        --ink: #ecf2ff;
        --muted: #93a0b8;
        --line: #263248;
        --accent: #65b3ff;
        --accent-soft: rgba(101, 179, 255, 0.12);
        --good: #79d39d;
        --warn: #ffb86c;
        --bad: #ff8474;
        --shadow: 0 28px 70px rgba(0, 0, 0, 0.35);
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(101, 179, 255, 0.16), transparent 26%),
          radial-gradient(circle at top right, rgba(121, 211, 157, 0.08), transparent 22%),
          linear-gradient(180deg, #0a0e14, var(--bg));
        color: var(--ink);
        font-family: "Aptos", "Segoe UI Variable", "Segoe UI", sans-serif;
      }

      body {
        padding: 28px 18px 120px;
      }

      main {
        max-width: 1120px;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }

      .hero,
      .composer-card,
      .message-card {
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(17, 24, 35, 0.98), rgba(14, 20, 30, 0.98));
        border-radius: 24px;
        box-shadow: var(--shadow);
      }

      .hero {
        padding: 24px 24px 20px;
        display: grid;
        gap: 14px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font: 600 12px/1 "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        width: fit-content;
      }

      h1 {
        margin: 0;
        font-size: clamp(34px, 6vw, 56px);
        line-height: 0.96;
        letter-spacing: -0.04em;
      }

      .hero-copy {
        margin: 0;
        max-width: 780px;
        color: var(--muted);
        font-size: 17px;
        line-height: 1.7;
      }

      .hero-links {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      a.action-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: var(--ink);
        text-decoration: none;
        border: 1px solid rgba(255, 255, 255, 0.06);
        font-weight: 600;
      }

      .thread {
        display: grid;
        gap: 16px;
      }

      .message-card {
        padding: 18px;
        display: grid;
        gap: 14px;
      }

      .message-card.user {
        background: linear-gradient(180deg, rgba(21, 30, 44, 0.98), rgba(14, 20, 30, 0.98));
      }

      .message-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .identity {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .avatar {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(101, 179, 255, 0.14);
        color: var(--accent);
        border: 1px solid rgba(101, 179, 255, 0.24);
        font: 700 12px/1 "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        text-transform: uppercase;
      }

      .identity-title {
        display: grid;
        gap: 3px;
      }

      .identity-title strong {
        font-size: 16px;
      }

      .identity-title small {
        color: var(--muted);
      }

      .state-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
        color: var(--muted);
        font: 600 12px/1 "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      }

      .state-pill::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 0 0 rgba(101, 179, 255, 0.5);
        animation: pulse 1.4s infinite;
      }

      .state-pill.done::before {
        animation: none;
        background: var(--good);
        box-shadow: none;
      }

      .state-pill.warn::before {
        animation: none;
        background: var(--warn);
        box-shadow: none;
      }

      .state-pill.bad::before {
        animation: none;
        background: var(--bad);
        box-shadow: none;
      }

      .message-body {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.75;
        font-size: 16px;
      }

      .message-placeholder {
        color: var(--muted);
      }

      .message-body.empty {
        display: none;
      }

      .meta-row,
      .link-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .meta-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        font: 600 12px/1 "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        color: var(--muted);
      }

      .meta-chip.good {
        color: var(--good);
        background: rgba(121, 211, 157, 0.08);
      }

      .meta-chip.warn {
        color: var(--warn);
        background: rgba(255, 184, 108, 0.08);
      }

      .meta-chip.bad {
        color: var(--bad);
        background: rgba(255, 132, 116, 0.08);
      }

      .worklog {
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(8, 12, 19, 0.86), rgba(10, 14, 21, 0.96));
        overflow: hidden;
      }

      .worklog-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--muted);
        font: 600 12px/1 "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .worklog-items {
        display: grid;
        gap: 0;
        max-height: 260px;
        overflow: auto;
      }

      .worklog-entry {
        display: grid;
        grid-template-columns: 118px 96px 1fr;
        gap: 12px;
        padding: 12px 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.04);
        font: 13px/1.45 "Cascadia Code", "SFMono-Regular", Consolas, monospace;
      }

      .worklog-entry:first-child {
        border-top: none;
      }

      .worklog-time {
        color: #607089;
      }

      .worklog-actor {
        color: var(--accent);
        text-transform: lowercase;
      }

      .worklog-copy {
        display: grid;
        gap: 4px;
      }

      .worklog-copy strong {
        color: var(--ink);
        font-weight: 700;
      }

      .worklog-copy span {
        color: var(--muted);
      }

      .worklog-entry.info .worklog-actor {
        color: #c0ccde;
      }

      .worklog-entry.completed .worklog-actor {
        color: var(--good);
      }

      .worklog-entry.blocked .worklog-actor,
      .worklog-entry.failed .worklog-actor {
        color: var(--bad);
      }

      .composer-card {
        position: sticky;
        bottom: 18px;
        padding: 16px;
        background: linear-gradient(180deg, rgba(15, 21, 31, 0.98), rgba(11, 15, 22, 0.98));
        backdrop-filter: blur(16px);
      }

      .composer-grid {
        display: grid;
        gap: 12px;
      }

      .composer-note {
        color: var(--muted);
        font-size: 13px;
      }

      textarea,
      button {
        width: 100%;
        font: inherit;
      }

      textarea {
        min-height: 120px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
        color: var(--ink);
        resize: vertical;
        outline: none;
        line-height: 1.65;
      }

      textarea:focus {
        border-color: rgba(101, 179, 255, 0.55);
        box-shadow: 0 0 0 4px rgba(101, 179, 255, 0.12);
      }

      button {
        border: none;
        border-radius: 18px;
        padding: 14px 18px;
        background: linear-gradient(135deg, #4d8fd0, #67b6ff);
        color: #07131f;
        font-weight: 800;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }

      .empty-thread {
        border: 1px dashed rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        padding: 28px;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.02);
      }

      @keyframes pulse {
        0% {
          box-shadow: 0 0 0 0 rgba(101, 179, 255, 0.45);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(101, 179, 255, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(101, 179, 255, 0);
        }
      }

      @media (max-width: 760px) {
        body {
          padding: 18px 12px 120px;
        }

        .hero,
        .message-card,
        .composer-card {
          border-radius: 20px;
        }

        .worklog-entry {
          grid-template-columns: 1fr;
          gap: 5px;
        }

        .message-head {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">best-brain / live manager console</div>
        <h1>best-brain chat</h1>
        <p class="hero-copy">Ask normally. The AI manager decides whether to answer directly, do light work, or turn the request into a mission internally. While it works, you can see the manager, worker, and verifier steps in real time.</p>
        <div class="hero-links">
          <a class="action-link" href="/control-room">Open control room</a>
        </div>
      </section>

      <section id="thread" class="thread">
        <div class="empty-thread" id="emptyThread">Start with any question or goal. best-brain will show a live work log whenever it needs to think, dispatch a worker, or verify a result.</div>
      </section>

      <section class="composer-card">
        <div class="composer-grid">
          <textarea id="message" placeholder="Ask anything. Example: What is my name? / Please remember that I prefer concise reports. / I want a stock scanner that matches my investing style."></textarea>
          <div class="composer-note">No mode hints required. The AI manager chooses chat, task, or mission on its own.</div>
          <button id="send">Send</button>
        </div>
      </section>
    </main>

    <script>
      const thread = document.getElementById('thread');
      const emptyThread = document.getElementById('emptyThread');
      const messageEl = document.getElementById('message');
      const sendButton = document.getElementById('send');
      const decoder = new TextDecoder();
      const FENCE = String.fromCharCode(96).repeat(3);

      function ensureThreadStarted() {
        if (emptyThread) {
          emptyThread.remove();
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
      }

      function stripFence(value) {
        const trimmed = value.trim();
        if (!trimmed.startsWith(FENCE)) {
          return trimmed;
        }

        const normalized = trimmed
          .split('\\r\\n').join('\\n')
          .split('\\r').join('\\n');
        const lines = normalized.split('\\n');
        if (lines.length === 1) {
          return trimmed.split(FENCE).join('').trim();
        }

        const body = lines.slice(1, lines[lines.length - 1].trim() === FENCE ? -1 : undefined).join('\\n').trim();
        return body || trimmed.split(FENCE).join('').trim();
      }

      function extractAnswerFromJsonLines(value) {
        const lines = value
          .split(/\\r?\\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        let latestText = null;

        for (const line of lines) {
          try {
            const payload = JSON.parse(line);
            if (payload.type === 'result' && typeof payload.result === 'string' && payload.result.trim()) {
              latestText = payload.result.trim();
            }

            if (Array.isArray(payload.message && payload.message.content)) {
              const text = payload.message.content
                .filter((entry) => entry.type === 'text' && typeof entry.text === 'string')
                .map((entry) => entry.text)
                .join('')
                .trim();
              if (text) {
                latestText = text;
              }
            }

            if (payload.msg && payload.msg.type === 'agent_message' && typeof payload.msg.message === 'string' && payload.msg.message.trim()) {
              latestText = payload.msg.message.trim();
            }
          } catch {
            // Ignore non-JSON lines.
          }
        }

        return latestText;
      }

      function looksLikeInternalEventLog(value) {
        const trimmed = value.trim();
        return trimmed.startsWith('{"type":"system"')
          || trimmed.includes('"subtype":"init"')
          || trimmed.includes('"type":"assistant"')
          || trimmed.includes('"type":"result"')
          || trimmed.includes('"msg":{"type":"agent_message"');
      }

      function sanitizeAssistantAnswer(value) {
        const answer = typeof value === 'string' ? value.trim() : '';
        if (!answer) {
          return 'No displayable answer was produced. Try sending the message again.';
        }

        const extracted = extractAnswerFromJsonLines(answer);
        if (extracted) {
          return stripFence(extracted);
        }

        if (looksLikeInternalEventLog(answer)) {
          return 'No displayable answer was produced. Try sending the message again.';
        }

        return stripFence(answer);
      }

      function formatClock(value) {
        const date = new Date(typeof value === 'number' ? value : Date.now());
        return date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }

      function statusLabel(event) {
        if (!event) {
          return 'working';
        }

        if (event.status === 'completed') {
          return 'done';
        }
        if (event.status === 'blocked') {
          return 'blocked';
        }
        if (event.status === 'failed') {
          return 'needs repair';
        }
        return 'working';
      }

      function bubbleMetaChip(text, className) {
        const chip = document.createElement('span');
        chip.className = 'meta-chip' + (className ? ' ' + className : '');
        chip.textContent = text;
        return chip;
      }

      function addUserBubble(message) {
        ensureThreadStarted();
        const card = document.createElement('section');
        card.className = 'message-card user';
        card.innerHTML = ''
          + '<div class="message-head">'
          + '  <div class="identity">'
          + '    <div class="avatar">you</div>'
          + '    <div class="identity-title"><strong>You</strong><small>input</small></div>'
          + '  </div>'
          + '  <div class="state-pill done">sent</div>'
          + '</div>'
          + '<div class="message-body">' + escapeHtml(message) + '</div>';
        thread.appendChild(card);
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }

      function createAssistantBubble() {
        ensureThreadStarted();
        const card = document.createElement('section');
        card.className = 'message-card assistant pending';
        card.innerHTML = ''
          + '<div class="message-head">'
          + '  <div class="identity">'
          + '    <div class="avatar">bb</div>'
          + '    <div class="identity-title"><strong>best-brain</strong><small>manager-led response</small></div>'
          + '  </div>'
          + '  <div class="state-pill" data-role="state">working</div>'
          + '</div>'
          + '<div class="message-body message-placeholder" data-role="answer">Waiting for the next step...</div>'
          + '<div class="meta-row" data-role="meta"></div>'
          + '<div class="worklog">'
          + '  <div class="worklog-head"><span>Live activity</span><span data-role="activity-count">0 events</span></div>'
          + '  <div class="worklog-items" data-role="worklog"></div>'
          + '</div>'
          + '<div class="link-row" data-role="links"></div>';
        thread.appendChild(card);
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
        return {
          card,
          answer: card.querySelector('[data-role="answer"]'),
          meta: card.querySelector('[data-role="meta"]'),
          links: card.querySelector('[data-role="links"]'),
          worklog: card.querySelector('[data-role="worklog"]'),
          activityCount: card.querySelector('[data-role="activity-count"]'),
          state: card.querySelector('[data-role="state"]'),
          activitySeen: new Set(),
          activityTotal: 0,
        };
      }

      function appendStatusEvent(view, event) {
        if (!event || !view.worklog) {
          return;
        }

        const eventKey = [
          event.timestamp,
          event.stage,
          event.status,
          event.actor,
          event.title,
          event.detail,
        ].join('|');
        if (view.activitySeen.has(eventKey)) {
          return;
        }
        view.activitySeen.add(eventKey);
        view.activityTotal += 1;
        if (view.activityCount) {
          view.activityCount.textContent = view.activityTotal + ' event' + (view.activityTotal === 1 ? '' : 's');
        }

        const entry = document.createElement('div');
        entry.className = 'worklog-entry ' + event.status;
        entry.innerHTML = ''
          + '<div class="worklog-time">' + escapeHtml(formatClock(event.timestamp)) + '</div>'
          + '<div class="worklog-actor">' + escapeHtml(event.actor) + '</div>'
          + '<div class="worklog-copy"><strong>' + escapeHtml(event.title) + '</strong><span>' + escapeHtml(event.detail) + '</span></div>';
        view.worklog.appendChild(entry);
        view.worklog.scrollTop = view.worklog.scrollHeight;

        if (view.state) {
          view.state.textContent = statusLabel(event);
          view.state.className = 'state-pill'
            + (event.status === 'completed' ? ' done' : '')
            + (event.status === 'blocked' ? ' warn' : '')
            + (event.status === 'failed' ? ' bad' : '');
        }
      }

      function populateActivityLog(view, activityLog) {
        if (!Array.isArray(activityLog)) {
          return;
        }

        for (const event of activityLog) {
          appendStatusEvent(view, event);
        }
      }

      function renderMeta(view, payload) {
        if (!view.meta) {
          return;
        }

        view.meta.innerHTML = '';
        view.meta.appendChild(bubbleMetaChip(payload.decision_kind || 'chat', ''));
        if (payload.mission_status) {
          view.meta.appendChild(
            bubbleMetaChip(
              payload.mission_status,
              payload.mission_status === 'verified_complete'
                ? 'good'
                : payload.mission_status === 'verification_failed' || payload.mission_status === 'rejected'
                  ? 'bad'
                  : 'warn',
            ),
          );
        }
        if (payload.blocked_reason) {
          view.meta.appendChild(bubbleMetaChip('blocked', 'bad'));
        }
      }

      function renderLinks(view, payload) {
        if (!view.links) {
          return;
        }
        view.links.innerHTML = '';
        if (payload.control_room_path) {
          const link = document.createElement('a');
          link.className = 'action-link';
          link.href = payload.control_room_path;
          link.textContent = 'Inspect in control room';
          view.links.appendChild(link);
        }
      }

      function renderAssistantResult(view, payload) {
        populateActivityLog(view, payload.activity_log);
        renderMeta(view, payload);
        renderLinks(view, payload);

        if (view.answer) {
          view.answer.className = 'message-body';
          view.answer.textContent = sanitizeAssistantAnswer(payload.answer);
        }

        if (view.state) {
          const stateClass = payload.mission_status === 'verified_complete'
            ? ' done'
            : payload.mission_status === 'verification_failed' || payload.mission_status === 'rejected'
              ? ' bad'
              : payload.decision_kind === 'chat'
                ? ' done'
                : ' warn';
          view.state.className = 'state-pill' + stateClass;
          view.state.textContent = payload.mission_status || payload.decision_kind || 'done';
        }

        view.card.classList.remove('pending');
        view.card.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }

      function renderAssistantError(view, message) {
        if (view.answer) {
          view.answer.className = 'message-body';
          view.answer.textContent = message;
        }
        if (view.state) {
          view.state.className = 'state-pill bad';
          view.state.textContent = 'failed';
        }
        if (view.meta) {
          view.meta.innerHTML = '';
          view.meta.appendChild(bubbleMetaChip('request_failed', 'bad'));
        }
        view.card.classList.remove('pending');
      }

      async function fallbackRequest(message, view) {
        const response = await fetch('/chat/api/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: message }),
        });
        const payload = await response.json();
        if (!response.ok) {
          renderAssistantError(view, payload.error || 'Request failed.');
          return;
        }
        renderAssistantResult(view, payload);
      }

      async function streamRequest(message, view) {
        const response = await fetch('/chat/api/message/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: message }),
        });

        if (!response.ok || !response.body) {
          await fallbackRequest(message, view);
          return;
        }

        const reader = response.body.getReader();
        let buffer = '';

        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            break;
          }

          buffer += decoder.decode(chunk.value, { stream: true });
          let newlineIndex = buffer.indexOf('\\n');
          while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line) {
              const payload = JSON.parse(line);
              if (payload.type === 'status') {
                appendStatusEvent(view, payload.event);
              } else if (payload.type === 'result') {
                renderAssistantResult(view, payload.payload);
              } else if (payload.type === 'error') {
                renderAssistantError(view, payload.error || 'Request failed.');
              }
            }
            newlineIndex = buffer.indexOf('\\n');
          }
        }

        const trailing = buffer.trim();
        if (trailing) {
          const payload = JSON.parse(trailing);
          if (payload.type === 'result') {
            renderAssistantResult(view, payload.payload);
          } else if (payload.type === 'error') {
            renderAssistantError(view, payload.error || 'Request failed.');
          }
        }
      }

      async function sendMessage() {
        const message = messageEl.value.trim();
        if (!message) {
          return;
        }

        addUserBubble(message);
        const assistantView = createAssistantBubble();
        messageEl.value = '';
        sendButton.disabled = true;

        try {
          await streamRequest(message, assistantView);
        } catch (error) {
          renderAssistantError(
            assistantView,
            error instanceof Error ? error.message : 'Request failed.',
          );
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
