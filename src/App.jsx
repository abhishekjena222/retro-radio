import { useEffect, useMemo, useRef, useState } from "react";
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

  const lastPlaybackTimeRef = useRef(0);
  const playbackStallTimerRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const recoveryAttemptRef = useRef(0);

  const failoverRef = useRef(false);

  const wasOfflineRef = useRef(false);
  const wasPlayingBeforeOfflineRef = useRef(false);

  const manuallyPausedRef = useRef(false);

  const tunerAnimationRef = useRef(null);

  const stationLoadRequestRef = useRef(0);

  const recoveryStationIdRef = useRef(null);

  const activeStationListRef = useRef([]);

  const lcdRef = useRef(null);

  /*
   * ---------------------------------------------------------
   * PLAYBACK RACE PROTECTION
   * ---------------------------------------------------------
   *
   * Every time we intentionally change the audio source,
   * this number increases.
   *
   * If an old play() promise finishes later, we know it is
   * obsolete and we simply ignore it.
   */
  const playbackRequestRef = useRef(0);

  /*
   * Station currently owned by the audio element.
   */
  const audioStationIdRef = useRef(null);

  /*
   * True while WE are intentionally changing/pauseing
   * the audio element.
   *
   * This prevents onPause from being interpreted as a
   * user pause during station switching/recovery.
   */
  const internalAudioChangeRef = useRef(false);

  /*
   * Prevent multiple recovery operations from running
   * simultaneously.
   */
  const recoveryRunningRef = useRef(false);

  /*
   * Prevent duplicate error recovery calls.
   */
  const errorRecoveryPendingRef = useRef(false);

  /*
   * Stations already tested during the current
   * skip/recovery cycle.
   */
  const failedStationsRef = useRef(new Set());

  const STATION_HEALTH_CONFIG = {
    enabled: true,
    showUnknown: true,
    testTimeout: 8000,
  };

  const [stationHealth, setStationHealth] = useState({});

  const [displayFrequency, setDisplayFrequency] = useState(98.0);
  const [stations, setStations] = useState([]);
  const [regionStations, setRegionStations] = useState([]);

  const [currentStation, setCurrentStation] = useState(null);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] =
    useState("Unknown Location");

  const [locationLoading, setLocationLoading] =
    useState(false);

  const [searchLocation, setSearchLocation] =
    useState("");

  const [stationSearch, setStationSearch] =
    useState("");

  const [searchingStations, setSearchingStations] =
    useState(false);

  const [searchResults, setSearchResults] =
    useState([]);

  const [searchingLocation, setSearchingLocation] =
    useState(false);

  const [scanning, setScanning] =
    useState(false);

  const [tunerFrequency, setTunerFrequency] =
    useState(98.0);

  const [scanMessage, setScanMessage] =
    useState("");

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(
        "retroRadioFavorites"
      );

      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error(
        "Failed to load favorites:",
        error
      );

      return [];
    }
  });

  const [stationFilter, setStationFilter] =
    useState("all");

  const [selectedRegion, setSelectedRegion] =
    useState("");

  const [volume, setVolume] = useState(() => {
    const savedVolume =
      localStorage.getItem("retroRadioVolume");

    if (savedVolume !== null) {
      const parsed = parseFloat(savedVolume);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 0.8;
  });

  const [muted, setMuted] =
    useState(false);

  const [recovering, setRecovering] =
    useState(false);

  const [autoFailover, setAutoFailover] =
    useState(false);

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

  const [signalLevel, setSignalLevel] =
    useState(0);

  const [streamHealth, setStreamHealth] =
    useState("READY");

  const [showPresets, setShowPresets] =
    useState(false);

  const [presetToReplace, setPresetToReplace] =
    useState(null);

  const [theme, setTheme] = useState(() => {
    return (
      localStorage.getItem(
        "retroRadioTheme"
      ) || "car"
    );
  });

  const [online, setOnline] =
    useState(navigator.onLine);

  const onlineRef = useRef(navigator.onLine);

  const [lastStationId, setLastStationId] =
    useState(() => {
      return (
        localStorage.getItem(
          "retroRadioLastStationId"
        ) || null
      );
    });

  const [isTuning, setIsTuning] =
    useState(false);

  const [showMiniPlayer, setShowMiniPlayer] =
    useState(false);

  /*
   * ---------------------------------------------------------
   * DERIVED LISTS
   * ---------------------------------------------------------
   */

  // const displayedRegionStations =
  //   selectedRegion === "ALL"
  //     ? regionStations
  //     : regionStations.filter(
  //         (station) =>
  //           getStationRegion(station) ===
  //           selectedRegion
  //       );

  const displayedRegionStations =
  useMemo(() => {
    if (selectedRegion === "ALL" || !selectedRegion) {
      return regionStations;
    }

    return regionStations.filter(
      (station) =>
        getStationRegion(station) ===
        selectedRegion
    );
  }, [
    regionStations,
    selectedRegion,
  ]);

  // const displayedStations =
  //   stationFilter === "favorites"
  //     ? favorites
  //     : stationFilter === "regions"
  //     ? displayedRegionStations
  //     : stations;

  // const displayedStations =
  // useMemo(() => {
  //   if (stationFilter === "favorites") {
  //     return favorites;
  //   }

  //   if (stationFilter === "regions") {
  //     return displayedRegionStations;
  //   }

  //   return stations;
  // }, [
  //   stationFilter,
  //   favorites,
  //   displayedRegionStations,
  //   stations,
  // ]);

  const displayedStations =
  useMemo(() => {
    if (stationSearch.trim()) {
      return searchResults;
    }

    if (stationFilter === "favorites") {
      return favorites;
    }

    if (stationFilter === "regions") {
      return displayedRegionStations;
    }

    return stations;
  }, [
    stationSearch,
    searchResults,
    stationFilter,
    favorites,
    displayedRegionStations,
    stations,
  ]);


  // const activeStationList =
  //   stationFilter === "regions"
  //     ? displayedRegionStations
  //     : stationFilter === "favorites"
  //     ? favorites
  //     : stations;

  // const activeStationList =
  // useMemo(() => {
  //   if (stationFilter === "regions") {
  //     return displayedRegionStations;
  //   }

  //   if (stationFilter === "favorites") {
  //     return favorites;
  //   }

  //   return stations;
  // }, [
  //   stationFilter,
  //   favorites,
  //   displayedRegionStations,
  //   stations,
  // ]);

  const activeStationList =
  useMemo(() => {
    if (stationSearch.trim()) {
      return searchResults;
    }

    if (stationFilter === "regions") {
      return displayedRegionStations;
    }

    if (stationFilter === "favorites") {
      return favorites;
    }

    return stations;
  }, [
    stationSearch,
    searchResults,
    stationFilter,
    favorites,
    displayedRegionStations,
    stations,
  ]);

  const availableRegions = [
    ...new Set(
      regionStations
        .map((station) => station.state)
        .filter(Boolean)
    ),
  ].sort();



  /*
   * ---------------------------------------------------------
   * EFFECTS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    localStorage.setItem(
      "retroRadioPresets",
      JSON.stringify(presets)
    );
  }, [presets]);

  useEffect(() => {
    loadStations();
    loadRegionStations();
  }, []);

  useEffect(() => {
    return () => {
      playbackRequestRef.current += 1;

      if (scanIntervalRef.current) {
        clearInterval(
          scanIntervalRef.current
        );
      }

      if (recoveryTimerRef.current) {
        clearTimeout(
          recoveryTimerRef.current
        );
      }

      if (tunerAnimationRef.current) {
        cancelAnimationFrame(
          tunerAnimationRef.current
        );
      }

      if (scanAudioRef.current) {
        scanAudioRef.current.pause();
        scanAudioRef.current.src = "";
        scanAudioRef.current = null;
      }

      if (audioRef.current) {
        internalAudioChangeRef.current = true;
        audioRef.current.pause();
        audioRef.current.src = "";
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
    onlineRef.current = online;
  }, [online]);

  /*
   * Network listeners.
   */
  useEffect(() => {
    const offlineHandler = () => {
      handleOffline();
    };

    const onlineHandler = () => {
      handleOnline();
    };

    window.addEventListener(
      "offline",
      offlineHandler
    );

    window.addEventListener(
      "online",
      onlineHandler
    );

    return () => {
      window.removeEventListener(
        "offline",
        offlineHandler
      );

      window.removeEventListener(
        "online",
        onlineHandler
      );
    };
  }, []);

  /*
   * Media Session.
   *
   * ONLY ONE EFFECT.
   */
  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata =
      new MediaMetadata({
        title:
          currentStation?.name ||
          "Retro Radio",
        artist: "RETRO RADIO",
        album: "FM Radio",
        artwork:
          currentStation?.favicon
            ? [
                {
                  src: currentStation.favicon,
                  sizes: "512x512",
                  type: "image/png",
                },
              ]
            : [],
      });

    try {
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
    } catch (error) {
      console.error(
        "Media Session setup failed:",
        error
      );
    }

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
  }, [currentStation]);

  useEffect(() => {
    activeStationListRef.current =
      activeStationList;

    console.log(
      "ACTIVE STATION LIST UPDATED:",
      activeStationList.map(
        (station) => station.name
      )
    );
  }, [
    activeStationList,
  ]);

  useEffect(() => {
  const interval =
    setInterval(() => {
      const audio =
        audioRef.current;

      if (
        !audio ||
        audio.paused ||
        manuallyPausedRef.current ||
        scanning
      ) {
        return;
      }

      const currentTime =
        audio.currentTime;

      /*
       * If playback has moved,
       * stream is alive.
       */
      if (
        currentTime !==
        lastPlaybackTimeRef.current
      ) {
        lastPlaybackTimeRef.current =
          currentTime;

        return;
      }

      /*
       * No movement.
       *
       * Don't recover immediately.
       */
      console.log(
        "PLAYBACK NOT ADVANCING:",
        currentStation?.name,
        "readyState:",
        audio.readyState
      );
    }, 3000);

  return () => {
    clearInterval(interval);
  };
}, []);

