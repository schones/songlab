// studio.js — Main entry point for Skratch Studio

import { registerBlocks, getToolboxXml } from './blocks.js';
import { registerGenerators } from './generators.js';
import { registerMusicBlocks, getMusicToolboxXml } from './music-blocks.js';
import { registerMusicGenerators } from './music-generators.js';
import { MusicEngine } from './music-engine.js';
import { Sandbox } from './sandbox.js';
import { AudioBridge } from './audio-bridge.js';
import { Piano } from '../shared/ui/piano.js';
import { LoopPedal } from './loop-pedal.js';

const STORAGE_KEY = 'skratch-studio-workspace';
const LOOPS_STORAGE_KEY = 'skratch_loops';
const _loopRegistry = new Map();
let _loopMicPlayers = []; // active Tone.Player instances from __playLoop mic layers

// --- Helper: build a chain of next-linked blocks for JSON serialization ---
function chain(...blocks) {
  if (blocks.length === 0) return undefined;
  const result = { ...blocks[0] };
  let current = result;
  for (let i = 1; i < blocks.length; i++) {
    current.next = { block: { ...blocks[i] } };
    current = current.next.block;
  }
  return result;
}

function starter(topBlock) {
  return { blocks: { languageVersion: 0, blocks: topBlock ? [topBlock] : [] } };
}

function multiStarter(...topBlocks) {
  return { blocks: { languageVersion: 0, blocks: topBlocks } };
}

