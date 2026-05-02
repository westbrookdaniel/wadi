(function () {
  const NAMESPACE = "urn:x-cast:com.wadi";
  const CHUNK_SIZE = 20000;
  const context = cast.framework.CastReceiverContext.getInstance();
  const video = document.getElementById("video");
  const idle = document.getElementById("idle");
  const chunksById = new Map();
  const observed = new Set();
  const state = {
    stream: null,
    loaded: false,
    paused: true,
    time: 0,
    duration: 0,
    buffering: false,
    buffered: 0,
    volume: 1,
    muted: false,
    playbackSpeed: 1,
    subtitlesTracks: [],
    selectedSubtitlesTrackId: null,
    audioTracks: [],
    selectedAudioTrackId: null,
  };

  function emit(event, args) {
    const payload = JSON.stringify({ event, args: args || [] });
    const count = Math.ceil(payload.length / CHUNK_SIZE);
    const id = Math.random().toString(16).slice(2);
    for (let i = 0; i < count; i += 1) {
      context.sendCustomMessage(NAMESPACE, undefined, {
        id,
        chunk: payload.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE),
        index: i,
        length: count,
      });
    }
  }

  function propChanged(name, value) {
    state[name] = value;
    emit("propChanged", [name, value]);
  }

  function propValue(name) {
    emit("propValue", [name, state[name]]);
  }

  function syncBuffered() {
    if (!video.buffered?.length) {
      propChanged("buffered", 0);
      return;
    }
    const value = video.buffered.end(video.buffered.length - 1);
    propChanged("buffered", value);
  }

  function setSubtitlesTrack(trackId) {
    const tracks = Array.from(video.textTracks || []);
    tracks.forEach((track) => {
      track.mode = "disabled";
    });
    if (!trackId) {
      propChanged("selectedSubtitlesTrackId", null);
      return;
    }
    const selected = tracks.find((track) => track.id === trackId || track.language === trackId);
    if (selected) {
      selected.mode = "showing";
      propChanged("selectedSubtitlesTrackId", trackId);
    }
  }

  function syncAudioTracks() {
    const rawTracks = Array.from(video.audioTracks || []);
    const tracks = rawTracks.map((track, index) => ({
      id: String(index),
      label: track.label || track.language || `Audio ${index + 1}`,
      language: track.language || "und",
    }));
    propChanged("audioTracks", tracks);
    const selectedIndex = rawTracks.findIndex((track) => track.enabled);
    propChanged("selectedAudioTrackId", selectedIndex >= 0 ? String(selectedIndex) : null);
  }

  function setAudioTrack(trackId) {
    const tracks = Array.from(video.audioTracks || []);
    if (!tracks.length) {
      propChanged("selectedAudioTrackId", null);
      return;
    }
    let selectedIndex = null;
    if (typeof trackId === "string") {
      const numeric = Number.parseInt(trackId, 10);
      if (Number.isFinite(numeric) && numeric >= 0 && numeric < tracks.length) {
        selectedIndex = numeric;
      } else {
        selectedIndex = tracks.findIndex((track) => track.language === trackId);
      }
    }
    tracks.forEach((track, index) => {
      track.enabled = selectedIndex === null ? index === 0 : index === selectedIndex;
    });
    const activeIndex = selectedIndex === null ? 0 : selectedIndex;
    propChanged("selectedAudioTrackId", String(Math.max(activeIndex, 0)));
  }

  function attachTracks(stream) {
    const subtitles = Array.isArray(stream?.subtitles) ? stream.subtitles : [];
    const textTracks = subtitles
      .filter((track) => typeof track?.url === "string")
      .map((track, index) => {
        const element = document.createElement("track");
        element.kind = "subtitles";
        element.label = track.lang || `Subtitle ${index + 1}`;
        element.srclang = track.lang || "und";
        element.id = track.id || `${track.lang || "sub"}-${index}`;
        element.src = track.url;
        video.appendChild(element);
        return {
          id: element.id,
          label: element.label,
          lang: element.srclang,
        };
      });

    propChanged("subtitlesTracks", textTracks);
    syncAudioTracks();
  }

  function load(commandArgs) {
    const stream = commandArgs?.stream;
    if (!stream?.url) {
      return;
    }
    video.querySelectorAll("track").forEach((node) => node.remove());
    video.src = stream.url;
    attachTracks(stream);
    idle.style.display = "none";
    propChanged("stream", stream);
    propChanged("loaded", true);
    if (typeof commandArgs.time === "number" && Number.isFinite(commandArgs.time)) {
      video.currentTime = Math.max(0, commandArgs.time);
    }
    if (commandArgs.autoplay !== false) {
      video.play().catch(() => undefined);
    }
  }

  function setProp(name, value) {
    switch (name) {
      case "paused":
        if (value) {
          video.pause();
        } else {
          video.play().catch(() => undefined);
        }
        break;
      case "time":
        if (typeof value === "number" && Number.isFinite(value)) {
          video.currentTime = Math.max(0, value);
        }
        break;
      case "volume":
        if (typeof value === "number" && Number.isFinite(value)) {
          video.volume = Math.min(1, Math.max(0, value));
          propChanged("volume", video.volume);
        }
        break;
      case "muted":
        video.muted = Boolean(value);
        propChanged("muted", video.muted);
        break;
      case "playbackSpeed":
        if (typeof value === "number" && Number.isFinite(value)) {
          video.playbackRate = Math.min(3, Math.max(0.25, value));
          propChanged("playbackSpeed", video.playbackRate);
        }
        break;
      case "selectedSubtitlesTrackId":
        setSubtitlesTrack(value);
        break;
      case "selectedAudioTrackId":
        setAudioTrack(value);
        break;
      default:
        break;
    }
  }

  function onMessage(event) {
    try {
      const { id, chunk, index, length } = event.data || {};
      if (!id || typeof chunk !== "string") {
        return;
      }
      const chunks = chunksById.get(id) || [];
      chunks[index] = chunk;
      chunksById.set(id, chunks);
      if (chunks.filter(Boolean).length !== length) {
        return;
      }
      chunksById.delete(id);
      const action = JSON.parse(chunks.join(""));
      if (action?.type === "observeProp" && typeof action.propName === "string") {
        observed.add(action.propName);
        propValue(action.propName);
        return;
      }
      if (action?.type === "setProp") {
        setProp(action.propName, action.propValue);
        return;
      }
      if (action?.type === "command") {
        if (action.commandName === "load") {
          load(action.commandArgs);
        }
        if (action.commandName === "unload") {
          video.pause();
          video.removeAttribute("src");
          video.load();
          idle.style.display = "block";
          propChanged("loaded", false);
          propChanged("stream", null);
        }
      }
    } catch (error) {
      emit("error", [{ message: String(error) }]);
    }
  }

  video.addEventListener("play", function () {
    propChanged("paused", false);
  });
  video.addEventListener("pause", function () {
    propChanged("paused", true);
  });
  video.addEventListener("timeupdate", function () {
    propChanged("time", video.currentTime || 0);
  });
  video.addEventListener("durationchange", function () {
    propChanged("duration", Number.isFinite(video.duration) ? video.duration : 0);
  });
  video.addEventListener("loadedmetadata", function () {
    syncAudioTracks();
  });
  video.addEventListener("progress", syncBuffered);
  video.addEventListener("ended", function () {
    emit("ended");
  });
  video.addEventListener("waiting", function () {
    propChanged("buffering", true);
  });
  video.addEventListener("playing", function () {
    propChanged("buffering", false);
  });

  context.addCustomMessageListener(NAMESPACE, onMessage);
  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true;
  options.mediaElement = video;
  context.start(options);
})();
