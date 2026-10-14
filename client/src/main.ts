const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '<h1>Paleodig</h1><p>Loading...</p>';

async function load() {
  try {
    const res = await fetch(`${API_URL}/api/test`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows: Record<string, unknown>[] = await res.json();

    const list = rows
      .map((row) => `<li>${Object.values(row).join(' | ')}</li>`)
      .join('');

    app.innerHTML = `<h1>Paleodig</h1><ul>${list || '<li>(table is empty)</li>'}</ul>`;
  } catch (err) {
    app.innerHTML = `<h1>Paleodig</h1><p>Could not load data: ${String(err)}</p>`;
  }
}

load();