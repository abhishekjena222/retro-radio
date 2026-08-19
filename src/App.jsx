import { useEffect, useRef, useState } from "react";
import "./App.css";

const API =
  "https://de1.api.radio-browser.info/json/stations/search";

function App() {
  const audioRef = useRef(null);
  const scanAudioRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const scanIndexRef = useRef(null);
  const scanDirectionRef = useRef(null);
  const scanCancelRef = useRef(false);
  const recoveryTimerRef = useRef(null);
  const recoveryAttemptRef = useRef(0);
  const failoverRef = useRef(false);
  const wasOfflineRef = useRef(false);
  const wasPlayingBeforeOfflineRef = useRef(false);
  const manuallyPausedRef = useRef(false);
  const tunerAnimationRef = useRef(null);
  const stationLoadRequestRef = useRef(0);
  const recoveryStationIdRef = useRef(null);


  const [displayFrequency, setDisplayFrequency] = useState(98.0);
  const [stations, setStations] = useState([]);
  const [currentStation, setCurrentStation] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState("Unknown Location");
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchLocation, setSearchLocation] = useState("");
  const [searchingLocation, setSearchingLocation] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [tunerFrequency, setTunerFrequency] = useState(98.0);
  const [scanMessage, setScanMessage] =   useState("");
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem("retroRadioFavorites");
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Failed to load favorites:", error);
      return [];
    }
  });
  const [stationFilter, setStationFilter] = useState("all");
  const displayedStations = stationFilter === "favorites" ? favorites : stations;
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem("retroRadioVolume");
    if (savedVolume !== null) {
      const parsed = parseFloat(savedVolume);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 0.8;
  });
const [muted, setMuted] = useState(false);
const [recovering, setRecovering] = useState(false);
const [autoFailover, setAutoFailover] = useState(false);
const [presets, setPresets] = useState(() => {
  try {
    const saved = localStorage.getItem(
      "retroRadioPresets"
    );

    return saved
      ? JSON.parse(saved)
      : [null, null, null, null, null, null];
  } catch (error) {
    console.error(
      "Failed to load presets:",
      error
    );

    return [null, null, null, null, null, null];
  }
});
const [signalLevel, setSignalLevel] = useState(0);
const [streamHealth, setStreamHealth] = useState("READY");
const [showPresets, setShowPresets] = useState(false);
const [presetToReplace, setPresetToReplace] = useState(null);
const [theme, setTheme] = useState(() => {
  return localStorage.getItem("retroRadioTheme") || "car";
});
const [online, setOnline] = useState(navigator.onLine);
const onlineRef = useRef(navigator.onLine);
const [lastStationId, setLastStationId] = useState(() => {
  return localStorage.getItem("retroRadioLastStationId") || null;
});
const [isTuning, setIsTuning] = useState(false);


// -- USE EFFECTS --
useEffect(() => {
  localStorage.setItem(
    "retroRadioPresets",
    JSON.stringify(presets)
  );
}, [presets]);

useEffect(() => {
    loadStations();
  }, []);

useEffect(() => {
  return () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
    }

    if (scanAudioRef.current) {
      scanAudioRef.current.pause();
      scanAudioRef.current.src = "";
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }
  };
}, []);

useEffect(() => {
  localStorage.setItem(
    "retroRadioFavorites",
    JSON.stringify(favorites)
  );
}, [favorites]);

useEffect(() => {
  localStorage.setItem(
    "retroRadioVolume",
    volume.toString()
  );

  if (audioRef.current) {
    audioRef.current.volume = volume;
  }
}, [volume]);

useEffect(() => {
  if (audioRef.current) {
    audioRef.current.muted = muted;
  }
}, [muted]);

useEffect(() => {
  const interval = setInterval(() => {
    updateSignalLevel();
  }, 1000);

  return () => {
    clearInterval(interval);
  };
}, []);

useEffect(() => {
  localStorage.setItem(
    "retroRadioTheme",
    theme
  );
}, [theme]);

useEffect(() => {
  window.addEventListener(
    "offline",
    handleOffline
  );

  window.addEventListener(
    "online",
    handleOnline
  );

  return () => {
    window.removeEventListener(
      "offline",
      handleOffline
    );

    window.removeEventListener(
      "online",
      handleOnline
    );
  };
}, []);

useEffect(() => {
  if (!("mediaSession" in navigator)) {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentStation?.name || "Retro Radio",
    artist: "RETRO RADIO",
    album: "FM Radio",
    artwork: currentStation?.favicon
      ? [
          {
            src: currentStation.favicon,
            sizes: "512x512",
            type: "image/png",
          },
        ]
      : [],
  });

  navigator.mediaSession.setActionHandler("play", () => {
    togglePlay();
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    togglePlay();
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    nextStation();
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    previousStation();
  });

  return () => {
    try {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    } catch (error) {
      console.error("Media Session cleanup failed:", error);
    }
  };
}, [currentStation, playing]);

useEffect(() => {
  if (!("mediaSession" in navigator)) {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: currentStation?.name || "Retro Radio",
    artist: "RETRO RADIO",
    album: "FM Radio",
    artwork: currentStation?.favicon
      ? [
          {
            src: currentStation.favicon,
            sizes: "512x512",
            type: "image/png",
          },
        ]
      : [],
  });

  navigator.mediaSession.setActionHandler(
    "play",
    () => {
      togglePlay();
    }
  );

  navigator.mediaSession.setActionHandler(
    "pause",
    () => {
      togglePlay();
    }
  );

  navigator.mediaSession.setActionHandler(
    "nexttrack",
    () => {
      nextStation();
    }
  );

  navigator.mediaSession.setActionHandler(
    "previoustrack",
    () => {
      previousStation();
    }
  );

  return () => {
    try {
      navigator.mediaSession.setActionHandler(
        "play",
        null
      );

      navigator.mediaSession.setActionHandler(
        "pause",
        null
      );

      navigator.mediaSession.setActionHandler(
        "nexttrack",
        null
      );

      navigator.mediaSession.setActionHandler(
        "previoustrack",
        null
      );
    } catch (error) {
      console.error(
        "Media Session cleanup failed:",
        error
      );
    }
  };
}, [currentStation, playing]);



