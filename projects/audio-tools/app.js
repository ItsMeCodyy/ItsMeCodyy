const tools = {
  "8d": {
    name: "8D Audio",
    controls: [
      { id: "speed", name: "Rotation speed", hint: "Stereo movement cycle", min: 1, max: 12, step: .5, value: 5, unit: " sec" },
      { id: "depth", name: "Pan depth", hint: "Left / right intensity", min: 20, max: 100, step: 1, value: 90, unit: "%" }
    ]
  },
  bass: {
    name: "Bass Booster",
    controls: [
      { id: "gain", name: "Bass boost", hint: "Low-frequency gain", min: 0, max: 24, step: 1, value: 10, unit: " dB" },
      { id: "freq", name: "Bass range", hint: "Low-shelf frequency", min: 60, max: 300, step: 10, value: 150, unit: " Hz" }
    ]
  },
  vocals: {
    name: "Vocal Remover",
    controls: [
      { id: "strength", name: "Center reduction", hint: "Stereo center cancellation", min: 20, max: 100, step: 1, value: 100, unit: "%" }
    ]
  },
  reverb: {
    name: "Reverb",
    controls: [
      { id: "decay", name: "Room decay", hint: "Reverb tail length", min: .5, max: 6, step: .1, value: 2.4, unit: " sec" },
      { id: "mix", name: "Wet mix", hint: "Amount of reverb", min: 0, max: 100, step: 1, value: 32, unit: "%" }
    ]
  },
  echo: {
    name: "Echo / Delay",
    controls: [
      { id: "delay", name: "Delay time", hint: "Spacing between repeats", min: .08, max: 1.2, step: .01, value: .32, unit: " sec" },
      { id: "feedback", name: "Feedback", hint: "Repeat intensity", min: 0, max: 80, step: 1, value: 38, unit: "%" }
    ]
  },
  speed: {
    name: "Speed Changer",
    controls: [
      { id: "rate", name: "Playback speed", hint: "Also changes pitch", min: .5, max: 2, step: .05, value: 1.2, unit: "×" }
    ]
  },
  reverse: { name: "Reverse Audio", controls: [] },
  normalize: {
    name: "Normalize",
    controls: [
      { id: "peak", name: "Target peak", hint: "Maximum output level", min: 70, max: 100, step: 1, value: 96, unit: "%" }
    ]
  },
  fade: {
    name: "Fade In / Out",
    controls: [
      { id: "in", name: "Fade in", hint: "Smooth opening", min: 0, max: 10, step: .25, value: 2, unit: " sec" },
      { id: "out", name: "Fade out", hint: "Smooth ending", min: 0, max: 10, step: .25, value: 2, unit: " sec" }
    ]
  }
};

let selectedTool = "8d";
let sourceBuffer = null;
let processedBuffer = null;
let objectUrl = null;
let previewAudio = new Audio();
let loadedFile = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const filePanel = $("#filePanel");
const waveformWrap = $("#waveformWrap");
const controls = $("#controls");
const actionRow = $("#actionRow");
const processBtn = $("#processBtn");
const downloadBtn = $("#downloadBtn");
const playBtn = $("#playBtn");
const progressWrap = $("#progressWrap");
const progressBar = $("#progressBar");
const progressText = $("#progressText");

function formatTime(sec) {
  if (!Number.isFinite(sec)) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes/1024).toFixed(0)} KB` : `${(bytes/1024/1024).toFixed(1)} MB`;
}

function setStatus(text) { $("#statusText").textContent = text; }

function renderControls() {
  const tool = tools[selectedTool];
  $("#workspaceTitle").textContent = tool.name;
  controls.innerHTML = "";
  if (!sourceBuffer) return;
  if (!tool.controls.length) {
    controls.innerHTML = `<div class="control-row"><div class="control-name"><strong>No settings needed</strong><span>This tool is ready to process.</span></div></div>`;
  } else {
    tool.controls.forEach(c => {
      const row = document.createElement("div");
      row.className = "control-row";
      row.innerHTML = `
        <div class="control-name"><strong>${c.name}</strong><span>${c.hint}</span></div>
        <input type="range" id="ctl-${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}">
        <div class="control-value" id="val-${c.id}">${c.value}${c.unit}</div>
      `;
      controls.appendChild(row);
      const input = row.querySelector("input");
      input.addEventListener("input", () => row.querySelector(".control-value").textContent = `${input.value}${c.unit}`);
    });
  }
  controls.classList.remove("hidden");
}

function getValue(id) {
  const el = $(`#ctl-${id}`);
  return el ? Number(el.value) : 0;
}