// --- Starter Programs (Blockly JSON serialization) ---
const STARTERS = {
  blank: {
    name: 'Blank Canvas',
    json: starter(null)
  },

  circles: {
    name: 'Circles',
    json: starter(chain(
      { type: 'set_background', x: 20, y: 20, fields: { COLOR: '#1e1e2e' } },
      { type: 'save_position' },
      { type: 'move_to_center' },
      { type: 'no_fill' },
      { type: 'set_stroke', fields: { COLOR: '#a29bfe' } },
      { type: 'set_stroke_weight', fields: { WEIGHT: 2 } },
      {
        type: 'repeat_times', fields: { TIMES: 6 },
        inputs: {
          DO: {
            block: chain(
              { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 50 } },
              { type: 'grow_by', fields: { PERCENT: 30 } }
            )
          }
        }
      },
      { type: 'restore_position' }
    ))
  },

  rainbow: {
    name: 'Rainbow Grid',
    json: starter(chain(
      { type: 'set_background', x: 20, y: 20, fields: { COLOR: '#1e1e2e' } },
      { type: 'save_position' },
      { type: 'no_fill' },
      { type: 'set_stroke', fields: { COLOR: '#ff6600' } },
      { type: 'set_stroke_weight', fields: { WEIGHT: 2 } },
      {
        type: 'repeat_times', fields: { TIMES: 8 },
        inputs: {
          DO: {
            block: chain(
              { type: 'save_position' },
              {
                type: 'repeat_times', fields: { TIMES: 8 },
                inputs: {
                  DO: {
                    block: chain(
                      { type: 'draw_rect', fields: { X: 0, Y: 0, W: 40, H: 40 } },
                      { type: 'move_to', fields: { X: 50, Y: 0 } }
                    )
                  }
                }
              },
              { type: 'restore_position' },
              { type: 'move_to', fields: { X: 0, Y: 50 } }
            )
          }
        }
      },
      { type: 'restore_position' }
    ))
  },

  spiral: {
    name: 'Spiral',
    json: starter(chain(
      { type: 'set_background', x: 20, y: 20, fields: { COLOR: '#1e1e2e' } },
      { type: 'save_position' },
      { type: 'move_to_center' },
      { type: 'set_stroke', fields: { COLOR: '#00cec9' } },
      { type: 'no_fill' },
      { type: 'set_stroke_weight', fields: { WEIGHT: 2 } },
      {
        type: 'repeat_times', fields: { TIMES: 36 },
        inputs: {
          DO: {
            block: chain(
              { type: 'draw_circle', fields: { X: 60, Y: 0, SIZE: 30 } },
              { type: 'rotate_by', fields: { ANGLE: 10 } },
              { type: 'grow_by', fields: { PERCENT: 3 } }
            )
          }
        }
      },
      { type: 'restore_position' }
    ))
  },

  sound_circles: {
    name: 'Sound Circles',
    json: starter(chain(
      { type: 'set_background', x: 20, y: 20, fields: { COLOR: '#1e1e2e' } },
      { type: 'save_position' },
      { type: 'move_to_center' },
      { type: 'no_fill' },
      { type: 'set_stroke', fields: { COLOR: '#a29bfe' } },
      { type: 'set_stroke_weight', fields: { WEIGHT: 2 } },
      {
        type: 'simple_if',
        inputs: {
          CONDITION: { block: { type: 'note_is_playing' } },
          DO: {
            block: chain(
              { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 150 } },
              { type: 'set_stroke', fields: { COLOR: '#00cec9' } },
              { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 100 } },
              { type: 'set_stroke', fields: { COLOR: '#ff6600' } },
              { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 50 } }
            )
          }
        }
      },
      { type: 'restore_position' }
    ))
  },

  note_garden: {
    name: 'Note Garden',
    json: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'when_start_clicked', x: 20, y: 20,
            inputs: {
              DO: { block: { type: 'draw_trail' } }
            }
          },
          {
            type: 'when_specific_note', x: 20, y: 140,
            fields: { NOTE: 'C' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 80, Y: 100 } },
                  { type: 'set_fill', fields: { COLOR: '#ff6b6b' } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 50 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_specific_note', x: 20, y: 340,
            fields: { NOTE: 'D' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 280, Y: 70 } },
                  { type: 'set_fill', fields: { COLOR: '#ffa502' } },
                  { type: 'draw_star', fields: { X: 0, Y: 0, SIZE: 25 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_specific_note', x: 20, y: 540,
            fields: { NOTE: 'E' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 180, Y: 200 } },
                  { type: 'set_fill', fields: { COLOR: '#ffd93d' } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 40 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_specific_note', x: 20, y: 740,
            fields: { NOTE: 'F' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 60, Y: 280 } },
                  { type: 'set_fill', fields: { COLOR: '#2ed573' } },
                  { type: 'draw_star', fields: { X: 0, Y: 0, SIZE: 30 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_specific_note', x: 380, y: 20,
            fields: { NOTE: 'G' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 320, Y: 220 } },
                  { type: 'set_fill', fields: { COLOR: '#00cec9' } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 45 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_specific_note', x: 380, y: 220,
            fields: { NOTE: 'A' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 140, Y: 340 } },
                  { type: 'set_fill', fields: { COLOR: '#a29bfe' } },
                  { type: 'draw_star', fields: { X: 0, Y: 0, SIZE: 25 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_specific_note', x: 380, y: 420,
            fields: { NOTE: 'B' },
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to', fields: { X: 300, Y: 340 } },
                  { type: 'set_fill', fields: { COLOR: '#fd79a8' } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 35 } },
                  { type: 'restore_position' }
                )
              }
            }
          }
        ]
      }
    }
  },

  bounce: {
    name: 'Bounce',
    json: {
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'when_start_clicked', x: 20, y: 20,
            inputs: {
              DO: {
                block: chain(
                  { type: 'draw_trail' },
                  { type: 'save_position' },
                  { type: 'move_to_center' },
                  { type: 'set_fill', fields: { COLOR: '#a29bfe' } },
                  {
                    type: 'simple_if',
                    inputs: {
                      CONDITION: { block: { type: 'note_is_playing' } },
                      DO: { block: { type: 'set_fill', fields: { COLOR: '#ff6b6b' } } }
                    }
                  },
                  { type: 'set_stroke', fields: { COLOR: '#ffffff' } },
                  { type: 'set_stroke_weight', fields: { WEIGHT: 2 } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 60 } },
                  { type: 'restore_position' }
                )
              }
            }
          },
          {
            type: 'when_note_played', x: 20, y: 420,
            inputs: {
              DO: {
                block: chain(
                  { type: 'save_position' },
                  { type: 'move_to_center' },
                  { type: 'no_fill' },
                  { type: 'set_stroke', fields: { COLOR: '#ff6b6b' } },
                  { type: 'set_stroke_weight', fields: { WEIGHT: 3 } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 120 } },
                  { type: 'set_stroke', fields: { COLOR: '#ffd93d' } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 180 } },
                  { type: 'set_stroke', fields: { COLOR: '#00cec9' } },
                  { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 240 } },
                  { type: 'restore_position' }
                )
              }
            }
          }
        ]
      }
    }
  },

  // --- Music Starters (Part C) ---

  first_beat: {
    name: 'First Beat',
    json: starter({
      type: 'music_start', x: 20, y: 20,
      inputs: {
        DO: {
          block: chain(
            { type: 'set_tempo', fields: { BPM: 100 } },
            { type: 'play_kick', fields: { TIME: '0:0:0' } },
            { type: 'play_hihat', fields: { TIME: '0:0:2' } },
            { type: 'play_snare', fields: { TIME: '0:1:0' } },
            { type: 'play_hihat', fields: { TIME: '0:1:2' } },
            { type: 'play_kick', fields: { TIME: '0:2:0' } },
            { type: 'play_hihat', fields: { TIME: '0:2:2' } },
            { type: 'play_snare', fields: { TIME: '0:3:0' } },
            { type: 'play_hihat', fields: { TIME: '0:3:2' } }
          )
        }
      }
    })
  },

  bass_groove: {
    name: 'Bass Groove',
    json: starter({
      type: 'music_start', x: 20, y: 20,
      inputs: {
        DO: {
          block: chain(
            { type: 'set_tempo', fields: { BPM: 110 } },
            { type: 'drum_pattern', fields: { PATTERN: 'rock' } },
            { type: 'play_bass_note', fields: { NOTE: 'C2', DURATION: '4n', TIME: '0:0:0' } },
            { type: 'play_bass_note', fields: { NOTE: 'C2', DURATION: '8n', TIME: '0:1:0' } },
            { type: 'play_bass_note', fields: { NOTE: 'E2', DURATION: '8n', TIME: '0:1:2' } },
            { type: 'play_bass_note', fields: { NOTE: 'G2', DURATION: '4n', TIME: '0:2:0' } },
            { type: 'play_bass_note', fields: { NOTE: 'F2', DURATION: '4n', TIME: '0:3:0' } }
          )
        }
      }
    })
  },

  my_first_song: {
    name: 'My First Song',
    json: starter({
      type: 'music_start', x: 20, y: 20,
      inputs: {
        DO: {
          block: chain(
            { type: 'set_tempo', fields: { BPM: 120 } },
            {
              type: 'section', fields: { NAME: 'verse', MEASURES: '2' },
              inputs: {
                DO: {
                  block: chain(
                    { type: 'drum_pattern', fields: { PATTERN: 'rock' } },
                    { type: 'play_bass_note', fields: { NOTE: 'C2', DURATION: '4n', TIME: '0:0:0' } },
                    { type: 'play_bass_note', fields: { NOTE: 'G2', DURATION: '4n', TIME: '0:2:0' } },
                    { type: 'play_melody_note', fields: { NOTE: 'E4', DURATION: '4n', TIME: '0:0:0' } },
                    { type: 'play_melody_note', fields: { NOTE: 'D4', DURATION: '4n', TIME: '0:1:0' } },
                    { type: 'play_melody_note', fields: { NOTE: 'C4', DURATION: '2n', TIME: '0:2:0' } }
                  )
                }
              }
            },
            {
              type: 'section', fields: { NAME: 'chorus', MEASURES: '2' },
              inputs: {
                DO: {
                  block: chain(
                    { type: 'drum_pattern', fields: { PATTERN: 'four' } },
                    { type: 'play_chord', fields: { ROOT: 'C', QUALITY: 'major', DURATION: '2n', TIME: '0:0:0' } },
                    { type: 'play_chord', fields: { ROOT: 'G', QUALITY: 'major', DURATION: '2n', TIME: '0:2:0' } },
                    { type: 'play_melody_note', fields: { NOTE: 'G4', DURATION: '4n', TIME: '0:0:0' } },
                    { type: 'play_melody_note', fields: { NOTE: 'A4', DURATION: '4n', TIME: '0:1:0' } },
                    { type: 'play_melody_note', fields: { NOTE: 'G4', DURATION: '2n', TIME: '0:2:0' } }
                  )
                }
              }
            }
          )
        }
      }
    })
  },

  beat_painter: {
    name: 'Beat Painter',
    json: multiStarter(
      {
        type: 'music_start', x: 20, y: 20,
        inputs: {
          DO: {
            block: chain(
              { type: 'set_tempo', fields: { BPM: 110 } },
              { type: 'drum_pattern', fields: { PATTERN: 'hiphop' } },
              { type: 'play_bass_note', fields: { NOTE: 'C2', DURATION: '4n', TIME: '0:0:0' } },
              { type: 'play_bass_note', fields: { NOTE: 'G2', DURATION: '4n', TIME: '0:2:0' } }
            )
          }
        }
      },
      {
        type: 'when_start_clicked', x: 20, y: 340,
        inputs: {
          DO: {
            block: chain(
              { type: 'draw_trail' },
              { type: 'save_position' },
              { type: 'move_to_center' },
              { type: 'no_fill' },
              { type: 'set_stroke', fields: { COLOR: '#a29bfe' } },
              { type: 'set_stroke_weight', fields: { WEIGHT: 2 } },
              { type: 'draw_circle', fields: { X: 0, Y: 0, SIZE: 80 } },
              { type: 'restore_position' }
            )
          }
        }
      },
      {
        type: 'every_n_beats', x: 20, y: 620,
        fields: { BEATS: 1 },
        inputs: {
          DO: {
            block: chain(
              { type: 'save_position' },
              { type: 'set_fill', fields: { COLOR: '#ff6b6b' } },
              { type: 'draw_circle', fields: { X: 200, Y: 200, SIZE: 30 } },
              { type: 'restore_position' }
            )
          }
        }
      },
      {
        type: 'every_n_beats', x: 380, y: 20,
        fields: { BEATS: 2 },
        inputs: {
          DO: {
            block: chain(
              { type: 'save_position' },
              { type: 'set_fill', fields: { COLOR: '#00cec9' } },
              { type: 'draw_star', fields: { X: 200, Y: 200, SIZE: 60 } },
              { type: 'restore_position' }
            )
          }
        }
      }
    )
  }
};

let workspace = null;
let sandbox = null;
let audioBridge = null;
let musicEngine = null;
let piano = null;
let loopPedal = null;
let _highlightEnabled = false;
let _workspaceDirty = false;
let _isPlaying = false;
let _pianoSyncChannel = null;
let _popoutWindow = null;
let _applyingPianoSync = false;