// -- FUNCTIONS --

function animateTunerTo(frequency) {
  if (frequency === null) {
    return;
  }
  setIsTuning(true);

  if (tunerAnimationRef.current) {
    cancelAnimationFrame(
      tunerAnimationRef.current
    );
  }

  setDisplayFrequency(frequency);

  const start = tunerFrequency;
  const end = frequency;

  const duration = 350;
  const startTime = performance.now();

  const animate = (currentTime) => {
    const elapsed =
      currentTime - startTime;

    const progress =
      Math.min(elapsed / duration, 1);

    // Smooth ease-out
    const eased =
      1 - Math.pow(1 - progress, 3);

    const value =
      start + (end - start) * eased;

    setDisplayFrequency(value);

    if (progress < 1) {
      tunerAnimationRef.current =
        requestAnimationFrame(animate);
    } else {
      setTunerFrequency(end);
      setDisplayFrequency(end);
      setIsTuning(false);
      tunerAnimationRef.current = null;
    }
  };

  tunerAnimationRef.current =
    requestAnimationFrame(animate);
}

function getFrequencyScale() {
  const frequencies = [];

  for (let i = 880; i <= 1080; i++) {
    frequencies.push(i / 10);
  }

  return frequencies;
}

function handleOffline() {
  console.log("INTERNET OFFLINE");

  wasOfflineRef.current = true;

  // Only remember playback if the user did NOT
  // intentionally pause the radio.
  if (!manuallyPausedRef.current) {
    wasPlayingBeforeOfflineRef.current = true;
  } else {
    wasPlayingBeforeOfflineRef.current = false;
  }

  if (recoveryTimerRef.current) {
    clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }

  recoveryAttemptRef.current = 0;

  setRecovering(false);
  setAutoFailover(false);
  setPlaying(false);

  setSignalLevel(0);
  setStreamHealth("OFFLINE");
  setScanMessage("INTERNET OFFLINE");

  console.log(
    "MANUALLY PAUSED:",
    manuallyPausedRef.current
  );

  console.log(
    "WILL AUTO RESUME:",
    wasPlayingBeforeOfflineRef.current
  );
}

async function handleOnline() {
  console.log("INTERNET ONLINE");

  if (!wasOfflineRef.current) {
    return;
  }

  wasOfflineRef.current = false;

  // USER MANUALLY PAUSED
  if (manuallyPausedRef.current) {
    console.log(
      "ONLINE: USER HAD PAUSED RADIO — STAY PAUSED"
    );

    wasPlayingBeforeOfflineRef.current = false;

    setRecovering(false);
    setPlaying(false);
    setScanMessage("");
    setStreamHealth("READY");
    setSignalLevel(0);

    return;
  }

  // RADIO WAS PLAYING BEFORE INTERNET LOSS
  const station = currentStation;

  if (
    !station ||
    !wasPlayingBeforeOfflineRef.current
  ) {
    wasPlayingBeforeOfflineRef.current = false;

    setRecovering(false);
    setPlaying(false);
    setScanMessage("");
    setStreamHealth("READY");

    return;
  }

  wasPlayingBeforeOfflineRef.current = false;

  recoveryAttemptRef.current = 0;

  if (recoveryTimerRef.current) {
    clearTimeout(
      recoveryTimerRef.current
    );

    recoveryTimerRef.current = null;
  }

  setScanMessage("RECONNECTING...");
  setRecovering(true);
  setStreamHealth("RECOVERING");

  console.log(
    "RECONNECTING:",
    station.name
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 1000)
  );

  // User pressed pause during reconnect delay
  if (manuallyPausedRef.current) {
    console.log(
      "RECONNECT CANCELLED: USER PAUSED"
    );

    setRecovering(false);
    setPlaying(false);
    setStreamHealth("READY");
    setScanMessage("");

    return;
  }

  if (!navigator.onLine) {
    console.log(
      "INTERNET DROPPED AGAIN"
    );

    return;
  }

  await recoverCurrentStation();
}

function getFrequencyDisplay(station) {
  const frequency =
    getStationFrequency(station);

  if (frequency === null) {
    return "STREAM";
  }

  return `${frequency.toFixed(1)} FM`;
}

function getStationFrequency(station) {
  if (!station) {
    return null;
  }

  const frequency = Number(
    station.frequency
  );

  if (
    !Number.isFinite(frequency) ||
    frequency <= 0
  ) {
    return null;
  }

  return frequency;
}

function updateSignalLevel() {
  const audio = audioRef.current;

  if (!audio) {
    setSignalLevel(0);
    setStreamHealth("LOST");
    return;
  }

  if (audio.error) {
    setSignalLevel(0);
    setStreamHealth("LOST");
    return;
  }

  if (audio.paused) {
    setSignalLevel(0);
    setStreamHealth("PAUSED");
    return;
  }

  if (audio.readyState === 0) {
    setSignalLevel(1);
    setStreamHealth("WEAK");
    return;
  }

  if (audio.readyState === 1) {
    setSignalLevel(2);
    setStreamHealth("WEAK");
    return;
  }

  if (audio.readyState === 2) {
    setSignalLevel(3);
    setStreamHealth("FAIR");
    return;
  }

  if (audio.readyState >= 3) {
    setSignalLevel(5);
    setStreamHealth("GOOD");
  }
}

function savePreset(index) {
  if (!currentStation) {
    return;
  }

  // If this preset already contains a station,
  // ask for confirmation before replacing it.
  if (presets[index]) {
    setPresetToReplace(index);
    return;
  }

  setPresets((previousPresets) => {
    const updated = [
      ...previousPresets
    ];

    updated[index] = currentStation;

    return updated;
  });

  console.log(
    `Saved ${currentStation.name} to P${index + 1}`
  );
}

async function tunePreset(index) {
  const station = presets[index];

  if (!station) {
    return;
  }

  console.log(
    `Tuning to P${index + 1}:`,
    station.name
  );

  await playStation(station);
}

