// Browser port of Client/music.cpp. The original generated two 11,025 Hz
// voices with these wave tables, notes, beat patterns, and envelopes.
class PS2MudMusic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.triangle = new Int8Array(512);
    this.sawtooth = new Int8Array(512);
    this.sine = new Int8Array(512);
    this.notes = new Float32Array(84);
    for (let i = 0; i < 512; i++) {
      this.triangle[i] = i > 255 ? 383 - i : i - 128;
      this.sawtooth[i] = Math.trunc(i / 2) - 128;
      this.sine[i] = Math.trunc(127 * Math.sin(i / 256 * Math.PI));
    }
    this.notes.set([3.037467, 3.218084, 3.409441, 3.612177,
      3.826968, 4.054532, 4.295627, 4.551058, 4.821678,
      5.10839, 5.412151, 5.733974]);
    for (let octave = 1; octave < 6; octave++)
      for (let note = 0; note < 12; note++)
        this.notes[octave * 12 + note] = this.notes[note] * 2 ** octave;
    this.step = [0, 0];
    this.loc = [0, 0];
    this.amp = [0, 0];
    this.decay = [0, 0];
    this.type = [0, 0];
    this.tune = -1;
    this.fraction = 0;
    this.previous = 0;
    this.following = 0;
    this.port.onmessage = event => {
      if (Number.isInteger(event.data?.tune)) this.setTune(event.data.tune);
    };
  }

  setTune(which) {
    if (which === this.tune) return;
    this.tune = which;
    if (which < 0) return;
    this.octave = 36;
    this.beatCount = 10000;
    this.placeCount = 0;
    this.amp.fill(0);
    this.loc.fill(0);
    if (which === 0) {
      this.bass = [0, 5, 0, 7];
      this.voice = [4, 9, 11, 2];
      this.measureNotes = 4;
      this.tuneSpeed = 2000;
      this.beatType = 1;
    } else if (which === 2) {
      this.bass = [0, 2, 4, 5];
      this.voice = [7, 9, 11, 0];
      this.measureNotes = 3;
      this.tuneSpeed = 2500;
      this.beatType = 2;
    } else {
      this.bass = [9, 7, 5, 4];
      this.voice = [0, 2, 11, 9];
      this.measureNotes = 4;
      this.tuneSpeed = 3000;
      this.beatType = 0;
    }
    this.fraction = 0;
    this.previous = this.nextSample();
    this.following = this.nextSample();
  }

  setParameters(voice, step, amplitude, decay, type) {
    this.step[voice] = step;
    this.amp[voice] = amplitude;
    this.decay[voice] = decay;
    this.type[voice] = type;
    this.loc[voice] = 0;
  }

  nextByte(voice) {
    let value = 0;
    const index = Math.trunc(this.loc[voice]);
    switch (this.type[voice]) {
      case 0: value = this.triangle[index]; break;
      case 1: value = this.sawtooth[index]; break;
      case 2: value = this.sine[index]; break;
      case 3: value = Math.floor(Math.random() * 256) - 128; break;
    }
    const amplitude = this.amp[voice];
    if (amplitude < 32767) {
      value >>= 1;
      if (amplitude > 16382) value = (value + value) >> 2;
    }
    for (const threshold of [16383, 8191, 4095, 2047, 1023, 511, 255])
      if (amplitude < threshold) value >>= 1;
    this.loc[voice] += this.step[voice];
    if (this.loc[voice] > 511) this.loc[voice] -= 511;
    this.amp[voice] = Math.max(0, amplitude - this.decay[voice]);
    return value;
  }

  nextBeat() {
    this.placeCount = (this.placeCount + 1) % (this.measureNotes * 4);
    const measure = Math.trunc(this.placeCount / this.measureNotes);
    if (this.beatType === 0 && this.placeCount % this.measureNotes === 0)
      this.setParameters(1, this.notes[this.bass[measure] + 12], 40000, 4, 1);
    if (this.beatType === 1) {
      if (this.placeCount % this.measureNotes === 0)
        this.setParameters(1, this.notes[this.bass[measure]], 40000, 4, 1);
      if ((this.placeCount + 2) % this.measureNotes === 0)
        this.setParameters(1, this.notes[this.bass[measure] + 12] * 2, 40000, 4, 1);
    }
    if (this.beatType === 2 && this.placeCount % this.measureNotes === 0)
      this.setParameters(1, 1, 40000, 10, 3);
    const choice = Math.floor(Math.random() * 16);
    if (choice === 0 || choice === 11) return;
    if (choice === 1) { this.octave = Math.min(48, this.octave + 12); return; }
    if (choice === 2) { this.octave = Math.max(24, this.octave - 12); return; }
    const noteIndex = choice >= 12 ? choice - 12
      : choice <= 6 ? choice - 3 : choice - 7;
    const note = choice >= 7 && choice <= 10
      ? this.voice[noteIndex] : this.bass[noteIndex];
    this.setParameters(0, this.notes[note + this.octave], 70000, 10, 0);
  }

  nextSample() {
    this.beatCount++;
    if (this.beatCount > this.tuneSpeed) {
      this.beatCount = 0;
      this.nextBeat();
    }
    return Math.trunc((this.nextByte(0) + this.nextByte(1)) / 2) / 128;
  }

  process(_inputs, outputs) {
    const channel = outputs[0][0];
    if (!channel) return true;
    if (this.tune < 0) { channel.fill(0); return true; }
    const advance = 11025 / sampleRate;
    for (let i = 0; i < channel.length; i++) {
      channel[i] = this.previous + (this.following - this.previous) * this.fraction;
      this.fraction += advance;
      while (this.fraction >= 1) {
        this.fraction--;
        this.previous = this.following;
        this.following = this.nextSample();
      }
    }
    return true;
  }
}

registerProcessor('ps2mud-music', PS2MudMusic);
