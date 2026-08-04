import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from 'livekit-client';
import {
  LuMic,
  LuMicOff,
  LuPhoneOff,
  LuVideo,
  LuVideoOff,
} from 'react-icons/lu';
import { API_BASE } from '../api/client';
import {
  fetchAiInterviewContext,
  startAiInterviewSession,
  type AiInterviewContext,
} from '../api/endpoints';

type Phase = 'loading' | 'invalid' | 'lobby' | 'connecting' | 'live' | 'ended';

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function clock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Candidate-facing interview room.
 *
 * Robin has no camera, so the AI gets a designed presence — an orb driven by its real
 * audio level — rather than leaving the candidate staring at their own self-view while a
 * disembodied voice asks questions. Layout mirrors a familiar call UI (lobby → two-tile
 * grid → ended) so nothing about the format needs explaining.
 */
export default function AiInterviewPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [ctx, setCtx] = useState<AiInterviewContext | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(Date.now());

  // Device state — chosen in the lobby, carried into the call.
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Call state
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [agentLevel, setAgentLevel] = useState(0);
  const [youSpeaking, setYouSpeaking] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const roomRef = useRef<Room | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const callVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewStream = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // --- Load interview context -------------------------------------------------
  useEffect(() => {
    if (!token) return setPhase('invalid');
    fetchAiInterviewContext(token)
      .then((c) => {
        setCtx(c);
        setPhase('lobby');
      })
      .catch(() => setPhase('invalid'));
  }, [token]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const windowState = (() => {
    if (!ctx) return 'loading';
    const start = new Date(ctx.scheduledAt).getTime();
    if (now < start - ctx.leadMinutes * 60_000) return 'too_early';
    if (now > start + ctx.durationMinutes * 60_000 + 5 * 60_000) return 'expired';
    return 'open';
  })();

  const stopPreview = useCallback(() => {
    previewStream.current?.getTracks().forEach((t) => t.stop());
    previewStream.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    cancelAnimationFrame(rafRef.current);
  }, []);

  // --- Lobby: live camera preview + mic level meter ---------------------------
  useEffect(() => {
    if (phase !== 'lobby') return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStream.current = stream;
        if (previewRef.current) previewRef.current.srcObject = stream;
        setDeviceError(null);

        // Drive the mic meter so a dead microphone is obvious before joining.
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const src = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setMicLevel(peak);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (!cancelled) {
          setDeviceError(
            'We could not reach your camera or microphone. Check your browser permissions, then reload.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stopPreview();
    };
  }, [phase, stopPreview]);

  // Reflect lobby toggles onto the preview tracks.
  useEffect(() => {
    previewStream.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn]);
  useEffect(() => {
    previewStream.current?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [camOn]);

  // --- Join -------------------------------------------------------------------
  async function join() {
    if (!consent || !token) return;
    stopPreview();
    setPhase('connecting');
    setStatus('Connecting…');
    try {
      const { url, token: lkToken } = await startAiInterviewSession(token);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.autoplay = true;
          document.body.appendChild(el);
        }
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const ids = new Set(speakers.map((s) => s.identity));
        setYouSpeaking(ids.has(room.localParticipant.identity));
        setAgentSpeaking([...ids].some((i) => i !== room.localParticipant.identity));
      });
      room.on(RoomEvent.Disconnected, () => {
        setPhase('ended');
        setStatus('The interview has ended. Thank you!');
      });

      await room.connect(url, lkToken);
      await room.localParticipant.setMicrophoneEnabled(micOn);
      await room.localParticipant.setCameraEnabled(camOn);

      const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (cam?.videoTrack && callVideoRef.current) cam.videoTrack.attach(callVideoRef.current);

      setStartedAt(Date.now());
      setPhase('live');
      setStatus('');

      // Animate the orb from the agent's real audio level.
      const pollLevels = () => {
        let level = 0;
        room.remoteParticipants.forEach((p) => (level = Math.max(level, p.audioLevel ?? 0)));
        setAgentLevel(level);
        rafRef.current = requestAnimationFrame(pollLevels);
      };
      pollLevels();
    } catch (err) {
      setPhase('lobby');
      setStatus(
        err instanceof Error && /too_early|expired/.test(err.message)
          ? 'This interview link is not active right now.'
          : 'Could not start the interview. Please check your camera and microphone permissions.',
      );
    }
  }

  async function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
  }
  async function toggleCam() {
    const next = !camOn;
    setCamOn(next);
    await roomRef.current?.localParticipant.setCameraEnabled(next);
    if (next) {
      const cam = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera);
      if (cam?.videoTrack && callVideoRef.current) cam.videoTrack.attach(callVideoRef.current);
    }
  }

  const leave = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setPhase('ended');
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      void roomRef.current?.disconnect();
      stopPreview();
    },
    [stopPreview],
  );

  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const total = (ctx?.durationMinutes ?? 12) * 60;

  // Report time spent away from the interview tab. Advisory only — the recruiter sees it
  // beside the recording; nothing is scored or blocked on it. sendBeacon is used when the
  // page is being hidden so the report still lands if the candidate closes the tab.
  useEffect(() => {
    if (phase !== 'live' || !token) return;
    let hiddenAt: number | null = null;

    const report = (awaySeconds: number) => {
      if (awaySeconds < 1) return;
      const body = JSON.stringify({ token, awaySeconds });
      const url = `${API_BASE}/ai-interview/focus`;
      if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) {
        void fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        report(Math.round((Date.now() - hiddenAt) / 1000));
        hiddenAt = null;
      }
    };
    // If they never come back, still report what we know as the page unloads.
    const onPageHide = () => {
      if (hiddenAt) report(Math.round((Date.now() - hiddenAt) / 1000));
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [phase, token]);

  // --- Screens ----------------------------------------------------------------

  if (phase === 'loading') {
    return (
      <Shell>
        <p className="text-slate-400">Loading your interview…</p>
      </Shell>
    );
  }

  if (phase === 'invalid') {
    return (
      <Shell>
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <h1 className="text-lg font-semibold text-white">This link isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-slate-300">
            It may have expired or already been used. Please contact the recruiter for a new one.
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === 'ended') {
    return (
      <Shell>
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white">Interview complete</h1>
          <p className="mt-2 text-sm text-slate-300">
            Thanks for your time{ctx ? `, ${ctx.candidateName.split(' ')[0]}` : ''}. The hiring team
            will review the conversation and follow up with you about next steps.
          </p>
          <p className="mt-4 text-xs text-slate-500">You can close this tab.</p>
        </div>
      </Shell>
    );
  }

  // --- In call: two-tile grid -------------------------------------------------
  if (phase === 'live' || phase === 'connecting') {
    return (
      <div className="flex min-h-screen flex-col bg-slate-950">
        {/* Top bar */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-rose-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            Recording
          </span>
          <span className="truncate text-sm text-slate-300">AI interview</span>
          <span className="ml-auto font-mono text-sm tabular-nums text-slate-400">
            {clock(elapsed)} <span className="text-slate-600">/ {clock(total)}</span>
          </span>
        </header>

        {/* Tiles */}
        <main className="grid flex-1 grid-cols-1 gap-3 px-4 pb-3 sm:px-6 lg:grid-cols-2">
          {/* AI interviewer */}
          <Tile speaking={agentSpeaking} label="Robin" sublabel="AI interviewer">
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <Orb level={agentLevel} speaking={agentSpeaking} />
              <p className="text-sm text-slate-400">
                {phase === 'connecting'
                  ? 'Connecting…'
                  : agentSpeaking
                    ? 'Speaking…'
                    : 'Listening'}
              </p>
            </div>
          </Tile>

          {/* Candidate */}
          <Tile speaking={youSpeaking} label={ctx?.candidateName ?? 'You'} sublabel="You" muted={!micOn}>
            <video
              ref={callVideoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${camOn ? '' : 'invisible'}`}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-2xl font-semibold text-slate-300">
                  {(ctx?.candidateName ?? 'You').slice(0, 1).toUpperCase()}
                </div>
              </div>
            )}
          </Tile>
        </main>

        {/* Controls */}
        <footer className="flex items-center justify-center gap-3 px-4 pb-6 pt-2">
          <CtlButton onClick={() => void toggleMic()} active={micOn} label={micOn ? 'Mute' : 'Unmute'}>
            {micOn ? <LuMic className="h-5 w-5" /> : <LuMicOff className="h-5 w-5" />}
          </CtlButton>
          <CtlButton onClick={() => void toggleCam()} active={camOn} label={camOn ? 'Turn camera off' : 'Turn camera on'}>
            {camOn ? <LuVideo className="h-5 w-5" /> : <LuVideoOff className="h-5 w-5" />}
          </CtlButton>
          <button
            type="button"
            onClick={() => void leave()}
            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
          >
            <LuPhoneOff className="h-4 w-4" />
            Leave
          </button>
        </footer>
      </div>
    );
  }

  // --- Lobby ------------------------------------------------------------------
  return (
    <Shell wide>
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        {/* Camera preview */}
        <div>
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
            <video
              ref={previewRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${camOn ? '' : 'invisible'}`}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Camera is off
              </div>
            )}
            {deviceError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-6 text-center text-sm text-rose-300">
                {deviceError}
              </div>
            )}
          </div>

          {/* Device controls + mic meter */}
          <div className="mt-3 flex items-center gap-3">
            <CtlButton onClick={() => setMicOn((v) => !v)} active={micOn} label={micOn ? 'Mute' : 'Unmute'} small>
              {micOn ? <LuMic className="h-4 w-4" /> : <LuMicOff className="h-4 w-4" />}
            </CtlButton>
            <CtlButton onClick={() => setCamOn((v) => !v)} active={camOn} label={camOn ? 'Turn camera off' : 'Turn camera on'} small>
              {camOn ? <LuVideo className="h-4 w-4" /> : <LuVideoOff className="h-4 w-4" />}
            </CtlButton>
            {/* Mic level — proves the microphone is actually picking you up. */}
            <div className="flex flex-1 items-center gap-1" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-colors ${
                    micOn && micLevel * 14 > i ? 'bg-emerald-400' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Context + consent */}
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Ready to start{ctx ? `, ${ctx.candidateName.split(' ')[0]}` : ''}?
          </h1>
          {ctx && (
            <p className="mt-1.5 text-sm text-slate-400">
              {fmtWhen(ctx.scheduledAt)} · about {ctx.durationMinutes} minutes
            </p>
          )}

          <ul className="mt-5 space-y-2 text-sm text-slate-300">
            <li className="flex gap-2"><span className="text-slate-500">1.</span> An AI interviewer named Robin will ask about your experience.</li>
            <li className="flex gap-2"><span className="text-slate-500">2.</span> Answer out loud, as you would with a person — take your time.</li>
            <li className="flex gap-2"><span className="text-slate-500">3.</span> A human reviews the conversation afterwards. Robin does not decide anything.</li>
          </ul>

          <label className="mt-5 flex items-start gap-2.5 rounded-xl bg-white/5 p-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
            />
            <span>
              I understand this interview is conducted by an AI and is{' '}
              <strong className="text-white">recorded</strong> for the hiring team.
            </span>
          </label>

          {windowState === 'too_early' && ctx && (
            <p className="mt-3 text-sm text-amber-400">
              You can join {ctx.leadMinutes} minutes before the start time.
            </p>
          )}
          {windowState === 'expired' && (
            <p className="mt-3 text-sm text-rose-400">This interview link has expired.</p>
          )}
          {status && <p className="mt-3 text-sm text-rose-400">{status}</p>}

          <button
            type="button"
            disabled={!consent || windowState !== 'open'}
            onClick={() => void join()}
            className="mt-5 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Join interview
          </button>
        </div>
      </div>
    </Shell>
  );
}

