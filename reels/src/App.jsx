import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Heart, Share2, Radio, Play, Pause, ChevronUp, ChevronDown,
  Disc3, Info, Volume2, Headphones, LoaderCircle, RefreshCw,
  Compass, History, Settings, SlidersHorizontal, RotateCcw, Search,
  ArrowLeft, X, Check, Globe2
} from "lucide-react";
import "./App.css";

const API = "https://de1.api.radio-browser.info/json/stations/search";
const FAVORITES_KEY = "retroRadioFavorites";
const VOLUME_KEY = "retroRadioVolume";
const SETTINGS_KEY = "radioWaveReelsSettings";
const HISTORY_KEY = "radioWaveReelsHistory";

const DEFAULT_SETTINGS = {
  country: "India",
  region: "",
  language: "",
  limit: 100,
  hideBroken: true,
  geoOnly: false,
  minBitrate: 0,
  sort: "votes",
  autoplay: false,
  autoSkip: true,
  theme: "dark",
  animations: true,
};

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia",
  "Germany", "France", "Japan", "Brazil", "United Arab Emirates",
  "Sri Lanka", "Nepal", "Pakistan", "Bangladesh"
];

const LIMITS = [25, 50, 66, 100, 200];

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeStation(item) {
  return {
    id: item.stationuuid,
    name: item.name || "Unknown station",
    country: item.country || "",
    state: item.state || "",
    language: item.language || "",
    codec: item.codec || "",
    bitrate: item.bitrate || 0,
    streamUrl: item.url_resolved || item.url,
    favicon: item.favicon || "",
    homepage: item.homepage || "",
    tags: item.tags || "",
    votes: item.votes || 0,
  };
}