// Music blocks whose highlights should be scheduled on-beat via Tone.Transport
// rather than highlighted every frame in the visual sandbox loop
const BEAT_SYNCED_BLOCKS = new Set([
  'play_kick', 'play_snare', 'play_hihat', 'drum_pattern',
  'play_bass_note', 'bass_pattern',
  'play_melody_note', 'play_chord',
]);

export function init() {
  // Register custom blocks and generators (visual + music)
  registerBlocks();
  registerGenerators();
  registerMusicBlocks();
  registerMusicGenerators();

  // Load saved loops from localStorage and register their blocks/generators
  // (must happen before buildCombinedToolbox so My Loops category is included)
  loadSavedLoops();

  // Build combined toolbox XML (visual categories + music categories + my loops)
  const combinedToolboxXml = buildCombinedToolbox();
  const toolboxContainer = document.createElement('div');
  toolboxContainer.innerHTML = combinedToolboxXml;
  document.body.appendChild(toolboxContainer);

  // Create Blockly workspace with dark theme
  const darkTheme = Blockly.Theme.defineTheme('skratchDark', {
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#1e1e2e',
      toolboxBackgroundColour: '#181825',
      toolboxForegroundColour: '#cdd6f4',
      flyoutBackgroundColour: '#1e1e2e',
      flyoutForegroundColour: '#cdd6f4',
      flyoutOpacity: 0.95,
      scrollbarColour: '#45475a',
      insertionMarkerColour: '#cdd6f4',
      insertionMarkerOpacity: 0.3,
      scrollbarOpacity: 0.5,
      cursorColour: '#f5e0dc'
    },
    fontStyle: {
      family: 'system-ui, -apple-system, sans-serif',
      size: 12
    }
  });

  workspace = Blockly.inject('blocklyDiv', {
    toolbox: document.getElementById('toolbox'),
    theme: darkTheme,
    grid: {
      spacing: 25,
      length: 3,
      colour: '#313244',
      snap: true
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.9,
      maxScale: 2,
      minScale: 0.3,
      scaleSpeed: 1.1
    },
    trashcan: true,
    sounds: false,
    renderer: 'zelos'
  });

  // Set up canvas and sandbox
  const canvas = document.getElementById('skratchCanvas');
  canvas.width = 400;
  canvas.height = 400;
  const errorEl = document.getElementById('errorBar');
  sandbox = new Sandbox(canvas, errorEl);

  // Draw initial grid background
  drawCanvasGrid(canvas);

  // --- Music Engine ---
  musicEngine = new MusicEngine();

  // --- Event Bindings ---
  document.getElementById('btnPlay').addEventListener('click', handlePlay);
  document.getElementById('btnStop').addEventListener('click', handleStop);

  // Code preview toggle
  const previewHeader = document.getElementById('codePreviewHeader');
  previewHeader.addEventListener('click', toggleCodePreview);

  // Copy button
  document.getElementById('btnCopy').addEventListener('click', handleCopy);

  // Starter program dropdown
  const starterSelect = document.getElementById('starterSelect');
  starterSelect.addEventListener('change', (e) => {
    const key = e.target.value;
    if (key && STARTERS[key]) {
      loadStarterProgram(key);
      e.target.value = '';
    }
  });

  // --- Tonnetz Integration Bridge (batch import) ---
  function _showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
      background: var(--accent, #6c5ce7); color: #fff; padding: 0.6rem 1.2rem;
      border-radius: 8px; font-size: 0.85rem; font-weight: 700;
      font-family: 'Nunito', sans-serif; z-index: 9999;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      opacity: 0; transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
  }

  // Import a chord sequence into the Blockly workspace
  function _importSequence(chords) {
    console.log('[Skratch import] _importSequence called with', chords);
    if (!workspace || !Array.isArray(chords) || !chords.length) return;

    // Clear workspace and create a fresh music_start block
    console.log('[Skratch import] Clearing workspace for clean import');
    workspace.clear();
    const startBlock = workspace.newBlock('music_start');
    startBlock.initSvg();
    startBlock.render();
    startBlock.moveBy(20, 20);

    let connection = startBlock.getInput('DO').connection;
    let timeIndex = 0;

    // Build blocks from imported sequence
    const beatOptions = ['0:0:0', '0:1:0', '0:2:0', '0:3:0'];

    for (const chord of chords) {
      const timeValue = beatOptions[Math.floor(timeIndex / 2) % 4] || '0:0:0';

      console.log('[Skratch import] Creating play_chord block:', chord.root, chord.quality);
      const newBlock = workspace.newBlock('play_chord');
      newBlock.setFieldValue(chord.root, 'ROOT');
      newBlock.setFieldValue(chord.quality, 'QUALITY');
      newBlock.setFieldValue('2n', 'DURATION');
      newBlock.setFieldValue(timeValue, 'TIME');

      newBlock.initSvg();
      newBlock.render();

      if (connection) {
        try {
          connection.connect(newBlock.previousConnection);
        } catch (err) { console.error('[Skratch import] Failed to connect block:', err); }
      }

      connection = newBlock.nextConnection;
      timeIndex += 2;
    }

    console.log('[Skratch import] Block chain complete —', chords.length, 'blocks created');
    generateCode();
    _showToast(`Imported ${chords.length} chord${chords.length !== 1 ? 's' : ''} from Explorer`);
  }

  // sessionStorage import moved after workspace load (below) so music_start block exists

  // BroadcastChannel listener (secondary path for when both tabs are already open)
  const tonnetzBridge = new BroadcastChannel('tonnetz-skratch-bridge');
  tonnetzBridge.onmessage = (e) => {
    const msg = e.data;
    if (msg.type !== 'import_sequence') return;
    _importSequence(msg.chords);
  };

  // Canvas size dropdown
  const canvasSizeSelect = document.getElementById('canvasSizeSelect');
  if (canvasSizeSelect) {
    canvasSizeSelect.addEventListener('change', (e) => {
      const newSize = parseInt(e.target.value, 10);
      if (newSize && canvas) {
        canvas.width = newSize;
        canvas.height = newSize;
        canvas.parentElement.style.maxWidth = newSize + 'px';
        // Redraw grid if sandbox doesn't automatically maintain it
        if (typeof drawCanvasGrid === 'function') {
          drawCanvasGrid(canvas);
        }
      }
    });
  }

  // --- Audio Integration ---
  audioBridge = new AudioBridge();

  // Hide the loading indicator once piano samples are ready
  const pianoLoadingEl = document.getElementById('pianoLoadingIndicator');
  audioBridge.onSamplerLoad(() => {
    if (pianoLoadingEl) pianoLoadingEl.hidden = true;
  });

  // Connect audio state to sandbox so generated code can read pitch/volume
  sandbox.setAudioState(audioBridge.state);

  // When AudioBridge fires note callbacks, forward to sandbox's registered callbacks
  audioBridge.onNotePlayed(() => sandbox.fireNoteCallbacks());

  // Piano keyboard — noteOn/noteOff for proper sustain support
  const pianoContainer = document.getElementById('pianoContainer');
  const sustainIndicator = document.getElementById('sustainIndicator');
  piano = new Piano(pianoContainer, {
    onNoteOn: (noteName) => {
      audioBridge.noteOn(noteName);
      if (loopPedal) loopPedal.onNoteOn(noteName, document.getElementById('soundSelect').value);
    },
    onNoteOff: (noteName) => {
      audioBridge.noteOff(noteName);
      if (loopPedal) loopPedal.onNoteOff(noteName);
    },
    onSustainChange: (on) => {
      if (on) {
        audioBridge.sustainOn();
        if (musicEngine) musicEngine.setSustain(true);
        sustainIndicator.textContent = 'Sustain: ON';
        sustainIndicator.classList.add('active');
      } else {
        audioBridge.sustainOff();
        if (musicEngine) musicEngine.setSustain(false);
        sustainIndicator.textContent = 'Sustain: OFF';
        sustainIndicator.classList.remove('active');
      }
    },
    onMarkChange: (note, add) => {
      if (_pianoSyncChannel && !_applyingPianoSync) {
        _pianoSyncChannel.postMessage({ type: 'mark-toggle', note, add });
      }
    },
  });
  // Sound selector — async for soundfont-based voices, with loading state + persistence
  const STUDIO_INST_KEY = 'skratch-studio-instrument';
  const soundSelect = document.getElementById('soundSelect');
  const pianoLoadingIndicator = document.getElementById('pianoLoadingIndicator');

  async function switchStudioInstrument(type) {
    soundSelect.disabled = true;
    if (pianoLoadingIndicator) {
      pianoLoadingIndicator.textContent = 'Loading…';
      pianoLoadingIndicator.hidden = false;
    }
    try {
      await audioBridge.setSoundType(type);
      localStorage.setItem(STUDIO_INST_KEY, type);
    } catch (err) {
      console.warn('[studio] Instrument switch failed, falling back to piano:', err);
      soundSelect.value = 'piano';
      try { await audioBridge.setSoundType('piano'); } catch (_) {}
      localStorage.setItem(STUDIO_INST_KEY, 'piano');
    } finally {
      soundSelect.disabled = false;
      if (pianoLoadingIndicator) pianoLoadingIndicator.hidden = true;
    }
  }

  soundSelect.addEventListener('change', () => {
    switchStudioInstrument(soundSelect.value);
  });

  // Restore persisted instrument choice
  const savedInst = localStorage.getItem(STUDIO_INST_KEY);
  if (savedInst && soundSelect.querySelector(`option[value="${savedInst}"]`)) {
    soundSelect.value = savedInst;
    // Defer the switch so Tone.js context starts on first user gesture, not page load.
    // For piano this is a no-op (already the default). For voices, the load happens
    // on the first user interaction that calls ensureTone().
    if (savedInst !== 'piano') {
      audioBridge._soundType = savedInst;
    }
  }

  // Piano label mode selector
  const pianoLabelSelect = document.getElementById('pianoLabelSelect');
  pianoLabelSelect.addEventListener('change', () => {
    piano.setLabelMode(pianoLabelSelect.value);
  });

  // Mark mode toggle
  const btnMarkMode = document.getElementById('btnMarkMode');
  btnMarkMode.addEventListener('click', () => {
    const active = btnMarkMode.classList.toggle('active');
    piano.setMarkMode(active);
  });

  // Clear all marks
  document.getElementById('btnClearMarks').addEventListener('click', () => {
    piano.clearMarks();
    if (_pianoSyncChannel && !_applyingPianoSync) {
      _pianoSyncChannel.postMessage({ type: 'clear-marks' });
    }
  });

  // ── Pop-out keyboard ───────────────────────────────────────────────────────
  _pianoSyncChannel = new BroadcastChannel('skratch-piano-sync');

  _pianoSyncChannel.onmessage = (e) => {
    const msg = e.data;
    _applyingPianoSync = true;
    try {
      switch (msg.type) {
        case 'popout-ready':
          _pianoSyncChannel.postMessage({
            type: 'state-dump',
            instrument: soundSelect.value,
            bpm: parseInt(document.getElementById('bpmSlider').value, 10),
            volume: parseInt(document.getElementById('volumeSlider').value, 10),
            labelMode: pianoLabelSelect.value,
            markedNotes: [...piano._markedNotes],
            markModeActive: document.getElementById('btnMarkMode').classList.contains('active'),
          });
          break;
        case 'note-on':
          audioBridge.noteOn(msg.note);
          if (loopPedal) loopPedal.onNoteOn(msg.note, msg.instrument || soundSelect.value);
          break;
        case 'note-off':
          audioBridge.noteOff(msg.note);
          if (loopPedal) loopPedal.onNoteOff(msg.note);
          break;
        case 'sustain-change':
          if (msg.on) {
            audioBridge.sustainOn();
            if (musicEngine) musicEngine.setSustain(true);
            sustainIndicator.textContent = 'Sustain: ON';
            sustainIndicator.classList.add('active');
          } else {
            audioBridge.sustainOff();
            if (musicEngine) musicEngine.setSustain(false);
            sustainIndicator.textContent = 'Sustain: OFF';
            sustainIndicator.classList.remove('active');
          }
          break;
        case 'instrument':
          soundSelect.value = msg.value;
          audioBridge.setSoundType(msg.value);
          break;
        case 'bpm': {
          const bpmEl = document.getElementById('bpmSlider');
          const bpmDispEl = document.getElementById('bpmValue');
          bpmEl.value = msg.value;
          bpmDispEl.textContent = msg.value;
          sandbox.setBpm(msg.value);
          if (musicEngine) musicEngine.setBpm(msg.value);
          break;
        }
        case 'volume': {
          const volEl = document.getElementById('volumeSlider');
          const volDispEl = document.getElementById('volumeValue');
          volEl.value = msg.value;
          volDispEl.textContent = msg.value + '%';
          const db = msg.value === 0 ? -Infinity : -40 + (msg.value / 100) * 40;
          if (musicEngine) musicEngine.setVolume(db);
          break;
        }
        case 'label-mode':
          pianoLabelSelect.value = msg.value;
          piano.setLabelMode(msg.value);
          break;
        case 'mark-toggle':
          piano.applyMark(msg.note, msg.add);
          break;
        case 'clear-marks':
          piano.clearMarks();
          break;
      }
    } finally {
      _applyingPianoSync = false;
    }
  };

  // Sync main-window control changes to any open pop-out
  const _syncToPopout = (msg) => {
    if (_pianoSyncChannel && !_applyingPianoSync) {
      _pianoSyncChannel.postMessage(msg);
    }
  };

  document.getElementById('bpmSlider').addEventListener('input', (e) => {
    _syncToPopout({ type: 'bpm', value: parseInt(e.target.value, 10) });
  });

  document.getElementById('volumeSlider').addEventListener('input', (e) => {
    _syncToPopout({ type: 'volume', value: parseInt(e.target.value, 10) });
  });

  soundSelect.addEventListener('change', () => {
    _syncToPopout({ type: 'instrument', value: soundSelect.value });
  });

  pianoLabelSelect.addEventListener('change', () => {
    _syncToPopout({ type: 'label-mode', value: pianoLabelSelect.value });
  });

  // Pop Out button
  document.getElementById('btnPopOut').addEventListener('click', () => {
    if (_popoutWindow && !_popoutWindow.closed) {
      _popoutWindow.focus();
      return;
    }
    _popoutWindow = window.open(
      '/skratch-studio/piano-popout',
      'skratch-piano-popout',
      'width=900,height=280,resizable=yes,scrollbars=no'
    );
  });

  // --- Loop Pedal ---
  loopPedal = new LoopPedal({
    getBpm: () => parseInt(document.getElementById('bpmSlider').value, 10),
    pianoRollCanvas: document.getElementById('loopPianoRoll'),
    barVizCanvas: document.getElementById('loopBarViz'),
    statusEl: document.getElementById('loopPedalStatus'),
    lengthEl: document.getElementById('loopLengthDisplay'),
    quantizeCheckbox: document.getElementById('chkQuantize'),
    inputSourceEl: document.getElementById('loopInputSource'),
    buttons: {
      record: document.getElementById('btnLoopRecord'),
      stopRec: document.getElementById('btnLoopStopRec'),
      overdub: document.getElementById('btnLoopOverdub'),
      play: document.getElementById('btnLoopPlay'),
      clearL1: document.getElementById('btnClearL1'),
      clearL2: document.getElementById('btnClearL2'),
      clearL3: document.getElementById('btnClearL3'),
      clearAll: document.getElementById('btnLoopClearAll'),
      saveAsBlock: document.getElementById('btnSaveAsBlock'),
    },
    // When loop pedal takes the Transport, pause any running Blockly music
    onTakeoverTransport: () => { if (_isPlaying) handleStop(); },
  });

  document.getElementById('btnLoopRecord').addEventListener('click', () => loopPedal.startRecording());
  document.getElementById('btnLoopStopRec').addEventListener('click', async () => { await loopPedal.stopRecording(); });
  document.getElementById('btnLoopOverdub').addEventListener('click', () => loopPedal.startOverdub());
  document.getElementById('btnLoopPlay').addEventListener('click', () => loopPedal.togglePlayback());
  document.getElementById('btnClearL1').addEventListener('click', () => loopPedal.clearLayer(0));
  document.getElementById('btnClearL2').addEventListener('click', () => loopPedal.clearLayer(1));
  document.getElementById('btnClearL3').addEventListener('click', () => loopPedal.clearLayer(2));
  document.getElementById('btnLoopClearAll').addEventListener('click', () => loopPedal.clearAll());
  document.getElementById('btnSaveAsBlock').addEventListener('click', () => handleSaveAsBlock());

  registerLoopContextMenu();

  // Clear Blocks button — clears only the Blockly workspace
  document.getElementById('btnClearBlocks').addEventListener('click', () => {
    if (!confirm('Are you sure? This will clear all blocks.')) return;
    if (_isPlaying) handleStop();
    workspace.clear();
    updateCodePreview();
    localStorage.removeItem(STORAGE_KEY);
    drawCanvasGrid(document.getElementById('skratchCanvas'));
  });

  // Clear Canvas button — resets canvas and stops audio/Transport
  document.getElementById('btnClearCanvas').addEventListener('click', () => {
    if (_isPlaying) handleStop();
    drawCanvasGrid(document.getElementById('skratchCanvas'));
  });

  // Export MIDI button
  document.getElementById('btnExportMidi').addEventListener('click', handleExportMidi);

  // Mic toggle
  const btnMic = document.getElementById('btnMic');
  btnMic.addEventListener('click', async () => {
    if (audioBridge._micActive) {
      audioBridge.stopMic();
      btnMic.textContent = '\u{1F3A4} Mic Off';
      btnMic.classList.remove('active');
    } else {
      try {
        await audioBridge.startMic();
        btnMic.textContent = '\u{1F3A4} Mic On';
        btnMic.classList.add('active');
        startPianoHighlight();
      } catch (e) {
        alert('Could not access microphone. Please allow mic access and try again.');
      }
    }
  });

  // BPM control — drives both sandbox beat timers and Tone.Transport
  const bpmSlider = document.getElementById('bpmSlider');
  const bpmValue = document.getElementById('bpmValue');
  bpmSlider.addEventListener('input', () => {
    const bpm = parseInt(bpmSlider.value, 10);
    bpmValue.textContent = bpm;
    sandbox.setBpm(bpm);
    if (musicEngine._started) {
      musicEngine.setBpm(bpm);
    }
  });

  // Volume control
  const volumeSlider = document.getElementById('volumeSlider');
  if (volumeSlider) {
    const volumeValue = document.getElementById('volumeValue');
    volumeSlider.addEventListener('input', () => {
      const vol = parseInt(volumeSlider.value, 10);
      volumeValue.textContent = vol + '%';
      // Map 0-100 → -40dB to 0dB (logarithmic feel)
      const db = vol === 0 ? -Infinity : -40 + (vol / 100) * 40;
      musicEngine.setVolume(db);
    });
  }

  // Loop toggle — update Tone.Transport.loop live during playback
  document.getElementById('chkLoop').addEventListener('change', (e) => {
    if (_isPlaying && musicEngine._started) {
      const loop = e.target.checked;
      musicEngine.setLoop(loop);
      if (loop) {
        // Wire up live editing reschedule + visual restart
        musicEngine.onLoopReschedule(() => {
          if (!_workspaceDirty) return;
          _workspaceDirty = false;
          const newCode = generateCode();
          const newHasMusic = /\b(kick|snare|hihat|bass|melody|chords)\.(trigger|Tone\.Transport)/.test(newCode)
            || /__playLoop\(/.test(newCode);
          musicEngine.clearScheduledEvents();
          if (newHasMusic) executeMusicCode(newCode);
          musicEngine.setLoop(true);
          sandbox.recompile(newCode);
        });
        musicEngine.onLoopRestart(() => {
          sandbox.restartLoop();
        });
      } else {
        musicEngine.onLoopReschedule(null);
        musicEngine.onLoopRestart(null);
      }
    }
  });

  // Update code preview on workspace change + auto-save
  workspace.addChangeListener((e) => {
    if (e.isUiEvent) return;
    updateCodePreview();
    saveWorkspace();
    // Mark workspace dirty for live editing (changes applied at next loop)
    if (_isPlaying && document.getElementById('chkLoop').checked) {
      _workspaceDirty = true;
    }
  });

  // Load saved workspace or default starter
  if (!loadWorkspace()) {
    loadStarterProgram('circles');
  }

  // Check sessionStorage for a sequence exported from Explorer
  // (must run AFTER workspace load so music_start block exists)
  console.log('[Skratch] checking sessionStorage:', sessionStorage.getItem('tonnetz-export-sequence'));
  const exportedJson = sessionStorage.getItem('tonnetz-export-sequence');
  if (exportedJson) {
    sessionStorage.removeItem('tonnetz-export-sequence');
    try {
      const chords = JSON.parse(exportedJson);
      _importSequence(chords);
    } catch (err) { console.error('[Skratch] Failed to parse exported sequence:', err); }
  }

  // Initial code preview
  updateCodePreview();

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (_pianoSyncChannel) { try { _pianoSyncChannel.close(); } catch (_) { } }
    if (loopPedal) loopPedal.destroy();
    if (musicEngine) musicEngine.destroy();
    if (audioBridge) audioBridge.destroy();
    if (piano) piano.destroy();
    if (sandbox) sandbox.destroy();
  });
}

