// Tiny ASCII table + number formatting for the console report. No deps.

export const fmt = (n, digits = 3) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return Number(n).toFixed(digits);
};

// Signed delta with explicit +/- and an arrow, for regression scanning.
export const fmtDelta = (d, digits = 3) => {
    if (d === null || d === undefined || Number.isNaN(d)) return '—';
    const s = d >= 0 ? '+' : '';
    const arrow = Math.abs(d) < 0.0005 ? '·' : (d > 0 ? '▲' : '▼');
    return `${arrow} ${s}${Number(d).toFixed(digits)}`;
};

export const table = (headers, rows) => {
    const all = [headers, ...rows].map(r => r.map(c => String(c)));
    const widths = headers.map((_, i) => Math.max(...all.map(r => (r[i] || '').length)));
    const line = cells => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
    const sep = widths.map(w => '─'.repeat(w)).join('  ');
    return [line(all[0]), sep, ...all.slice(1).map(line)].join('\n');
};
