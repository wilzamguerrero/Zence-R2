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
  Medio: `src(s0)
  .rotate(() => time * 0.02)
  .modulate(osc(4), () => control("intensity") * 0.05)
  .out(o0)`,
};

export function frameDocument(): string {
  const source = new URL("/vendor/hydra-synth.js", location.href).href;
  return `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#202020}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="screen"></canvas><script src="${source}"></script><script>
  const canvas = document.querySelector("canvas");
  canvas.getContext("webgl", {preserveDrawingBuffer:true});
  const hydra = new Hydra({canvas, detectAudio:false, enableStreamCapture:false, makeGlobal:true, autoLoop:false, width:960, height:540});
  let controls = {}, running = true, frameExport = false, busy = false, lastExport = 0, media = null, mediaUrl = null;
  window.control = id => controls[id] ?? 0;
  window.audio = () => controls.__audio ?? 0;
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
    if(data.type === "export") frameExport = data.value;
    if(data.type === "blackout") canvas.style.visibility = data.value ? "hidden" : "visible";
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