async function autoFailoverToNextStation() {
  if (!navigator.onLine) {

  console.log(
    "AUTO FAILOVER SKIPPED: INTERNET OFFLINE"
  );

  setAutoFailover(false);
  setRecovering(false);
  setStreamHealth("OFFLINE");

  return;
}

  if (
    scanning ||
    stations.length === 0 ||
    !currentStation
  ) {
    return;
  }

  if (failoverRef.current) {
    return;
  }

  failoverRef.current = true;

  setAutoFailover(true);
  setRecovering(false);
  setPlaying(false);

  console.log(
    "AUTO FAILOVER STARTED"
  );

  const currentIndex =
    stations.findIndex(
      (station) =>
        station.id === currentStation.id
    );

  if (currentIndex === -1) {
    failoverRef.current = false;
    setAutoFailover(false);
    return;
  }

  let index = currentIndex + 1;

  while (
    index < stations.length
  ) {

    if (
      !failoverRef.current ||
      scanning
    ) {
      break;
    }

    const station =
      stations[index];

    const frequency =  getStationFrequency(station);

  setScanMessage(
  frequency !== null
    ? `AUTO SEEK: ${frequency.toFixed(1)} FM`
    : `AUTO SEEK: ${station.name}`
);

    console.log(
      "AUTO TEST:",
      station.name
    );

    const playable =
      await testStation(station);

    if (
      playable &&
      failoverRef.current
    ) {

      console.log(
        "AUTO LOCK:",
        station.name
      );

      failoverRef.current = false;

      setAutoFailover(false);
      setScanMessage("LOCKED");

      await playStation(
        station
      );

      return;
    }

    index++;
  }

  console.log(
    "AUTO FAILOVER FAILED"
  );

  failoverRef.current = false;

  setAutoFailover(false);
  setPlaying(false);

  setScanMessage(
    "NO BACKUP STATION"
  );
}

async function recoverCurrentStation() {

  // NEVER attempt recovery while internet is offline.
  if (!navigator.onLine) {
    console.log(
      "RECOVERY BLOCKED: INTERNET OFFLINE"
    );

    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }

    setRecovering(false);
    setPlaying(false);
    setSignalLevel(0);
    setStreamHealth("OFFLINE");
    setScanMessage("INTERNET OFFLINE");

    return;
  }


  const audio = audioRef.current;
  const station = currentStation;

  if (station) {
    recoveryStationIdRef.current = station.id;
  }

  if (!audio || !station?.streamUrl) {
    return;
  }

  if (scanning) {
    return;
  }

  if (recoveryAttemptRef.current >= 3) {
    console.log(
    "RECOVERY FAILED: Starting auto failover"
  );

  setRecovering(false);

  recoveryAttemptRef.current = 0;

  await autoFailoverToNextStation();

  return;
  }

  recoveryAttemptRef.current += 1;

  const attempt =
    recoveryAttemptRef.current;

  console.log(
    `RECOVERY ATTEMPT ${attempt}:`,
    station.name
  );

  setRecovering(true);
  setPlaying(false);

  try {


    if (
      !currentStation ||
      currentStation.id !==
      recoveryStationIdRef.current
      ) {
        console.log(
          "RECOVERY CANCELLED: STATION CHANGED"
          );
      setRecovering(false);
      return;
    }

    audio.pause();

    audio.src = station.streamUrl;

    audio.load();

    await audio.play();

    console.log(
      "RECOVERY SUCCESS:",
      station.name
    );

    setRecovering(false);
    setPlaying(true);

    recoveryAttemptRef.current = 0;

  } catch (error) {

    console.error(
      `RECOVERY FAILED ${attempt}:`,
      error
    );

    if (recoveryTimerRef.current) {
      clearTimeout(
        recoveryTimerRef.current
      );
    }

    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;

      if (
        !currentStation ||
        currentStation.id !==
        recoveryStationIdRef.current
        ) {
          console.log(
            "RECOVERY TIMER CANCELLED: STATION CHANGED"
            );
            setRecovering(false);
            return;
        }

    // Internet disappeared while waiting.
    // Do NOT start another recovery attempt.
    if (!navigator.onLine) {
      console.log(
        "RECOVERY CANCELLED: INTERNET OFFLINE"
      );

      setRecovering(false);
      setPlaying(false);
      setSignalLevel(0);
      setStreamHealth("OFFLINE");
      setScanMessage("INTERNET OFFLINE");

      return;
    }

    recoverCurrentStation();

  }, 1500);
  }
}

function isUnplayableStream(audio, error = null) {
  if (error?.name === "NotSupportedError") {
    return true;
  }

  if (audio?.error?.code === 4) {
    return true;
  }

  return false;
}

function toggleFavorite(station) {
  if (!station) {
    return;
  }

  setFavorites((previousFavorites) => {
    const exists = previousFavorites.some(
      (favorite) => favorite.id === station.id
    );

    if (exists) {
      return previousFavorites.filter(
        (favorite) => favorite.id !== station.id
      );
    }

    return [...previousFavorites, station];
  });
}

