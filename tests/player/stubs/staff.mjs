// PlayerStaff without Verovio: records what the page asks of it.
// Two slots (top, bottom), one of them active; range / hits are the active slot's, as in the real one.
export class PlayerStaff {
  constructor() { this.hits = {}; this.range = null; this.ranges = []; this.active = 0; this.marker = null; this.anchors = null; this.renders = []; this.shows = []; this.prepared = []; this.tints = {}; this.onBarTap = null; this.missed = []; this.pill = ''; this.pills = []; this.pillColor = ''; this._pillTimer = 0; }
  prepare(norm, ranges) { this.clear(); this.prepared.push((ranges || []).map(r => [r.from, r.to])); return Promise.resolve({ warnings: [] }); }
  async show(top, bottom = null, { active = 0, animate = true, label = '' } = {}) {
    this.ranges = [top, bottom].filter(Boolean).map(r => ({ from: r.from, to: r.to }));
    this.active = active && this.ranges.length > 1 ? 1 : 0;
    this.range = this.ranges[this.active];
    this.marker = null;
    this.renders.push([this.range.from, this.range.to]);   // the active line, as render() recorded it
    this.shows.push({ top: [top.from, top.to], bottom: bottom ? [bottom.from, bottom.to] : null, active: this.active, animate, label });
    this.hits = {};
    return { warnings: [], hits: this.hits };
  }
  clear() { this.hits = {}; this.range = null; this.ranges = []; this.active = 0; }
  clearStates() {} setDimmed() {} setNoteState() {}
  setMissed(ids) { this.missed = [...(ids || [])]; }   // play-along's missed notes (soft coral in the real one); the stub has no hits, so the ids are always []
  setBarTint(tint, bars) { this.tints[tint] = bars; }
  setBarMarker(bar) { this.marker = bar; }
  setAnchors(anchors) { this.anchors = anchors; }
  noteIds() { return []; }
  // The pill over the staff: `pill` is the text showing ('' : none), `pills` every change, `pillColor` the colour the last message asked for ('' : the pill's own); a hold ends as in the real one (without the fades).
  setPill(text, { holdMs = 0, color = '' } = {}) {
    clearTimeout(this._pillTimer); this._pillTimer = 0;
    const next = text ? String(text) : '';
    if (next !== this.pill || next) this.pills.push(next);
    this.pill = next;
    if (next) this.pillColor = color || '';
    if (next && holdMs > 0) this._pillTimer = setTimeout(() => { this._pillTimer = 0; this.pill = ''; this.pills.push(''); }, holdMs);
  }
}
