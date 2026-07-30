import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import {
  fetchAiInterviewContext,
  startAiInterviewSession,
  type AiInterviewContext,
} from '../api/endpoints';

type Phase = 'loading' | 'invalid' | 'ready' | 'connecting' | 'live' | 'ended';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function AiInterviewPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';

  const [phase, setPhase] = useState<Phase>('loading');
  const [ctx, setCtx] = useState<AiInterviewContext | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('');
  const [now, setNow] = useState(Date.now());

  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Load the interview context (name, time, window state).
  useEffect(() => {
    if (!token) return setPhase('invalid');
    fetchAiInterviewContext(token)
      .then((c) => {
        setCtx(c);
        setPhase('ready');
      })
      .catch(() => setPhase('invalid'));
  }, [token]);

  // Tick so the countdown / window opens live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Compute window state client-side (server enforces authoritatively on join).
  const windowState = (() => {
    if (!ctx) return 'loading';
    const start = new Date(ctx.scheduledAt).getTime();
    if (now < start - ctx.leadMinutes * 60_000) return 'too_early';
    if (now > start + ctx.durationMinutes * 60_000 + 5 * 60_000) return 'expired';
    return 'open';
  })();

  async function join() {
    if (!consent || !token) return;
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
          setStatus('Connected — the interviewer is speaking. Say hello!');
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        setPhase('ended');
        setStatus('The interview has ended. Thank you!');
      });

      await room.connect(url, lkToken);
      await room.localParticipant.enableCameraAndMicrophone();
      const cam = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (cam?.videoTrack && localVideoRef.current) cam.videoTrack.attach(localVideoRef.current);

      setPhase('live');
      setStatus('Connected — waiting for the interviewer…');
    } catch (err) {
      setPhase('ready');
      setStatus(
        err instanceof Error && /too_early|expired/.test(err.message)
          ? 'This interview link is not active right now.'
          : 'Could not start the interview. Please check your camera/mic permissions.',
      );
    }
  }

  async function leave() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setPhase('ended');
  }

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-slate-800 dark:text-slate-100">
      <h1 className="text-2xl font-bold">AI Voice Interview</h1>

      {phase === 'loading' && <p className="mt-4 text-slate-500">Loading…</p>}

      {phase === 'invalid' && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          This interview link is invalid or has expired. Please contact the recruiter.
        </p>
      )}

      {ctx && phase !== 'invalid' && (
        <>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Hi {ctx.candidateName} — your interview is scheduled for{' '}
            <strong>{fmt(ctx.scheduledAt)}</strong> ({ctx.durationMinutes} min).
          </p>

          {phase === 'ready' && (
            <div className="mt-6 space-y-4">
              <label className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  I understand this interview is conducted by an AI and is <strong>recorded</strong>{' '}
                  for the hiring team.
                </span>
              </label>

              {windowState === 'too_early' && (
                <p className="text-sm text-amber-600">
                  You can join {ctx.leadMinutes} minutes before the start time.
                </p>
              )}
              {windowState === 'expired' && (
                <p className="text-sm text-rose-600">This interview link has expired.</p>
              )}

              <button
                type="button"
                disabled={!consent || windowState !== 'open'}
                onClick={() => void join()}
                className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Join interview
              </button>
              {status && <p className="text-sm text-slate-500">{status}</p>}
            </div>
          )}

          {(phase === 'connecting' || phase === 'live') && (
            <div className="mt-6 space-y-3">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full max-w-md rounded-xl bg-black"
                style={{ aspectRatio: '4 / 3' }}
              />
              <p className="text-sm text-slate-500">{status}</p>
              {phase === 'live' && (
                <button
                  type="button"
                  onClick={() => void leave()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium dark:border-slate-600"
                >
                  Leave
                </button>
              )}
            </div>
          )}

          {phase === 'ended' && (
            <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              {status || 'The interview has ended. Thank you!'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