function isFavorite(station) {
  if (!station) {
    return false;
  }

  return favorites.some(
    (favorite) => favorite.id === station.id
  );
}

  async function loadStations(latitude = null, longitude = null) {
    const requestId =
    ++stationLoadRequestRef.current;

  try {
    // Changing station lists means the
    // current stream must stop.
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
    }

    setPlaying(false);
    setLoading(true);

    const params = new URLSearchParams({
      hidebroken: "true",
      has_geo_info: "true",
      order: "votes",
      reverse: "true",
      limit: "100",
    });

    if (
      latitude === null ||
      longitude === null
    ) {
      params.set("country", "India");
    }

    const requestUrl = `${API}?${params}`;

    console.log(
      "Request:",
      requestUrl
    );

    const response = await fetch(
      requestUrl
    );

    const data = await response.json();

    if (
      requestId !== stationLoadRequestRef.current
      ) {
        console.log(
          "IGNORING OLD STATION REQUEST:",
          requestId
        );
        return;
      }

    console.log(
      "Station count:",
      data.length
    );

    const normalizedStations = data.map(
      (station) =>
        normalizeStation(
          station,
          latitude,
          longitude
        )
    );

    // If we have a location,
    // sort stations by distance.
    if (
      latitude !== null &&
      longitude !== null
    ) {
      normalizedStations.sort(
        (a, b) => {

          if (a.distance === null) {
            return 1;
          }

          if (b.distance === null) {
            return -1;
          }

          return (
            a.distance -
            b.distance
          );
        }
      );
    }

    // Update existing favorites
    // with fresh station information.
    setFavorites((previousFavorites) => {
      return previousFavorites.map((favorite) => {
        const freshStation =
        normalizedStations.find(
          (station) =>
            station.id === favorite.id
        );

        if (!freshStation) {
          return favorite;
        }

        return {
           ...favorite,
           ...freshStation,
        };
      });
    });

    setPresets((previousPresets) => {
      return previousPresets.map((preset) => {
      if (!preset) {
      return null;
      }

      const freshStation =
        normalizedStations.find(
          (station) =>
            station.id === preset.id
        );

      if (!freshStation) {
        return preset;
      }

      return {
        ...preset,
        ...freshStation,
      };
    });
    });

    setStations(
      normalizedStations
    );

    if (normalizedStations.length > 0) {

      const savedStationId =
  localStorage.getItem(
    "retroRadioLastStationId"
  );

  const savedStation =
  savedStationId
    ? normalizedStations.find(
        (station) =>
          station.id === savedStationId
      )
    : null;

  const stationToRestore =
    savedStation || normalizedStations[0];

  console.log(
    savedStation
      ? "RESTORING LAST STATION:"
      : "NO SAVED STATION — USING FIRST STATION:",
    stationToRestore.name
  );

  setCurrentStation(stationToRestore);
  setLastStationId(stationToRestore.id);

  if (audioRef.current) {
    audioRef.current.pause();

    audioRef.current.src =
      stationToRestore.streamUrl;

    audioRef.current.load();
  }

  setPlaying(false);

  const frequency =
    getStationFrequency(stationToRestore);

  if (frequency !== null) {
    setTunerFrequency(frequency);
  } else {
    setTunerFrequency(null);
  }
}

  } catch (error) {

    console.error(
      "Failed to load stations:",
      error
    );

  } finally {

    setLoading(false);

  }
}

  async function scanToStation(direction) {

    if (!navigator.onLine) {
    console.log(
      "SEEK BLOCKED: INTERNET OFFLINE"
    );

    setScanMessage("INTERNET OFFLINE");
    setStreamHealth("OFFLINE");

    return;
  }

  if (
    scanning ||
    stations.length === 0
  ) {
    return;
  }

  scanCancelRef.current = false;

  setScanning(true);
  setScanMessage("SCANNING...");

  const currentIndex =
    currentStation
      ? stations.findIndex(
          (station) =>
            station.id ===
            currentStation.id
        )
      : -1;

  let index;

  if (currentIndex === -1) {
    index =
      direction === "next"
        ? 0
        : stations.length - 1;
  } else {
    index =
      direction === "next"
        ? currentIndex + 1
        : currentIndex - 1;
  }

  while (
    index >= 0 &&
    index < stations.length
  ) {

    if (scanCancelRef.current) {
      console.log("SCAN CANCELLED");
      setScanMessage("SCAN CANCELLED");
      setScanning(false);

      return;
    }

    const station = stations[index];
    const frequency = getStationFrequency(station);

    setScanMessage(
  frequency !== null
    ? `TESTING ${frequency.toFixed(1)} FM`
    : `TESTING ${station.name}`
);
    console.log(
      "Scanning station:",
      station.name
    );

    const playable = await testStation(station);

    if (playable) {
      console.log(
        "LOCKED:",
        station.name
      );

      // setCurrentStation(station);

      setScanMessage("LOCKED");

      try {
        // await audioRef.current.play();

        // setPlaying(true);
      } catch (error) {
        console.error(
          "Could not start locked station:",
          error
        );
      }

      setScanning(false);
      await playStation(station);

      scanIndexRef.current = null;
      scanDirectionRef.current = null;

      return;
    }

    console.log(
      "SKIP:",
      station.name
    );

    index =
      direction === "next"
        ? index + 1
        : index - 1;
  }

  console.log(
    "No playable stations found."
  );

  setScanMessage(
    "NO PLAYABLE STATION"
  );

  setScanning(false);
  scanIndexRef.current = null;
  scanDirectionRef.current = null;
}