useEffect(() => {
  const lcdElement = lcdRef.current;

  if (!lcdElement) {
    return;
  }

  const observer =
    new IntersectionObserver(
      ([entry]) => {
        /*
         * Main LCD visible:
         * hide mini-player.
         *
         * Main LCD out of view:
         * show mini-player.
         */
        setShowMiniPlayer(
          !entry.isIntersecting
        );
      },
      {
        threshold: 0.1,
      }
    );

  observer.observe(lcdElement);

  return () => {
    observer.disconnect();
  };
}, []);

  /*
   * ---------------------------------------------------------
   * HELPERS
   * ---------------------------------------------------------
   */

  function getActiveStationList() {
    if (stationFilter === "favorites") {
      return favorites;
    }

    if (stationFilter === "regions") {
      return displayedRegionStations;
    }

    return stations;
  }

  function getStationRegion(station) {
    if (!station) {
      return "UNKNOWN";
    }

    return (
      station.state ||
      station.country ||
      "UNKNOWN"
    ).trim();
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

  function getFrequencyDisplay(station) {
    const frequency =
      getStationFrequency(station);

    if (frequency === null) {
      return "STREAM";
    }

    return `${frequency.toFixed(1)} FM`;
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
    if (
      !station ||
      station.distance === null
    ) {
      return "DISTANCE N/A";
    }

    return `${station.distance.toFixed(
      1
    )} KM`;
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

  /*
   * ---------------------------------------------------------
   * TUNER
   * ---------------------------------------------------------
   */

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

    const start = tunerFrequency;
    const end = frequency;

    const duration = 350;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed =
        currentTime - startTime;

      const progress =
        Math.min(
          elapsed / duration,
          1
        );

      const eased =
        1 -
        Math.pow(
          1 - progress,
          3
        );

      const value =
        start +
        (end - start) * eased;

      setDisplayFrequency(value);

      if (progress < 1) {
        tunerAnimationRef.current =
          requestAnimationFrame(
            animate
          );
      } else {
        setTunerFrequency(end);
        setDisplayFrequency(end);
        setIsTuning(false);
        tunerAnimationRef.current =
          null;
      }
    };

    tunerAnimationRef.current =
      requestAnimationFrame(
        animate
      );
  }

  function getFrequencyScale() {
    const frequencies = [];

    for (let i = 880; i <= 1080; i++) {
      frequencies.push(i / 10);
    }

    return frequencies;
  }

  /*
   * ---------------------------------------------------------
   * NETWORK
   * ---------------------------------------------------------
   */

  function handleOffline() {
    console.log(
      "INTERNET OFFLINE"
    );

    setOnline(false);
    onlineRef.current = false;

    wasOfflineRef.current = true;

    if (
      !manuallyPausedRef.current
    ) {
      wasPlayingBeforeOfflineRef.current =
        true;
    } else {
      wasPlayingBeforeOfflineRef.current =
        false;
    }

    /*
     * Invalidate every pending play/recovery.
     */
    playbackRequestRef.current += 1;

    if (recoveryTimerRef.current) {
      clearTimeout(
        recoveryTimerRef.current
      );

      recoveryTimerRef.current = null;
    }

    recoveryRunningRef.current = false;
    errorRecoveryPendingRef.current =
      false;

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
    console.log(
      "INTERNET ONLINE"
    );

    setOnline(true);
    onlineRef.current = true;

    if (!wasOfflineRef.current) {
      return;
    }

    wasOfflineRef.current = false;

    if (
      manuallyPausedRef.current
    ) {
      console.log(
        "ONLINE: USER HAD PAUSED RADIO — STAY PAUSED"
      );

      wasPlayingBeforeOfflineRef.current =
        false;

      setRecovering(false);
      setPlaying(false);
      setScanMessage("");
      setStreamHealth("READY");
      setSignalLevel(0);

      return;
    }

    const station =
      currentStation;

    if (
      !station ||
      !wasPlayingBeforeOfflineRef.current
    ) {
      wasPlayingBeforeOfflineRef.current =
        false;

      setRecovering(false);
      setPlaying(false);
      setScanMessage("");
      setStreamHealth("READY");

      return;
    }

    wasPlayingBeforeOfflineRef.current =
      false;

    recoveryAttemptRef.current = 0;

    if (recoveryTimerRef.current) {
      clearTimeout(
        recoveryTimerRef.current
      );

      recoveryTimerRef.current = null;
    }

    setScanMessage(
      "RECONNECTING..."
    );

    setRecovering(true);
    setStreamHealth("RECOVERING");

    console.log(
      "RECONNECTING:",
      station.name
    );

    await new Promise(
      (resolve) =>
        setTimeout(resolve, 1000)
    );

    if (
      manuallyPausedRef.current
    ) {
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

  /*
   * ---------------------------------------------------------
   * SIGNAL
   * ---------------------------------------------------------
   */

  function updateSignalLevel() {
    const audio =
      audioRef.current;

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

      /*
       * Do not overwrite OFFLINE.
       */
      if (navigator.onLine) {
        setStreamHealth("PAUSED");
      }

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

  /*
   * ---------------------------------------------------------
   * PRESETS
   * ---------------------------------------------------------
   */

  function savePreset(index) {
    if (!currentStation) {
      return;
    }

    if (presets[index]) {
      setPresetToReplace(index);
      return;
    }

    setPresets(
      (previousPresets) => {
        const updated = [
          ...previousPresets,
        ];

        updated[index] =
          currentStation;

        return updated;
      }
    );

    console.log(
      `Saved ${currentStation.name} to P${
        index + 1
      }`
    );
  }

  async function tunePreset(index) {
    const station =
      presets[index];

    if (!station) {
      return;
    }

    console.log(
      `Tuning to P${index + 1}:`,
      station.name
    );

    await playStation(station);
  }

  /*
   * ---------------------------------------------------------
   * STATION HEALTH
   * ---------------------------------------------------------
   */

  function isUnplayableStream(
    audio,
    error = null
  ) {
    if (
      error?.name ===
      "NotSupportedError"
    ) {
      return true;
    }

    if (
      audio?.error?.code === 4
    ) {
      return true;
    }

    return false;
  }

  /*
   * ---------------------------------------------------------
   * AUTO FAILOVER
   * ---------------------------------------------------------
   */

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
          station.id ===
          currentStation.id
      );

    if (currentIndex === -1) {
      failoverRef.current = false;
      setAutoFailover(false);
      return;
    }

    let index =
      currentIndex + 1;

    while (
      index < stations.length
    ) {
      if (
        !failoverRef.current ||
        scanning
      ) {
        break;
      }

      if (!navigator.onLine) {
        break;
      }

      const station =
        stations[index];

      const frequency =
        getStationFrequency(
          station
        );

      setScanMessage(
        frequency !== null
          ? `AUTO SEEK: ${frequency.toFixed(
              1
            )} FM`
          : `AUTO SEEK: ${station.name}`
      );

      console.log(
        "AUTO TEST:",
        station.name
      );

      const playable =
        await testStation(
          station
        );

      if (
        playable &&
        failoverRef.current
      ) {
        console.log(
          "AUTO LOCK:",
          station.name
        );

        failoverRef.current =
          false;

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

  /*
   * ---------------------------------------------------------
   * RECOVERY
   * ---------------------------------------------------------
   */

  async function recoverCurrentStation() {
    if (!navigator.onLine) {
      console.log(
        "RECOVERY BLOCKED: INTERNET OFFLINE"
      );

      if (
        recoveryTimerRef.current
      ) {
        clearTimeout(
          recoveryTimerRef.current
        );

        recoveryTimerRef.current =
          null;
      }

      recoveryRunningRef.current =
        false;

      setRecovering(false);
      setPlaying(false);
      setSignalLevel(0);
      setStreamHealth("OFFLINE");
      setScanMessage(
        "INTERNET OFFLINE"
      );

      return;
    }

    if (scanning) {
      return;
    }

    if (
      manuallyPausedRef.current
    ) {
      console.log(
        "RECOVERY BLOCKED: USER PAUSED"
      );

      return;
    }

    if (
      recoveryRunningRef.current
    ) {
      console.log(
        "RECOVERY ALREADY RUNNING"
      );

      return;
    }

    const station =
      currentStation;

    const audio =
      audioRef.current;

    if (
      !audio ||
      !station?.streamUrl
    ) {
      return;
    }

    recoveryStationIdRef.current =
      station.id;

    if (
      recoveryAttemptRef.current >= 3
    ) {
      console.log(
        "RECOVERY FAILED: Starting auto failover"
      );

      recoveryAttemptRef.current =
        0;

      setRecovering(false);

      await autoFailoverToNextStation();

      return;
    }

    recoveryRunningRef.current =
      true;

    recoveryAttemptRef.current +=
      1;

    const attempt =
      recoveryAttemptRef.current;

    const recoveryStationId =
      station.id;

    console.log(
      `RECOVERY ATTEMPT ${attempt}:`,
      station.name
    );

    setRecovering(true);
    setPlaying(false);
    setStreamHealth("RECOVERING");

    try {
      if (
        !currentStation ||
        currentStation.id !==
          recoveryStationId
      ) {
        console.log(
          "RECOVERY CANCELLED: STATION CHANGED"
        );

        recoveryRunningRef.current =
          false;

        setRecovering(false);

        return;
      }

      if (!navigator.onLine) {
        throw new Error(
          "Internet offline"
        );
      }

      /*
       * Invalidate the previous play() promise.
       */
      const requestId =
        ++playbackRequestRef.current;

      internalAudioChangeRef.current =
        true;

      audio.pause();

      /*
       * Only reset the source if necessary.
       */
      const currentSrc =
        audio.currentSrc ||
        audio.src;

      if (
        currentSrc !==
        station.streamUrl
      ) {
        audio.src =
          station.streamUrl;
        audio.load();
      } else {
        /*
         * Re-load the same stream to recover
         * from a stalled stream.
         */
        audio.load();
      }

      audioStationIdRef.current =
        station.id;

      internalAudioChangeRef.current =
        false;

      /*
       * Make sure another station hasn't
       * been selected while load() happened.
       */
      if (
        requestId !==
          playbackRequestRef.current ||
        currentStation?.id !==
          recoveryStationId
      ) {
        console.log(
          "RECOVERY ABORTED: REQUEST OBSOLETE"
        );

        recoveryRunningRef.current =
          false;

        return;
      }

      await audio.play();

      /*
       * The play promise may have completed
       * after another station was selected.
       */
      if (
        requestId !==
          playbackRequestRef.current ||
        currentStation?.id !==
          recoveryStationId
      ) {
        console.log(
          "RECOVERY PLAY RESULT IGNORED: STATION CHANGED"
        );

        return;
      }

      console.log(
        "RECOVERY SUCCESS:",
        station.name
      );

      recoveryRunningRef.current =
        false;

      errorRecoveryPendingRef.current =
        false;

      setRecovering(false);
      setPlaying(true);

      recoveryAttemptRef.current = 0;
      setStreamHealth("GOOD");
    } catch (error) {
      recoveryRunningRef.current =
        false;

      /*
       * AbortError is expected when another
       * play/pause/source operation supersedes
       * the current one.
       */
      if (
        error?.name === "AbortError"
      ) {
        console.log(
          "RECOVERY ABORTED: PLAY REQUEST SUPERSEDED"
        );

        return;
      }

      console.error(
        `RECOVERY FAILED ${attempt}:`,
        error
      );

      if (
        !navigator.onLine ||
        error?.message ===
          "Internet offline"
      ) {
        setRecovering(false);
        setPlaying(false);
        setSignalLevel(0);
        setStreamHealth("OFFLINE");
        setScanMessage(
          "INTERNET OFFLINE"
        );

        return;
      }

      if (
        !currentStation ||
        currentStation.id !==
          recoveryStationId
      ) {
        console.log(
          "RECOVERY TIMER CANCELLED: STATION CHANGED"
        );

        setRecovering(false);

        return;
      }

      if (
        recoveryTimerRef.current
      ) {
        clearTimeout(
          recoveryTimerRef.current
        );
      }

      recoveryTimerRef.current =
        setTimeout(() => {
          recoveryTimerRef.current =
            null;

          if (
            !navigator.onLine
          ) {
            return;
          }

          if (
            manuallyPausedRef.current
          ) {
            return;
          }

          if (
            !currentStation ||
            currentStation.id !==
              recoveryStationId
          ) {
            return;
          }

          recoverCurrentStation();
        }, 1500);
    }
  }

  /*
   * ---------------------------------------------------------
   * FAVORITES
   * ---------------------------------------------------------
   */

  function toggleFavorite(station) {
    if (!station) {
      return;
    }

    setFavorites(
      (previousFavorites) => {
        const exists =
          previousFavorites.some(
            (favorite) =>
              favorite.id ===
              station.id
          );

        if (exists) {
          return previousFavorites.filter(
            (favorite) =>
              favorite.id !==
              station.id
          );
        }

        return [
          ...previousFavorites,
          station,
        ];
      }
    );
  }

  function isFavorite(station) {
    if (!station) {
      return false;
    }

    return favorites.some(
      (favorite) =>
        favorite.id === station.id
    );
  }


  function handleStationSearchKeyDown(
  event
) {
  if (event.key === "Enter") {
    searchStations();
  }

  if (
    event.key === "Escape"
  ) {
    setStationSearch("");
    setSearchResults([]);
  }
}


  /*
 * ---------------------------------------------------------
 * SEARCH FM STATIONS
 * ---------------------------------------------------------
 */

async function searchStations() {
  const query =
    stationSearch.trim();

  if (!query) {
    setSearchResults([]);
    return;
  }

  if (!navigator.onLine) {
    console.log(
      "STATION SEARCH BLOCKED: INTERNET OFFLINE"
    );

    setSearchResults([]);
    return;
  }

  try {
    setSearchingStations(true);

    console.log(
      "================================================="
    );

    console.log(
      "WORLDWIDE FM STATION SEARCH:",
      query
    );

    const params =
      new URLSearchParams({
        name: query,
        hidebroken: "true",
        // has_geo_info: "true",
        order: "votes",
        reverse: "true",
        limit: "100",
      });

    /*
     * Keep normal station search focused on India.
     *
     * We can remove this later if you want worldwide
     * station search.
     */
    // params.set(
    //   "country",
    //   "India"
    // );

    const requestUrl =
      `${API}?${params}`;

    console.log(
      "SEARCH REQUEST:",
      requestUrl
    );

    const response =
      await fetch(requestUrl);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    console.log(
      "RAW SEARCH RESULTS:",
      data.length
    );

    const normalizedResults =
      data
        .map((station) =>
          normalizeStation(
            station,
            // location?.latitude ??
              null,
            // location?.longitude ??
              null
          )
        )
        .filter(
          (station) =>
            station.id &&
            station.streamUrl
        );

    /*
     * Remove duplicate UUIDs.
     */
    const uniqueResults =
      Array.from(
        new Map(
          normalizedResults.map(
            (station) => [
              station.id,
              station,
            ]
          )
        ).values()
      );

      console.log(
      "FINAL SEARCH RESULTS:",
      uniqueResults.length
    );

    console.table(
      uniqueResults.map(
        (station) => ({
          name: station.name,
          country:
            station.country ||
            "UNKNOWN",
          region:
            station.state ||
            "UNKNOWN",
          geo:
            station.latitude !== null &&
            station.longitude !== null
              ? "YES"
              : "NO",
        })
      )
    );

    setSearchResults(
      uniqueResults
    );

    /*
     * If the user currently selected a region,
     * keep only results belonging to that region.
     *
     * This does NOT modify regionStations.
     */
    // const filteredResults =
    //   selectedRegion &&
    //   selectedRegion !== "ALL"
    //     ? uniqueResults.filter(
    //         (station) =>
    //           getStationRegion(
    //             station
    //           ) === selectedRegion
    //       )
    //     : uniqueResults;

    // setSearchResults(
    //   filteredResults
    // );

    // console.log(
    //   "FINAL SEARCH RESULTS:",
    //   filteredResults.length
    // );

    console.log(
      "================================================="
    );
  } catch (error) {
    console.error(
      "FM STATION SEARCH FAILED:",
      error
    );

    setSearchResults([]);
  } finally {
    setSearchingStations(false);
  }
}



  /*
   * ---------------------------------------------------------
   * LOAD STATIONS
   * ---------------------------------------------------------
   */

  async function loadStations(
    latitude = null,
    longitude = null
  ) {
    const requestId =
      ++stationLoadRequestRef.current;

    try {
      stopCurrentPlayback();

      setPlaying(false);
      setLoading(true);

      const params =
        new URLSearchParams({
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
        params.set(
          "country",
          "India"
        );
      }

      const requestUrl =
        `${API}?${params}`;

      console.log(
        "Request:",
        requestUrl
      );

      const response =
        await fetch(requestUrl);

      const data =
        await response.json();

      if (
        requestId !==
        stationLoadRequestRef.current
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

      const normalizedStations =
        data.map((station) =>
          normalizeStation(
            station,
            latitude,
            longitude
          )
        );

      if (
        latitude !== null &&
        longitude !== null
      ) {
        normalizedStations.sort(
          (a, b) => {
            if (
              a.distance === null
            ) {
              return 1;
            }

            if (
              b.distance === null
            ) {
              return -1;
            }

            return (
              a.distance -
              b.distance
            );
          }
        );
      }

      /*
       * Update favorites with fresh
       * station metadata.
       */
      setFavorites(
        (previousFavorites) =>
          previousFavorites.map(
            (favorite) => {
              const freshStation =
                normalizedStations.find(
                  (station) =>
                    station.id ===
                    favorite.id
                );

              if (!freshStation) {
                return favorite;
              }

              return {
                ...favorite,
                ...freshStation,
              };
            }
          )
      );

      /*
       * Update presets.
       */
      setPresets(
        (previousPresets) =>
          previousPresets.map(
            (preset) => {
              if (!preset) {
                return null;
              }

              const freshStation =
                normalizedStations.find(
                  (station) =>
                    station.id ===
                    preset.id
                );

              if (!freshStation) {
                return preset;
              }

              return {
                ...preset,
                ...freshStation,
              };
            }
          )
      );

      setStations(
        normalizedStations
      );

      // const stationsWithRegion =
      //   normalizedStations.filter(
      //     (station) =>
      //       station.state &&
      //       station.state.trim() !== ""
      //   );

        

      // setRegionStations(
      //   stationsWithRegion
      // );


      if (
  latitude === null &&
  longitude === null
) {
  const stationsWithRegion =
    normalizedStations.filter(
      (station) =>
        station.state &&
        station.state.trim() !== ""
    );

  setRegionStations(
    stationsWithRegion
  );
}

      if (
        normalizedStations.length > 0
      ) {
        const savedStationId =
          localStorage.getItem(
            "retroRadioLastStationId"
          );

        const savedStation =
          savedStationId
            ? normalizedStations.find(
                (station) =>
                  station.id ===
                  savedStationId
              )
            : null;

        const stationToRestore =
          savedStation ||
          normalizedStations[0];

        console.log(
          savedStation
            ? "RESTORING LAST STATION:"
            : "NO SAVED STATION — USING FIRST STATION:",
          stationToRestore.name
        );

        setCurrentStation(
          stationToRestore
        );

        setLastStationId(
          stationToRestore.id
        );

        /*
         * Prepare the source but DO NOT PLAY.
         */
        const audio =
          audioRef.current;

        if (audio) {
          internalAudioChangeRef.current =
            true;

          ++playbackRequestRef.current;

          audio.pause();

          audio.src =
            stationToRestore.streamUrl;

          audioStationIdRef.current =
            stationToRestore.id;

          audio.load();

          internalAudioChangeRef.current =
            false;
        }

        setPlaying(false);

        const frequency =
          getStationFrequency(
            stationToRestore
          );

        if (frequency !== null) {
          setTunerFrequency(
            frequency
          );

          setDisplayFrequency(
            frequency
          );
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
      if (
        requestId ===
        stationLoadRequestRef.current
      ) {
        setLoading(false);
      }
    }
  }

  /*
   * ---------------------------------------------------------
   * LOAD REGION STATIONS
   * ---------------------------------------------------------
   */

  async function loadRegionStations() {
    try {
      const params =
        new URLSearchParams({
          hidebroken: "true",
          has_geo_info: "false",
          order: "votes",
          reverse: "true",
          limit: "100",
          country: "India",
        });

      const requestUrl =
        `${API}?${params}`;

      console.log(
        "REGION REQUEST:",
        requestUrl
      );

      const response =
        await fetch(requestUrl);

      const data =
        await response.json();

      console.log(
        "Region station count:",
        data.length
      );

      const normalizedStations =
        data.map((station) =>
          normalizeStation(
            station,
            null,
            null
          )
        );

      setRegionStations(
        normalizedStations
      );
    } catch (error) {
      console.error(
        "Failed to load region stations:",
        error
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * SCAN
   * ---------------------------------------------------------
   */

  async function scanToStation(
    direction
  ) {
    if (!navigator.onLine) {
      console.log(
        "SEEK BLOCKED: INTERNET OFFLINE"
      );

      setScanMessage(
        "INTERNET OFFLINE"
      );

      setStreamHealth(
        "OFFLINE"
      );

      return;
    }

    const activeStations =
      getActiveStationList();

    console.log(
      "SEEK ACTIVE LIST:",
      {
        filter: stationFilter,
        selectedRegion,
        count:
          activeStations.length,
        stations:
          activeStations.map(
            (station) =>
              station.name
          ),
      }
    );

    if (
      scanning ||
      activeStations.length === 0
    ) {
      return;
    }

    scanCancelRef.current =
      false;

    /*
     * Cancel recovery while seeking.
     */
    playbackRequestRef.current += 1;

    if (
      recoveryTimerRef.current
    ) {
      clearTimeout(
        recoveryTimerRef.current
      );

      recoveryTimerRef.current =
        null;
    }

    recoveryRunningRef.current =
      false;

    failoverRef.current = false;

    setRecovering(false);
    setAutoFailover(false);

    setScanning(true);
    setScanMessage(
      "SCANNING..."
    );

    const currentIndex =
      currentStation
        ? activeStations.findIndex(
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
          : activeStations.length - 1;
    } else {
      index =
        direction === "next"
          ? currentIndex + 1
          : currentIndex - 1;
    }

    while (
      index >= 0 &&
      index < activeStations.length
    ) {
      if (
        scanCancelRef.current
      ) {
        console.log(
          "SCAN CANCELLED"
        );

        setScanMessage(
          "SCAN CANCELLED"
        );

        setScanning(false);

        return;
      }

      if (!navigator.onLine) {
        setScanning(false);
        setScanMessage(
          "INTERNET OFFLINE"
        );
        return;
      }

      const station =
        activeStations[index];

      const frequency =
        getStationFrequency(
          station
        );

      setScanMessage(
        frequency !== null
          ? `TESTING ${frequency.toFixed(
              1
            )} FM`
          : `TESTING ${station.name}`
      );

      console.log(
        "Scanning station:",
        station.name
      );

      const playable =
        await testStation(
          station
        );

      if (playable) {
        console.log(
          "LOCKED:",
          station.name
        );

        setScanMessage(
          "LOCKED"
        );

        setScanning(false);

        await playStation(
          station
        );

        scanIndexRef.current =
          null;

        scanDirectionRef.current =
          null;

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

    scanIndexRef.current =
      null;

    scanDirectionRef.current =
      null;
  }

  /*
   * ---------------------------------------------------------
   * TEST STATION
   * ---------------------------------------------------------
   */

  function testStation(station) {
    return new Promise(
      (resolve) => {
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

        const audio =
          new Audio();

        scanAudioRef.current =
          audio;

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
            scanAudioRef.current ===
            audio
          ) {
            scanAudioRef.current =
              null;
          }
        };

        const finish = (
          success
        ) => {
          if (finished) {
            return;
          }

          finished = true;

          setStationHealth(
            (previous) => ({
              ...previous,
              [station.id]:
                success
                  ? "healthy"
                  : "unhealthy",
            })
          );

          cleanup();

          resolve(success);
        };

        const handleSuccess = () => {
          if (
            scanCancelRef.current
          ) {
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
            "TEST FAILURE:",
            station.name
          );

          failedStationsRef.current.add(
            station.id
          );

          finish(false);
        };

        timeout = setTimeout(
          () => {
            console.log(
              "TEST TIMEOUT:",
              station.name
            );

            finish(false);
          },
          STATION_HEALTH_CONFIG.testTimeout
        );

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

        audio
          .play()
          .catch((error) => {
            /*
             * AbortError during test simply
             * means the test was cancelled.
             */
            if (
              error?.name !==
              "AbortError"
            ) {
              console.log(
                "TEST PLAY FAILED:",
                station.name,
                error
              );
            }

            finish(false);
          });
      }
    );
  }

  /*
   * ---------------------------------------------------------
   * NORMALIZE STATION
   * ---------------------------------------------------------
   */

  function normalizeStation(
    station,
    userLatitude = null,
    userLongitude = null
  ) {
    let distance = null;

    if (
      station.geo_lat !== null &&
      station.geo_long !== null &&
      userLatitude !== null &&
      userLongitude !== null
    ) {
      distance =
        calculateDistance(
          userLatitude,
          userLongitude,
          station.geo_lat,
          station.geo_long
        );
    }

    const rawFrequency =
      station.frequency ??
      station.name?.match(
        /\b(8[8-9](?:\.\d+)?|9\d(?:\.\d+)?|10[0-7](?:\.\d+)?)\s*(?:FM)?\b/i
      )?.[1] ??
      null;

    const parsedFrequency =
      Number(rawFrequency);

    const frequency =
      Number.isFinite(
        parsedFrequency
      ) &&
      parsedFrequency >= 88 &&
      parsedFrequency <= 108
        ? parsedFrequency
        : null;

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

  /*
   * ---------------------------------------------------------
   * LOCATION
   * ---------------------------------------------------------
   */

  async function getLocationName(
    latitude,
    longitude
  ) {
    try {
      const response =
        await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
        );

      const data =
        await response.json();

      const address =
        data.address;

      const city =
        address.city ||
        address.town ||
        address.village ||
        address.county ||
        "Unknown";

      const state =
        address.state || "";

      const country =
        address.country || "";

      setLocationName(
        [
          city,
          state,
          country,
        ]
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
    failoverRef.current =
      false;

    setAutoFailover(false);

    console.log(
      "STOPPING SCAN"
    );

    scanCancelRef.current =
      true;

    if (scanAudioRef.current) {
      scanAudioRef.current.pause();

      scanAudioRef.current.src =
        "";

      scanAudioRef.current =
        null;
    }

    setScanning(false);

    setScanMessage(
      "SCAN CANCELLED"
    );

    scanIndexRef.current =
      null;

    scanDirectionRef.current =
      null;
  }

  /*
   * ---------------------------------------------------------
   * STOP PLAYBACK
   * ---------------------------------------------------------
   */

  function stopCurrentPlayback() {
    const audio =
      audioRef.current;

    /*
     * Invalidate every pending play()
     * immediately.
     */
    playbackRequestRef.current +=
      1;

    recoveryStationIdRef.current =
      null;

    recoveryRunningRef.current =
      false;

    errorRecoveryPendingRef.current =
      false;

    if (
      recoveryTimerRef.current
    ) {
      clearTimeout(
        recoveryTimerRef.current
      );

      recoveryTimerRef.current =
        null;
    }

    if (audio) {
      internalAudioChangeRef.current =
        true;

      audio.pause();

      audio.removeAttribute(
        "src"
      );

      audio.load();

      audioStationIdRef.current =
        null;

      internalAudioChangeRef.current =
        false;
    }

    setPlaying(false);
    setRecovering(false);
    setSignalLevel(0);

    if (navigator.onLine) {
      setStreamHealth("READY");
    }
  }

  /*
   * ---------------------------------------------------------
   * GEOLOCATION
   * ---------------------------------------------------------
   */

  function getMyLocation() {
    stopScanning();

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
        const {
          latitude,
          longitude,
        } = position.coords;

        setLocation({
          latitude,
          longitude,
        });

        setLocationName(
          "Finding location..."
        );

        getLocationName(
          latitude,
          longitude
        );

        loadStations(
          latitude,
          longitude
        );

        setLocationLoading(false);
      },
      (error) => {
        console.error(
          "Location error:",
          error
        );

        setLocationLoading(false);

        alert(
          "Unable to get your location. Please allow location access."
        );
      }
    );
  }

  async function searchCustomLocation() {
    stopScanning();

    stopCurrentPlayback();

    if (!searchLocation.trim()) {
      return;
    }

    try {
      setSearchingLocation(
        true
      );

      const response =
        await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            searchLocation
          )}&limit=1`
        );

      const data =
        await response.json();

      if (data.length === 0) {
        alert(
          "Location not found."
        );

        return;
      }

      const result =
        data[0];

      const latitude =
        parseFloat(result.lat);

      const longitude =
        parseFloat(result.lon);

      setLocation({
        latitude,
        longitude,
      });

      setLocationName(
        result.display_name
      );

      await loadStations(
        latitude,
        longitude
      );
    } catch (error) {
      console.error(
        "Location search failed:",
        error
      );

      alert(
        "Unable to find that location."
      );
    } finally {
      setSearchingLocation(
        false
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * DISTANCE
   * ---------------------------------------------------------
   */

  function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
  ) {
    const earthRadius = 6371;

    const dLat =
      ((lat2 - lat1) *
        Math.PI) /
      180;

    const dLon =
      ((lon2 - lon1) *
        Math.PI) /
      180;

    const a =
      Math.sin(dLat / 2) **
        2 +
      Math.cos(
        (lat1 * Math.PI) /
          180
      ) *
        Math.cos(
          (lat2 * Math.PI) /
            180
        ) *
        Math.sin(dLon / 2) **
          2;

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );

    return earthRadius * c;
  }

  /*
   * ---------------------------------------------------------
   * SKIP FAILED STATION
   * ---------------------------------------------------------
   */

  async function skipFailedStation(station) {
  console.log(
    "========== SKIP FAILED STATION =========="
  );

  const activeStations =
    getActiveStationList();

  console.log(
    "FAILED STATION:",
    station?.name
  );

  if (
    !station ||
    activeStations.length === 0
  ) {
    setPlaying(false);
    setScanMessage(
      "NO PLAYABLE STATION"
    );

    return;
  }

  const currentIndex =
    activeStations.findIndex(
      (availableStation) =>
        availableStation.id ===
        station.id
    );

  if (currentIndex === -1) {
    console.log(
      "FAILED STATION NOT FOUND IN ACTIVE LIST"
    );

    setPlaying(false);
    setScanMessage(
      "NO PLAYABLE STATION"
    );

    return;
  }

  /*
   * -------------------------------------------------------
   * CIRCULAR SEARCH
   * -------------------------------------------------------
   *
   * Start from the station after the failed station.
   *
   * Wrap around to the beginning when we reach
   * the end of the active list.
   *
   * Every station is tested at most once.
   * -------------------------------------------------------
   */

  const testedStationIds =
    new Set();

  for (
    let offset = 1;
    offset < activeStations.length;
    offset++
  ) {
    /*
     * Circular index.
     *
     * Example:
     *
     * current = 4
     * length  = 6
     *
     * offset 1 → 5
     * offset 2 → 0
     * offset 3 → 1
     * ...
     */
    const nextIndex =
      (currentIndex + offset) %
      activeStations.length;

    const nextStation =
      activeStations[nextIndex];

    /*
     * Safety protection against duplicates.
     */
    if (
      testedStationIds.has(
        nextStation.id
      )
    ) {
      continue;
    }

    testedStationIds.add(
      nextStation.id
    );

    console.log(
      `TRY ${offset}/${
        activeStations.length - 1
      }:`,
      nextStation.name
    );

    setScanMessage(
      `TESTING ${nextStation.name}`
    );

    const playable =
      await testStation(
        nextStation
      );

    if (playable) {
      console.log(
        "NEXT PLAYABLE STATION FOUND:",
        nextStation.name
      );

      setScanMessage(
        "LOCKED"
      );

      await playStation(
        nextStation
      );

      return;
    }

    console.log(
      "NEXT STATION FAILED:",
      nextStation.name
    );
  }

  /*
   * -------------------------------------------------------
   * ALL STATIONS FAILED
   * -------------------------------------------------------
   */

  console.log(
    "NO PLAYABLE STATION IN ACTIVE LIST"
  );

  setPlaying(false);

  setScanMessage(
    "NO PLAYABLE STATION"
  );
}

  /*
   * =========================================================
   * PLAY STATION
   * =========================================================
   *
   * THIS IS THE MAIN FIX.
   *
   * We now:
   *
   * 1. Invalidate old play() promises.
   * 2. Cancel recovery.
   * 3. Mark internal pause/source changes.
   * 4. Never treat AbortError as a bad stream.
   * 5. Verify the request is still current after
   *    await audio.play().
   * 6. Don't reload an already-correct source unnecessarily.
   * =========================================================
   */

  async function playStation(
    station
  ) {
    console.count(
      "playStation CALLED"
    );

    if (!station?.streamUrl) {
      console.error(
        "Station has no stream URL:",
        station
      );

      return;
    }

    if (!navigator.onLine) {
      console.log(
        "PLAY BLOCKED: INTERNET OFFLINE"
      );

      setStreamHealth(
        "OFFLINE"
      );

      setScanMessage(
        "INTERNET OFFLINE"
      );

      return;
    }

    /*
     * -------------------------------------------------------
     * GET FRESH STATION
     * -------------------------------------------------------
     */

    const freshStation =
      stations.find(
        (availableStation) =>
          availableStation.id ===
          station.id
      );

    if (freshStation) {
      station = {
        ...station,
        ...freshStation,
      };
    }

    /*
     * -------------------------------------------------------
     * NEW PLAYBACK REQUEST
     * -------------------------------------------------------
     */

    const requestId =
      ++playbackRequestRef.current;

    manuallyPausedRef.current =
      false;

    recoveryStationIdRef.current =
      null;

    errorRecoveryPendingRef.current =
      false;

    failoverRef.current =
      false;

    recoveryRunningRef.current =
      false;

    if (
      recoveryTimerRef.current
    ) {
      clearTimeout(
        recoveryTimerRef.current
      );

      recoveryTimerRef.current =
        null;
    }

    recoveryAttemptRef.current =
      0;

    setRecovering(false);
    setAutoFailover(false);

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
      "Codec:",
      station.frequency
    );

    console.log(
      "Bitrate:",
      station.bitrate
    );

    console.log(
      "REQUEST ID:",
      requestId
    );

    console.log(
      "================================"
    );

    /*
     * Update UI station BEFORE touching audio.
     */
    setCurrentStation(
      station
    );

    localStorage.setItem(
      "retroRadioLastStationId",
      station.id
    );

    setLastStationId(
      station.id
    );

    const frequency =
      getStationFrequency(
        station
      );

    if (frequency !== null) {
      animateTunerTo(
        frequency
      );
    }

    /*
     * -------------------------------------------------------
     * STOP OLD AUDIO
     * -------------------------------------------------------
     */

    internalAudioChangeRef.current =
      true;

    try {
      audio.pause();

      /*
       * IMPORTANT:
       *
       * Use currentSrc because browser may
       * normalize the URL.
       */
      const currentSrc =
        audio.currentSrc ||
        audio.src;

      const sourceChanged =
        currentSrc !==
        station.streamUrl;

      if (sourceChanged) {
        audio.src =
          station.streamUrl;

        audioStationIdRef.current =
          station.id;

        audio.load();
      } else {
        /*
         * Same station.
         *
         * If the audio is already loaded,
         * don't unnecessarily reset it.
         */
        audioStationIdRef.current =
          station.id;
      }
    } finally {
      internalAudioChangeRef.current =
        false;
    }

    setPlaying(false);
    setSignalLevel(0);
    setStreamHealth(
      "CONNECTING"
    );

    /*
     * -------------------------------------------------------
     * VERIFY REQUEST BEFORE PLAY
     * -------------------------------------------------------
     */

    if (
      requestId !==
      playbackRequestRef.current
    ) {
      console.log(
        "PLAY CANCELLED BEFORE PLAY(): REQUEST OBSOLETE"
      );

      return;
    }

    if (
      currentStationId() !==
      station.id
    ) {
      /*
       * React state may not have updated yet,
       * so this is only a secondary safety check.
       */
      console.log(
        "PLAY CONTINUING: React state update pending"
      );
    }

    try {
      /*
       * IMPORTANT:
       *
       * Do not call pause() immediately before
       * play() here.
       *
       * We already handled the old source above.
       */
      await audio.play();

      /*
       * -----------------------------------------------------
       * PLAY PROMISE FINISHED
       * -----------------------------------------------------
       *
       * It may have completed after the user
       * selected another station.
       */

      if (
        requestId !==
        playbackRequestRef.current
      ) {
        console.log(
          "PLAY RESULT IGNORED: OLD REQUEST",
          requestId
        );

        return;
      }

      if (
        manuallyPausedRef.current
      ) {
        console.log(
          "PLAY RESULT IGNORED: USER PAUSED"
        );

        return;
      }

      if (
        !navigator.onLine
      ) {
        console.log(
          "PLAY RESULT IGNORED: INTERNET OFFLINE"
        );

        return;
      }

      setStationHealth(
        (previous) => ({
          ...previous,
          [station.id]:
            "healthy",
        })
      );

      setPlaying(true);

      setRecovering(false);
      setAutoFailover(false);

      errorRecoveryPendingRef.current =
        false;

      console.log(
        "PLAYING:",
        station.name
      );
    } catch (error) {
      /*
       * -----------------------------------------------------
       * ABORTERROR IS NOT A BROKEN STATION
       * -----------------------------------------------------
       */

      if (
        error?.name ===
        "AbortError"
      ) {
        console.log(
          "PLAY ABORTED: OLD PLAY REQUEST WAS INTERRUPTED"
        );

        /*
         * DO NOT mark the station unhealthy.
         *
         * DO NOT start recovery.
         */
        return;
      }

      /*
       * If another request replaced this
       * request while play() was pending,
       * ignore the failure.
       */
      if (
        requestId !==
        playbackRequestRef.current
      ) {
        console.log(
          "PLAY FAILURE IGNORED: REQUEST OBSOLETE"
        );

        return;
      }

      if (
        manuallyPausedRef.current
      ) {
        console.log(
          "PLAY FAILURE IGNORED: USER PAUSED"
        );

        return;
      }

      console.error(
        "PLAY FAILED:",
        error
      );

      console.error(
        "Stream URL:",
        station.streamUrl
      );

      setPlaying(false);

      /*
       * -----------------------------------------------------
       * PERMANENT FAILURE
       * -----------------------------------------------------
       */

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

        setStationHealth(
          (previous) => ({
            ...previous,
            [station.id]:
              "unhealthy",
          })
        );

        internalAudioChangeRef.current =
          true;

        audio.pause();
        audio.removeAttribute(
          "src"
        );
        audio.load();

        internalAudioChangeRef.current =
          false;

        await skipFailedStation(
          station
        );

        return;
      }

      /*
       * -----------------------------------------------------
       * TEMPORARY FAILURE
       * -----------------------------------------------------
       */

      console.log(
        "TEMPORARY PLAYBACK FAILURE — RECOVERY"
      );

      if (
        !scanning &&
        !recoveryRunningRef.current
      ) {
        recoveryStationIdRef.current =
          station.id;

        recoverCurrentStation();
      }
    }
  }

  /*
   * Helper for current station ID.
   */
  function currentStationId() {
    return currentStation?.id || null;
  }

  /*
   * ---------------------------------------------------------
   * PLAY / PAUSE
   * ---------------------------------------------------------
   */

  async function togglePlay() {
    /*
     * SEEK is running → PLAY button becomes CANCEL.
     */
    if (scanning) {
      stopScanning();
      return;
    }

    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    /*
     * No current station.
     */
    if (!currentStation) {
      if (stations.length === 0) {
        return;
      }

      await playStation(
        stations[0]
      );

      return;
    }

    /*
     * -------------------------------------------------------
     * PAUSE
     * -------------------------------------------------------
     */

    if (!audio.paused) {
      /*
       * Invalidate any pending play()
       * promise.
       */
      ++playbackRequestRef.current;

      manuallyPausedRef.current =
        true;

      wasPlayingBeforeOfflineRef.current =
        false;

      if (
        recoveryTimerRef.current
      ) {
        clearTimeout(
          recoveryTimerRef.current
        );

        recoveryTimerRef.current =
          null;
      }

      recoveryRunningRef.current =
        false;

      errorRecoveryPendingRef.current =
        false;

      recoveryAttemptRef.current =
        0;

      recoveryStationIdRef.current =
        null;

      internalAudioChangeRef.current =
        true;

      audio.pause();

      internalAudioChangeRef.current =
        false;

      setRecovering(false);
      setPlaying(false);
      setSignalLevel(0);
      setStreamHealth("PAUSED");
      setScanMessage("");

      console.log(
        "USER PAUSED RADIO"
      );

      return;
    }

    /*
     * -------------------------------------------------------
     * PLAY
     * -------------------------------------------------------
     */

    manuallyPausedRef.current =
      false;

    /*
     * If the audio source belongs to
     * another station, use playStation()
     * instead of manually manipulating it.
     */
    if (
      audioStationIdRef.current !==
      currentStation.id
    ) {
      await playStation(
        currentStation
      );

      return;
    }

    /*
     * Source missing.
     */
    if (
      !audio.src &&
      !audio.currentSrc
    ) {
      await playStation(
        currentStation
      );

      return;
    }

    const requestId =
      ++playbackRequestRef.current;

    setStreamHealth(
      "CONNECTING"
    );

    try {
      await audio.play();

      if (
        requestId !==
        playbackRequestRef.current
      ) {
        console.log(
          "PLAY BUTTON RESULT IGNORED: OLD REQUEST"
        );

        return;
      }

      if (
        manuallyPausedRef.current
      ) {
        return;
      }

      setPlaying(true);

      setRecovering(false);

      console.log(
        "PLAYING:",
        currentStation.name
      );
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        console.log(
          "PLAY BUTTON ABORTED: REQUEST SUPERSEDED"
        );

        return;
      }

      console.error(
        "PLAY BUTTON FAILED:",
        error
      );

      setPlaying(false);

      if (
        isUnplayableStream(
          audio,
          error
        )
      ) {
        await skipFailedStation(
          currentStation
        );

        return;
      }

      if (
        !manuallyPausedRef.current
      ) {
        recoveryStationIdRef.current =
          currentStation.id;

        recoverCurrentStation();
      }
    }
  }

  /*
   * ---------------------------------------------------------
   * NEXT / PREVIOUS
   * ---------------------------------------------------------
   */

  function nextStation() {
    if (
      scanning ||
      stations.length === 0
    ) {
      return;
    }

    const activeStations =
      getActiveStationList();

    if (
      activeStations.length === 0
    ) {
      return;
    }

    if (!currentStation) {
      playStation(
        activeStations[0]
      );

      return;
    }

    const currentIndex =
      activeStations.findIndex(
        (station) =>
          station.id ===
          currentStation.id
      );

    if (currentIndex === -1) {
      playStation(
        activeStations[0]
      );

      return;
    }

    const nextIndex =
      (currentIndex + 1) %
      activeStations.length;

    playStation(
      activeStations[nextIndex]
    );
  }

  function previousStation() {
    if (
      scanning ||
      stations.length === 0
    ) {
      return;
    }

    const activeStations =
      getActiveStationList();

    if (
      activeStations.length === 0
    ) {
      return;
    }

    if (!currentStation) {
      playStation(
        activeStations[
          activeStations.length - 1
        ]
      );

      return;
    }

    const currentIndex =
      activeStations.findIndex(
        (station) =>
          station.id ===
          currentStation.id
      );

    if (currentIndex === -1) {
      playStation(
        activeStations[
          activeStations.length - 1
        ]
      );

      return;
    }

    const previousIndex =
      (currentIndex -
        1 +
        activeStations.length) %
      activeStations.length;

    playStation(
      activeStations[
        previousIndex
      ]
    );
  }

  /*
   * ---------------------------------------------------------
   * RENDER
   * ---------------------------------------------------------
   */

  return (
    <div
      className={`car-stereo theme-${theme}`}
    >
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

          <select
            value={theme}
            onChange={(e) =>
              setTheme(
                e.target.value
              )
            }
          >
            <option value="classic">
              📻 Classic FM
            </option>

            <option value="retro">
              🟢 Retro Radio
            </option>

            <option value="amber">
              🟠 Amber Classic
            </option>

            <option value="ocean">
              🔵 Ocean FM
            </option>

            <option value="neon">
              🟣 Neon FM
            </option>

            <option value="cyber">
              💚 Cyber FM
            </option>

            <option value="studio">
              🔷 Studio
            </option>

            <option value="minimal">
              ⚪ Minimal
            </option>

            <option value="light">
              ☀️ Light
            </option>
          </select>
        </div>
      </header>

      {/* LCD DISPLAY */}

      <section ref={lcdRef} className="lcd">
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

        <div
          className={`scan-message ${
            scanning
              ? "visible"
              : ""
          }`}
        >
          {scanMessage}
        </div>

        <div className="frequency">
          {getFrequencyDisplay(
            currentStation
          )}
        </div>

        <div className="station-title">
          {currentStation?.name ||
            "SEARCHING STATION..."}
        </div>

        <div className="station-meta">
          {currentStation?.codec ||
            "STREAM"}

          {currentStation?.bitrate >
            0 &&
            ` • ${currentStation.bitrate} KBPS `}

          {currentStation?.country &&
            " • " +
              currentStation.country.toUpperCase()}
        </div>

        <div className="station-type">
          {getStationType(
            currentStation
          )}
        </div>

        <div className="station-tags">
          {getStationTags(
            currentStation
          )}
        </div>

        <div className="signal-section">
          <div className="signal-header">
            <span>
              STREAM HEALTH
            </span>

            <span>
              {streamHealth}
            </span>
          </div>

          <div className="signal-bars">
            {[1, 2, 3, 4, 5].map(
              (level) => (
                <span
                  key={level}
                  className={
                    level <=
                    signalLevel
                      ? "active"
                      : ""
                  }
                  style={{
                    height: `${
                      level * 4 +
                      4
                    }px`,
                  }}
                />
              )
            )}
          </div>
        </div>

        <div className="station-location">
          📍 {locationName}
        </div>

        <div className="station-distance">
          📡{" "}
          {getStationDistance(
            currentStation
          )}
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
                displayFrequency !==
                null
                  ? `translateX(calc(50% - ${
                      (displayFrequency -
                        88) *
                      40
                    }px))`
                  : "translateX(50%)",
            }}
          >
            {Array.from(
              { length: 201 },
              (_, index) => {
                const frequency =
                  88 +
                  index * 0.1;

                const isMajor =
                  index % 10 ===
                  0;

                const isHalf =
                  index % 5 ===
                  0;

                return (
                  <div
                    key={frequency.toFixed(
                      1
                    )}
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
                        {frequency.toFixed(
                          0
                        )}
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

      {/* PRESETS */}

      <section className="preset-panel">
        <div
          className="preset-heading"
          onClick={() =>
            setShowPresets(
              (previous) =>
                !previous
            )
          }
        >
          <span className="preset-title">
            RADIO PRESETS
          </span>

          <div className="preset-heading-right">
            <span className="preset-count">
              {
                presets.filter(
                  Boolean
                ).length
              }
              /6
            </span>

            <span className="preset-arrow">
              {showPresets
                ? "▲"
                : "▼"}
            </span>
          </div>
        </div>

        {showPresets && (
          <div className="preset-grid">
            {presets.map(
              (
                station,
                index
              ) => {
                const isCurrent =
                  station &&
                  currentStation?.id ===
                    station.id;

                return (
                  <div
                    key={index}
                    className={`preset-card ${
                      station
                        ? "stored"
                        : "empty"
                    } ${
                      isCurrent
                        ? "active"
                        : ""
                    }`}
                  >
                    <button
                      className="preset-tune"
                      onClick={() =>
                        tunePreset(
                          index
                        )
                      }
                      disabled={
                        !station
                      }
                    >
                      <span className="preset-number">
                        P
                        {index + 1}
                      </span>

                      <span className="preset-frequency">
                        {station
                          ? getFrequencyDisplay(
                              station
                            )
                          : "---"}
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
                          savePreset(
                            index
                          )
                        }
                        disabled={
                          !currentStation
                        }
                      >
                        {station
                          ? "SAVE"
                          : "STORE"}
                      </button>

                      {station && (
                        <button
                          className="preset-clear"
                          onClick={() => {
                            setPresets(
                              (
                                previousPresets
                              ) => {
                                const updated =
                                  [
                                    ...previousPresets,
                                  ];

                                updated[
                                  index
                                ] =
                                  null;

                                return updated;
                              }
                            );
                          }}
                        >
                          CLEAR
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        )}
      </section>

      {/* CONTROLS */}

      <section className="controls">
        <button
          onClick={() =>
            scanToStation(
              "previous"
            )
          }
          disabled={
            scanning ||
            stations.length ===
              0 ||
            !navigator.onLine
          }
        >
          SEEK −
        </button>

        <button
          className="play"
          onClick={togglePlay}
        >
          {scanning
            ? "■"
            : playing
            ? "❚❚"
            : "▶"}
        </button>

        <button
          onClick={() =>
            scanToStation(
              "next"
            )
          }
          disabled={
            scanning ||
            stations.length ===
              0 ||
            !navigator.onLine
          }
        >
          SEEK +
        </button>
      </section>

      {/* VOLUME */}

      <section className="volume-panel">
        <button
          className="mute-button"
          onClick={() =>
            setMuted(
              (previous) =>
                !previous
            )
          }
        >
          {muted ||
          volume === 0
            ? "🔇"
            : "🔊"}
        </button>

        <input
          className="volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={
            muted
              ? 0
              : volume
          }
          onChange={(event) => {
            const newVolume =
              parseFloat(
                event.target.value
              );

            setVolume(
              newVolume
            );

            if (
              newVolume > 0 &&
              muted
            ) {
              setMuted(false);
            }
          }}
        />

        <span className="volume-value">
          {Math.round(
            (muted
              ? 0
              : volume) *
              100
          )}
          %
        </span>
      </section>

      {/* LOCATION */}

      <section className="location-panel">
        <button
          onClick={
            getMyLocation
          }
        >
          📍
          {locationLoading
            ? " FINDING..."
            : " MY LOCATION"}
        </button>

        <div className="custom-search">
          <input
            type="text"
            placeholder="SEARCH CITY..."
            value={
              searchLocation
            }
            onChange={(e) =>
              setSearchLocation(
                e.target.value
              )
            }
            onKeyDown={(e) => {
              if (
                e.key ===
                "Enter"
              ) {
                searchCustomLocation();
              }
            }}
          />

          <button
            onClick={
              searchCustomLocation
            }
            disabled={
              searchingLocation
            }
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
              className={
                stationFilter ===
                "all"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setStationFilter(
                  "all"
                )
              }
            >
              ALL
            </button>

            <button
              className={
                stationFilter ===
                "regions"
                  ? "active"
                  : ""
              }
              onClick={() => {
                setStationFilter(
                  "regions"
                );

                setSelectedRegion(
                  "ALL"
                );
              }}
            >
              REGIONS
            </button>

            <button
              className={
                stationFilter ===
                "favorites"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setStationFilter(
                  "favorites"
                )
              }
            >
              ♥ FAVORITES
            </button>
          </div>

          {stationFilter ===
            "regions" && (
            <div className="region-selector">
              <span>
                REGION
              </span>

              <select
                value={
                  selectedRegion
                }
                onChange={(
                  event
                ) =>
                  setSelectedRegion(
                    event.target
                      .value
                  )
                }
              >
                <option value="ALL">
                  ALL REGIONS
                </option>

                {availableRegions.map(
                  (region) => (
                    <option
                      key={region}
                      value={
                        region
                      }
                    >
                      {region}
                    </option>
                  )
                )}
              </select>
            </div>
          )}

          {/* <span>
            {stationFilter ===
            "favorites"
              ? favorites.length
              : stationFilter ===
                "regions"
              ? displayedRegionStations.length
              : stations.length}
          </span> */}
          <span>
  {stationSearch.trim()
    ? searchResults.length
    : stationFilter ===
      "favorites"
    ? favorites.length
    : stationFilter ===
      "regions"
    ? displayedRegionStations.length
    : stations.length}
</span>
        </div>
        <div className="station-search">
          <input type="text" placeholder="SEARCH FM STATIONS..." value={stationSearch} onChange={(event) => {
            const value = event.target.value;
            setStationSearch(value);

      /*
       * Clearing search restores
       * the normal station list.
       */
      if (!value.trim()) {
        setSearchResults([]);
      }
    }}
    onKeyDown={
      handleStationSearchKeyDown
    }
  />

  <button
    onClick={searchStations}
    disabled={
      searchingStations ||
      !stationSearch.trim()
    }
  >
    {searchingStations
      ? "..."
      : "SEARCH"}
  </button>

  {stationSearch && (
    <button
      className="station-search-clear"
      onClick={() => {
        setStationSearch("");
        setSearchResults([]);
      }}
    >
      ✕
    </button>
  )}
</div>

        {loading && (
          <div className="loading">
            SCANNING FREQUENCIES...
          </div>
        )}

        {/* {!loading &&
          displayedStations.length ===
            0 && (
            <div className="loading">
              {stationFilter ===
              "favorites"
                ? "NO FAVORITE STATIONS"
                : stationFilter ===
                  "regions"
                ? "NO REGION STATIONS"
                : "NO STATIONS"}
            </div>
          )} */}

          {!loading &&
  displayedStations.length === 0 && (
    <div className="loading">
      {stationSearch.trim()
        ? searchingStations
          ? "SEARCHING FM STATIONS..."
          : "NO FM STATIONS FOUND"
        : stationFilter === "favorites"
        ? "NO FAVORITE STATIONS"
        : stationFilter === "regions"
        ? "NO REGION STATIONS"
        : "NO STATIONS"}
    </div>
  )}

        {!loading &&
          displayedStations.map(
            (station) => (
              <div
                key={station.id}
                className={`station-row ${
                  currentStation?.id ===
                  station.id
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  playStation(
                    station
                  )
                }
              >
                <div className="station-info">
                  <strong>
                    <span
                      className={`station-health ${
                        stationHealth[
                          station.id
                        ] ||
                        "unknown"
                      }`}
                      title={
                        stationHealth[
                          station.id
                        ] ===
                        "healthy"
                          ? "Station healthy"
                          : stationHealth[
                              station.id
                            ] ===
                            "unhealthy"
                          ? "Station unavailable"
                          : "Station not tested"
                      }
                    >
                      ●
                    </span>

                    {station.name}

                    {currentStation?.id ===
                      station.id &&
                      playing && (
                        <span className="on-air-indicator">
                          ● ON AIR
                        </span>
                      )}
                  </strong>

                  <small>
                    {station.state ||
                      station.country ||
                      "UNKNOWN"}

                    {station.distance !==
                      null && (
                      <>
                        {" • "}
                        {station.distance.toFixed(
                          1
                        )}{" "}
                        km
                      </>
                    )}
                  </small>
                </div>

                <div className="codec">
                  {station.distance !==
                  null
                    ? `${station.distance.toFixed(
                        1
                      )} KM`
                    : "DIGITAL"}

                  <br />

                  {station.codec ||
                    "STREAM"}
                </div>

                <button
                  className={`favorite-button ${
                    isFavorite(
                      station
                    )
                      ? "favorite"
                      : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();

                    toggleFavorite(
                      station
                    );
                  }}
                >
                  {isFavorite(
                    station
                  )
                    ? "♥"
                    : "♡"}
                </button>
              </div>
            )
          )}
      </section>

      {/* =====================================================
          AUDIO ENGINE
          ===================================================== */}

      {showMiniPlayer &&
  currentStation && (
    <div className={`mini-player ${showMiniPlayer ? "visible" : ""}`}>
      <div className="mini-player-art">
  {currentStation.favicon ? (
    <img
      src={currentStation.favicon}
      alt=""
      onError={(event) => {
        event.currentTarget.style.display =
          "none";
      }}
    />
  ) : (
    <img
  className="mini-player-fallback-image"
  src="https://cdn3.iconfinder.com/data/icons/journalism-18/492/12255_-_Radio-512.png"
  alt="Radio"
/>
  )}
</div>
      <div className="mini-player-info">
        <div className="mini-player-status">
          {playing
            ? "● ON AIR"
            : recovering
            ? "◉ RECOVERING"
            : "○ PAUSED"}
        </div>

        <div className="mini-player-name">
          {currentStation.name}
        </div>

        <div className="mini-player-meta">
          {getFrequencyDisplay(
            currentStation
          )}

          {currentStation.codec &&
            ` • ${currentStation.codec}`}

          {currentStation.country &&
            ` • ${currentStation.country}`}
        </div>
      </div>

      <div className="mini-player-controls">
        <button
          type="button"
          onClick={() =>
            scanToStation("previous")
          }
          disabled={
            scanning ||
            !navigator.onLine
          }
          title="Previous station"
        >
          ◀
        </button>

        <button
          type="button"
          className="mini-player-play"
          onClick={togglePlay}
          disabled={
            !navigator.onLine
          }
          title={
            playing
              ? "Pause"
              : "Play"
          }
        >
          {scanning
            ? "■"
            : playing
            ? "❚❚"
            : "▶"}
        </button>

        <button
          type="button"
          onClick={() =>
            scanToStation("next")
          }
          disabled={
            scanning ||
            !navigator.onLine
          }
          title="Next station"
        >
          ▶
        </button>
      </div>
    </div>
  )}


      <audio
        ref={audioRef}
        volume={volume}
        muted={muted}
        controls={false}

        onLoadStart={() => {
          console.log(
            "AUDIO: loadstart"
          );

          if (
            !manuallyPausedRef.current
          ) {
            setStreamHealth(
              "CONNECTING"
            );
          }
        }}

        onLoadedMetadata={() => {
          console.log(
            "AUDIO: metadata loaded"
          );
        }}

        onCanPlay={() => {
          console.log(
            "AUDIO: can play"
          );
        }}

        onPlay={() => {
          console.log(
            "AUDIO: PLAY"
          );

          if (
            manuallyPausedRef.current
          ) {
            console.log(
              "AUDIO PLAY IGNORED: USER PAUSED"
            );

            return;
          }

          setPlaying(true);
          setRecovering(false);

          recoveryAttemptRef.current =
            0;

          if (
            recoveryTimerRef.current
          ) {
            clearTimeout(
              recoveryTimerRef.current
            );

            recoveryTimerRef.current =
              null;
          }

          errorRecoveryPendingRef.current =
            false;

          if (
            "mediaSession" in
            navigator
          ) {
            navigator.mediaSession.playbackState =
              "playing";
          }

          updateSignalLevel();
        }}

        onPlaying={() => {
          console.log(
            "AUDIO: PLAYING"
          );

          if (
            manuallyPausedRef.current
          ) {
            return;
          }

          setPlaying(true);
          setRecovering(false);
          setStreamHealth(
            "GOOD"
          );

          updateSignalLevel();

          if (
            "mediaSession" in
            navigator
          ) {
            navigator.mediaSession.playbackState =
              "playing";
          }
        }}

        onPause={() => {
          console.log(
            "AUDIO: PAUSE"
          );

          /*
           * This is the important part:
           *
           * Internal pause != user pause.
           */
          if (
            internalAudioChangeRef.current
          ) {
            console.log(
              "AUDIO PAUSE: INTERNAL CHANGE"
            );

            return;
          }

          if (
            manuallyPausedRef.current
          ) {
            setPlaying(false);
            setSignalLevel(0);
            setStreamHealth(
              "PAUSED"
            );

            if (
              "mediaSession" in
              navigator
            ) {
              navigator.mediaSession.playbackState =
                "paused";
            }

            return;
          }

          /*
           * If browser pauses because of
           * an external event, don't immediately
           * assume the station is broken.
           */
          setPlaying(false);

          if (
            navigator.onLine
          ) {
            setSignalLevel(0);

            /*
             * Don't immediately trigger
             * recovery from pause.
             */
            if (
              !scanning &&
              currentStation
            ) {
              setStreamHealth(
                "BUFFERING"
              );
            }
          }

          if (
            "mediaSession" in
            navigator
          ) {
            navigator.mediaSession.playbackState =
              "paused";
          }
        }}

        onWaiting={() => {
          console.log(
            "AUDIO: WAITING"
          );

          setSignalLevel(2);
          setStreamHealth(
            "BUFFERING"
          );
        }}

        // onStalled={() => {
        //   console.log(
        //     "AUDIO: STALLED"
        //   );

        //   /*
        //    * IMPORTANT:
        //    *
        //    * Do NOT immediately call
        //    * recoverCurrentStation().
        //    *
        //    * Internet radio can stall temporarily.
        //    *
        //    * Give the browser time to recover.
        //    */
        //   setSignalLevel(1);
        //   setStreamHealth(
        //     "WEAK"
        //   );
        // }}

        onStalled={() => {
  const audio =
    audioRef.current;

  console.log(
    "AUDIO: STALLED",
    {
      paused: audio?.paused,
      readyState: audio?.readyState,
      networkState: audio?.networkState,
      currentTime: audio?.currentTime,
      station:
        currentStation?.name,
    }
  );

  /*
   * User intentionally paused.
   */
  if (
    manuallyPausedRef.current
  ) {
    return;
  }

  /*
   * Ignore stalls while scanning.
   */
  if (scanning) {
    return;
  }

  /*
   * Don't immediately declare the
   * station unhealthy.
   */
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

          /*
           * Ignore errors from obsolete
           * playback requests.
           */
          if (
            audioStationIdRef.current !==
            currentStation?.id
          ) {
            console.log(
              "AUDIO ERROR IGNORED: OLD STATION"
            );

            return;
          }

          if (
            manuallyPausedRef.current
          ) {
            console.log(
              "AUDIO ERROR IGNORED: USER PAUSED"
            );

            return;
          }

          setSignalLevel(0);
          setStreamHealth(
            "LOST"
          );

          /*
           * FORMAT / UNSUPPORTED MEDIA.
           */
          if (
            mediaError?.code === 4
          ) {
            console.warn(
              "FORMAT ERROR — STREAM UNPLAYABLE"
            );

            setStationHealth(
              (previous) => ({
                ...previous,
                [currentStation.id]:
                  "unhealthy",
              })
            );

            return;
          }

          /*
           * Prevent duplicate recovery.
           */
          if (
            !scanning &&
            currentStation &&
            !errorRecoveryPendingRef.current
          ) {
            errorRecoveryPendingRef.current =
              true;

            recoveryStationIdRef.current =
              currentStation.id;

            recoverCurrentStation();
          }
        }}
      />

      {/* PRESET REPLACEMENT */}

      {presetToReplace !==
        null &&
        currentStation && (
          <div className="preset-confirm-overlay">
            <div className="preset-confirm">
              <div className="preset-confirm-title">
                REPLACE PRESET?
              </div>

              <div className="preset-confirm-text">
                P
                {presetToReplace +
                  1}{" "}
                already contains:
              </div>

              <div className="preset-confirm-station">
                {
                  presets[
                    presetToReplace
                  ]?.name
                }
              </div>

              <div className="preset-confirm-text">
                Replace it with:
              </div>

              <div className="preset-confirm-station">
                {
                  currentStation.name
                }
              </div>

              <div className="preset-confirm-actions">
                <button
                  onClick={() =>
                    setPresetToReplace(
                      null
                    )
                  }
                >
                  CANCEL
                </button>

                <button
                  className="confirm-replace"
                  onClick={() => {
                    setPresets(
                      (
                        previousPresets
                      ) => {
                        const updated =
                          [
                            ...previousPresets,
                          ];

                        updated[
                          presetToReplace
                        ] =
                          currentStation;

                        return updated;
                      }
                    );

                    console.log(
                      `Replaced P${
                        presetToReplace +
                        1
                      } with ${
                        currentStation.name
                      }`
                    );

                    setPresetToReplace(
                      null
                    );
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