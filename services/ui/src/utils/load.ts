let cachedPollData: any[] | null = null;
let availableSeasons: number[] = [];

export async function loadAvailableSeasons(): Promise<number[]> {
  if (availableSeasons.length > 0) {
    return availableSeasons;
  }

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
  const endpoint = `${API_BASE}/api/seasons`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Failed to fetch seasons: ${response.status}`);
    }

    const data = await response.json();
    availableSeasons = data.seasons || [];
    return availableSeasons;
  } catch (error) {
    console.error('Failed to load seasons:', error);
    return [2024]; // Fallback to current year
  }
}

export async function loadLatestPollData(): Promise<any[]> {
  if (cachedPollData) {
    return cachedPollData;
  }

  // Load all available seasons and get data for all
  const seasons = await loadAvailableSeasons();
  const allData: any[] = [];
  
  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
  
  for (const season of seasons) {
    const endpoint = `${API_BASE}/api/latest-poll?season=${season}`;

    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        console.warn(`Failed to fetch data for season ${season}: ${response.status}`);
        continue;
      }

      const result = await response.json();
      let seasonData;
      
      // Handle new season-aware API response format
      if (result.season && result.data) {
        seasonData = result.data;
      } else if (Array.isArray(result)) {
        seasonData = result;
      } else {
        console.warn(`Unexpected data format for season ${season}`);
        continue;
      }

      const apTop25Regular = seasonData
        .filter((d: any) => d.poll === "AP Top 25" && d.seasonType === "regular")
        .map((d: any) => ({ ...d, season })); // Add season field to each record
      
      allData.push(...apTop25Regular);
    } catch (error) {
      console.warn(`Failed to load data for season ${season}:`, error);
      continue;
    }
  }
  
  cachedPollData = allData;

  const sample = cachedPollData.slice(0, 3);
  console.log('Sample multi-season AP Top 25 poll data:\n', JSON.stringify(sample, null, 2));
  console.log(`Loaded data for ${seasons.length} season(s): ${seasons.join(', ')}`);

  return cachedPollData;
}

