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
        --bg-2: #11161d;
        --panel: #0f141b;
        --panel-2: #131a22;
        --panel-3: #1a2230;
        --ink: #edf2fa;
        --muted: #92a0b5;
        --line: #222d3b;
        --line-soft: #18202c;
        --accent: #a9d0ff;
        --accent-strong: #70b6ff;
        --accent-soft: rgba(112, 182, 255, 0.14);
        --good: #7fd6a2;
        --warn: #ffca72;
        --bad: #ff8a7a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        padding: 10px 10px 96px;
        background:
          radial-gradient(circle at top left, rgba(112, 182, 255, 0.12), transparent 24%),
          radial-gradient(circle at top right, rgba(127, 214, 162, 0.06), transparent 18%),
          linear-gradient(180deg, var(--bg-2), var(--bg));
        color: var(--ink);
        font-family: "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      }

      main {
        max-width: 760px;
        margin: 0 auto;
        display: grid;
        gap: 10px;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--panel);
        box-shadow: 0 12px 26px rgba(0, 0, 0, 0.22);
      }

      .hero {
        padding: 12px 14px;
        display: grid;
        gap: 6px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        border: 1px solid rgba(142, 197, 255, 0.15);
        font: 700 10px/1 "SFMono-Regular", "Cascadia Code", Consolas, monospace;
        letter-spacing: 0.04em;
      }

      h1 {
        margin: 0;
        font-size: 18px;
        line-height: 1.1;
        letter-spacing: -0.02em;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
        line-height: 1.45;
        font-size: 12px;
      }

      .hero a {
        color: var(--accent-strong);
        text-decoration: none;
        font-weight: 700;
        font-size: 12px;
      }

      .thread {
        display: grid;
        gap: 8px;
      }

      .empty-state {
        padding: 14px 15px;
        color: var(--muted);
        border: 1px dashed var(--line);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.02);
        line-height: 1.5;
        font-size: 12px;
      }

      .message-card {
        padding: 12px 13px;
        display: grid;
        gap: 8px;
      }

      .message-card.user {
        background: linear-gradient(180deg, rgba(18, 25, 34, 0.98), rgba(14, 20, 28, 0.98));
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
        gap: 8px;
      }

      .avatar {
        width: 24px;
        height: 24px;
        border-radius: 7px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font: 700 9px/1 "SFMono-Regular", "Cascadia Code", Consolas, monospace;
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
        font-size: 13px;
      }

      .message-title small {
        color: var(--muted);
        font-size: 11px;
      }

      .state-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--panel-3);
        color: var(--muted);
        border: 1px solid rgba(255, 255, 255, 0.06);
        font: 700 10px/1 "SFMono-Regular", "Cascadia Code", Consolas, monospace;
      }

      .state-pill::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--accent);
      }

      .state-pill.done {
        color: var(--good);
        background: rgba(127, 214, 162, 0.1);
      }

      .state-pill.done::before {
        background: var(--good);
      }

      .state-pill.warn {
        color: var(--warn);
        background: rgba(255, 202, 114, 0.1);
      }

      .state-pill.warn::before {
        background: var(--warn);
      }

      .state-pill.bad {
        color: var(--bad);
        background: rgba(255, 138, 122, 0.1);
      }

      .state-pill.bad::before {
        background: var(--bad);
      }

      .message-body {
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.55;
        font-size: 14px;
      }

      .message-body.pending {
        color: var(--muted);
      }

      .meta-row,
      .link-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .meta-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: var(--panel-3);
        border: 1px solid rgba(255, 255, 255, 0.05);
        color: var(--muted);
        font: 700 10px/1 "SFMono-Regular", "Cascadia Code", Consolas, monospace;
      }

      .meta-chip.good {
        color: var(--good);
        background: rgba(127, 214, 162, 0.1);
      }

      .meta-chip.warn {
        color: var(--warn);
        background: rgba(255, 202, 114, 0.1);
      }

      .meta-chip.bad {
        color: var(--bad);
        background: rgba(255, 138, 122, 0.1);
      }

      .link-row a {
        color: var(--accent-strong);
        text-decoration: none;
        font-weight: 700;
        font-size: 12px;
      }

      .activity-panel {
        display: none;
        margin-top: 2px;
        padding-top: 8px;
        border-top: 1px solid var(--line-soft);
      }

      .activity-panel.visible {
        display: block;
      }

      .activity-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 0 0 8px;
        color: var(--muted);
        font: 700 10px/1 "SFMono-Regular", "Cascadia Code", Consolas, monospace;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .activity-list {
        display: grid;
        gap: 2px;
        max-height: 184px;
        overflow: auto;
      }

      .activity-entry {
        display: grid;
        grid-template-columns: 56px 64px 1fr;
        gap: 8px;
        padding: 5px 0;
        font: 11px/1.45 "SFMono-Regular", "Cascadia Code", Consolas, monospace;
      }

      .activity-time {
        color: #718099;
      }

      .activity-actor {
        color: var(--accent-strong);
        text-transform: lowercase;
      }

      .activity-copy {
        display: grid;
        gap: 2px;
      }

      .activity-copy strong {
        color: var(--ink);
        font-weight: 700;
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
        bottom: 10px;
        padding: 10px;
        background: rgba(17, 24, 35, 0.94);
        backdrop-filter: blur(10px);
      }

      .composer-grid {
        display: grid;
        gap: 10px;
      }

      textarea,
      button {
        width: 100%;
        font: inherit;
      }

      textarea {
        min-height: 76px;
        padding: 11px 12px;
        border-radius: 12px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.03);
        color: var(--ink);
        resize: vertical;
        line-height: 1.5;
        font-size: 14px;
      }

      textarea:focus {
        outline: none;
        border-color: rgba(91, 167, 255, 0.55);
        box-shadow: 0 0 0 4px rgba(91, 167, 255, 0.12);
      }

      button {
        border: none;
        border-radius: 12px;
        padding: 11px 14px;
        background: linear-gradient(135deg, #4e98e9, #66b3ff);
        color: #07131f;
        font-weight: 700;
        cursor: pointer;
        font-size: 14px;
      }

      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }

      .composer-note {
        color: var(--muted);
        font-size: 11px;
      }

      @media (max-width: 720px) {
        body {
          padding: 8px 8px 94px;
        }

        .card,
        .activity-panel {
          border-radius: 14px;
        }

        .message-head {
          align-items: flex-start;
          flex-direction: column;
          gap: 8px;
        }

        .activity-entry {
          grid-template-columns: 52px 58px 1fr;
          gap: 7px;
        }

        .hero {
          padding: 10px 12px;
        }

        h1 {
          font-size: 17px;
        }

        .message-card {
          padding: 11px 12px;
        }

        .composer {
          padding: 8px;
        }
      }

      @media (max-width: 480px) {
        .hero p,
        .empty-state,
        .composer-note {
          font-size: 11px;
        }

        .activity-entry {
          grid-template-columns: 1fr;
          gap: 2px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card hero">
        <div class="eyebrow">best-brain / mobile terminal</div>
        <h1>best-brain chat</h1>
        <p>Ask normally. The AI manager decides whether to answer directly, do light work, or turn the request into a mission internally.</p>
        <a href="/control-room">Open control room</a>
      </section>

      <section id="thread" class="thread">
        <div id="emptyThread" class="empty-state">Type anything. best-brain will answer in one bubble and show its run log inline when it needs memory, workers, or verification.</div>
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
          + '    <div class="message-title"><strong>best-brain</strong><small>manager log inline</small></div>'
          + '  </div>'
          + '  <div class="state-pill" data-role="state">working</div>'
          + '</div>'
          + '<div class="message-body pending" data-role="answer">Waiting for the next step...</div>'
          + '<div class="meta-row" data-role="meta"></div>'
          + '<div class="activity-panel" data-role="activity-panel">'
          + '  <div class="activity-head"><span>Run trace</span><span data-role="activity-count">0 events</span></div>'
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

      function isLowSignalManagerEvent(event) {
        return event.actor === 'manager'
          && ['chat_receive', 'manager_receive', 'triage', 'chat_response'].includes(event.stage)
          && ['Received your message', 'Manager received the request', 'Deciding how to handle the request', 'Preparing a direct answer'].includes(event.title);
      }

      function isLowSignalBrainEvent(event) {
        return (event.actor === 'brain' && event.title === 'Brain connection is ready')
          || (event.actor === 'brain' && event.stage === 'brain_consult' && event.status === 'started')
          || (event.actor === 'brain' && event.stage === 'brain_context' && event.status === 'started');
      }

      function shouldRenderTraceEvent(event) {
        if (!event) {
          return false;
        }
        if (event.kind === 'status' && event.actor === 'claude' && /^Claude session initialized$/i.test(event.title || '')) {
          return false;
        }
        if (isLowSignalManagerEvent(event) || isLowSignalBrainEvent(event)) {
          return false;
        }
        return true;
      }

      function appendProgress(view, event) {
        if (!event || !view.activityListEl || !shouldRenderTraceEvent(event)) {
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
        const activity = Array.isArray(payload.activity_log) ? payload.activity_log : [];
        if (activity.some((event) => event.kind === 'memory_write' && event.status === 'completed')) {
          view.metaEl.appendChild(createMetaChip('memory updated', 'good'));
        } else if (activity.some((event) => event.kind === 'memory_read')) {
          view.metaEl.appendChild(createMetaChip('brain read', 'warn'));
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
          return;
        }
        if (payload.promotion && payload.promotion.can_promote && payload.promotion.control_room_prefill_path) {
          const link = document.createElement('a');
          link.href = payload.promotion.control_room_prefill_path;
          link.textContent = 'Promote to mission';
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

      function renderAssistantSnapshot(view, snapshot) {
        if (Array.isArray(snapshot.trace_events)) {
          snapshot.trace_events.forEach((event) => appendProgress(view, event));
        }

        if (snapshot.run_status === 'completed' && snapshot.response) {
          renderAssistantResult(view, snapshot.response);
          return;
        }

        if (snapshot.run_status === 'failed') {
          renderAssistantError(view, snapshot.error || 'Request failed.');
          return;
        }

        if (view.answerEl) {
          view.answerEl.className = 'message-body pending';
          view.answerEl.textContent = 'กำลังทำงาน...';
        }
        if (view.stateEl) {
          view.stateEl.className = 'state-pill';
          view.stateEl.textContent = snapshot.run_status === 'running' ? 'working' : snapshot.run_status;
        }
      }

      async function startRun(message) {
        const response = await fetch('/chat/api/message/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: message }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Request failed.');
        }
        return payload;
      }

      async function fetchRunSnapshot(runId) {
        const response = await fetch('/chat/api/runs/' + encodeURIComponent(runId), {
          headers: { 'cache-control': 'no-store' },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load chat run.');
        }
        return payload;
      }

      async function followRun(runId, view) {
        while (true) {
          const snapshot = await fetchRunSnapshot(runId);
          renderAssistantSnapshot(view, snapshot);
          if (snapshot.run_status === 'completed' || snapshot.run_status === 'failed') {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
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
          const run = await startRun(message);
          renderAssistantSnapshot(assistantView, run);
          await followRun(run.run_id, assistantView);
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
