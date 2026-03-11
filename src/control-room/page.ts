export function renderControlRoomPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>best-brain control room</title>
    <style>
      :root {
        --bg: #f2efe8;
        --panel: #fffaf1;
        --ink: #1f1b16;
        --muted: #6d655b;
        --line: #d5c8b3;
        --accent: #9f4f16;
        --accent-soft: #f0d9c7;
        --good: #24613a;
        --bad: #8a2f1f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(159,79,22,0.12), transparent 35%),
          linear-gradient(180deg, #f8f4ed, var(--bg));
        color: var(--ink);
      }
      main {
        max-width: 1400px;
        margin: 0 auto;
        padding: 24px;
      }
      h1, h2, h3 { margin: 0; }
      .hero {
        display: grid;
        gap: 16px;
        padding: 20px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: linear-gradient(135deg, rgba(255,250,241,0.98), rgba(247,237,223,0.92));
        box-shadow: 0 18px 48px rgba(31,27,22,0.08);
      }
      .hero p {
        margin: 0;
        color: var(--muted);
        max-width: 880px;
      }
      .layout {
        display: grid;
        grid-template-columns: 360px 1fr;
        gap: 20px;
        margin-top: 20px;
      }
      .panel {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--panel);
        padding: 18px;
        box-shadow: 0 12px 30px rgba(31,27,22,0.06);
      }
      .stack { display: grid; gap: 12px; }
      textarea, select, button, input {
        width: 100%;
        font: inherit;
      }
      textarea, select, input {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        background: #fffdf8;
        color: var(--ink);
      }
      textarea { min-height: 120px; resize: vertical; }
      button {
        border: none;
        border-radius: 12px;
        padding: 12px 14px;
        cursor: pointer;
        background: var(--accent);
        color: white;
        font-weight: 600;
      }
      button.secondary {
        background: var(--accent-soft);
        color: var(--ink);
      }
      button:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .mission-list {
        display: grid;
        gap: 10px;
        max-height: 72vh;
        overflow: auto;
      }
      .mission-card {
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 12px;
        background: #fffdf8;
        cursor: pointer;
      }
      .mission-card.active {
        border-color: var(--accent);
        box-shadow: inset 0 0 0 1px rgba(159,79,22,0.25);
      }
      .mission-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 12px;
        margin-top: 8px;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        background: #efe7da;
        color: var(--ink);
      }
      .status.good { background: rgba(36,97,58,0.12); color: var(--good); }
      .status.bad { background: rgba(138,47,31,0.12); color: var(--bad); }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .chip {
        padding: 6px 10px;
        border-radius: 999px;
        background: #efe7da;
        color: var(--ink);
        font-size: 12px;
      }
      .list {
        display: grid;
        gap: 10px;
      }
      .item {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        background: #fffdf8;
      }
      .item small { color: var(--muted); }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, monospace;
        font-size: 12px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .two-line {
        display: grid;
        gap: 4px;
      }
      .empty {
        color: var(--muted);
        padding: 24px;
        border: 1px dashed var(--line);
        border-radius: 16px;
        text-align: center;
      }
      @media (max-width: 980px) {
        .layout, .detail-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="two-line">
          <h1>best-brain control room</h1>
          <p>Launch a mission from one goal, inspect the real manager/runtime proof chain, and steer retry or operator review without bypassing kernel rails.</p>
        </div>
        <div class="panel">
          <div class="stack">
            <label class="two-line">
              <span>Goal</span>
              <textarea id="goal" placeholder="Describe the goal once. The manager should continue from there."></textarea>
            </label>
            <label><input id="dryRun" type="checkbox" /> Dry run</label>
            <label><input id="noExecute" type="checkbox" /> No execute</label>
            <button id="launch">Launch mission</button>
          </div>
        </div>
      </section>

      <section class="layout">
        <aside class="panel">
          <div class="two-line">
            <h2>Missions</h2>
            <small id="missionCount">0 missions</small>
          </div>
          <div class="stack" style="margin: 10px 0 12px;">
            <label class="two-line">
              <span>Status filter</span>
              <select id="historyStatusFilter">
                <option value="all">all</option>
              </select>
            </label>
            <label class="two-line">
              <span>Mission kind filter</span>
              <select id="historyKindFilter">
                <option value="all">all</option>
              </select>
            </label>
            <label class="two-line">
              <span>Date from</span>
              <input id="historyDateFrom" type="date" />
            </label>
            <label class="two-line">
              <span>Date to</span>
              <input id="historyDateTo" type="date" />
            </label>
            <button id="historyApplyFilter" class="secondary">Apply history filter</button>
          </div>
          <div id="missionList" class="mission-list"></div>
          <div class="two-line" style="margin-top: 12px;">
            <h3>Run history</h3>
            <small id="historyCount">0 items</small>
          </div>
          <div id="historyList" class="mission-list"></div>
        </aside>

        <section id="detail" class="grid">
          <div class="empty">Launch a mission or select one from the list.</div>
        </section>
      </section>
    </main>

    <script>
      const state = {
        dashboard: null,
        history: null,
        selectedMissionId: null,
        selectedMissionStatus: null,
      };
      const searchParams = new URLSearchParams(window.location.search);
      const requestedMissionId = searchParams.get('mission_id');
      const prefilledGoal = searchParams.get('goal');

      function badgeClass(status) {
        if (status === 'verified_complete' || status === 'completed') return 'status good';
        if (status === 'verification_failed' || status === 'rejected' || status === 'failed' || status === 'blocked') return 'status bad';
        return 'status';
      }

      function formatTime(value) {
        if (!value) return 'n/a';
        return new Date(value).toLocaleString();
      }

      function renderDashboard() {
        const list = document.getElementById('missionList');
        const missionCount = document.getElementById('missionCount');
        const statusFilterEl = document.getElementById('historyStatusFilter');
        const kindFilterEl = document.getElementById('historyKindFilter');
        const missions = state.dashboard?.missions ?? [];
        missionCount.textContent = missions.length + ' mission' + (missions.length === 1 ? '' : 's');
        list.innerHTML = '';
        if (statusFilterEl) {
          const selected = statusFilterEl.value || 'all';
          const statuses = ['all'].concat(state.dashboard?.available_statuses ?? []);
          statusFilterEl.innerHTML = statuses.map((value) => '<option value="' + value + '">' + value + '</option>').join('');
          statusFilterEl.value = statuses.includes(selected) ? selected : 'all';
        }
        if (kindFilterEl) {
          const selected = kindFilterEl.value || 'all';
          const kinds = ['all'].concat(state.dashboard?.available_mission_kinds ?? []);
          kindFilterEl.innerHTML = kinds.map((value) => '<option value="' + value + '">' + value + '</option>').join('');
          kindFilterEl.value = kinds.includes(selected) ? selected : 'all';
        }
        if (missions.length === 0) {
          list.innerHTML = '<div class="empty">No mission has been launched yet.</div>';
          return;
        }

        for (const mission of missions) {
          const card = document.createElement('button');
          card.className = 'mission-card' + (mission.mission_id === state.selectedMissionId ? ' active' : '');
          card.innerHTML = '<div class="two-line"><strong>' + mission.goal + '</strong><small>' + mission.mission_id + '</small></div>'
            + '<div class="mission-meta"><span class="' + badgeClass(mission.status) + '">' + mission.status + '</span><span>' + formatTime(mission.updated_at) + '</span></div>';
          card.addEventListener('click', () => loadMission(mission.mission_id));
          list.appendChild(card);
        }
      }

      function formatDuration(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return 'n/a';
        }
        const seconds = Math.max(0, Math.round(value / 1000));
        if (seconds < 60) return seconds + 's';
        const minutes = Math.floor(seconds / 60);
        const remain = seconds % 60;
        return minutes + 'm ' + remain + 's';
      }

      function renderHistory() {
        const historyList = document.getElementById('historyList');
        const historyCount = document.getElementById('historyCount');
        const items = state.history?.items ?? [];
        if (historyCount) {
          historyCount.textContent = items.length + ' item' + (items.length === 1 ? '' : 's');
        }
        if (!historyList) {
          return;
        }
        historyList.innerHTML = '';
        if (items.length === 0) {
          historyList.innerHTML = '<div class="empty">No history item matches the current filter.</div>';
          return;
        }
        for (const item of items) {
          const card = document.createElement('div');
          card.className = 'mission-card';
          const comparison = item.comparison && item.comparison.has_previous
            ? 'Δduration: ' + formatDuration(item.comparison.duration_delta_ms) + ' • Δchecks: ' + item.comparison.checks_passed_delta
            : 'No previous run to compare.';
          card.innerHTML = ''
            + '<div class="two-line"><strong>' + item.goal + '</strong><small>' + item.mission_kind + '</small></div>'
            + '<div class="mission-meta"><span class="' + badgeClass(item.status) + '">' + item.status + '</span><span>' + formatDuration(item.duration_ms) + '</span></div>'
            + '<div class="mission-meta"><span>runs: ' + item.run_count + '</span><span>checks: ' + item.checks_passed + '/' + item.checks_total + '</span></div>'
            + '<div class="mission-meta"><span>' + comparison + '</span></div>';
          historyList.appendChild(card);
        }
      }

      async function loadHistory() {
        const params = new URLSearchParams();
        const status = document.getElementById('historyStatusFilter')?.value || 'all';
        const missionKind = document.getElementById('historyKindFilter')?.value || 'all';
        const dateFrom = document.getElementById('historyDateFrom')?.value || '';
        const dateTo = document.getElementById('historyDateTo')?.value || '';
        params.set('status', status);
        params.set('mission_kind', missionKind);
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        const response = await fetch('/control-room/api/history?' + params.toString());
        state.history = await response.json();
        renderHistory();
      }

      function renderDetail(view) {
        const detail = document.getElementById('detail');
        if (!view) {
          detail.innerHTML = '<div class="empty">Launch a mission or select one from the list.</div>';
          return;
        }

        const actionButtons = view.allowed_actions.map((action) => {
          const label = action.replaceAll('_', ' ');
          return '<button class="' + (action === 'approve_verdict' ? '' : 'secondary') + '" data-action="' + action + '">' + label + '</button>';
        }).join('');

        detail.innerHTML = ''
          + '<div class="panel grid">'
          + '  <div class="two-line">'
          + '    <div class="' + badgeClass(view.status) + '">' + view.status + '</div>'
          + '    <h2>' + view.goal + '</h2>'
          + '    <small>' + view.mission_id + ' • updated ' + formatTime(view.updated_at) + '</small>'
          + '  </div>'
          + '  <div class="detail-grid">'
          + '    <div class="panel stack">'
          + '      <h3>Plan</h3>'
          + '      <div class="list">' + view.plan_overview.map((step) => '<div class="item"><pre>' + step + '</pre></div>').join('') + '</div>'
          + '      <h3>Phase timeline</h3>'
          + '      <div class="list">' + (view.phase_timeline || []).map((phase) =>
            '<div class="item"><strong>' + phase.title + '</strong><br/><small>' + phase.status + ' • '
            + formatTime(phase.started_at) + ' → ' + formatTime(phase.ended_at) + ' • '
            + formatDuration(phase.duration_ms) + '</small><pre>' + phase.detail + '</pre></div>').join('') + '</div>'
          + '    </div>'
          + '    <div class="panel stack">'
          + '      <h3>Verdict</h3>'
          + (view.verdict
              ? '<div class="item"><pre>' + JSON.stringify(view.verdict, null, 2) + '</pre></div>'
              : '<div class="empty">No verdict recorded yet.</div>')
          + '      <h3>Operator review</h3>'
          + '      <div class="item"><pre>' + JSON.stringify(view.operator_review, null, 2) + '</pre></div>'
          + '      <div class="actions">' + actionButtons + '</div>'
          + '    </div>'
          + '  </div>'
          + '</div>'
          + '<div class="detail-grid">'
          + '  <div class="panel stack">'
          + '    <h3>Timeline</h3>'
          + '    <div class="list">' + view.timeline.map((entry) => '<div class="item"><strong>' + entry.title + '</strong><br/><small>' + entry.source + ' • ' + entry.status + ' • ' + formatTime(entry.created_at) + '</small><pre>' + entry.detail + '</pre></div>').join('') + '</div>'
          + '  </div>'
          + '  <div class="panel stack">'
          + '    <h3>Workers</h3>'
          + '    <div class="list">' + view.workers.map((worker) =>
            '<div class="item"><strong>' + worker.worker + '</strong><br/><small>' + worker.status + ' • '
            + formatTime(worker.last_update_at) + ' • artifacts ' + worker.artifact_count + '</small><pre>'
            + (worker.last_summary || 'No worker summary yet.') + '</pre></div>').join('') + '</div>'
          + '    <h3>Final report</h3>'
          + (view.final_report_artifact
              ? '<div class="item"><pre>' + JSON.stringify(view.final_report_artifact, null, 2) + '</pre></div>'
              : '<div class="empty">No final report artifact recorded yet.</div>')
          + '  </div>'
          + '</div>'
          + '<div class="detail-grid">'
          + '  <div class="panel stack">'
          + '    <h3>Artifacts</h3>'
          + '    <div class="list">' + view.artifacts.map((artifact) => '<div class="item"><strong>' + artifact.kind + '</strong><br/><small>' + artifact.uri + '</small><pre>' + JSON.stringify(artifact, null, 2) + '</pre></div>').join('') + '</div>'
          + '  </div>'
          + '  <div class="panel stack">'
          + '    <h3>Task graph</h3>'
          + '    <div class="item"><pre>' + JSON.stringify(view.mission_graph, null, 2) + '</pre></div>'
          + '  </div>'
          + '</div>';

        detail.querySelectorAll('[data-action]').forEach((button) => {
          button.addEventListener('click', async () => {
            const note = window.prompt('Optional operator note:', '') ?? '';
            const response = await fetch('/control-room/api/missions/' + view.mission_id + '/actions', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: button.dataset.action, note }),
            });
            const payload = await response.json();
            if (!response.ok) {
              window.alert(payload.error || 'Action failed.');
              return;
            }
            await refresh(view.mission_id);
          });
        });
      }

      async function loadMission(missionId) {
        const response = await fetch('/control-room/api/missions/' + missionId);
        const payload = await response.json();
        if (!response.ok) {
          window.alert(payload.error || 'Unable to load mission.');
          return;
        }
        state.selectedMissionId = missionId;
        state.selectedMissionStatus = payload.status || null;
        renderDashboard();
        renderDetail(payload);
      }

      async function loadDashboard() {
        const response = await fetch('/control-room/api/overview');
        state.dashboard = await response.json();
        if (!state.selectedMissionId && requestedMissionId) {
          state.selectedMissionId = requestedMissionId;
        } else if (!state.selectedMissionId && state.dashboard.latest_mission_id) {
          state.selectedMissionId = state.dashboard.latest_mission_id;
        }
        renderDashboard();
        await loadHistory();
        if (state.selectedMissionId) {
          await loadMission(state.selectedMissionId);
        } else {
          renderDetail(null);
        }
      }

      async function refresh(missionId) {
        await loadDashboard();
        if (missionId) {
          state.selectedMissionId = missionId;
          await loadMission(missionId);
        }
      }

      document.getElementById('launch').addEventListener('click', async () => {
        const payload = {
          goal: document.getElementById('goal').value.trim(),
          dry_run: document.getElementById('dryRun').checked,
          no_execute: document.getElementById('noExecute').checked,
        };
        const response = await fetch('/control-room/api/launch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const view = await response.json();
        if (!response.ok) {
          window.alert(view.error || 'Launch failed.');
          return;
        }
        document.getElementById('goal').value = '';
        state.selectedMissionId = view.mission_id;
        await refresh(view.mission_id);
      });

      document.getElementById('historyApplyFilter').addEventListener('click', async () => {
        await loadHistory();
      });

      if (prefilledGoal) {
        document.getElementById('goal').value = prefilledGoal;
      }

      setInterval(() => {
        if (!state.selectedMissionId) {
          return;
        }
        if (state.selectedMissionStatus === 'in_progress' || state.selectedMissionStatus === 'awaiting_verification') {
          loadMission(state.selectedMissionId).catch((error) => window.console.error(error));
        }
      }, 1500);

      loadDashboard().catch((error) => {
        renderDetail(null);
        window.console.error(error);
      });
    </script>
  </body>
</html>`;
}
