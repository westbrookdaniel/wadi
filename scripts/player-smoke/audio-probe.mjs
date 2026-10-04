// Test-only observation. No player handlers, sinks or selection state are replaced.
export function observeWebAudio() {
  const probes = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = connect.call(this, destination, ...rest);
    if (destination === this.context.destination) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 4096;
      const silent = this.context.createGain();
      silent.gain.value = 0;
      // Observe post-volume samples without duplicating the audible output.
      connect.call(this, analyser);
      connect.call(analyser, silent);
      connect.call(silent, destination);
      analyser.__wadiOutputNode = this;
      probes.push(analyser);
    }
    return result;
  };
  globalThis.__wadiAudioProbe = { probes };
}
export async function observeNativeAudio() {
  const video = document.querySelector('video');
  if (!video) throw new Error('Native smoke requires the real HTML video');
  const context = new AudioContext();
  const source = context.createMediaElementSource(video);
  const analyser = context.createAnalyser();
  analyser.fftSize = 4096;
  source.connect(analyser);
  analyser.connect(context.destination);
  const resume=()=>void context.resume();
  document.addEventListener('pointerdown',resume,{once:true,capture:true});
  document.addEventListener('keydown',resume,{once:true,capture:true});
  globalThis.__wadiAudioProbe = { probes: [analyser], context, video };
}
export function readFrequency() {
  const values = (globalThis.__wadiAudioProbe?.probes || []).map(analyser => {
    const bins = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(bins);
    let index = 0;
    for (let i = 1; i < bins.length; i++) if (bins[i] > bins[index]) index = i;
    return { hz: index * analyser.context.sampleRate / analyser.fftSize, db: bins[index], state: analyser.context.state };
  });
  return values.sort((a,b) => b.db - a.db)[0] || {hz:0,db:-Infinity,state:'missing'};
}
