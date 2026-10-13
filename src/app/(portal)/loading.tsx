export default function PortalLoading() {
  return (
    <div className="command-center" aria-busy="true" aria-label="Loading workspace">
      <section className="page-heading command-header obsidian-panel glass-container">
        <div className="command-header-main">
          <p className="eyebrow">LOADING WORKSPACE</p>
          <h1>Preparing your command center…</h1>
          <p className="muted">
            Fetching real-time projects, milestones, tasks, and workspace telemetry.
          </p>
        </div>
      </section>
      <div className="stats-grid command-kpi-grid">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="stat-card command-kpi-card glass-container"
            style={{ minHeight: "128px", opacity: 0.65 }}
          >
            <p className="muted small">Synchronizing metric…</p>
          </div>
        ))}
      </div>
    </div>
  );
}