// ── Saved Loop Library ────────────────────────────────────────────────────

// Mic layer serialization: AudioBuffer → mono 16-bit WAV → base64 string (synchronous).
function audioBufferToWavBase64(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  // Downmix to mono
  const mono = new Float32Array(numFrames);
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < numFrames; i++) mono[i] += data[i] / channels;
  }
  const dataSize = numFrames * 2; // 16-bit samples
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true);           // fmt chunk size
  v.setUint16(20, 1, true);           // PCM
  v.setUint16(22, 1, true);           // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true);           // block align
  v.setUint16(34, 16, true);           // bits per sample
  ws(36, 'data'); v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < numFrames; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  const u8 = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

// Mic layer deserialization: base64 WAV string → AudioBuffer (async).
async function wavBase64ToAudioBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const audioCtx = Tone.context.rawContext || Tone.context;
  return audioCtx.decodeAudioData(u8.buffer.slice(0));
}

// Decode mic WAV layers for a registered loopData entry (runs in background after page load).
async function _decodeMicLayers(loopData) {
  const entry = _loopRegistry.get(loopData.id);
  if (!entry || !loopData.micWav) return;
  entry._audioBuffers = [null, null, null];
  for (let i = 0; i < 3; i++) {
    if (loopData.micWav[i]) {
      try { entry._audioBuffers[i] = await wavBase64ToAudioBuffer(loopData.micWav[i]); }
      catch (err) { console.warn('[LoopBlock] mic decode error layer', i, err); }
    }
  }
}

function loadLoopsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(LOOPS_STORAGE_KEY) || '[]');
  } catch { return []; }
}

function registerLoopBlock(loopData) {
  const blockType = 'loop_saved_' + loopData.id;
  const noteCount = loopData.layers.flat().length; // all 3 keyboard layers
  const micCount = loopData.micWav ? loopData.micWav.filter(Boolean).length : 0;
  const durLabel = loopData.loopLength.toFixed(1) + 's';
  const infoLabel = micCount > 0
    ? `  (${noteCount} notes · ${micCount} mic · ${durLabel})`
    : `  (${noteCount} notes · ${durLabel})`;

  _loopRegistry.set(loopData.id, loopData);

  Blockly.Blocks[blockType] = {
    init() {
      this.appendDummyInput()
        .appendField('🎵 ' + loopData.name)
        .appendField(new Blockly.FieldLabel(infoLabel));
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip(`Play saved loop: ${loopData.name}`);
    }
  };

  Blockly.JavaScript.forBlock[blockType] = function () {
    return `__playLoop('${loopData.id}');\n`;
  };
}

function buildMyLoopsToolboxXml() {
  const loops = loadLoopsFromStorage();
  if (loops.length === 0) return '';
  let xml = `<category name="🎵 My Loops" colour="160">`;
  for (const loop of loops) {
    xml += `<block type="loop_saved_${loop.id}"></block>`;
  }
  xml += `</category>`;
  return xml;
}

