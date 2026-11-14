// PlayerStaff without Verovio: records what the page asks of it.
export class PlayerStaff {
  constructor() { this.hits = {}; this.range = null; this.marker = null; this.anchors = null; this.renders = []; this.onBarTap = null; }
  async render(norm, from, { to } = {}) { this.range = { from, to }; this.renders.push([from, to]); this.hits = {}; return { warnings: [], hits: this.hits }; }
  clear() { this.hits = {}; this.range = null; }
  clearStates() {} setDimmed() {} setNoteState() {} setBarTint() {}
  setBarMarker(bar) { this.marker = bar; }
  setAnchors(anchors) { this.anchors = anchors; }
  noteIds() { return []; }
}
