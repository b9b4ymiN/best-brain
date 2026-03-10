export function renderChatPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>best-brain chat</title>
    <style>
      :root {
        --bg: #f3efe7;
        --panel: #fdfaf4;
        --panel-2: #f7f2e9;
        --ink: #181510;
        --muted: #6e6558;
        --line: #d6c8b1;
        --accent: #b15c1b;
        --accent-soft: rgba(177, 92, 27, 0.11);
        --good: #2e6b41;
        --warn: #8f5b14;
        --bad: #9b3322;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: 20px 16px 112px;
        background:
          radial-gradient(circle at top left, rgba(177, 92, 27, 0.08), transparent 28%),
          linear-gradient(180deg, #f8f4ed, var(--bg));
        color: var(--ink);
        font-family: "Segoe UI", system-ui, sans-serif;
      }

      main {
        max-width: 980px;
        margin: 0 auto;
        display: grid;
        gap: 16px;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background: var(--panel);
        box-shadow: 0 12px 26px rgba(31, 27, 22, 0.05);
      }

      .hero {
        padding: 22px;
        display: grid;
        gap: 10px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
        letter-spacing: 0.04em;
      }

      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.05;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
      }

      .hero a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }

      .thread {
        display: grid;
        gap: 14px;
      }

      .empty-state {
        padding: 18px 20px;
        color: var(--muted);
        border: 1px dashed var(--line);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.45);
      }

      .message-card {
        padding: 16px 18px;
        display: grid;
        gap: 12px;
      }

      .message-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .message-identity {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .avatar {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font: 700 11px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
        text-transform: uppercase;
        border: 1px solid var(--line);
        background: var(--panel-2);
        color: var(--accent);
      }

      .message-title {
        display: grid;
        gap: 2px;
      }

      .message-title strong {
        font-size: 15px;
      }

      .message-title small {
        color: var(--muted);
      }

      .state-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 11px;
        border-radius: 999px;
        background: #efe7d9;
        color: var(--muted);
        font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      .state-pill::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
      }

      .state-pill.done {
        color: var(--good);
        background: rgba(46, 107, 65, 0.1);
      }

      .state-pill.done::before {
        background: var(--good);
      }

      .state-pill.warn {
        color: var(--warn);
        background: rgba(143, 91, 20, 0.1);
      }

      .state-pill.warn::before {
        background: var(--warn);
      }

      .state-pill.bad {
        color: var(--bad);
        background: rgba(155, 51, 34, 0.1);
      }

      .state-pill.bad::before {
        background: var(--bad);
      }

      .message-body {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.7;
        font-size: 15px;
      }

      .message-body.pending {
        color: var(--muted);
      }

      .meta-row,
      .link-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .meta-chip {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: #efe7d9;
        color: var(--muted);
        font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      .meta-chip.good {
        color: var(--good);
        background: rgba(46, 107, 65, 0.1);
      }

      .meta-chip.warn {
        color: var(--warn);
        background: rgba(143, 91, 20, 0.1);
      }

      .meta-chip.bad {
        color: var(--bad);
        background: rgba(155, 51, 34, 0.1);
      }

      .link-row a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 700;
      }

      .activity-panel {
        display: none;
        border: 1px solid var(--line);
        border-radius: 16px;
        background: #fbf7ef;
        overflow: hidden;
      }

      .activity-panel.visible {
        display: block;
      }

      .activity-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        background: rgba(0, 0, 0, 0.02);
        color: var(--muted);
        font: 700 12px/1 ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      .activity-list {
        display: grid;
        max-height: 240px;
        overflow: auto;
      }

      .activity-entry {
        display: grid;
        grid-template-columns: 92px 92px 1fr;
        gap: 12px;
        padding: 11px 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        font: 13px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
      }

      .activity-entry:first-child {
        border-top: none;
      }

      .activity-time {
        color: #8a7d69;
      }

      .activity-actor {
        color: var(--accent);
      }

      .activity-copy {
        display: grid;
        gap: 4px;
      }

      .activity-copy strong {
        color: var(--ink);
      }

      .activity-copy span {
        color: var(--muted);
      }

      .activity-entry.completed .activity-actor {
        color: var(--good);
      }

      .activity-entry.blocked .activity-actor,
      .activity-entry.failed .activity-actor {
        color: var(--bad);
      }

      .composer {
        position: sticky;
        bottom: 14px;
        padding: 14px;
        background: rgba(253, 250, 244, 0.94);
        backdrop-filter: blur(10px);
      }

      .composer-grid {
        display: grid;
        gap: 12px;
      }

      textarea,
      button {
        width: 100%;
        font: inherit;
      }

      textarea {
        min-height: 98px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: #fffdf8;
        color: var(--ink);
        resize: vertical;
      }

      textarea:focus {
        outline: none;
        border-color: rgba(177, 92, 27, 0.55);
        box-shadow: 0 0 0 4px rgba(177, 92, 27, 0.12);
      }

      button {
        border: none;
        border-radius: 16px;
        padding: 13px 16px;
        background: var(--accent);
        color: white;
        font-weight: 700;
        cursor: pointer;
      }

      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }

      .composer-note {
        color: var(--muted);
        font-size: 13px;
      }

      @media (max-width: 720px) {
        body {
          padding: 14px 10px 104px;
        }

        .card,
        .activity-panel {
          border-radius: 18px;
        }

        .message-head {
          align-items: flex-start;
          flex-direction: column;
        }

        .activity-entry {
          grid-template-columns: 1fr;
          gap: 4px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card hero">
        <div class="eyebrow">manager-led chat</div>
        <h1>best-brain chat</h1>
        <p>Ask normally. The AI manager decides whether to answer directly, do light work, or turn the request into a mission internally.</p>
        <a href="/control-room">Open control room</a>
      </section>

      <section id="thread" class="thread">
        <div id="emptyThread" class="empty-state">Type anything. If best-brain needs to consult memory, dispatch Claude, fall back, verify, or block on missing facts, you will see those steps here.</div>
      </section>

      <section class="card composer">
        <div class="composer-grid">
          <textarea id="message" placeholder="Ask anything. Example: What is my name? / Please remember that I prefer concise reports. / I want a stock scanner that matches my investing style."></textarea>
          <div class="composer-note">No mode hints needed. The AI manager decides the path by itself.</div>
          <button id="send">Send</button>
        </div>
      </section>
    </main>

    <script>
      const thread = document.getElementById('thread');
      const emptyThread = document.getElementById('emptyThread');
      const messageEl = document.getElementById('message');
      const sendButton = document.getElementById('send');
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

        const normalized = trimmed.replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n');
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
        return new Date(typeof value === 'number' ? value : Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      }

      function classifyState(label) {
        if (label === 'verified_complete' || label === 'done' || label === 'chat') {
          return 'done';
        }
        if (label === 'verification_failed' || label === 'rejected' || label === 'failed') {
          return 'bad';
        }
        if (label === 'blocked' || label === 'mission') {
          return 'warn';
        }
        return '';
      }

      function createMetaChip(text, stateClass) {
        const chip = document.createElement('span');
        chip.className = 'meta-chip' + (stateClass ? ' ' + stateClass : '');
        chip.textContent = text;
        return chip;
      }

      function addUserBubble(message) {
        ensureThreadStarted();
        const card = document.createElement('section');
        card.className = 'card message-card';
        card.innerHTML = ''
          + '<div class="message-head">'
          + '  <div class="message-identity">'
          + '    <div class="avatar">you</div>'
          + '    <div class="message-title"><strong>You</strong><small>input</small></div>'
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
        card.className = 'card message-card';
        card.innerHTML = ''
          + '<div class="message-head">'
          + '  <div class="message-identity">'
          + '    <div class="avatar">bb</div>'
          + '    <div class="message-title"><strong>best-brain</strong><small>live manager activity</small></div>'
          + '  </div>'
          + '  <div class="state-pill" data-role="state">working</div>'
          + '</div>'
          + '<div class="message-body pending" data-role="answer">Waiting for the next step...</div>'
          + '<div class="meta-row" data-role="meta"></div>'
          + '<div class="activity-panel" data-role="activity-panel">'
          + '  <div class="activity-head"><span>Live activity</span><span data-role="activity-count">0 events</span></div>'
          + '  <div class="activity-list" data-role="activity-list"></div>'
          + '</div>'
          + '<div class="link-row" data-role="links"></div>';
        thread.appendChild(card);
        card.scrollIntoView({ block: 'end', behavior: 'smooth' });
        return {
          card: card,
          answerEl: card.querySelector('[data-role="answer"]'),
          metaEl: card.querySelector('[data-role="meta"]'),
          linksEl: card.querySelector('[data-role="links"]'),
          stateEl: card.querySelector('[data-role="state"]'),
          activityPanelEl: card.querySelector('[data-role="activity-panel"]'),
          activityListEl: card.querySelector('[data-role="activity-list"]'),
          activityCountEl: card.querySelector('[data-role="activity-count"]'),
          seenEvents: new Set(),
          eventCount: 0,
        };
      }

      function appendProgress(view, event) {
        if (!event || !view.activityListEl) {
          return;
        }

        const key = [
          event.timestamp,
          event.stage,
          event.status,
          event.actor,
          event.title,
          event.detail,
        ].join('|');
        if (view.seenEvents.has(key)) {
          return;
        }
        view.seenEvents.add(key);
        view.eventCount += 1;

        if (view.activityPanelEl) {
          view.activityPanelEl.classList.add('visible');
        }
        if (view.activityCountEl) {
          view.activityCountEl.textContent = view.eventCount + ' event' + (view.eventCount === 1 ? '' : 's');
        }

        const row = document.createElement('div');
        row.className = 'activity-entry ' + event.status;
        row.innerHTML = ''
          + '<div class="activity-time">' + escapeHtml(formatClock(event.timestamp)) + '</div>'
          + '<div class="activity-actor">' + escapeHtml(event.actor) + '</div>'
          + '<div class="activity-copy"><strong>' + escapeHtml(event.title) + '</strong><span>' + escapeHtml(event.detail) + '</span></div>';
        view.activityListEl.appendChild(row);
        view.activityListEl.scrollTop = view.activityListEl.scrollHeight;

        if (view.stateEl) {
          const stateClass = event.status === 'completed'
            ? 'done'
            : event.status === 'blocked'
              ? 'warn'
              : event.status === 'failed'
                ? 'bad'
                : '';
          view.stateEl.className = 'state-pill' + (stateClass ? ' ' + stateClass : '');
          view.stateEl.textContent = event.status === 'started' ? 'working' : event.status;
        }
      }

      function clearActivity(view) {
        view.seenEvents.clear();
        view.eventCount = 0;
        if (view.activityListEl) {
          view.activityListEl.innerHTML = '';
        }
        if (view.activityCountEl) {
          view.activityCountEl.textContent = '0 events';
        }
        if (view.activityPanelEl) {
          view.activityPanelEl.classList.remove('visible');
        }
      }

      function renderMeta(view, payload) {
        if (!view.metaEl) {
          return;
        }

        view.metaEl.innerHTML = '';
        if (payload.decision_kind) {
          view.metaEl.appendChild(createMetaChip(payload.decision_kind, classifyState(payload.decision_kind)));
        }
        if (payload.mission_status) {
          view.metaEl.appendChild(createMetaChip(payload.mission_status, classifyState(payload.mission_status)));
        }
        if (payload.blocked_reason) {
          view.metaEl.appendChild(createMetaChip('blocked', 'bad'));
        }
      }

      function renderLinks(view, payload) {
        if (!view.linksEl) {
          return;
        }
        view.linksEl.innerHTML = '';
        if (payload.control_room_path) {
          const link = document.createElement('a');
          link.href = payload.control_room_path;
          link.textContent = 'Inspect in control room';
          view.linksEl.appendChild(link);
        }
      }

      function renderAssistantResult(view, payload) {
        if (Array.isArray(payload.activity_log) && payload.activity_log.length > 0) {
          clearActivity(view);
          payload.activity_log.forEach((event) => appendProgress(view, event));
        }

        renderMeta(view, payload);
        renderLinks(view, payload);

        if (view.answerEl) {
          view.answerEl.className = 'message-body';
          view.answerEl.textContent = sanitizeAssistantAnswer(payload.answer);
        }

        if (view.stateEl) {
          const stateText = payload.mission_status || payload.decision_kind || 'done';
          const stateClass = classifyState(stateText);
          view.stateEl.className = 'state-pill' + (stateClass ? ' ' + stateClass : '');
          view.stateEl.textContent = stateText;
        }
      }

      function renderAssistantError(view, message) {
        if (view.answerEl) {
          view.answerEl.className = 'message-body';
          view.answerEl.textContent = message;
        }
        if (view.stateEl) {
          view.stateEl.className = 'state-pill bad';
          view.stateEl.textContent = 'failed';
        }
        if (view.metaEl) {
          view.metaEl.innerHTML = '';
          view.metaEl.appendChild(createMetaChip('request_failed', 'bad'));
        }
        if (view.activityPanelEl && view.eventCount === 0) {
          view.activityPanelEl.classList.remove('visible');
        }
      }

      async function sendWithFallback(message, view) {
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

      function startPendingActivity(view) {
        const placeholders = [
          {
            actor: 'manager',
            title: 'Received your message',
            detail: 'best-brain is deciding whether to answer directly or run a mission.',
          },
          {
            actor: 'brain',
            title: 'Consulting memory',
            detail: 'Checking owner context, preferences, procedures, and recent mission history.',
          },
          {
            actor: 'manager',
            title: 'Planning the next step',
            detail: 'The manager is deciding whether to answer directly, do light work, or run a mission.',
          },
          {
            actor: 'runtime',
            title: 'Still working',
            detail: 'If a worker is needed, best-brain is waiting for that run to finish before answering.',
          },
          {
            actor: 'verifier',
            title: 'Preparing verification',
            detail: 'If this becomes a mission, proof and verification will be checked before marking it done.',
          },
        ];

        let index = 0;
        const emitNext = () => {
          if (index >= placeholders.length) {
            return;
          }
          const item = placeholders[index];
          index += 1;
          appendProgress(view, {
            stage: 'pending_' + index,
            status: 'started',
            actor: item.actor,
            title: item.title,
            detail: item.detail,
            timestamp: Date.now(),
            mission_id: null,
            task_id: null,
            decision_kind: null,
            requested_worker: null,
            executed_worker: null,
            blocked_reason_code: null,
          });
        };

        emitNext();
        const timer = setInterval(emitNext, 900);
        return () => clearInterval(timer);
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
        const stopPendingActivity = startPendingActivity(assistantView);

        try {
          await sendWithFallback(message, assistantView);
        } catch (error) {
          renderAssistantError(
            assistantView,
            error instanceof Error ? error.message : 'Request failed.',
          );
        } finally {
          stopPendingActivity();
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
