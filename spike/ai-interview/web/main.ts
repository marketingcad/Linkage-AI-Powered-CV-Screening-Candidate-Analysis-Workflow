import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('status');
const joinBtn = $<HTMLButtonElement>('join');
const leaveBtn = $<HTMLButtonElement>('leave');
const localVideo = $<HTMLVideoElement>('local');
const nameInput = $<HTMLInputElement>('name');
const schedEl = $('sched');

let room: Room | null = null;

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

// --- Scheduled-link handling -------------------------------------------------
// The link may carry ?t=<signed token>. We decode it (display only — the server
// verifies the signature) to show the time and gate the Join button by the window.
interface SchedulePayload {
  candidateName: string;
  scheduledAt: string;
  durationMinutes: number;
}

const scheduleToken = new URLSearchParams(location.search).get('t');

function decodePayload(token: string): SchedulePayload | null {
  try {
    const body = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(body)) as SchedulePayload;
  } catch {
    return null;
  }
}

const LEAD_MS = 15 * 60_000; // must match server SCHEDULE_LEAD_MINUTES for accurate UI

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

let scheduled: SchedulePayload | null = null;
if (scheduleToken) {
  scheduled = decodePayload(scheduleToken);
  if (scheduled) {
    nameInput.value = scheduled.candidateName;
    nameInput.disabled = true;
    schedEl.textContent = `Scheduled interview for ${scheduled.candidateName} — ${fmt(scheduled.scheduledAt)}.`;
    tickWindow();
    setInterval(tickWindow, 1000);
  } else {
    schedEl.textContent = 'This interview link looks invalid.';
    joinBtn.disabled = true;
  }
}

// Enable Join only inside [scheduledAt - lead, scheduledAt + duration]; else explain why.
function tickWindow() {
  if (!scheduled) return;
  const start = new Date(scheduled.scheduledAt).getTime();
  const opensAt = start - LEAD_MS;
  const closesAt = start + scheduled.durationMinutes * 60_000;
  const now = Date.now();
  if (now < opensAt) {
    joinBtn.disabled = true;
    const mins = Math.ceil((opensAt - now) / 60_000);
    setStatus(`You can join ${mins} minute${mins === 1 ? '' : 's'} before the start time.`);
  } else if (now > closesAt) {
    joinBtn.disabled = true;
    setStatus('This interview link has expired.');
  } else {
    joinBtn.disabled = false;
    setStatus('You can join now.');
  }
}
// ----------------------------------------------------------------------------

async function join() {
  if (!$<HTMLInputElement>('consent').checked) {
    setStatus('Please accept the recording notice first.');
    return;
  }
  joinBtn.disabled = true;
  setStatus('Creating room…');

  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidateName: nameInput.value || 'Candidate', token: scheduleToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const reason =
      body.error === 'too_early' ? 'It is not time for this interview yet.'
      : body.error === 'expired' ? 'This interview link has expired.'
      : body.error === 'invalid_link' ? 'This interview link is invalid.'
      : 'Failed to create session — is the server running?';
    setStatus(reason);
    joinBtn.disabled = false;
    return;
  }
  const { url, token } = (await res.json()) as { url: string; token: string };

  room = new Room({ adaptiveStream: true, dynacast: true });

  // Play the AI interviewer's voice as soon as its audio track arrives.
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.setAttribute('autoplay', 'true');
      document.body.appendChild(el);
      setStatus('Connected — the interviewer is speaking. Say hello!');
    }
  });
  room.on(RoomEvent.Disconnected, () => setStatus('Call ended.'));

  setStatus('Connecting…');
  await room.connect(url, token);
  await room.localParticipant.enableCameraAndMicrophone();

  const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
  cam?.videoTrack?.attach(localVideo);

  leaveBtn.disabled = false;
  setStatus('Connected — waiting for the interviewer to join…');
}

async function leave() {
  await room?.disconnect();
  room = null;
  leaveBtn.disabled = true;
  joinBtn.disabled = false;
  setStatus('You left the interview.');
}

joinBtn.addEventListener('click', () => void join());
leaveBtn.addEventListener('click', () => void leave());
