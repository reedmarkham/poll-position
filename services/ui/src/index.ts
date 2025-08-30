import { renderVisualization } from './components/visualization';
import { loadLatestPollData } from './utils/loadS3';
import type { RawPollRow } from './components/visualization'; // reuse the type for clarity

// Create the container first
const container = document.createElement('div');
container.id = 'visualization-container';
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

    renderVisualization(data as RawPollRow[], 'visualization-container');
  } catch (error) {
    console.error('❌ Visualization load failed:', error);
  }
}

main();
