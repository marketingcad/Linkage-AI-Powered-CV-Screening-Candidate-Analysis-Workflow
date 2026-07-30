const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Default the time picker to ~5 minutes from now, in the local timezone.
const when = $<HTMLInputElement>('when');
const soon = new Date(Date.now() + 5 * 60_000);
soon.setSeconds(0, 0);
when.value = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

$('make').addEventListener('click', async () => {
  const candidateName = $<HTMLInputElement>('name').value || 'Candidate';
  const scheduledAt = new Date(when.value).toISOString(); // datetime-local is local → ISO
  const durationMinutes = Number($<HTMLInputElement>('dur').value) || 15;

  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ candidateName, scheduledAt, durationMinutes }),
  });
  if (!res.ok) {
    alert('Failed to create link — is the server running?');
    return;
  }
  const data = (await res.json()) as { link: string; opensMinutesBefore: number };
  const full = location.origin + data.link;

  $('out').style.display = 'block';
  $<HTMLInputElement>('link').value = full;
  $<HTMLAnchorElement>('open').href = full;
  $('window').textContent = `(opens ${data.opensMinutesBefore} min before the start time)`;
  $<HTMLInputElement>('link').select();
});