function rebuildToolbox() {
  if (!workspace) return;
  workspace.updateToolbox(buildCombinedToolbox());
}

function loadSavedLoops() {
  for (const loopData of loadLoopsFromStorage()) {
    registerLoopBlock(loopData); // synchronous — must complete before toolbox is built
    if (loopData.micWav && loopData.micWav.some(Boolean)) {
      _decodeMicLayers(loopData); // async in background; ready before user can click Play
    }
  }
}

function handleSaveAsBlock() {
  if (!loopPedal) return;
  const hasAny = loopPedal.layers.some(l => l.length > 0) || loopPedal._layerAudio.some(a => a !== null);
  if (!hasAny) { alert('Nothing recorded yet!'); return; }

  const modal = document.getElementById('loopNameModal');
  const input = document.getElementById('loopNameInput');
  const okBtn = document.getElementById('loopNameOk');
  const canBtn = document.getElementById('loopNameCancel');

  // Disable all keyboard shortcuts before the dialog opens so no shortcut
  // (1/2/3 loop keys or Caps Lock sustain) can fire while the user types.
  loopPedal.setShortcutsEnabled(false);

  input.value = 'My Loop';
  modal.showModal();
  // autofocus attribute handles initial focus; select() highlights the default text
  requestAnimationFrame(() => { input.select(); });

  function finish(save) {
    // Re-enable shortcuts before any side-effects so state is consistent
    loopPedal.setShortcutsEnabled(true);
    okBtn.removeEventListener('click', onOk);
    canBtn.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onInputKey);
    modal.removeEventListener('close', onModalClose);
    if (modal.open) modal.close();
    if (save) {
      const name = input.value.trim();
      if (name) _commitSaveAsBlock(name);
    }
  }

  function onOk() { finish(true); }
  function onCancel() { finish(false); }
  function onModalClose() { finish(false); }
  function onInputKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
  }

  okBtn.addEventListener('click', onOk);
  canBtn.addEventListener('click', onCancel);
  input.addEventListener('keydown', onInputKey);
  modal.addEventListener('close', onModalClose);
}

function _commitSaveAsBlock(name) {
  // Serialize mic layers as mono 16-bit WAV base64 (null for keyboard-only layers)
  const micWav = [null, null, null];
  for (let i = 0; i < 3; i++) {
    if (loopPedal._layerAudio[i]) {
      try { micWav[i] = audioBufferToWavBase64(loopPedal._layerAudio[i]); }
      catch (err) { console.warn('[SaveBlock] mic serialize error layer', i, err); }
    }
  }

  const loopData = {
    id: String(Date.now()),
    name: name.trim(),
    layers: [
      loopPedal.layers[0].map(ev => ({ ...ev })),
      loopPedal.layers[1].map(ev => ({ ...ev })),
      loopPedal.layers[2].map(ev => ({ ...ev })),
    ],
    loopLength: loopPedal.loopLength,
    bpm: parseInt(document.getElementById('bpmSlider').value, 10),
    micWav,
  };

  const loops = loadLoopsFromStorage();
  loops.push(loopData);
  localStorage.setItem(LOOPS_STORAGE_KEY, JSON.stringify(loops));

  registerLoopBlock(loopData);
  rebuildToolbox();
}

function registerLoopContextMenu() {
  Blockly.ContextMenuRegistry.registry.register({
    id: 'delete_loop_from_library',
    displayText(scope) {
      const id = scope.block.type.replace('loop_saved_', '');
      const loopData = _loopRegistry.get(id);
      return loopData ? `Remove "${loopData.name}" from Library` : 'Remove from My Loops';
    },
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 6,
    preconditionFn(scope) {
      return scope.block.type.startsWith('loop_saved_') ? 'enabled' : 'hidden';
    },
    callback(scope) {
      const block = scope.block;
      const id = block.type.replace('loop_saved_', '');
      const loopData = _loopRegistry.get(id);
      const name = loopData ? loopData.name : 'this loop';
      if (!confirm(`Remove "${name}" from the loop library?`)) return;

      const loops = loadLoopsFromStorage().filter(l => l.id !== id);
      localStorage.setItem(LOOPS_STORAGE_KEY, JSON.stringify(loops));

      _loopRegistry.delete(id);
      delete Blockly.Blocks['loop_saved_' + id];
      delete Blockly.JavaScript.forBlock['loop_saved_' + id];

      for (const b of workspace.getAllBlocks(false)) {
        if (b.type === 'loop_saved_' + id) b.dispose(true);
      }

      rebuildToolbox();
    }
  });
}

// ── Toolbox assembly ──────────────────────────────────────────────────────

function buildCombinedToolbox() {
  const visualXml = getToolboxXml();
  const musicXml = getMusicToolboxXml();
  const myLoopsXml = buildMyLoopsToolboxXml();

  return visualXml.replace(
    '</xml>',
    `  <sep gap="32"></sep>\n${musicXml}\n${myLoopsXml}\n</xml>`
  );
}

