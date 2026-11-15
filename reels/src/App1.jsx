
import { useState, useEffect, useRef } from "react";
import {
  Heart, Share2, Radio, Play, Pause, ChevronUp, ChevronDown,
  Disc3, Info, Volume2, Headphones, LoaderCircle, RefreshCw
} from "lucide-react";
import "./App.css";

const API = "https://de1.api.radio-browser.info/json/stations/search";

function getFrequency(station) {
  if (station.frequency) return `${station.frequency} FM`;

  const match = station.name?.match(
    /\b(8[8-9](?:\.\d+)?|9\d(?:\.\d+)?|10[0-7](?:\.\d+)?)\s*(?:FM)?\b/i
  );

  return match ? `${match[1]} FM` : "DIGITAL RADIO";
}

function App() {
  const [stations, setStations] = useState([]);
  const [active, setActive] = useState(0);
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("retroRadioFavorites") || "[]");
    } catch {
      return [];
    }
  });

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("READY");
  const [showInfo, setShowInfo] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("retroRadioVolume");
    return saved === null ? 0.8 : Number(saved);
  });

  const audioRef = useRef(null);
  const skipInProgressRef = useRef(false);
const failedAttemptsRef = useRef(0);
  const touchStart = useRef(0);
  const touchMoved = useRef(false);
  const lastTap = useRef(0);

  const station = stations[active] || null;
  const isFavorite = station
    ? favorites.some(item => item.id === station.id)
    : false;


  function skipBrokenStation() {
  if (skipInProgressRef.current || !stations.length) return;

  skipInProgressRef.current = true;
  failedAttemptsRef.current += 1;

  console.warn(
    `Station failed. Skipping... (${failedAttemptsRef.current}/${stations.length})`
  );

  if (failedAttemptsRef.current >= stations.length) {
    setPlaying(false);
    setStreamStatus("NO WORKING STATIONS");
    skipInProgressRef.current = false;
    failedAttemptsRef.current = 0;
    return;
  }

  setStreamStatus("SKIPPING STATION");

  setActive(current => (current + 1) % stations.length);
}


  // Load real Radio Browser stations.
  async function loadStations() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        hidebroken: "true",
        //has_geo_info: "true",
        country: "India",
        order: "votes",
        reverse: "true",
        limit: "100",
      });

      const response = await fetch(`${API}?${params}`);

      if (!response.ok) {
        throw new Error(`Radio Browser returned ${response.status}`);
      }

      const data = await response.json();

      const normalized = data
        .map(item => ({
          id: item.stationuuid,
          name: item.name,
          country: item.country,
          state: item.state,
          language: item.language,
          codec: item.codec,
          bitrate: item.bitrate,
          streamUrl: item.url_resolved || item.url,
          favicon: item.favicon || "",
          homepage: item.homepage || "",
          tags: item.tags || "",
          frequency: item.frequency || null,
        }))
        .filter(item => item.id && item.streamUrl);

      const unique = Array.from(
        new Map(normalized.map(item => [item.id, item])).values()
      );

      if (!unique.length) {
        throw new Error("No playable stations found.");
      }

      setStations(unique);
      setActive(0);
    } catch (err) {
      console.error("Station loading failed:", err);
      setError("Couldn't load stations. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStations();
  }, []);

  // Keep favorites synchronized with the original RadioWave app.
  useEffect(() => {
    localStorage.setItem("retroRadioFavorites", JSON.stringify(favorites));
  }, [favorites]);

  // Persist volume.
  useEffect(() => {
    localStorage.setItem("retroRadioVolume", String(volume));

    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Switch streams when the selected station changes.
  
useEffect(() => {
  const audio = audioRef.current;

  if (!audio || !station) return;

  const nextUrl = station.streamUrl;

  if (audio.src !== nextUrl) {
    audio.src = nextUrl;
    audio.load();
  }

  if (playing) {
    setStreamStatus("CONNECTING");

    audio.play().catch(err => {
      console.error("Playback failed:", err);
      skipBrokenStation();
    });
  } else {
    audio.pause();
    setStreamStatus("READY");
  }
}, [active, stations, playing]);


  function next() {
    if (!stations.length) return;
    setActive(current => (current + 1) % stations.length);
    setShowInfo(false);
  }

  function previous() {
    if (!stations.length) return;
    setActive(current => (current - 1 + stations.length) % stations.length);
    setShowInfo(false);
  }

  function toggleFavorite() {
    if (!station) return;

    setFavorites(current =>
      current.some(item => item.id === station.id)
        ? current.filter(item => item.id !== station.id)
        : [...current, station]
    );
  }

  function togglePlay() {
    if (!station) return;
    setPlaying(current => !current);
  }

  async function handleShare() {
    if (!station) return;

    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("station", station.id);

    const shareData = {
      title: station.name,
      text: `Listen to ${station.name} on RadioWave Reels`,
      url: url.toString(),
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url.toString());
        alert("Station link copied!");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Sharing failed:", err);
      }
    }
  }

  // Double tap to favorite.
  function handleArtworkTap() {
    const now = Date.now();

    if (now - lastTap.current < 300) {
      toggleFavorite();
    }

    lastTap.current = now;
  }

  // Support shared station links.
  useEffect(() => {
    if (!stations.length) return;

    const sharedId = new URLSearchParams(window.location.search).get("station");

    if (!sharedId) return;

    const index = stations.findIndex(item => item.id === sharedId);

    if (index >= 0) {
      setActive(index);
    }
  }, [stations]);

  // Keyboard navigation.
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === "INPUT") return;

      if (e.key === "ArrowDown") next();
      if (e.key === "ArrowUp") previous();

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stations]);

  if (loading) {
    return (
      <main className="reels-app loading-screen">
        <LoaderCircle className="loading-spinner" size={38} />
        <h2>Finding your frequency...</h2>
        <p>Discovering live radio stations</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="reels-app loading-screen">
        <Radio size={42} />
        <h2>Signal lost</h2>
        <p>{error}</p>
        <button className="retry-button" onClick={loadStations}>
          <RefreshCw size={16} /> Try again
        </button>
      </main>
    );
  }

  return (
    <main
  className="reels-app"
  onClick={(e) => {
  if (touchMoved.current) {
    touchMoved.current = false;
    return;
  }

  if (e.target.closest("button, input, a")) return;

  togglePlay();
}}
>
      
<audio
  ref={audioRef}
  preload="none"
  onLoadStart={() => setStreamStatus("CONNECTING")}
  onPlaying={() => {
    skipInProgressRef.current = false;
    failedAttemptsRef.current = 0;

    setPlaying(true);
    setStreamStatus("ON AIR");
  }}
  onWaiting={() => setStreamStatus("BUFFERING")}
  onError={() => {
    console.warn("Audio stream failed:", station?.name);
    skipBrokenStation();
  }}
  onPause={() => {
    if (audioRef.current?.src && !audioRef.current.ended) {
      // Status is updated by the playback controls.
    }
  }}
/>


      <header className="topbar">
        <div className="reels-brand">
          <span className="brand-icon">r.</span>
          <span>radio<span className="brand-light">wave</span></span>
          <span className="reels-label">REELS</span>
        </div>

        <div className="live-indicator">
          <span className="live-dot" /> DISCOVER
        </div>
      </header>

      <section
        className="reel-stage"
        onTouchStart={e => {
  touchStart.current = e.touches[0].clientY;
  touchMoved.current = false;
}}

onTouchEnd={e => {
  const diff = touchStart.current - e.changedTouches[0].clientY;

  if (Math.abs(diff) > 50) {
    touchMoved.current = true;

    if (diff > 0) {
      next();
    } else {
      previous();
    }
  }
}}
      >
        <div
  className="station-art"
  onClick={handleArtworkTap}
>
  {station.favicon && (
    <>
      <div
        className="station-backdrop"
        style={{ backgroundImage: `url("${station.favicon}")` }}
      />
      <img
        className="station-logo"
        src={station.favicon}
        alt={station.name}
        onError={e => {
          e.currentTarget.style.display = "none";
        }}
      />
    </>
  )}

  <div className="art-glow" />
  <div className="art-ring ring-one" />
  <div className="art-ring ring-two" />

  {!station.favicon && (
    <div className="station-emoji">♫</div>
  )}
</div>

        <div className="station-details">
          <div className="station-category">
            {station.country || "INTERNATIONAL"} · {station.codec || "LIVE RADIO"}
          </div>

          <h1>{station.name}</h1>

          <p>
            {station.tags
              ? station.tags.split(",").slice(0, 3).join(" · ")
              : "Your next favourite sound is waiting."}
          </p>

          <div className="station-status">
            <Radio size={14} /> {streamStatus}
          </div>
        </div>

        <aside className="action-rail">
          <button
            className={`action-button ${isFavorite ? "liked" : ""}`}
            onClick={toggleFavorite}
          >
            <Heart fill={isFavorite ? "currentColor" : "none"} />
            <span>{isFavorite ? "Saved" : "Like"}</span>
          </button>

          <button className="action-button" onClick={handleShare}>
            <Share2 />
            <span>Share</span>
          </button>

          <button className="action-button" onClick={() => setShowInfo(!showInfo)}>
            <Info />
            <span>Details</span>
          </button>

          <button className="action-button" onClick={togglePlay}>
            {playing ? <Pause /> : <Play />}
            <span>{playing ? "Pause" : "Play"}</span>
          </button>
        </aside>

        {showInfo && (
          <div className="info-panel">
            <button className="info-close" onClick={() => setShowInfo(false)}>×</button>
            <span>STATION INFORMATION</span>
            <h2>{station.name}</h2>
            <p>{station.country} {station.state && `· ${station.state}`}</p>
            <p>{station.language || "Language not listed"}</p>
            <p>{station.codec} · {station.bitrate || "Unknown"} kbps</p>
            {station.homepage && (
              <a href={station.homepage} target="_blank" rel="noreferrer">
                Station website ↗
              </a>
            )}
          </div>
        )}

        <div className="vertical-navigation">
          <button onClick={previous} aria-label="Previous station">
            <ChevronUp />
          </button>
          <span>{String(active + 1).padStart(2, "0")} / {String(stations.length).padStart(2, "0")}</span>
          <button onClick={next} aria-label="Next station">
            <ChevronDown />
          </button>
        </div>
      </section>

      <footer className="bottom-bar">
        <div className="bottom-now-playing">
          <div className="mini-disc"><Disc3 /></div>
          <div>
            <strong>{station.name}</strong>
            <span>{playing ? "Streaming live" : "Ready to play"}</span>
          </div>
        </div>

        <div className="bottom-hint">
          <Headphones size={16} /> SWIPE TO EXPLORE
        </div>

        <div className="bottom-volume">
          <Volume2 size={17} />
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
          />
        </div>
      </footer>
    </main>
  );
}

export default App;
