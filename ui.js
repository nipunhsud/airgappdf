export function download(bytes, filename, type = 'application/pdf') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'status error' : 'status';
}

export async function run(fn) {
  try {
    setStatus('Working…');
    await fn();
    setStatus('Done — download started.');
  } catch (e) {
    setStatus(e.message, true);
  }
}
