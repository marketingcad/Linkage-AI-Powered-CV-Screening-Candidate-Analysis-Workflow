interface Session {
  room: string;
  candidateName: string;
  createdAt: string;
  status: string;
  recordingUrl?: string;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function load() {
  const rows = document.getElementById('rows') as HTMLTableSectionElement;
  try {
    const res = await fetch('/api/sessions');
    const { sessions } = (await res.json()) as { sessions: Session[] };
    if (!sessions.length) {
      rows.innerHTML = '<tr><td colspan="5">No interviews yet.</td></tr>';
      return;
    }
    rows.innerHTML = sessions
      .map(
        (s) => `<tr>
          <td>${esc(s.candidateName)}</td>
          <td><code>${esc(s.room)}</code></td>
          <td>${new Date(s.createdAt).toLocaleString()}</td>
          <td><span class="badge">${esc(s.status)}</span></td>
          <td>${s.recordingUrl ? `<a href="${esc(s.recordingUrl)}" target="_blank">open</a>` : '—'}</td>
        </tr>`,
      )
      .join('');
  } catch {
    rows.innerHTML = '<tr><td colspan="5">Failed to load — is the server running?</td></tr>';
  }
}

void load();
setInterval(() => void load(), 5000);