$$(".tool-card").forEach(card => {
  card.addEventListener("click", () => {
    $$(".tool-card").forEach(c => c.classList.remove("active"));
    card.classList.add("active");
    selectedTool = card.dataset.tool;
    processedBuffer = null;
    downloadBtn.classList.add("hidden");
    $("#previewMode").textContent = "Original audio";
    renderControls();
    document.querySelector("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

["dragenter", "dragover"].forEach(evt => dropzone.addEventListener(evt, e => {
  e.preventDefault(); dropzone.classList.add("drag");
}));
["dragleave", "drop"].forEach(evt => dropzone.addEventListener(evt, e => {
  e.preventDefault(); dropzone.classList.remove("drag");
}));
dropzone.addEventListener("drop", e => {
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("audio/")) loadFile(file);
});
fileInput.addEventListener("change", () => fileInput.files[0] && loadFile(fileInput.files[0]));
$("#replaceBtn").addEventListener("click", () => fileInput.click());

async function loadFile(file) {
  try {
    setStatus("DECODING AUDIO");
    loadedFile = file;
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    sourceBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    await ctx.close();
    processedBuffer = null;

    $("#fileName").textContent = file.name;
    $("#fileDetails").textContent = `${formatTime(sourceBuffer.duration)} · ${formatSize(file.size)} · ${sourceBuffer.numberOfChannels} CH`;
    $("#duration").textContent = formatTime(sourceBuffer.duration);
    $("#currentTime").textContent = "00:00";
    dropzone.classList.add("hidden");
    filePanel.classList.remove("hidden");
    waveformWrap.classList.remove("hidden");
    actionRow.classList.remove("hidden");
    downloadBtn.classList.add("hidden");
    renderControls();
    drawWaveform(sourceBuffer);
    setPreview(sourceBuffer, "Original audio");
    setStatus("READY");
  } catch (err) {
    console.error(err);
    setStatus("COULD NOT READ FILE");
    alert("That audio format could not be decoded in this browser. Try WAV, MP3, M4A, or OGG.");
  }
}

function drawWaveform(buffer) {
  const canvas = $("#waveform");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = 170 * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const w = rect.width, h = 170;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = "#d6d6d1";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();

  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x++) {
    let min = 1, max = -1;
    const start = x * step;
    for (let i = 0; i < step && start+i < data.length; i++) {
      const v = data[start+i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, (1+min)*h/2);
    ctx.lineTo(x, (1+max)*h/2);
  }
  ctx.stroke();
}

function setPreview(buffer, label) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(bufferToWavBlob(buffer));
  previewAudio.pause();
  previewAudio.src = objectUrl;
  $("#previewMode").textContent = label;
  playBtn.textContent = "▶";
}

playBtn.addEventListener("click", async () => {
  if (!previewAudio.src) return;
  if (previewAudio.paused) {
    await previewAudio.play();
    playBtn.textContent = "❚❚";
  } else {
    previewAudio.pause();
    playBtn.textContent = "▶";
  }
});
previewAudio.addEventListener("timeupdate", () => $("#currentTime").textContent = formatTime(previewAudio.currentTime));
previewAudio.addEventListener("ended", () => playBtn.textContent = "▶");

function makeBuffer(channels, length, sampleRate) {
  const ctx = new OfflineAudioContext(channels, Math.max(1,length), sampleRate);
  return ctx.createBuffer(channels, Math.max(1,length), sampleRate);
}

async function processAudio() {
  if (!sourceBuffer) return;
  setStatus("PROCESSING");
  progressWrap.classList.remove("hidden");
  progressBar.style.width = "12%"; progressText.textContent = "12%";
  processBtn.disabled = true;

  try {
    await new Promise(r => setTimeout(r, 80));
    let out;

    if (selectedTool === "reverse") out = reverseBuffer(sourceBuffer);
    else if (selectedTool === "normalize") out = normalizeBuffer(sourceBuffer, getValue("peak")/100);
    else if (selectedTool === "fade") out = fadeBuffer(sourceBuffer, getValue("in"), getValue("out"));
    else if (selectedTool === "vocals") out = vocalRemove(sourceBuffer, getValue("strength")/100);
    else out = await renderWithGraph(sourceBuffer, selectedTool);

    progressBar.style.width = "100%"; progressText.textContent = "100%";
    processedBuffer = out;
    setPreview(processedBuffer, `${tools[selectedTool].name} result`);
    drawWaveform(processedBuffer);
    downloadBtn.classList.remove("hidden");
    setStatus("DONE");
    setTimeout(() => progressWrap.classList.add("hidden"), 900);
  } catch (err) {
    console.error(err);
    setStatus("PROCESSING FAILED");
    alert("Processing failed in this browser. Try a shorter audio file or a WAV/MP3 source.");
  } finally {
    processBtn.disabled = false;
  }
}

processBtn.addEventListener("click", processAudio);

async function renderWithGraph(buffer, mode) {
  const rate = mode === "speed" ? getValue("rate") : 1;
  const tail = mode === "reverb" ? getValue("decay") + 1 : mode === "echo" ? 4 : 0;
  const duration = buffer.duration / rate + tail;
  const length = Math.ceil(duration * buffer.sampleRate);
  const ctx = new OfflineAudioContext(2, length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  if (mode === "bass") {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowshelf";
    filter.frequency.value = getValue("freq");
    filter.gain.value = getValue("gain");
    source.connect(filter).connect(ctx.destination);
  } else if (mode === "8d") {
    const panner = ctx.createStereoPanner();
    const cycle = Math.max(1, getValue("speed"));
    const depth = getValue("depth") / 100;
    const points = Math.ceil(buffer.duration / cycle * 32);
    for (let i=0; i<=points; i++) {
      const t = i * buffer.duration / points;
      panner.pan.setValueAtTime(Math.sin((t/cycle) * Math.PI * 2) * depth, t);
    }
    source.connect(panner).connect(ctx.destination);
  } else if (mode === "reverb") {
    const convolver = ctx.createConvolver();
    const decay = getValue("decay");
    convolver.buffer = createImpulse(ctx, decay);
    const wet = ctx.createGain(), dry = ctx.createGain();
    const mix = getValue("mix") / 100;
    wet.gain.value = mix; dry.gain.value = 1 - mix * .55;
    source.connect(dry).connect(ctx.destination);
    source.connect(convolver).connect(wet).connect(ctx.destination);
  } else if (mode === "echo") {
    const delay = ctx.createDelay(2);
    const feedback = ctx.createGain();
    const wet = ctx.createGain();
    delay.delayTime.value = getValue("delay");
    feedback.gain.value = getValue("feedback") / 100;
    wet.gain.value = .6;
    source.connect(ctx.destination);
    source.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet).connect(ctx.destination);
  } else {
    source.connect(ctx.destination);
  }

  source.start(0);
  progressBar.style.width = "58%"; progressText.textContent = "58%";
  return await ctx.startRendering();
}

function createImpulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c=0;c<2;c++) {
    const data = impulse.getChannelData(c);
    for (let i=0;i<len;i++) {
      data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.4);
    }
  }
  return impulse;
}