function App() {
  const [stations, setStations] = useState([]);
  const [active, setActive] = useState(0);
  const [favorites, setFavorites] = useState(() => readJSON(FAVORITES_KEY, []));
  const [history, setHistory] = useState(() => readJSON(HISTORY_KEY, []));
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...readJSON(SETTINGS_KEY, {}),
  }));
  const [draftSettings, setDraftSettings] = useState(settings);
  const [section, setSection] = useState("discover");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [streamStatus, setStreamStatus] = useState("READY");
  const [showInfo, setShowInfo] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(VOLUME_KEY);
    return saved === null ? 0.8 : Number(saved);
  });
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 650px)").matches
  );
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const audioRef = useRef(null);
  const touchStart = useRef(null);
  const skipLock = useRef(false);
  const failedCount = useRef(0);
  const noticeTimer = useRef(null);

  const station = stations[active] || null;
  const isFavorite = station ? favorites.some(item => item.id === station.id) : false;

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2200);
  }, []);

  const loadStations = useCallback(async (prefs = settings, quiet = false) => {
    try {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");

      const params = new URLSearchParams({
        country: prefs.country || "India",
        limit: String(prefs.limit || 100),
        order: prefs.sort === "name" ? "name" : "votes",
        reverse: prefs.sort === "name" ? "false" : "true",
      });
      if (prefs.hideBroken) params.set("hidebroken", "true");
      if (prefs.geoOnly) params.set("has_geo_info", "true");
      if (prefs.region.trim()) params.set("state", prefs.region.trim());
      if (prefs.language.trim()) params.set("language", prefs.language.trim());
      if (prefs.minBitrate > 0) params.set("bitrateMin", String(prefs.minBitrate));

      const response = await fetch(`${API}?${params.toString()}`);
      if (!response.ok) throw new Error(`Radio Browser returned ${response.status}`);
      const data = await response.json();
      let list = data.map(normalizeStation).filter(item => item.id && item.streamUrl);
      list = [...new Map(list.map(item => [item.id, item])).values()];

      if (prefs.sort === "random") {
        list = list.map(item => ({ item, key: Math.random() }))
          .sort((a, b) => a.key - b.key).map(entry => entry.item);
      }

      if (!list.length) throw new Error("No stations matched these filters. Try widening your discovery settings.");
      setStations(list);
      setActive(0);
      failedCount.current = 0;
      skipLock.current = false;
      if (quiet) showNotice(`${list.length} stations loaded`);
    } catch (err) {
      console.error("Station loading failed:", err);
      if (!quiet || !stations.length) {
        setError(err.message || "Couldn't load stations. Check your internet connection and try again.");
      } else {
        showNotice("Couldn't refresh stations");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [settings, stations.length, showNotice]);

  useEffect(() => { loadStations(settings); }, []); // Initial discovery only.

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 650px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener?.("change", updateLayout);
    return () => mediaQuery.removeEventListener?.("change", updateLayout);
  }, []);

  useEffect(() => {
    // Mobile uses full element volume so the phone's hardware volume buttons
    // control the listening level. Keep the user's desktop slider preference.
    localStorage.setItem(VOLUME_KEY, String(volume));
    if (audioRef.current) audioRef.current.volume = isMobileLayout ? 1 : volume;
  }, [volume, isMobileLayout]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;
    if (audio.src !== station.streamUrl) {
      audio.src = station.streamUrl;
      audio.load();
    }
    if (playing) {
      setStreamStatus("CONNECTING");
      audio.play().catch(err => {
        console.warn("Playback failed:", err);
        if (settings.autoSkip) skipBrokenStation();
        else {
          setPlaying(false);
          setStreamStatus("UNAVAILABLE");
          showNotice("This station could not be played");
        }
      });
    } else {
      audio.pause();
      setStreamStatus("READY");
    }
  }, [active, stations, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!station) return;
    setHistory(current => [
      station,
      ...current.filter(item => item.id !== station.id),
    ].slice(0, 50));
  }, [station?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!station || !playing) return;
    const sharedId = new URLSearchParams(window.location.search).get("station");
    if (sharedId) {
      const index = stations.findIndex(item => item.id === sharedId);
      if (index >= 0) setActive(index);
    }
  }, [stations]); // eslint-disable-line react-hooks/exhaustive-deps

  function skipBrokenStation() {
    if (skipLock.current || !stations.length) return;
    skipLock.current = true;
    failedCount.current += 1;
    if (failedCount.current >= stations.length) {
      setPlaying(false);
      setStreamStatus("NO WORKING STATIONS");
      showNotice("No playable stations found in this list");
      skipLock.current = false;
      failedCount.current = 0;
      return;
    }
    setStreamStatus("SKIPPING");
    setActive(current => (current + 1) % stations.length);
  }

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

  function selectStation(item) {
    const index = stations.findIndex(entry => entry.id === item.id);
    if (index >= 0) {
      setActive(index);
      setSection("discover");
      setPlaying(settings.autoplay);
    } else {
      // A saved station may not be in the current discovery result.
      setStations(current => [item, ...current.filter(entry => entry.id !== item.id)]);
      setActive(0);
      setSection("discover");
      setPlaying(settings.autoplay);
    }
  }

  function toggleFavorite(item = station) {
    if (!item) return;
    setFavorites(current => current.some(entry => entry.id === item.id)
      ? current.filter(entry => entry.id !== item.id)
      : [item, ...current]);
  }

  function togglePlay() {
    if (!station) return;
    setPlaying(value => !value);
  }

  async function handleShare(item = station) {
    if (!item) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("station", item.id);
    const data = {
      title: item.name,
      text: `Listen to ${item.name} on RadioWave Reels`,
      url: url.toString(),
    };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url.toString());
        showNotice("Station link copied");
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Sharing failed:", err);
    }
  }

  function updateDraft(key, value) {
    setDraftSettings(current => ({ ...current, [key]: value }));
  }

  function saveSettings() {
    setSettings(draftSettings);
    setSection("discover");
    loadStations(draftSettings, true);
    showNotice("Preferences saved");
  }

  function resetSettings() {
    setDraftSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    loadStations(DEFAULT_SETTINGS, true);
    showNotice("Settings restored to defaults");
  }

  const filteredFavorites = useMemo(() => favorites.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  ), [favorites, search]);

  const filteredHistory = useMemo(() => history.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  ), [history, search]);

  useEffect(() => {
    function onKey(e) {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (section !== "discover") return;
      if (e.key === "ArrowDown") next();
      if (e.key === "ArrowUp") previous();
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stations, section, playing]);

  const navItems = [
    { id: "discover", label: "Discover", icon: Compass },
    { id: "liked", label: "Liked", icon: Heart },
    { id: "history", label: "Recently Played", icon: History },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  if (loading) {
    return <main className="reels-app loading-screen">
      <LoaderCircle className="loading-spinner" size={38} />
      <h2>Finding your frequency...</h2>
      <p>Discovering live radio stations</p>
    </main>;
  }

  if (error && !stations.length) {
    return <main className="reels-app loading-screen">
      <Radio size={42} />
      <h2>Signal lost</h2>
      <p>{error}</p>
      <button className="primary-button" onClick={() => loadStations(settings)}>
        <RefreshCw size={16} /> Try again
      </button>
    </main>;
  }

  return (
    <main className={`reels-app ${settings.animations ? "" : "no-animations"}`}>
      <header className="topbar">
        <div className="reels-brand">
          <span className="brand-icon">r.</span>
          <span>radio<span className="brand-light">wave</span></span>
          <span className="reels-label">REELS</span>
        </div>
        <div className="topbar-right">
          {section === "discover" && <span className="live-indicator"><i className="live-dot" /> DISCOVER</span>}
          {section === "discover" && <span className="station-count">{String(active + 1).padStart(2, "0")} / {String(stations.length).padStart(2, "0")}</span>}
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-caption">YOUR RADIO</div>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${section === id ? "active" : ""}`}
              onClick={() => { setSection(id); setSearch(""); }}>
              <Icon size={19} />
              <span>{label}</span>
              {id === "liked" && favorites.length > 0 && <b>{favorites.length}</b>}
            </button>
          ))}
          <div className="sidebar-footer">
            <span className="sidebar-pulse" /> {stations.length} stations available
          </div>
        </aside>

        <section className="main-content">
          {section === "discover" && station && <>
            <section className="reel-stage"
              onTouchStart={e => { touchStart.current = e.touches[0].clientY; }}
              onTouchEnd={e => {
                if (touchStart.current === null) return;
                const diff = touchStart.current - e.changedTouches[0].clientY;
                if (Math.abs(diff) > 50) diff > 0 ? next() : previous();
                touchStart.current = null;
              }}>
              <div
                className="station-art"
                onClick={(e) => {
                  // Tapping the artwork toggles playback; dedicated controls keep their own actions.
                  if (e.target.closest("button, a")) return;
                  togglePlay();
                }}
                onDoubleClick={() => toggleFavorite()}
                role="button"
                tabIndex={0}
                aria-label={playing ? "Pause station" : "Play station"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePlay();
                  }
                }}
              >
                {station.favicon && <>
                  <div className="station-backdrop" style={{ backgroundImage: `url("${station.favicon}")` }} />
                  <img className="station-logo" src={station.favicon} alt="" onError={e => { e.currentTarget.style.display = "none"; }} />
                </>}
                <div className="art-glow" />
                <div className="art-ring ring-one" />
                <div className="art-ring ring-two" />
                {!station.favicon && <div className="station-emoji">♫</div>}
                <div className="art-bottom-gradient" />
                <div className="station-details"><h1>{station.name}</h1><span className="station-status"><i className="live-dot" /> {streamStatus}</span></div>
                <div className="art-controls">
                  <button onClick={previous} aria-label="Previous station"><ChevronUp /></button>
                  <button className="main-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                    {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                  </button>
                  <button onClick={next} aria-label="Next station"><ChevronDown /></button>
                </div>
              </div>
              <aside className="action-rail">
                <button className={`action-button ${isFavorite ? "liked" : ""}`} onClick={() => toggleFavorite()}>
                  <Heart fill={isFavorite ? "currentColor" : "none"} /><span>{isFavorite ? "Saved" : "Like"}</span>
                </button>
                <button className="action-button" onClick={() => handleShare()}><Share2 /><span>Share</span></button>
                <button className="action-button" onClick={() => setShowInfo(value => !value)}><Info /><span>Details</span></button>
              </aside>
              {showInfo && <div className="info-panel">
                <button className="info-close" onClick={() => setShowInfo(false)}><X /></button>
                <span>STATION INFORMATION</span><h2>{station.name}</h2>
                <p>{station.country}{station.state ? ` · ${station.state}` : ""}</p>
                <p>{station.language || "Language not listed"}</p>
                <p>{station.codec || "Stream"} · {station.bitrate || "Unknown"} kbps</p>
                {station.homepage && <a href={station.homepage} target="_blank" rel="noreferrer">Station website ↗</a>}
              </div>}
            </section>
            <footer className="player-footer">
              <div className="now-playing"><div className="mini-disc"><Disc3 /></div><div><strong>{station.name}</strong><span>{playing ? "Streaming live" : "Ready to play"}</span></div></div>
              <div className="swipe-hint"><Headphones size={16} /> SWIPE TO EXPLORE</div>
              <label className="volume-control"><Volume2 size={17} /><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))} /></label>
            </footer>
          </>}

          {(section === "liked" || section === "history") && (
            <div className="library-page">
              <div className="page-heading">
                <div><span className="eyebrow">{section === "liked" ? "YOUR COLLECTION" : "YOUR LISTENING"}</span>
                  <h1>{section === "liked" ? "Liked stations" : "Recently played"}</h1>
                  <p>{section === "liked" ? `${favorites.length} stations saved` : `${history.length} stations in your history`}</p>
                </div>
                <div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a station..." /></div>
              </div>
              {(() => {
                const items = section === "liked" ? filteredFavorites : filteredHistory;
                return items.length ? <div className="station-grid">{items.map(item => (
                  <article className="station-card" key={item.id}>
                    <button className="station-card-main" onClick={() => selectStation(item)}>
                      <div className="card-art">{item.favicon ? <img src={item.favicon} alt="" onError={e => { e.currentTarget.style.display = "none"; }} /> : <Radio size={30} />}</div>
                      <div className="card-copy"><strong>{item.name}</strong><span>{item.country || "Radio station"}{item.state ? ` · ${item.state}` : ""}</span></div>
                      <Play size={17} />
                    </button>
                    <div className="card-actions">
                      <button onClick={() => toggleFavorite(item)} title={favorites.some(f => f.id === item.id) ? "Remove from liked" : "Add to liked"}>
                        <Heart size={17} fill={favorites.some(f => f.id === item.id) ? "currentColor" : "none"} />
                      </button>
                      <button onClick={() => handleShare(item)} title="Share station"><Share2 size={17} /></button>
                    </div>
                  </article>
                ))}</div> : <div className="empty-state"><div className="empty-icon">{section === "liked" ? <Heart /> : <History />}</div>
                  <h2>{section === "liked" ? "No liked stations yet" : "Nothing played yet"}</h2>
                  <p>{section === "liked" ? "Tap the heart while discovering stations to save them here." : "Stations you listen to will show up here."}</p>
                  <button className="primary-button" onClick={() => setSection("discover")}><Compass size={16} /> Explore stations</button>
                </div>;
              })()}
            </div>
          )}

          {section === "settings" && (
            <div className="settings-page">
              <div className="page-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h1>Settings</h1><p>Choose what you want to hear and how Reels behaves.</p></div></div>
              <div className="settings-grid">
                <section className="settings-card">
                  <div className="settings-card-title"><Globe2 /><div><h2>Station discovery</h2><p>Choose the stations that appear in Discover.</p></div></div>
                  <label className="field-label">Country</label>
                  <select value={draftSettings.country} onChange={e => updateDraft("country", e.target.value)}>
                    {COUNTRIES.map(country => <option key={country} value={country}>{country}</option>)}
                  </select>
                  <label className="field-label">State / Region <small>Optional; type the region name</small></label>
                  <input value={draftSettings.region} onChange={e => updateDraft("region", e.target.value)} placeholder={draftSettings.country === "India" ? "e.g. Telangana" : "Any region"} />
                  <label className="field-label">Language <small>Optional; use the station language name</small></label>
                  <input value={draftSettings.language} onChange={e => updateDraft("language", e.target.value)} placeholder="e.g. Hindi, English" />
                  <label className="field-label">Maximum stations</label>
                  <div className="choice-row">{LIMITS.map(limit => <button key={limit} className={Number(draftSettings.limit) === limit ? "choice selected" : "choice"} onClick={() => updateDraft("limit", limit)}>{limit}</button>)}</div>
                  <label className="field-label">Minimum bitrate</label>
                  <select value={draftSettings.minBitrate} onChange={e => updateDraft("minBitrate", Number(e.target.value))}>
                    <option value={0}>Any quality</option><option value={32}>32 kbps</option><option value={64}>64 kbps</option><option value={96}>96 kbps</option><option value={128}>128 kbps</option><option value={192}>192 kbps</option>
                  </select>
                  <label className="field-label">Sort stations</label>
                  <select value={draftSettings.sort} onChange={e => updateDraft("sort", e.target.value)}>
                    <option value="votes">Most popular</option><option value="name">Station name</option><option value="random">Random discovery</option>
                  </select>
                </section>

                <section className="settings-card">
                  <div className="settings-card-title"><SlidersHorizontal /><div><h2>Filters & playback</h2><p>Fine-tune station quality and player behaviour.</p></div></div>
                  <SettingToggle title="Hide broken stations" description="Ask Radio Browser to exclude stations marked broken." checked={draftSettings.hideBroken} onChange={v => updateDraft("hideBroken", v)} />
                  <SettingToggle title="Require location data" description="Only include stations with geographic information." checked={draftSettings.geoOnly} onChange={v => updateDraft("geoOnly", v)} />
                  <SettingToggle title="Autoplay selected station" description="Start playing when you choose a station from a list." checked={draftSettings.autoplay} onChange={v => updateDraft("autoplay", v)} />
                  <SettingToggle title="Skip failed streams" description="Automatically move to the next station if playback fails." checked={draftSettings.autoSkip} onChange={v => updateDraft("autoSkip", v)} />
                  <div className="settings-divider" />
                  <div className="settings-card-title compact"><Disc3 /><div><h2>Appearance</h2><p>Adjust the Reels screen.</p></div></div>
                  <label className="field-label">Theme</label>
                  <select value={draftSettings.theme} onChange={e => updateDraft("theme", e.target.value)}><option value="dark">Dark</option><option value="amoled">AMOLED black</option></select>
                  <SettingToggle title="Artwork animations" description="Show the animated rings and visual effects." checked={draftSettings.animations} onChange={v => updateDraft("animations", v)} />
                </section>
              </div>
              <div className="settings-actions">
                <button className="secondary-button" onClick={resetSettings}><RotateCcw size={16} /> Reset defaults</button>
                <button className="primary-button" onClick={saveSettings}><Check size={16} /> Save & refresh stations</button>
              </div>
              <p className="settings-note">Your preferences are saved on this device. Liked stations continue using the shared RadioWave favourites list.</p>
            </div>
          )}
        </section>
      </div>

      <nav className="mobile-nav">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "active" : ""} onClick={() => { setSection(id); setSearch(""); }}>
          <Icon size={20} /><span>{id === "history" ? "History" : label}</span>
        </button>)}
      </nav>

      <audio ref={audioRef} preload="none"
        onLoadStart={() => setStreamStatus("CONNECTING")}
        onPlaying={() => { skipLock.current = false; failedCount.current = 0; setPlaying(true); setStreamStatus("ON AIR"); }}
        onWaiting={() => setStreamStatus("BUFFERING")}
        onError={() => {
          console.warn("Audio stream failed:", station?.name);
          if (settings.autoSkip) skipBrokenStation();
          else { setPlaying(false); setStreamStatus("UNAVAILABLE"); }
        }} />
      {refreshing && <div className="refresh-indicator"><LoaderCircle size={15} /> Updating stations…</div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

function SettingToggle({ title, description, checked, onChange }) {
  return <div className="setting-toggle">
    <div><strong>{title}</strong><p>{description}</p></div>
    <button className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
  </div>;
}

export default App;
