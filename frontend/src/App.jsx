
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const CITY_DATA = {
  Hyderabad: { pm25: 28.7, pm10: 39.3 },
  Delhi: { pm25: 68.4, pm10: 112.6 },
  Bengaluru: { pm25: 22.3, pm10: 35.8 },
  Chennai: { pm25: 31.6, pm10: 48.2 },
};

function getStatus(pm25) {
  if (pm25 <= 15) return "Low";
  if (pm25 <= 35) return "Moderate";
  if (pm25 <= 75) return "Elevated";
  return "High";
}

function getSourceLabel(source) {
  if (source === "open_meteo") return "Open-Meteo estimate";
  return "Simulated demo";
}

function App() {
  const [city, setCity] = useState("Hyderabad");
  const [activeTab, setActiveTab] = useState("Overview");
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("airguard-theme") === "dark"
  );
  const [readings, setReadings] = useState([]);
  const [chartLimit, setChartLimit] = useState(10);
  const [apiOnline, setApiOnline] = useState(false);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsError, setReadingsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [addingReading, setAddingReading] = useState(false);
  const [refreshingExternal, setRefreshingExternal] = useState(false);

  useEffect(() => {
    localStorage.setItem("airguard-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    let active = true;

    async function checkApi() {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (active) setApiOnline(response.ok);
      } catch {
        if (active) setApiOnline(false);
      }
    }

    void checkApi();
    const interval = setInterval(() => void checkApi(), 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadReadings() {
      setReadingsLoading(true);
      setReadingsError("");

      try {
        const response = await fetch(
          `${API_URL}/readings?limit=50&city=${encodeURIComponent(city)}`
        );

        if (!response.ok) {
          throw new Error("The readings request failed.");
        }

        const payload = await response.json();

        if (active) {
          setReadings(
            Array.isArray(payload.readings) ? payload.readings : []
          );
        }
      } catch {
        if (active) {
          setReadings([]);
          setReadingsError(
            "Could not load saved readings. Check that the backend is running."
          );
        }
      } finally {
        if (active) setReadingsLoading(false);
      }
    }

    void loadReadings();

    return () => {
      active = false;
    };
  }, [city, refreshKey]);

  const latest = readings[0] ?? {
    pm25_ug_m3: CITY_DATA[city].pm25,
    pm10_ug_m3: CITY_DATA[city].pm10,
    status: getStatus(CITY_DATA[city].pm25),
    timestamp: new Date().toISOString(),
    data_source: "simulated",
  };

  const chartData = [...readings]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime()
    )
    .slice(-chartLimit)
    .map((reading) => ({
      ...reading,
      time: new Date(reading.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      pm25: Number(reading.pm25_ug_m3),
      pm10: Number(reading.pm10_ug_m3),
    }));

  async function addDemoReading() {
    setAddingReading(true);
    setReadingsError("");

    try {
      const response = await fetch(
        `${API_URL}/readings/demo?city=${encodeURIComponent(city)}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error("The demo reading could not be saved.");
      }

      setRefreshKey((key) => key + 1);
    } catch {
      setReadingsError(
        "Could not save a demo reading. Check that the backend is running."
      );
    } finally {
      setAddingReading(false);
    }
  }

  async function refreshExternalEstimate() {
    setRefreshingExternal(true);
    setReadingsError("");

    try {
      const response = await fetch(
        `${API_URL}/readings/external/refresh?city=${encodeURIComponent(city)}`,
        { method: "POST" }
      );
      const payload = await response.json().catch(() => ({}));

      if (response.ok === false) {
        throw new Error(
          payload.detail || "The external estimate could not be refreshed."
        );
      }

      setRefreshKey((key) => key + 1);
    } catch (error) {
      setReadingsError(
        error.message ||
          "Could not refresh the Open-Meteo estimate. Check the backend and internet connection."
      );
    } finally {
      setRefreshingExternal(false);
    }
  }

  return (
    <div className={`app${darkMode ? " dark-mode" : ""}`} data-theme={darkMode ? "dark" : "light"}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">A</span>
          <div>
            <h2>AirGuard</h2>
            <p>Air Quality Monitor</p>
          </div>
        </div>

        <nav aria-label="Main navigation">
          <button
            type="button"
            className={`nav-item ${activeTab === "Overview" ? "active" : ""}`}
            onClick={() => setActiveTab("Overview")}
            aria-current={activeTab === "Overview" ? "page" : undefined}
          >
            ◈ Overview
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === "Pollution History" ? "active" : ""}`}
            onClick={() => setActiveTab("Pollution History")}
            aria-current={activeTab === "Pollution History" ? "page" : undefined}
          >
            ▤ Pollution History
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === "Settings" ? "active" : ""}`}
            onClick={() => setActiveTab("Settings")}
            aria-current={activeTab === "Settings" ? "page" : undefined}
          >
            ⚙ Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <span
            className="status-dot"
            style={{ background: apiOnline ? "#27a77d" : "#d69b38" }}
          />
          {apiOnline ? "Backend connected" : "Backend disconnected"}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ENVIRONMENTAL INTELLIGENCE</p>
            <h1>{activeTab === "Overview" ? "Air Quality Overview" : activeTab}</h1>
            <p className="subtitle">
              {activeTab === "Overview"
                ? "Explore external model-based estimates alongside simulated demo records."
                : activeTab === "Pollution History"
                  ? `Review saved pollution readings for ${city}.`
                  : "Manage dashboard preferences and review system status."}
            </p>
          </div>
          <div className="demo-label">PROTOTYPE · SIMULATED DATA</div>
        </header>

        {activeTab === "Overview" && (
          <>
        <section className="welcome">
          <div>
            <p className="eyebrow">AIRGUARD MONITORING SYSTEM</p>
            <h2>Understand the air around you.</h2>
            <p>
              View Open-Meteo model-based estimates and simulated demonstration records.
              No physical air-quality sensor is connected yet.
            </p>
          </div>
          <div className="air-graphic" aria-hidden="true">
            <div className="air-circle">AQ</div>
            <span className="air-orbit orbit-one" />
            <span className="air-orbit orbit-two" />
          </div>
        </section>

        <section className="section-heading">
          <div>
            <h2>City monitoring</h2>
            <p>Select a city to view saved estimates and demo records</p>
          </div>

          <label className="chart-filter">
            City
            <select
              className="chart-filter-select"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            >
              {Object.keys(CITY_DATA).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="alert-panel">
          <div className="alert-icon">i</div>
          <div>
            <strong>Prototype air-quality status</strong>
            <p>
              {city} · Illustrative PM2.5 classification: {getStatus(latest.pm25_ug_m3)}.
              Not an official AQI or a real-time environmental alert.
            </p>
          </div>
          <span className="alert-tag">PROTOTYPE</span>
        </section>

        <section className="section-heading">
          <div>
            <h2>Particulate readings</h2>
            <p>{city} · Latest saved record — {getSourceLabel(latest.data_source)}</p>
          </div>
          <button
            onClick={refreshExternalEstimate}
            className="secondary-button"
            disabled={refreshingExternal || readingsLoading || apiOnline === false}
          >
            {refreshingExternal ? "Fetching estimate..." : "↻ Refresh estimate"}
          </button>
        </section>

        <section className="metrics">
          <article className="metric-card">
            <div className="metric-top">
              <span>PM2.5</span>
              <span className="metric-symbol purple">●</span>
            </div>
            <div className="metric-value">{latest.pm25_ug_m3}<small> µg/m³</small></div>
            <p>Fine particulate matter</p>
          </article>

          <article className="metric-card">
            <div className="metric-top">
              <span>PM10</span>
              <span className="metric-symbol blue">●</span>
            </div>
            <div className="metric-value">{latest.pm10_ug_m3}<small> µg/m³</small></div>
            <p>Coarse particulate matter</p>
          </article>

          <article className="metric-card">
            <div className="metric-top">
              <span>Illustrative status</span>
              <span className="metric-symbol green">●</span>
            </div>
            <div className="status-value">{latest.status}</div>
            <p>Prototype classification only</p>
          </article>

          <article className="metric-card">
            <div className="metric-top">
              <span>Displayed readings</span>
              <span className="metric-symbol orange">▤</span>
            </div>
            <div className="metric-value">{readings.length}</div>
            <p>Simulated records for {city}</p>
          </article>
        </section>

        <section className="section-heading">
          <div>
            <h2>Historical pollution</h2>
            <p>{city} · Illustrative PM2.5 and PM10 trends · µg/m³</p>
          </div>
          <label className="chart-filter">
            Show
            <select
              value={chartLimit}
              onChange={(event) => setChartLimit(Number(event.target.value))}
              className="chart-filter-select"
            >
              <option value={10}>Latest 10</option>
              <option value={25}>Latest 25</option>
              <option value={50}>Latest 50</option>
            </select>
          </label>
        </section>

        <section className="chart-card">
          <div className="chart-summary">
            <span>{chartData.length} saved measurements · mixed sources</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 20, left: 5, bottom: 55 }}>
                <CartesianGrid stroke="#e9edf4" strokeDasharray="4 4" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#78869a", fontSize: 10 }}
                  angle={-35}
                  textAnchor="end"
                  interval="preserveStartEnd"
                  height={65}
                />
                <YAxis
                  width={55}
                  tick={{ fill: "#78869a", fontSize: 11 }}
                  label={{ value: "µg/m³", angle: -90, position: "insideLeft", fill: "#78869a", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${value} µg/m³`,
                    name === "pm25" ? "PM2.5" : "PM10",
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  height={35}
                  formatter={(value) => value === "pm25" ? "PM2.5" : "PM10"}
                />
                <Line type="monotone" dataKey="pm25" name="pm25" stroke="#8871db" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="pm10" name="pm10" stroke="#5798dc" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="table-note">
            This chart may combine Open-Meteo model-based estimates with simulated demo records.
            Neither source is a physical sensor measurement, and the status is not an official AQI.
          </p>
        </section>

        <section className="section-heading history-heading">
          <div>
            <h2>Recent readings</h2>
            <p>{city} · Saved reading history</p>
          </div>
          <button
            onClick={addDemoReading}
            className="primary-button"
            disabled={addingReading || !apiOnline}
          >
            {addingReading ? "Saving..." : "+ Add demo reading"}
          </button>
        </section>

        <section className="table-card">
          {readingsLoading && (
            <p className="table-note">Loading saved readings...</p>
          )}
          {readingsError && (
            <p className="table-note">{readingsError}</p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Time</th>
                  <th>PM2.5</th>
                  <th>PM10</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((reading, index) => (
                  <tr key={reading.id}>
                    <td>#{index + 1}</td>
                    <td>{new Date(reading.timestamp).toLocaleString()}</td>
                    <td>{reading.pm25_ug_m3}</td>
                    <td>{reading.pm10_ug_m3}</td>
                    <td><span className="status-pill">{reading.status}</span></td>
                    <td>{getSourceLabel(reading.data_source || "simulated")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">
            Records are loaded from the local SQLite database. Open-Meteo entries are
            external model-based estimates; demo entries are simulated. No physical sensor is connected.
          </p>
        </section>

          </>
        )}

        {activeTab === "Pollution History" && (
          <>
            <section className="section-heading">
              <div>
                <h2>Saved pollution readings</h2>
                <p>{city} · {readings.length} records available</p>
              </div>
              <label className="chart-filter">
                City
                <select
                  className="chart-filter-select"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                >
                  {Object.keys(CITY_DATA).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
            </section>

            {readingsLoading && <p className="table-note">Loading saved readings...</p>}
            {readingsError && <p className="table-note">{readingsError}</p>}

            <section className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>Date and time</th>
                      <th>PM2.5 (µg/m³)</th>
                      <th>PM10 (µg/m³)</th>
                      <th>Status</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readings.map((reading, index) => (
                      <tr key={reading.id ?? `${reading.timestamp}-${index}`}>
                        <td>#{index + 1}</td>
                        <td>{new Date(reading.timestamp).toLocaleString()}</td>
                        <td>{reading.pm25_ug_m3}</td>
                        <td>{reading.pm10_ug_m3}</td>
                        <td><span className="status-pill">{reading.status}</span></td>
                        <td>{getSourceLabel(reading.data_source || "simulated")}</td>
                      </tr>
                    ))}
                    {!readingsLoading && !readingsError && readings.length === 0 && (
                      <tr>
                        <td colSpan={6}>No saved readings are available for {city}.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="table-note">
                Open-Meteo entries are model-based estimates. Demo entries are simulated.
                No physical sensor is connected.
              </p>
            </section>
          </>
        )}

        {activeTab === "Settings" && (
          <>
            <section className="section-heading">
              <div>
                <h2>Dashboard preferences</h2>
                <p>These settings apply to the current dashboard session.</p>
              </div>
            </section>

            <section className="metrics">
              <article className="metric-card theme-setting-card">
                <div className="metric-top"><span>Appearance</span></div>
                <div className="theme-setting-row">
                  <div>
                    <div className="status-value">
                      {darkMode ? "Dark mode" : "Light mode"}
                    </div>
                    <p>Choose the dashboard appearance.</p>
                  </div>
                  <button
                    type="button"
                    className={`theme-toggle ${darkMode ? "is-dark" : "is-light"}`}
                    role="switch"
                    aria-label="Toggle dark mode"
                    aria-checked={darkMode}
                    title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                    onClick={() => setDarkMode((current) => !current)}
                  >
                    <span className="theme-toggle-sun" aria-hidden="true">☀</span>
                    <span className="theme-toggle-moon" aria-hidden="true">☾</span>
                    <span className="theme-toggle-thumb" aria-hidden="true" />
                  </button>
                </div>
              </article>

              <article className="metric-card">
                <div className="metric-top"><span>Monitoring city</span></div>
                <label>
                  <select
                    className="chart-filter-select"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  >
                    {Object.keys(CITY_DATA).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <p>Changing the city reloads its saved readings.</p>
              </article>

              <article className="metric-card">
                <div className="metric-top"><span>Chart history limit</span></div>
                <label>
                  <select
                    className="chart-filter-select"
                    value={chartLimit}
                    onChange={(event) => setChartLimit(Number(event.target.value))}
                  >
                    <option value={10}>Latest 10 readings</option>
                    <option value={25}>Latest 25 readings</option>
                    <option value={50}>Latest 50 readings</option>
                  </select>
                </label>
                <p>Controls the number of readings shown in the Overview chart.</p>
              </article>

              <article className="metric-card">
                <div className="metric-top"><span>Backend connection</span></div>
                <div className="status-value">{apiOnline ? "Online" : "Offline"}</div>
                <p>{apiOnline ? "The local API is responding." : "Start the FastAPI backend to load and save readings."}</p>
              </article>

              <article className="metric-card">
                <div className="metric-top"><span>Data integration</span></div>
                <div className="status-value">Prototype</div>
                <p>Model-based estimates and simulated records only. Physical sensor integration is pending.</p>
              </article>
            </section>
          </>
        )}

        <footer>
          AirGuard · Air Pollution Monitoring System
          <span>Software prototype · Sensor integration pending</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
