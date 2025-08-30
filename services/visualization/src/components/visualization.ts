import { select, scaleLinear, axisLeft, axisBottom, line, max, extent, groups, group, format } from 'd3';

export interface RawPollRow {
  week: number;
  poll: string;
  rank: number;
  school: string;
  color?: string;
  logos?: string[];
}

interface FlattenedTeamRank {
  week: number;
  rank: number;
  visualRank: number;
  school: string;
  color: string;
}

function normalizeTiedRanks(data: RawPollRow[]): RawPollRow[] {
  return groups(data, d => d.week).flatMap(([week, rows]) => {
    const groupedByRank = groups(rows, d => d.rank).sort((a, b) => a[0] - b[0]);
    let visualRankCounter = 1;
    return groupedByRank.flatMap(([rank, ties]) => {
      const sorted = ties.sort((a, b) => a.school.localeCompare(b.school));
      const applyOffset = week === 1;
      const offset = 0.1;
      return sorted.map((team, i) => ({
        ...team,
        visualRank: applyOffset
          ? rank + offset * (i - (sorted.length - 1) / 2)
          : visualRankCounter++,
      }));
    });
  });
}

export function renderVisualization(data: RawPollRow[], containerId: string): void {
  const normalized = normalizeTiedRanks(data);

  const groupedByWeek = groups(normalized, d => d.week).map(([week, rows]) => ({
    week: String(week),
    ranks: rows.map(r => ({
      rank: r.rank,
      visualRank: (r as any).visualRank,
      school: r.school,
      color: r.color,
      logos: r.logos ?? [],
    })),
  }));

  renderGroupedVisualization(groupedByWeek, containerId);
}

