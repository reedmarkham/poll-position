import { renderUI } from './components/ui';
import { loadLatestPollData } from './utils/load';
import type { RawPollRow } from './components/ui'; // reuse the type for clarity

// Create the container first
const container = document.createElement('div');
container.id = 'ui-container';
const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');
app.appendChild(container);

async function main() {
  try {
    const data = await loadLatestPollData();

    // Sanity check the type
    if (!Array.isArray(data)) {
      throw new Error('Loaded data is not an array of rows.');
    }

    renderUI(data as RawPollRow[], 'ui-container');
  } catch (error) {
    console.error('❌ UI load failed:', error);
  }
}

main();