/** Dark canvas shared by every non-call screen. */
function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className={wide ? 'w-full' : ''}>{children}</div>
    </div>
  );
}

/** A participant tile. The ring is the active-speaker cue. */
function Tile({
  children,
  speaking,
  label,
  sublabel,
  muted,
}: {
  children: React.ReactNode;
  speaking: boolean;
  label: string;
  sublabel: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`relative min-h-64 overflow-hidden rounded-2xl bg-slate-900 transition-shadow ${
        speaking ? 'ring-2 ring-brand-400' : 'ring-1 ring-white/10'
      }`}
    >
      {children}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-slate-950/70 px-2.5 py-1.5 backdrop-blur">
        <span className="text-xs font-medium text-white">{label}</span>
        <span className="text-[11px] text-slate-400">{sublabel}</span>
        {muted && <LuMicOff className="h-3.5 w-3.5 text-rose-400" />}
      </div>
    </div>
  );
}

/**
 * Robin's stand-in for a camera feed: a soft orb that scales with the AI's real audio
 * level, so the candidate can see who is talking on a call with no second face.
 */
function Orb({ level, speaking }: { level: number; speaking: boolean }) {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const scale = reduce ? 1 : 1 + Math.min(level, 1) * 0.35;
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <span
        className="absolute inset-0 rounded-full bg-brand-500/20 blur-xl transition-transform duration-100"
        style={{ transform: `scale(${scale})` }}
      />
      <span
        className={`absolute inset-4 rounded-full bg-brand-500/30 transition-transform duration-100 ${
          speaking && !reduce ? 'animate-pulse' : ''
        }`}
        style={{ transform: `scale(${scale})` }}
      />
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-brand-600 text-lg font-semibold text-white shadow-lg">
        R
      </span>
    </div>
  );
}

/** Round call control (mic / camera). */
function CtlButton({
  children,
  onClick,
  active,
  label,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={!active}
      title={label}
      className={`inline-flex items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400 ${
        small ? 'h-9 w-9' : 'h-12 w-12'
      } ${
        active
          ? 'bg-white/10 text-white hover:bg-white/15'
          : 'bg-rose-600 text-white hover:bg-rose-700'
      }`}
    >
      {children}
    </button>
  );
}