function testStation(station) {
  return new Promise((resolve) => {

    if (!navigator.onLine) {
      console.log(
        "TEST BLOCKED: INTERNET OFFLINE"
      );

      resolve(false);
      return;
    }

    if (
      scanCancelRef.current ||
      !station?.streamUrl
    ) {
      resolve(false);
      return;
    }

    // IMPORTANT:
    // This is a temporary audio player.
    // It does NOT touch the real radio player.
    const audio = new Audio();

    scanAudioRef.current = audio;

    let finished = false;

    let timeout;

    const cleanup = () => {

      audio.removeEventListener(
        "canplay",
        handleSuccess
      );

      audio.removeEventListener(
        "playing",
        handleSuccess
      );

      audio.removeEventListener(
        "error",
        handleFailure
      );

      clearTimeout(timeout);

      audio.pause();

      audio.src = "";

      if (
        scanAudioRef.current === audio
      ) {
        scanAudioRef.current = null;
      }
    };

    const finish = (success) => {

      if (finished) {
        return;
      }

      finished = true;

      cleanup();

      resolve(success);
    };

    const handleSuccess = () => {

      // If user cancelled while
      // the station was loading,
      // don't lock onto it.
      if (scanCancelRef.current) {
        finish(false);
        return;
      }

      console.log(
        "TEST SUCCESS:",
        station.name
      );

      finish(true);
    };

    const handleFailure = () => {

      console.log(
        "TEST FAILED:",
        station.name
      );

      finish(false);
    };

    timeout = setTimeout(() => {

      console.log(
        "TEST TIMEOUT:",
        station.name
      );

      finish(false);

    }, 5000);

    audio.addEventListener(
      "canplay",
      handleSuccess
    );

    audio.addEventListener(
      "playing",
      handleSuccess
    );

    audio.addEventListener(
      "error",
      handleFailure
    );

    audio.src =
      station.streamUrl;

    audio.load();

    audio.play().catch(() => {

      finish(false);

    });
  });
}

  function normalizeStation(station, userLatitude = null, userLongitude = null) {
    
  let distance = null;

  if (
    station.geo_lat !== null &&
    station.geo_long !== null &&
    userLatitude !== null &&
    userLongitude !== null
  ) {
    distance = calculateDistance(
      userLatitude,
      userLongitude,
      station.geo_lat,
      station.geo_long
    );
  }

  // Normalize frequency safely.
  // Radio Browser can sometimes return:
  // number, string, empty string, null, etc.
  const rawFrequency =
    station.frequency ??
    station.name?.match(
    /\b(8[8-9](?:\.\d+)?|9\d(?:\.\d+)?|10[0-7](?:\.\d+)?)\s*(?:FM)?\b/i
    )?.[1] ??
    null;

  const parsedFrequency = Number(
    rawFrequency
  );

  const frequency =
    Number.isFinite(parsedFrequency) &&
    parsedFrequency >= 88 &&
    parsedFrequency <= 108
    ? parsedFrequency
    : null;

  // console.log(
  // "STATION FREQUENCY DEBUG:",
  // station.name,
  // "API frequency:",
  // station.frequency,
  // "Parsed:",
  // frequency
  // );

//   console.log(
//   "STATION METADATA:",
//   station.name,
//   {
//     homepage: station.homepage,
//     tags: station.tags,
//     codec: station.codec,
//     bitrate: station.bitrate,
//     streamUrl: station.url_resolved || station.url
//   }
// );

  return {
    id: station.stationuuid,

    name: station.name,

    country: station.country,

    state: station.state,

    language: station.language,

    codec: station.codec,

    bitrate: station.bitrate,

    streamUrl:
      station.url_resolved ||
      station.url,

    favicon:
      station.favicon ||
      null,

    homepage:
      station.homepage ||
      null,

    tags:
      station.tags ||
      "",

    frequency,

    type:
      frequency !== null
        ? "FM"
        : "DIGITAL",

    latitude:
      station.geo_lat,

    longitude:
      station.geo_long,

    distance,
  };

}

  async function getLocationName(latitude, longitude) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
      );

      const data = await response.json();

      const address = data.address;

      const city =
        address.city ||
        address.town ||
        address.village ||
        address.county ||
        "Unknown";

      const state = address.state || "";

      const country = address.country || "";

      setLocationName(
        [city, state, country]
          .filter(Boolean)
          .join(", ")
      );
    } catch (error) {
      console.error(
        "Failed to find location name:",
        error
      );
    }
  }

  function stopScanning() {
    failoverRef.current = false;
    setAutoFailover(false);

  console.log("STOPPING SCAN");

  scanCancelRef.current = true;

  // Kill only the temporary scanner audio
  if (scanAudioRef.current) {

    scanAudioRef.current.pause();

    scanAudioRef.current.src = "";

    scanAudioRef.current = null;
  }

  setScanning(false);

  setScanMessage(
    "SCAN CANCELLED"
  );

  scanIndexRef.current = null;
  scanDirectionRef.current = null;
}

