// music-blocks.js — Blockly block definitions for Music Creation (Part C)

export function registerMusicBlocks() {

  // ===================== DRUMS (red, hue 0) =====================

  Blockly.Blocks['play_kick'] = {
    init() {
      this.appendDummyInput()
        .appendField('🥁 kick drum')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(0);
      this.setTooltip('Play a kick drum at a beat position in the measure');
    }
  };

  Blockly.Blocks['play_snare'] = {
    init() {
      this.appendDummyInput()
        .appendField('🥁 snare')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(0);
      this.setTooltip('Play a snare hit at a beat position');
    }
  };

  Blockly.Blocks['play_hihat'] = {
    init() {
      this.appendDummyInput()
        .appendField('🥁 hi-hat')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(0);
      this.setTooltip('Play a hi-hat at a beat position');
    }
  };

  Blockly.Blocks['drum_pattern'] = {
    init() {
      this.appendDummyInput()
        .appendField('🥁 drum pattern')
        .appendField(new Blockly.FieldDropdown([
          ['Rock Beat',     'rock'],
          ['Disco',         'disco'],
          ['Hip Hop',       'hiphop'],
          ['Four on Floor', 'four'],
        ]), 'PATTERN');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(0);
      this.setTooltip('Play a preset drum pattern that loops every measure');
    }
  };

  // ===================== BASS (deep blue, hue 240) =====================

  Blockly.Blocks['play_bass_note'] = {
    init() {
      this.appendDummyInput()
        .appendField('🎸 bass note')
        .appendField(new Blockly.FieldDropdown([
          ['C',  'C2'], ['D',  'D2'], ['E',  'E2'], ['F',  'F2'],
          ['G',  'G2'], ['A',  'A2'], ['B',  'B2'],
          ['C#', 'C#2'], ['D#', 'D#2'], ['F#', 'F#2'], ['G#', 'G#2'], ['A#', 'A#2'],
        ]), 'NOTE')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['quarter note', '4n'], ['eighth note', '8n'],
          ['half note', '2n'], ['whole note', '1n'],
          ['dotted quarter', '4n.'], ['sixteenth', '16n'],
        ]), 'DURATION')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(240);
      this.setTooltip('Play a bass note at a beat position');
    }
  };

  Blockly.Blocks['bass_pattern'] = {
    init() {
      this.appendDummyInput()
        .appendField('🎸 bass line')
        .appendField(new Blockly.FieldDropdown([
          ['Root Notes',    'root'],
          ['Walking Bass',  'walking'],
          ['Octave Bounce', 'octave'],
          ['Funky',         'funky'],
        ]), 'PATTERN')
        .appendField('in key of')
        .appendField(new Blockly.FieldDropdown([
          ['C', 'C'], ['D', 'D'], ['E', 'E'], ['F', 'F'],
          ['G', 'G'], ['A', 'A'], ['B', 'B'],
        ]), 'KEY');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(240);
      this.setTooltip('Play a preset bass line pattern');
    }
  };

  // ===================== MELODY (pink, hue 330) =====================

  Blockly.Blocks['play_melody_note'] = {
    init() {
      this.appendDummyInput()
        .appendField('🎹 melody note')
        .appendField(new Blockly.FieldDropdown([
          ['C',  'C4'], ['D',  'D4'], ['E',  'E4'], ['F',  'F4'],
          ['G',  'G4'], ['A',  'A4'], ['B',  'B4'],
          ['C5', 'C5'], ['D5', 'D5'], ['E5', 'E5'],
          ['C#', 'C#4'], ['D#', 'D#4'], ['F#', 'F#4'], ['G#', 'G#4'], ['A#', 'A#4'],
        ]), 'NOTE')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['quarter note', '4n'], ['eighth note', '8n'],
          ['half note', '2n'], ['whole note', '1n'],
          ['dotted quarter', '4n.'], ['sixteenth', '16n'],
        ]), 'DURATION')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip('Play a melody note at a beat position');
    }
  };

  Blockly.Blocks['play_chord'] = {
    init() {
      this.appendDummyInput()
        .appendField('🎹 play chord')
        .appendField(new Blockly.FieldDropdown([
          ['C',  'C'], ['D',  'D'], ['E',  'E'], ['F',  'F'],
          ['G',  'G'], ['A',  'A'], ['B',  'B'],
          ['C#', 'C#'], ['D#', 'D#'], ['F#', 'F#'], ['G#', 'G#'], ['A#', 'A#'],
        ]), 'ROOT')
        .appendField(new Blockly.FieldDropdown([
          ['Major',      'major'],
          ['Minor',      'minor'],
          ['Diminished', 'diminished'],
        ]), 'QUALITY')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['half note', '2n'], ['quarter note', '4n'],
          ['whole note', '1n'], ['eighth note', '8n'],
        ]), 'DURATION')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip('Play a chord (Major = root + major 3rd + perfect 5th)');
    }
  };

  Blockly.Blocks['rest'] = {
    init() {
      this.appendDummyInput()
        .appendField('🔇 rest for')
        .appendField(new Blockly.FieldDropdown([
          ['quarter note', '4n'], ['eighth note', '8n'],
          ['half note', '2n'], ['whole note', '1n'],
        ]), 'DURATION');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip('A moment of silence');
    }
  };

  Blockly.Blocks['p_transform'] = {
    init() {
      this.appendDummyInput()
        .appendField('🔀 P transform')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['half note', '2n'], ['quarter note', '4n'],
          ['whole note', '1n'], ['eighth note', '8n'],
        ]), 'DURATION')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip('Parallel transform: flips major/minor. (e.g. C major -> C minor)');
    }
  };

  Blockly.Blocks['l_transform'] = {
    init() {
      this.appendDummyInput()
        .appendField('🔀 L transform')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['half note', '2n'], ['quarter note', '4n'],
          ['whole note', '1n'], ['eighth note', '8n'],
        ]), 'DURATION')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip('Leading-tone transform: C major -> E minor, or C minor -> Ab major');
    }
  };

  Blockly.Blocks['r_transform'] = {
    init() {
      this.appendDummyInput()
        .appendField('🔀 R transform')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['half note', '2n'], ['quarter note', '4n'],
          ['whole note', '1n'], ['eighth note', '8n'],
        ]), 'DURATION')
        .appendField('at beat')
        .appendField(new Blockly.FieldDropdown([
          ['1',   '0:0:0'], ['1 +', '0:0:2'], ['2',   '0:1:0'], ['2 +', '0:1:2'],
          ['3',   '0:2:0'], ['3 +', '0:2:2'], ['4',   '0:3:0'], ['4 +', '0:3:2'],
        ]), 'TIME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(330);
      this.setTooltip('Relative transform: C major -> A minor, or C minor -> Eb major');
    }
  };

  // ===================== SONG STRUCTURE (teal, hue 170) =====================

  Blockly.Blocks['section'] = {
    init() {
      this.appendDummyInput()
        .appendField('📋 section')
        .appendField(new Blockly.FieldDropdown([
          ['Intro',  'intro'],
          ['Verse',  'verse'],
          ['Chorus', 'chorus'],
          ['Bridge', 'bridge'],
          ['Outro',  'outro'],
        ]), 'NAME')
        .appendField('for')
        .appendField(new Blockly.FieldDropdown([
          ['1 measure', '1'], ['2 measures', '2'],
          ['4 measures', '4'], ['8 measures', '8'],
        ]), 'MEASURES');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(170);
      this.setTooltip('A named section of your song — the blocks inside repeat for the given number of measures');
    }
  };

  Blockly.Blocks['repeat_section'] = {
    init() {
      this.appendDummyInput()
        .appendField('🔁 repeat')
        .appendField(new Blockly.FieldNumber(2, 1, 16, 1), 'TIMES')
        .appendField('times');
      this.appendStatementInput('DO');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(170);
      this.setTooltip('Repeat the music inside a number of times');
    }
  };

  // ===================== TIMING (gold, hue 50) =====================

  Blockly.Blocks['set_tempo'] = {
    init() {
      this.appendDummyInput()
        .appendField('⏱ set tempo to')
        .appendField(new Blockly.FieldNumber(120, 60, 180, 1), 'BPM')
        .appendField('BPM');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(50);
      this.setTooltip('Set the speed of the music (beats per minute)');
    }
  };

  Blockly.Blocks['music_start'] = {
    init() {
      this.appendDummyInput()
        .appendField('🎵 when music starts');
      this.appendStatementInput('DO');
      this.setColour(50);
      this.setTooltip('Put your music blocks inside here — they run when you press Play');
      this.setDeletable(true);
    }
  };
}

// Build toolbox XML categories for music blocks
export function getMusicToolboxXml() {
  return `
  <category name="🥁 Drums" colour="0">
    <block type="play_kick"></block>
    <block type="play_snare"></block>
    <block type="play_hihat"></block>
    <sep gap="20"></sep>
    <block type="drum_pattern"></block>
  </category>
  <category name="🎸 Bass" colour="240">
    <block type="play_bass_note"></block>
    <block type="bass_pattern"></block>
  </category>
  <category name="🎹 Melody" colour="330">
    <block type="play_melody_note"></block>
    <block type="play_chord"></block>
    <block type="rest"></block>
    <sep gap="20"></sep>
    <block type="p_transform"></block>
    <block type="l_transform"></block>
    <block type="r_transform"></block>
  </category>
  <category name="📋 Song" colour="170">
    <block type="music_start"></block>
    <block type="section"></block>
    <block type="repeat_section"></block>
  </category>
  <category name="⏱ Timing" colour="50">
    <block type="set_tempo"></block>
  </category>`;
}