function copyMetaBuffer(buffer, channels=buffer.numberOfChannels) {
  return makeBuffer(channels, buffer.length, buffer.sampleRate);
}

function reverseBuffer(buffer) {
  const out = copyMetaBuffer(buffer);
  for (let c=0;c<buffer.numberOfChannels;c++) {
    const src = buffer.getChannelData(c), dst = out.getChannelData(c);
    for (let i=0;i<src.length;i++) dst[i] = src[src.length-1-i];
  }
  return out;
}

function normalizeBuffer(buffer, target) {
  const out = copyMetaBuffer(buffer);
  let peak = 0;
  for (let c=0;c<buffer.numberOfChannels;c++) {
    const src = buffer.getChannelData(c);
    for (let i=0;i<src.length;i++) peak = Math.max(peak, Math.abs(src[i]));
  }
  const gain = peak ? target / peak : 1;
  for (let c=0;c<buffer.numberOfChannels;c++) {
    const src = buffer.getChannelData(c), dst = out.getChannelData(c);
    for (let i=0;i<src.length;i++) dst[i] = Math.max(-1, Math.min(1, src[i]*gain));
  }
  return out;
}

function fadeBuffer(buffer, fadeIn, fadeOut) {
  const out = copyMetaBuffer(buffer);
  const inS = Math.min(buffer.length, Math.floor(fadeIn * buffer.sampleRate));
  const outS = Math.min(buffer.length, Math.floor(fadeOut * buffer.sampleRate));
  for (let c=0;c<buffer.numberOfChannels;c++) {
    const src = buffer.getChannelData(c), dst = out.getChannelData(c);
    for (let i=0;i<src.length;i++) {
      let g=1;
      if (inS && i < inS) g *= i/inS;
      if (outS && i > src.length-outS) g *= (src.length-i)/outS;
      dst[i] = src[i]*Math.max(0,g);
    }
  }
  return out;
}

function vocalRemove(buffer, strength) {
  if (buffer.numberOfChannels < 2) {
    const out = copyMetaBuffer(buffer);
    out.copyToChannel(buffer.getChannelData(0), 0);
    return out;
  }
  const out = makeBuffer(2, buffer.length, buffer.sampleRate);
  const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
  const ol = out.getChannelData(0), or = out.getChannelData(1);
  for (let i=0;i<buffer.length;i++) {
    const diff = (l[i]-r[i]) * .7;
    ol[i] = l[i]*(1-strength) + diff*strength;
    or[i] = r[i]*(1-strength) - diff*strength;
  }
  return out;
}

function bufferToWavBlob(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + frames * blockAlign);
  const view = new DataView(arrayBuffer);
  const write = (offset, str) => { for (let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + frames*blockAlign, true);
  write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate*blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames*blockAlign, true);
  let offset = 44;
  for (let i=0;i<frames;i++) {
    for (let c=0;c<channels;c++) {
      let s = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

downloadBtn.addEventListener("click", () => {
  if (!processedBuffer) return;
  const blob = bufferToWavBlob(processedBuffer);
  const a = document.createElement("a");
  const base = (loadedFile?.name || "audio").replace(/\.[^.]+$/, "");
  a.href = URL.createObjectURL(blob);
  a.download = `${base}-${selectedTool}.wav`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
});

window.addEventListener("resize", () => sourceBuffer && drawWaveform(processedBuffer || sourceBuffer));