function renderGroupedVisualization(data: { week: string, ranks: any[] }[], containerId: string): void {
  const container = select(`#${containerId}`);
  container.selectAll('*').remove();

  const svg = container
    .append('svg')
    .style('width', '100%')
    .style('height', '100%')
    .attr('preserveAspectRatio', 'xMidYMid meet');

  const g = svg.append('g');

  function draw(width: number, height: number) {
    g.selectAll('*').remove();

    const margin = { top: 40, right: 60, bottom: 50, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);
    g.attr('transform', `translate(${margin.left},${margin.top})`);

    const flattenedData = data.flatMap(week =>
      week.ranks.map(team => ({
        week: +week.week,
        rank: team.rank,
        visualRank: team.visualRank,
        school: team.school,
        color: team.color || '#ccc',
      }))
    );

    const finalWeek = max(flattenedData, d => d.week) ?? 0;
    const topSchools = flattenedData
      .filter(d => d.week === finalWeek)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 12)
      .map(d => d.school);

    const grouped = group(flattenedData, d => d.school);
    const allTeams = Array.from(grouped.entries()).map(([school, ranks]) => ({
      school,
      ranks: ranks.sort((a, b) => a.week - b.week),
      color: ranks[0].color,
      isTop: topSchools.includes(school),
    }));

    const xScale = scaleLinear()
      .domain(extent(flattenedData, d => d.week) as [number, number])
      .range([0, innerWidth]);

    const yMax = max(flattenedData, d => d.visualRank) || 25;
    const yScale = scaleLinear().domain([1 - 0.5, yMax + 0.5]).range([0, innerHeight]);

    const baseRadius = Math.max(4, width / 120);
    const fontSize = Math.max(8, width / 80);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(axisBottom(xScale).ticks(data.length).tickFormat(format('d')));

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .attr('font-size', fontSize)
      .attr('fill', '#ccc')
      .text('Week');

    const lineGenerator = line<FlattenedTeamRank>()
      .defined(d => d.visualRank !== undefined && d.visualRank !== null)
      .x(d => xScale(d.week))
      .y(d => yScale(d.visualRank));

    const highlightLine = g.append('path')
      .attr('class', 'highlight-line')
      .attr('fill', 'none')
      .attr('stroke-width', 4)
      .attr('stroke', '#fff')
      .attr('opacity', 0)
      .style('pointer-events', 'none');

    g.selectAll('.team-line')
      .data(allTeams)
      .join(
        enter => enter.append('path')
          .attr('class', 'team-line')
          .attr('fill', 'none')
          .attr('stroke-width', d => d.isTop ? 2 : 1)
          .attr('opacity', d => d.isTop ? 0.7 : 0.3)
          .attr('stroke', d => d.isTop ? d.color : '#444')
          .attr('d', d => lineGenerator(d.ranks)!),
        update => update.transition().duration(600)
          .attr('d', d => lineGenerator(d.ranks)!),
        exit => exit.remove()
      );

    g.selectAll('.team-line-hover')
      .data(allTeams)
      .enter()
      .append('path')
      .attr('class', 'team-line-hover')
      .attr('d', d => lineGenerator(d.ranks)!)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 10)
      .style('cursor', 'pointer')
      .on('mouseenter', function (event, d) {
        highlightLine
          .attr('d', lineGenerator(d.ranks)!)
          .attr('stroke', d.color)
          .attr('opacity', 1);
      })
      .on('mouseleave', function () {
        highlightLine.attr('opacity', 0);
      });

    const points = g.selectAll('.team-point')
      .data(flattenedData)
      .enter()
      .append('g')
      .attr('class', 'team-point')
      .attr('transform', d => `translate(${xScale(d.week)},${yScale(d.visualRank ?? yMax)})`);

    points.append('circle')
      .attr('r', 0)
      .attr('fill', d => topSchools.includes(d.school) ? d.color : '#444')
      .style('opacity', d => topSchools.includes(d.school) ? 0.95 : 0.3)
      .transition()
      .duration(600)
      .attr('r', baseRadius);

    points.append('text')
      .attr('x', 0)
      .attr('y', 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', fontSize)
      .attr('font-weight', 'bold')
      .attr('fill', '#fff')
      .style('opacity', 0)
      .text(d => d.rank ?? '')
      .transition()
      .duration(600)
      .style('opacity', 1);

    points.append('title')
      .text(d => `${d.school}: Rank ${d.rank}`);

    // === Delta label rendering: 1 per team in final week ===
    const deltaX = innerWidth + 20;
    const finalWeekData = flattenedData.filter(d => d.week === finalWeek);

    const deltaData = finalWeekData.map(team => {
      const history = grouped.get(team.school);
      if (!history) return null;
      const firstEntry = history.reduce((min, d) => d.week < min.week ? d : min, history[0]);
      return {
        school: team.school,
        visualRank: team.visualRank,
        delta: team.rank - firstEntry.rank,
      };
    }).filter(Boolean);

    const deltaLabels = g.selectAll<SVGTextElement, typeof deltaData[0]>('.delta-label')
      .data(deltaData, d => d!.school)
      .enter()
      .append('text')
      .attr('class', 'delta-label')
      .attr('x', deltaX + 4)  // slight horizontal offset
      .attr('y', d => yScale(d!.visualRank) + 2)
      .attr('fill', '#ccc')
      .attr('font-size', fontSize)
      .attr('alignment-baseline', 'middle')
      .attr('text-anchor', 'start')
      .text(d => {
        if (!d) return '';
        const symbol = d.delta > 0 ? '🔽' : d.delta < 0 ? '🔼' : '➖';
        return `${Math.abs(d.delta)} ${symbol}`;
      });

    deltaLabels.append('title')
      .text(d => {
        if (!d) return '';
        if (d.delta === 0) return `${d.school} held steady since entering the 2024 AP Top 25 poll`;
        const verb = d.delta < 0 ? 'rose' : 'fell';
        return `${d.school} ${verb} ${Math.abs(d.delta)} place${Math.abs(d.delta) === 1 ? '' : 's'} since entering the 2024 AP Top 25 poll`;
      });

    g.append('line')
      .attr('x1', deltaX - 10)
      .attr('x2', deltaX - 10)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#333')
      .attr('stroke-dasharray', '4,2');

    g.append('text')
      .attr('x', deltaX)
      .attr('y', -10)
      .attr('text-anchor', 'end')
      .attr('font-size', fontSize * 0.9)
      .attr('fill', '#888')
      .text('Δ = Final – First Rank');
  }

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      const height = width * 0.6;
      draw(width, height);
    }
  });

  const domNode = container.node() as HTMLElement;
  if (domNode) {
    resizeObserver.observe(domNode);
  }
}