async function handlePlay() {
  // If loop pedal is active, yield the Transport back to MusicEngine
  if (loopPedal) loopPedal.notifyTransportTakeover();

  // Ensure Tone.js is started (requires user gesture)
  await musicEngine.ensureTone();

  // Clear previous note callbacks so re-play doesn't stack them
  audioBridge.clearNoteCallbacks();
  audioBridge.onNotePlayed(() => sandbox.fireNoteCallbacks());

  const code = generateCode();
  _workspaceDirty = false;
  _isPlaying = true;

  // Check if code contains music blocks (Tone.js instrument calls or saved loop blocks)
  const hasMusic = /\b(kick|snare|hihat|bass|melody|chords)\.(trigger|Tone\.Transport)/.test(code)
    || /__playLoop\(/.test(code);

  // Set up block highlighting — visual blocks highlight every frame,
  // beat-synced music blocks are handled separately by executeMusicCode()
  _highlightEnabled = true;
  sandbox.setHighlightFn((id) => {
    if (!_highlightEnabled) return;
    const block = workspace.getBlockById(id);
    if (block && BEAT_SYNCED_BLOCKS.has(block.type)) return;
    workspace.highlightBlock(id);
  });

  // Always run visual sandbox (it handles visual-only code fine)
  sandbox.run(code);
  sandbox.startLoop();

  // If music code is present, schedule it via MusicEngine
  if (hasMusic) {
    musicEngine.stop(); // clear previous schedule
    const bpm = parseInt(document.getElementById('bpmSlider').value, 10);
    musicEngine.setBpm(bpm);

    // Execute the music code in a context where instrument names resolve to engine methods
    executeMusicCode(code);

    // Enable looping if the Loop checkbox is checked
    const loopEnabled = document.getElementById('chkLoop').checked;
    // Always set loop boundaries so live toggling during playback works
    musicEngine.setLoop(loopEnabled);

    // Register synchronous reschedule handler — fires at the transport loop point
    // BEFORE the next iteration plays, so we can swap in updated code
    musicEngine.onLoopReschedule(() => {
      if (!_workspaceDirty) return;
      _workspaceDirty = false;

      const newCode = generateCode();
      const newHasMusic = /\b(kick|snare|hihat|bass|melody|chords)\.(trigger|Tone\.Transport)/.test(newCode);

      // Clear all old scheduled music events and re-execute
      musicEngine.clearScheduledEvents();
      if (newHasMusic) {
        executeMusicCode(newCode);
      }

      // Update loop boundaries to match new code
      musicEngine.setLoop(true);

      // Hot-swap the visual sandbox code (rAF loop keeps running)
      sandbox.recompile(newCode);
    });

    // Register loop restart handler (resets visual animation on each loop)
    musicEngine.onLoopRestart(() => {
      sandbox.restartLoop();
    });

    // Start beat indicator
    musicEngine.onBeat(() => flashBeatIndicator());
    musicEngine.startBeatLoop();

    musicEngine.start();
  }

  document.getElementById('btnPlay').disabled = true;
  document.getElementById('btnStop').disabled = false;
}

function executeMusicCode(code) {
  try {
    // Track current block ID so instrument proxies can schedule on-beat highlights
    let _currentMusicBlockId = null;
    const musicHighlight = (id) => {
      _currentMusicBlockId = id;
    };

    // Saved loop playback — schedules keyboard notes + starts mic layer players
    const __playLoopFn = (id) => {
      const loopData = _loopRegistry.get(id);
      if (!loopData) return;
      musicEngine.updateLoopEnd(loopData.loopLength);

      // Keyboard layers — Transport-scheduled via MusicEngine
      const allNotes = loopData.layers.flat();
      for (const ev of allNotes) {
        musicEngine.scheduleLoopNote(ev.note, ev.duration, ev.startTime);
      }

      // Mic layers — Tone.Player synced to Transport (created before Transport.start)
      if (loopData._audioBuffers) {
        for (const buf of loopData._audioBuffers) {
          if (!buf) continue;
          try {
            const player = new Tone.Player(buf).toDestination();
            player.loop = true;
            player.loopEnd = Math.min(loopData.loopLength, player.buffer.duration);
            player.sync();
            player.start(0);
            _loopMicPlayers.push(player);
          } catch (err) {
            console.warn('[PlayLoop] mic player error:', err);
          }
        }
      }
    };

    // Build proxy instruments that forward .triggerAttackRelease() to MusicEngine scheduling
    // and schedule block highlights to fire in sync with Tone.Transport
    const instrumentsProxy = {
      kick: {
        triggerAttackRelease(note, dur, time) {
          const blockId = _currentMusicBlockId;
          musicEngine.scheduleKick(time, note);
          scheduleMusicHighlight(blockId, time);
        }
      },
      snare: {
        triggerAttackRelease(dur, time) {
          const blockId = _currentMusicBlockId;
          musicEngine.scheduleSnare(time);
          scheduleMusicHighlight(blockId, time);
        }
      },
      hihat: {
        triggerAttackRelease(note, dur, time) {
          const blockId = _currentMusicBlockId;
          musicEngine.scheduleHihat(time);
          scheduleMusicHighlight(blockId, time);
        }
      },
      bass: {
        triggerAttackRelease(note, dur, time) {
          const blockId = _currentMusicBlockId;
          musicEngine.scheduleBass(note, dur, time);
          scheduleMusicHighlight(blockId, time);
        }
      },
      melody: {
        triggerAttackRelease(note, dur, time) {
          const blockId = _currentMusicBlockId;
          musicEngine.scheduleMelody(note, dur, time);
          scheduleMusicHighlight(blockId, time);
        }
      },
      chords: {
        triggerAttackRelease(notes, dur, time) {
          const blockId = _currentMusicBlockId;
          musicEngine.scheduleChord(notes, dur, time);
          scheduleMusicHighlight(blockId, time);
        }
      },
    };

    // Tone proxy for set_tempo blocks — syncs MusicEngine + UI slider
    const ToneProxy = {
      Transport: {
        bpm: {
          set value(v) {
            musicEngine.setBpm(v);
            const slider = document.getElementById('bpmSlider');
            const display = document.getElementById('bpmValue');
            if (slider) slider.value = v;
            if (display) display.textContent = v;
          },
          get value() { return musicEngine.getBpm(); }
        }
      }
    };

    // The generated code declares `const kick = _instruments.kick;` etc.
    // so we pass the proxy object as `_instruments` and Tone for tempo.
    // Visual params are no-ops so mixed visual+music code doesn't error.
    const noop = () => { };
    const fn = new Function(
      '_instruments', 'Tone',
      'circle', 'rect', 'ellipse', 'triangle', 'line', 'star',
      'fill', 'stroke', 'noFill', 'noStroke', 'strokeWeight', 'background',
      'push', 'pop', 'translate', 'rotate', 'scale',
      'map', 'lerp', 'random', 'constrain', 'dist',
      'width', 'height', 'frameCount', 'mouseX', 'mouseY',
      'Math', 'PI',
      'currentPitch', 'currentNoteName', 'currentVolume', 'noteIsPlaying',
      'onNotePlayed', 'everyNBeats',
      'highlightBlock', '__playLoop',
      code
    );

    fn(
      instrumentsProxy, ToneProxy,
      noop, noop, noop, noop, noop, noop,
      noop, noop, noop, noop, noop, noop,
      noop, noop, noop, noop, noop,
      noop, noop, noop, noop, noop,
      400, 400, 0, 0, 0,
      Math, Math.PI,
      0, '--', 0, false,
      noop, noop,
      musicHighlight, __playLoopFn
    );
  } catch (e) {
    // Music code errors shown in error bar
    const errorEl = document.getElementById('errorBar');
    if (errorEl) {
      errorEl.textContent = 'Music Error: ' + e.message;
      errorEl.hidden = false;
    }
  }
}

function scheduleMusicHighlight(blockId, time) {
  if (!blockId) return;
  const id = Tone.Transport.schedule((t) => {
    Tone.Draw.schedule(() => {
      if (_highlightEnabled) {
        workspace.highlightBlock(blockId);
      }
    }, t);
  }, time);
  // Track so clearScheduledEvents() also clears stale highlights
  musicEngine._scheduledIds.push(id);
}

function drawCanvasGrid(canvas) {
  if (sandbox) sandbox.stop();
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e1e2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2a2a3e';
  for (let x = 0; x < canvas.width; x += 20) {
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function handleStop() {
  _highlightEnabled = false;
  _isPlaying = false;
  _workspaceDirty = false;
  sandbox.stop();
  musicEngine.stop();
  audioBridge.releaseAll(); // release any live piano notes held through sustain or mid-note

  // Stop and dispose any mic layer players started by __playLoop blocks
  for (const p of _loopMicPlayers) {
    try { p.stop(); p.unsync(); p.dispose(); } catch (_) { }
  }
  _loopMicPlayers = [];

  // Clear all block highlights
  workspace.highlightBlock(null);

  document.getElementById('btnPlay').disabled = false;
  document.getElementById('btnStop').disabled = true;

  // Clear beat indicator
  const indicator = document.getElementById('beatIndicator');
  if (indicator) indicator.classList.remove('flash');

  // Reset canvas to dot grid
  drawCanvasGrid(document.getElementById('skratchCanvas'));
}

function flashBeatIndicator() {
  const indicator = document.getElementById('beatIndicator');
  if (!indicator) return;
  indicator.classList.remove('flash');
  // Force reflow to restart animation
  void indicator.offsetWidth;
  indicator.classList.add('flash');
}

function generateCode() {
  const code = Blockly.JavaScript.workspaceToCode(workspace);
  return code;
}

function updateCodePreview() {
  let code = generateCode();
  // Strip highlightBlock() calls from preview so generated code stays clean
  code = code.replace(/highlightBlock\('[^']*'\);\n/g, '');
  document.getElementById('codePreviewContent').textContent = code || '// Drag blocks to start coding!';
}

function toggleCodePreview() {
  const body = document.getElementById('codePreviewBody');
  const toggle = document.getElementById('codePreviewToggle');
  body.classList.toggle('collapsed');
  toggle.classList.toggle('open');
}

function handleCopy() {
  const code = document.getElementById('codePreviewContent').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('btnCopy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}

function loadStarterProgram(key) {
  const s = STARTERS[key];
  if (!s) return;
  workspace.clear();
  Blockly.serialization.workspaces.load(s.json, workspace);
  workspace.scrollCenter();
  updateCodePreview();
}

function saveWorkspace() {
  try {
    const state = Blockly.serialization.workspaces.save(workspace);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // localStorage might be unavailable
  }
}

function loadWorkspace() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    const state = JSON.parse(saved);
    if (!state || typeof state !== 'object') return false;
    workspace.clear();
    Blockly.serialization.workspaces.load(state, workspace);
    return true;
  } catch (e) {
    // Clear invalid saved data (e.g. old XML format)
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

let _pianoHighlightId = null;

function startPianoHighlight() {
  // Already running
  if (_pianoHighlightId) return;

  const tick = () => {
    if (!audioBridge._micActive) {
      _pianoHighlightId = null;
      piano.highlightNote(null);
      return;
    }
    piano.highlightNote(audioBridge.state.currentNoteName);
    _pianoHighlightId = requestAnimationFrame(tick);
  };
  _pianoHighlightId = requestAnimationFrame(tick);
}

function handleExportMidi() {
  if (!window.MidiWriter) {
    alert("MidiWriterJS is not loaded yet.");
    return;
  }
  
  if (typeof workspace === 'undefined' || !workspace) return;
  const code = Blockly.JavaScript.workspaceToCode(workspace);
  const hasMusic = /\b(kick|snare|hihat|bass|melody|chords)\.(trigger|Tone\.Transport)/.test(code);
  if (!hasMusic) {
    alert("No music blocks found to export!");
    return;
  }

  const events = [];
  function parseToneDuration(durStr) {
    const map = { '1n': '1', '2n': '2', '4n': '4', '8n': '8', '16n': '16' };
    return map[durStr] || '4';
  }
  function parseToneTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.split(':').map(Number);
    const m = parts[0] || 0;
    const b = parts[1] || 0;
    const s = parts[2] || 0;
    return m * 4 * 128 + b * 128 + Math.floor(s * 32);
  }

  let _drumSkipWarned = false;
  const _drumSkip = () => {
    if (!_drumSkipWarned) {
      console.warn('MIDI export: drum blocks (kick, snare, hihat) are skipped — MIDI drum mapping is not supported.');
      _drumSkipWarned = true;
    }
  };

  const instrumentsProxy = {
    _add: (notes, dur, time) => {
      let pitch = Array.isArray(notes) ? notes : [notes];
      pitch = pitch.map(n => n.replace('♯', '#').replace('♭', 'b'));
      events.push({
        pitch,
        duration: parseToneDuration(dur),
        startTick: parseToneTime(time)
      });
    },
    kick: { triggerAttackRelease: () => _drumSkip() },
    snare: { triggerAttackRelease: () => _drumSkip() },
    hihat: { triggerAttackRelease: () => _drumSkip() },
    bass: { triggerAttackRelease: (note, dur, time) => instrumentsProxy._add(note, dur || '4n', time) },
    melody: { triggerAttackRelease: (note, dur, time) => instrumentsProxy._add(note, dur || '4n', time) },
    chords: { triggerAttackRelease: (notes, dur, time) => instrumentsProxy._add(notes, dur || '4n', time) }
  };

  const noop = () => {};
  const fn = new Function(
    '_instruments', 'Tone',
    'circle', 'rect', 'ellipse', 'triangle', 'line', 'star',
    'fill', 'stroke', 'noFill', 'noStroke', 'strokeWeight', 'background',
    'push', 'pop', 'translate', 'rotate', 'scale',
    'map', 'lerp', 'random', 'constrain', 'dist',
    'width', 'height', 'frameCount', 'mouseX', 'mouseY',
    'Math', 'PI',
    'currentPitch', 'currentNoteName', 'currentVolume', 'noteIsPlaying',
    'onNotePlayed', 'everyNBeats',
    'highlightBlock', '__playLoop',
    code
  );

  try {
    fn(
      instrumentsProxy, {},
      noop, noop, noop, noop, noop, noop,
      noop, noop, noop, noop, noop, noop,
      noop, noop, noop, noop, noop,
      noop, noop, noop, noop, noop,
      400, 400, 0, 0, 0,
      Math, Math.PI,
      0, '--', 0, false,
      noop, noop,
      noop, noop
    );
  } catch (e) {
    console.error("MIDI Export Evaluation Error", e);
  }

  if (events.length === 0) {
    alert("No notes were generated.");
    return;
  }

  events.sort((a, b) => a.startTick - b.startTick);

  const bpm = parseInt(document.getElementById('bpmSlider')?.value, 10) || 120;
  const track = new MidiWriter.Track();
  track.setTempo(bpm);
  track.addEvent(new MidiWriter.ProgramChangeEvent({instrument: 1}));

  let currentTick = 0;
  for (const e of events) {
    const delta = e.startTick - currentTick;
    const noteEvent = new MidiWriter.NoteEvent({
      pitch: e.pitch,
      duration: e.duration,
      wait: 'T' + delta
    });
    track.addEvent(noteEvent);
    currentTick = e.startTick;
  }

  const write = new MidiWriter.Writer(track);
  const dataUri = write.dataUri();
  
  const link = document.createElement('a');
  link.href = dataUri;
  link.download = 'skratch-studio.mid';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