function stopCurrentPlayback() {
  const audio = audioRef.current;

  if (audio) {
    audio.pause();

    audio.removeAttribute("src");
    audio.load();
  }

  setPlaying(false);
}

  function getMyLocation() {
    stopScanning();
    // Stop current radio playback
    // before changing location.
    stopCurrentPlayback();

    if (!navigator.geolocation) {
      alert(
        "Geolocation is not supported by your browser."
      );
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } =
          position.coords;

        setLocation({
          latitude,
          longitude,
        });

        setLocationName("Finding location...");

        getLocationName(latitude, longitude);

        loadStations(latitude, longitude);

        setLocationLoading(false);
      },
      (error) => {
        console.error("Location error:", error);

        setLocationLoading(false);

        alert(
          "Unable to get your location. Please allow location access."
        );
      }
    );
  }

  function getStationTags(station) {
  if (!station?.tags) {
    return "";
  }

  return station.tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((tag) => tag.toUpperCase())
    .join(" • ");
}

  async function searchCustomLocation() {
    stopScanning();
    // Stop current radio playback
    // before changing location.
    stopCurrentPlayback();

    if (!searchLocation.trim()) {
      return;
    }

    try {
      setSearchingLocation(true);

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchLocation
        )}&limit=1`
      );

      const data = await response.json();

      if (data.length === 0) {
        alert("Location not found.");
        return;
      }

      const result = data[0];

      const latitude = parseFloat(result.lat);
      const longitude = parseFloat(result.lon);

      setLocation({
        latitude,
        longitude,
      });

      setLocationName(result.display_name);

      await loadStations(latitude, longitude);
    } catch (error) {
      console.error(
        "Location search failed:",
        error
      );

      alert("Unable to find that location.");
    } finally {
      setSearchingLocation(false);
    }
  }

  function getStationType(station) {
  if (!station) {
    return "RADIO";
  }

  const frequency =
    getStationFrequency(station);

  if (frequency !== null) {
    return `${frequency.toFixed(1)} FM`;
  }

  return "DIGITAL";
}

function getStationDistance(station) {
  if (!station || station.distance === null) {
    return "DISTANCE N/A";
  }

  return `${station.distance.toFixed(1)} KM`;
}

function calculateDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const earthRadius = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

async function skipFailedStation(station) {
  if (
    !station ||
    stations.length === 0
  ) {
    return;
  }

  console.log(
    "SKIPPING UNPLAYABLE STATION:",
    station.name
  );

  const currentIndex =
    stations.findIndex(
      (availableStation) =>
        availableStation.id === station.id
    );

  if (currentIndex === -1) {
    setPlaying(false);
    setScanMessage("NO PLAYABLE STATION");
    return;
  }

  let index = currentIndex + 1;

  while (index < stations.length) {

    const nextStation =
      stations[index];

    console.log(
      "TESTING NEXT STATION:",
      nextStation.name
    );

    setScanMessage(
      `TESTING ${nextStation.name}`
    );

    const playable =
      await testStation(nextStation);

    if (playable) {

      console.log(
        "NEXT STATION LOCKED:",
        nextStation.name
      );

      setScanMessage("LOCKED");

      await playStation(nextStation);

      return;
    }

    console.log(
      "NEXT STATION FAILED:",
      nextStation.name
    );

    index++;
  }

  console.log(
    "NO PLAYABLE STATION AFTER FAILED STATION"
  );

  setPlaying(false);

  setScanMessage(
    "NO PLAYABLE STATION"
  );
}

async function playStation(station) {
  console.count("playStation CALLED");

  manuallyPausedRef.current = false;
  recoveryStationIdRef.current = null;

    if (recoveryTimerRef.current) {
    clearTimeout(
      recoveryTimerRef.current
    );

    recoveryTimerRef.current = null;
  }

  recoveryAttemptRef.current = 0;
  failoverRef.current = false;
  setRecovering(false);
  setAutoFailover(false);

  const freshStation =
  stations.find(
    (availableStation) =>
      availableStation.id === station.id
  );

  if (freshStation) {
    station = {
      ...station,
      ...freshStation,
    };
  }

  if (!station?.streamUrl) {
    console.error(
      "Station has no stream URL:",
      station
    );

    return;
  }

  const audio =
    audioRef.current;

  if (!audio) {
    return;
  }

  console.log(
    "================================"
  );

  console.log(
    "PLAY STATION"
  );

  console.log(
    "Name:",
    station.name
  );

  console.log(
    "URL:",
    station.streamUrl
  );

  console.log(
    "Codec:",
    station.codec
  );

  console.log(
    "Bitrate:",
    station.bitrate
  );

  console.log(
    "================================"
  );

  setCurrentStation(station);

  localStorage.setItem(
  "retroRadioLastStationId",
  station.id
  );

  setLastStationId(station.id);

  const frequency =
  getStationFrequency(station);

  if (frequency !== null) {
  animateTunerTo(frequency);
  }

  try {

  audio.pause();

  audio.src =
    station.streamUrl;

  audio.load();

  await audio.play();

  setPlaying(true);

  console.log(
    "PLAYING:",
    station.name
  );

} catch (error) {

  setPlaying(false);

  console.error(
    "PLAY FAILED:",
    error
  );

  console.error(
    "Stream URL:",
    station.streamUrl
  );

  // --------------------------------
  // PERMANENTLY UNPLAYABLE STREAM
  // --------------------------------

  if (
    isUnplayableStream(
      audio,
      error
    )
  ) {

    console.warn(
      "UNPLAYABLE STREAM — SKIPPING:",
      station.name
    );

    // Give the audio element a
    // clean state before testing
    // another station.
    audio.pause();

    audio.removeAttribute("src");

    audio.load();

    await skipFailedStation(
      station
    );

    return;
  }

  // --------------------------------
  // TEMPORARY FAILURE
  // --------------------------------

  console.log(
    "TEMPORARY PLAYBACK FAILURE — RECOVERY"
  );

  if (!scanning) {
    recoverCurrentStation();
  }
}
}

  async function togglePlay() {

  // SEEK is running → PLAY button becomes CANCEL
  if (scanning) {
    stopScanning();
    return;
  }

  const audio = audioRef.current;

  if (!audio) {
    return;
  }

  // No current station → play first station
  if (!currentStation) {

    if (stations.length === 0) {
      return;
    }

    await playStation(stations[0]);
    return;
  }

  // ==============================
  // PAUSE
  // ==============================

  if (!audio.paused) {

  audio.pause();

  manuallyPausedRef.current = true;
  wasPlayingBeforeOfflineRef.current = false;

  // Cancel any pending recovery.
  if (recoveryTimerRef.current) {
    clearTimeout(
      recoveryTimerRef.current
    );

    recoveryTimerRef.current = null;
  }

  recoveryAttemptRef.current = 0;
  recoveryStationIdRef.current = null;

  setRecovering(false);
  setPlaying(false);
  setSignalLevel(0);
  setStreamHealth("PAUSED");
  setScanMessage("");

  return;
  }

  // ==============================
  // PLAY
  // ==============================

  manuallyPausedRef.current = false;

  // Always make sure the audio element
  // points to the currently selected station.
  if (
    !audio.src ||
    audio.src !== currentStation.streamUrl
  ) {

    console.log(
      "SETTING CURRENT STATION SOURCE:",
      currentStation.name
    );

    audio.pause();

    audio.src = currentStation.streamUrl;

    audio.load();
  }

  try {

    await audio.play();

    setPlaying(true);

    console.log(
      "PLAYING:",
      currentStation.name
    );

  } catch (error) {

    console.error(
      "PLAY BUTTON FAILED:",
      error
    );

    setPlaying(false);

    // Let the existing recovery system
    // handle temporary stream failures.
    if (!isUnplayableStream(audio, error)) {
      recoverCurrentStation();
    }
  }
}
  function nextStation() {
  if (scanning || stations.length === 0) {
    return;
  }

  if (!currentStation) {
    playStation(stations[0]);
    return;
  }

  const currentIndex = stations.findIndex(
    (station) =>
      station.id === currentStation.id
  );

  if (currentIndex === -1) {
    playStation(stations[0]);
    return;
  }

  const nextIndex =
    (currentIndex + 1) % stations.length;

  playStation(stations[nextIndex]);
}

  function previousStation() {
  if (scanning || stations.length === 0) {
    return;
  }

  if (!currentStation) {
    playStation(stations[stations.length - 1]);
    return;
  }

  const currentIndex = stations.findIndex(
    (station) =>
      station.id === currentStation.id
  );

  if (currentIndex === -1) {
    playStation(stations[stations.length - 1]);
    return;
  }

  const previousIndex =
    (currentIndex - 1 + stations.length) %
    stations.length;

  playStation(stations[previousIndex]);
}

  return (
    <div className={`car-stereo theme-${theme}`}>

      {/* HEADER */}

      <header className="stereo-header">

        <div className="brand">
          RETRO RADIO
        </div>

        <div className="mode">
          FM
        </div>

        <div className="theme-selector">
        <span>THEME</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="classic">📻 Classic FM</option>
          <option value="retro">🟢 Retro Radio</option>
          <option value="amber">🟠 Amber Classic</option>
          <option value="ocean">🔵 Ocean FM</option>
          <option value="neon">🟣 Neon FM</option>
          <option value="cyber">💚 Cyber FM</option>
          <option value="studio">🔷 Studio</option>
          <option value="minimal">⚪ Minimal</option>
          <option value="light">☀️ Light</option>
        </select>

        </div>

      </header>


      {/* LCD DISPLAY */}

      <section className="lcd">

        <div className="lcd-top">

          <span>
            {!online
            ? "OFFLINE"
            : scanning
            ? "SCANNING"
            : recovering
            ? "RECOVERING"
            : autoFailover
            ? "AUTO SEEK"
            : playing
            ? "STEREO"
            : "READY"}
          </span>

          <span>
            {!online
    ? "◉ NO INTERNET"
    : scanning
    ? "◉ SEARCHING"
    : recovering
    ? "◉ RECONNECTING"
    : autoFailover
    ? "◉ FINDING STATION"
    : playing
    ? "● ON AIR"
    : "○ OFF"}
</span>

        </div>

        <div className={`scan-message ${scanning ? "visible" : ""}`}>
          {scanMessage}
        </div>


        <div className="frequency">
          {getFrequencyDisplay(currentStation)}
        </div>


        <div className="station-title">

          {currentStation?.name ||
            "SEARCHING STATION..."}

        </div>

        <div className="station-meta">

          {currentStation?.codec || "STREAM"}
          {currentStation?.bitrate > 0 && ` • ${currentStation.bitrate} KBPS `}

          {/* {currentStation?.language && currentStation.language.toUpperCase()} */}
          {/* {" • " && currentStation?.language && currentStation?.country && " • "} */}
          {currentStation?.country && " • " + currentStation.country.toUpperCase()}

        </div>

        <div className="station-type">
          {getStationType(currentStation)}
        </div>

        <div className="station-tags">
          {getStationTags(currentStation)}
        </div>

        <div className="signal-section">
          <div className="signal-header">
            <span>STREAM HEALTH</span>
            <span>{streamHealth}</span>
          </div>

          <div className="signal-bars">
            {[1, 2, 3, 4, 5].map((level) => (
              <span key={level} 
              className={ level <= signalLevel ? "active" : "" }
              style={{height: `${level * 4 + 4}px`,}}/>
            )
            )}
          </div>
        </div>


        <div className="station-location">

          📍 {locationName}

        </div>

        <div className="station-distance">

          📡 {getStationDistance(currentStation)}
        </div>


        <div className="lcd-bars">

          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />

        </div>

      </section>


      {/* FREQUENCY SCALE */}

      <section className="frequency-scale">
  <div className="frequency-window">

    <div
      className="frequency-track"
      style={{
        transform:
          displayFrequency !== null
            ? `translateX(calc(50% - ${(displayFrequency - 88) * 40}px))`
            : "translateX(50%)",
      }}
    >

      {Array.from(
        { length: 201 },
        (_, index) => {
          const frequency = 88 + index * 0.1;

          const isMajor = index % 10 === 0;
          const isHalf = index % 5 === 0;

          return (
            <div
              key={frequency.toFixed(1)}
              className={`frequency-mark ${
                isMajor
                  ? "major"
                  : isHalf
                  ? "half"
                  : "minor"
              }`}
            >

              {isMajor && (
                <span className="frequency-number">
                  {frequency.toFixed(0)}
                </span>
              )}

              <div className="frequency-tick">
                <span />
              </div>

            </div>
          );
        }
      )}

    </div>

    <div className="frequency-pointer" />

  </div>
</section>



      {/* Present Panel */}
      <section className="preset-panel">

  <div
  className="preset-heading"
  onClick={() => setShowPresets((previous) => !previous)}
>
  <span className="preset-title">
    RADIO PRESETS
  </span>

  <div className="preset-heading-right">
    <span className="preset-count">
      {presets.filter(Boolean).length}/6
    </span>

    <span className="preset-arrow">
      {showPresets ? "▲" : "▼"}
    </span>
  </div>
</div>

{showPresets && (
  <div className="preset-grid">

    {presets.map((station, index) => {

      const isCurrent =
        station &&
        currentStation?.id === station.id;

      return (
        <div
          key={index}
          className={`preset-card ${
            station ? "stored" : "empty"
          } ${
            isCurrent ? "active" : ""
          }`}
        >

          <button
            className="preset-tune"
            onClick={() =>
              tunePreset(index)
            }
            disabled={!station}
          >

            <span className="preset-number">
              P{index + 1}
            </span>

            <span className="preset-frequency">
              {station ? getFrequencyDisplay(station) : "---"}
            </span>

            <span className="preset-name">
              {station
                ? station.name
                : "EMPTY"}
            </span>

          </button>

          <div className="preset-actions">

  <button
    className="preset-save"
    onClick={() =>
      savePreset(index)
    }
    disabled={!currentStation}
  >
    {station ? "SAVE" : "STORE"}
  </button>

  {station && (
    <button
      className="preset-clear"
      onClick={() => {
        setPresets((previousPresets) => {
          const updated = [...previousPresets];
          updated[index] = null;
          return updated;
        });
      }}
    >
      CLEAR
    </button>
  )}

</div>

        </div>
      );
    })}

  </div>
)}

</section>


      {/* CONTROLS */}

      <section className="controls">

        <button onClick={() => scanToStation("previous")}
        disabled={
          scanning ||
          stations.length === 0 ||
          !navigator.onLine
        }>
          SEEK −
        </button>

        <button className="play" onClick={togglePlay}>
          {scanning ? "■" : playing ? "❚❚" : "▶"}
        </button>

        <button onClick={() => scanToStation("next")}
        disabled={
          scanning ||
          stations.length === 0 ||
          !navigator.onLine
        }>
          SEEK +
        </button>

      </section>

      <section className="volume-panel">

        <button className="mute-button" onClick={() => setMuted((previous) => !previous)}>
          {muted || volume === 0
          ? "🔇"
          : "🔊"}
        </button>

        <input 
        className="volume-slider"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={muted ? 0 : volume} onChange={(event) => {
          const newVolume = parseFloat(event.target.value);
          setVolume(newVolume);

          if (newVolume > 0 && muted) {
            setMuted(false);
          }
        }}/>

        <span className="volume-value">
          {Math.round(
            (muted ? 0 : volume) * 100)}%
        </span>

      </section>


      {/* LOCATION */}

      <section className="location-panel">

        <button onClick={getMyLocation}>

          📍

          {locationLoading
            ? " FINDING..."
            : " MY LOCATION"}

        </button>


        <div className="custom-search">

          <input
            type="text"
            placeholder="SEARCH CITY..."
            value={searchLocation}
            onChange={(e) =>
              setSearchLocation(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchCustomLocation();
              }
            }}
          />

          <button
            onClick={
              searchCustomLocation
            }
            disabled={searchingLocation}
          >
            {searchingLocation
              ? "..."
              : "TUNE"}
          </button>

        </div>

      </section>




      {/* STATIONS */}

      <section className="station-list">

        <div className="list-header">

          <div className="station-filter">
            
            <button 
            className={stationFilter === "all" ? "active" : ""}
            onClick={() => setStationFilter("all")}>
              ALL
            </button>

            <button
            className={stationFilter === "favorites" ? "active" : ""}
            onClick={() => setStationFilter("favorites")}>
               ♥ FAVORITES
            </button>
          </div>

          <span>
            {stationFilter === "favorites" ? favorites.length : stations.length}
          </span>

        </div>


        {loading && (
          <div className="loading">
            SCANNING FREQUENCIES...
          </div>
        )}

        {!loading &&
        displayedStations.length === 0 && (
          <div className="loading">
            NO FAVORITE STATIONS
          </div>
        )}


        {!loading &&
          displayedStations.map((station) => (

            <div
              key={station.id}
              className={`station-row ${currentStation?.id === station.id ? "selected" : ""}`}
              onClick={() => playStation(station)}
            >

              <div className="station-info">

  <strong>
    {station.name}

    {currentStation?.id === station.id && playing && (
      <span className="on-air-indicator">
        ● ON AIR
      </span>
    )}
  </strong>

  <small>
    {station.state || station.country || "UNKNOWN"}

    {station.distance !== null && (
      <>
        {" • "}
        {station.distance.toFixed(1)} km
      </>
    )}
  </small>

</div>


              <div className="codec">

                {station.distance !== null? `${station.distance.toFixed(1)} KM` : "DIGITAL"}
                <br />
                {station.codec || "STREAM"}
              </div>

              <button className={`favorite-button ${isFavorite(station) ? "favorite" : "" }`} onClick={(event) => {
                event.stopPropagation();
                toggleFavorite(station);
              }}>
                {isFavorite(station) ? "♥" : "♡"}
              </button>

            </div>

          ))}

      </section>


      <audio
         ref={audioRef}
         volume={volume}
         muted={muted}
         controls={false}
  onLoadStart={() =>
    console.log("AUDIO: loadstart")
  }
  onLoadedMetadata={() =>
    console.log("AUDIO: metadata loaded")
  }
  onCanPlay={() =>
    console.log("AUDIO: can play")
  }
  onPlay={() => {
  console.log("AUDIO: PLAY");

  setPlaying(true);
  setRecovering(false);

  recoveryAttemptRef.current = 0;

  if (recoveryTimerRef.current) {
    clearTimeout(
      recoveryTimerRef.current
    );

    recoveryTimerRef.current = null;
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "playing";
  }

  updateSignalLevel();
}}

  onPlaying={() =>{
    console.log("AUDIO: PLAYING")
    updateSignalLevel();
  }  }

  onPause={() => {
  console.log("AUDIO: PAUSE");

  setPlaying(false);

  setSignalLevel(0);
  setStreamHealth("PAUSED");

  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "paused";
  }
}}

  onWaiting={() => {
    console.log("AUDIO: WAITING")
    setSignalLevel(2);
  setStreamHealth("BUFFERING");
  }  }


  onStalled={() => {
  console.log("AUDIO: STALLED");

  // if (!scanning && currentStation) {
  //   recoverCurrentStation();
  // }
  setSignalLevel(1);
  setStreamHealth("WEAK");
  }}
  onError={(event) => {

  const audio =
    event.currentTarget;

  const mediaError =
    audio.error;

  console.error(
    "AUDIO ERROR:",
    mediaError
  );

  setSignalLevel(0);
  setStreamHealth("LOST");

  // --------------------------------
  // PERMANENT STREAM FAILURE
  // --------------------------------

  if (
    mediaError?.code === 4
  ) {

    console.warn(
      "FORMAT ERROR — STREAM UNPLAYABLE"
    );

    return;
  }

  // --------------------------------
  // TEMPORARY STREAM FAILURE
  // --------------------------------

  if (
    !scanning &&
    currentStation
  ) {

    recoverCurrentStation();
  }
}}
      />

      {presetToReplace !== null && currentStation && (
  <div className="preset-confirm-overlay">

    <div className="preset-confirm">

      <div className="preset-confirm-title">
        REPLACE PRESET?
      </div>

      <div className="preset-confirm-text">
        P{presetToReplace + 1} already contains:
      </div>

      <div className="preset-confirm-station">
        {presets[presetToReplace]?.name}
      </div>

      <div className="preset-confirm-text">
        Replace it with:
      </div>

      <div className="preset-confirm-station">
        {currentStation.name}
      </div>

      <div className="preset-confirm-actions">

        <button
          onClick={() => {
            setPresetToReplace(null);
          }}
        >
          CANCEL
        </button>

        <button
          className="confirm-replace"
          onClick={() => {

            setPresets((previousPresets) => {
              const updated = [
                ...previousPresets
              ];

              updated[presetToReplace] =
                currentStation;

              return updated;
            });

            console.log(
              `Replaced P${presetToReplace + 1} with ${currentStation.name}`
            );

            setPresetToReplace(null);
          }}
        >
          REPLACE
        </button>

      </div>

    </div>

  </div>
)}

    </div>
  );
}

export default App;