export const defaultCode = `osc(9, 0.08, 0.4)
  .kaleid(5)
  .rotate(() => time * 0.07)
  .modulate(noise(3), () => control("intensity") * 0.1)
  .color(0.68, 0.40, 0.68)
  .out(o0)`;

export const presets = {
  Órbitas: defaultCode,
  Materia: `noise(4, 0.15)
  .modulate(osc(7, 0.04), () => control("intensity") * 0.15)
  .posterize(4, 0.6)
  .color(0.68, 0.4, 0.68)
  .out(o0)`,
  Pulso: `shape(6, () => 0.25 + beat() * 0.25 + bass() * 0.3, 0.01)
  .repeat(3, 3)
  .rotate(() => time * 0.2)
  .modulateScale(osc(5), () => control("intensity") * 0.12)
  .color(0.78, 0.45, 0.85)
  .out(o0)`,
  Caleido: `osc(18, 0.03, 0.8)
  .kaleid(6)
  .mult(voronoi(5, 0.2).rotate(() => time * 0.15))
  .modulate(o0, () => 0.04 + control("intensity") * 0.06)
  .color(0.72, 0.42, 0.88)
  .out(o0)`,
  Plasma: `noise(3, 0.2)
  .colorama(() => 0.25 + mid() * 0.6)
  .modulateRotate(osc(8, 0.05), () => 0.4 + control("intensity") * 0.25)
  .contrast(1.3)
  .out(o0)`,
  Medio: `src(s0)
  .rotate(() => time * 0.02)
  .modulate(osc(4), () => control("intensity") * 0.05)
  .out(o0)`,
};

export function frameDocument(): string {
  const source = new URL("./vendor/hydra-synth.js", location.href).href;
  return `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="screen" width="960" height="540"></canvas><script src="${source}"></script><script>
  const canvas = document.querySelector("canvas");
  canvas.getContext("webgl", {preserveDrawingBuffer:true});
  const hydra = new Hydra({canvas, detectAudio:false, enableStreamCapture:false, makeGlobal:true, autoLoop:false, width:960, height:540});
  let controls = {}, running = true, frameExport = false, busy = false, lastExport = 0, media = null, mediaUrl = null, liveSourceCanvas = null, liveSourceInit = false;
  window.control = id => controls[id] ?? 0;
  window.audio = () => controls.__audio ?? 0;
  window.bass = () => controls.__bass ?? 0;
  window.mid = () => controls.__mid ?? 0;
  window.high = () => controls.__high ?? 0;
  window.bpm = () => controls.__bpm ?? 120;
  window.beat = () => controls.__beat ?? 0;
  const tell = data => parent.postMessage(data, "*");
  addEventListener("message", async event => {
    if(event.source !== parent) return;
    const data = event.data;
    if(data.type === "code") {
      try {
        new Function(data.code);
        hydra.eval(data.code);
        hydra.tick(0);
        tell({type:"compiled"});
      } catch(error) { tell({type:"error", message:String(error.message || error)}); }
    }
    if(data.type === "controls") controls = data.values;
    if(data.type === "playing") running = data.value;
    if(data.type === "export") {
      frameExport = data.value;
      if(frameExport && !busy) {
        busy=true; lastExport=performance.now();
        createImageBitmap(canvas).then(bitmap=>parent.postMessage({type:"frame",bitmap},"*",[bitmap])).catch(()=>{}).finally(()=>busy=false);
      }
    }
    if(data.type === "blackout") canvas.style.visibility = data.value ? "hidden" : "visible";
    if(data.type === "sourceFrame" && data.bitmap) {
      if(!liveSourceCanvas) {
        liveSourceCanvas = document.createElement("canvas");
        liveSourceCanvas.width = 640;
        liveSourceCanvas.height = 360;
      }
      liveSourceCanvas.getContext("2d").drawImage(data.bitmap, 0, 0, liveSourceCanvas.width, liveSourceCanvas.height);
      data.bitmap.close();
      if(!liveSourceInit) {
        liveSourceInit = true;
        s0.init({src: liveSourceCanvas, dynamic: true});
      }
    }
    if(data.type === "resetSource") {
      liveSourceInit = false;
    }
    if(data.type === "snapshot") {
      createImageBitmap(canvas).then(bitmap=>parent.postMessage({type:"snapshotBitmap",bitmap},"*",[bitmap])).catch(()=>{});
    }
    if(data.type === "media") {
      try {
        if(media?.pause) media.pause();
        if(mediaUrl) URL.revokeObjectURL(mediaUrl);
        mediaUrl = URL.createObjectURL(data.file);
        media = document.createElement(data.file.type.startsWith("video/") ? "video" : "img");
        if(media instanceof HTMLVideoElement) {
          media.muted = true; media.loop = true; media.playsInline = true;
          media.src = mediaUrl; await media.play();
        } else {
          media.src = mediaUrl; await media.decode();
        }
        s0.init({src:media});
        liveSourceInit = false;
        hydra.tick(0);
        tell({type:"mediaReady"});
      } catch(error) { tell({type:"error",message:"No se pudo decodificar el medio. " + error.message}); }
    }
  });
  let previous = performance.now();
  function draw(now) {
    if(running) hydra.tick(Math.min(now-previous,100));
    previous = now;
    if(frameExport && !busy && now-lastExport>50) {
      busy=true; lastExport=now;
      createImageBitmap(canvas).then(bitmap=>parent.postMessage({type:"frame",bitmap},"*",[bitmap])).catch(()=>{}).finally(()=>busy=false);
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  tell({type:"ready"});
  </script></body></html>`;
}
