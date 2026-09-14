import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, BrainCircuit, ChevronDown, Clock3,
  Database, FileSpreadsheet, FolderKanban, Gauge, History as HistoryIcon, Home,
  LogOut, Menu, Moon, MoreHorizontal, Plus, Search, Settings, ShieldCheck,
  Sparkles, Target, Upload, UserRound, WandSparkles, X, Zap, Sun, Check, Trash2
} from "lucide-react";
import { api } from "./services/api";

const navItems = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "models", label: "Models", icon: BrainCircuit },
  { id: "predictions", label: "Predictions", icon: Target },
  { id: "whatif", label: "What-if Analysis", icon: WandSparkles },
  { id: "history", label: "History", icon: HistoryIcon }
];

function isPracticalWhatIfFeature(name) {
  const n = String(name || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const compact = n.replace(/_/g, "");
  if (!n) return false;
  // Always keep identifiers and identity/demographic fields read-only.
  const exact = new Set([
    "id", "studentid", "userid", "user_id", "recordid", "record_id", "rowid", "row_id",
    "index", "name", "fullname", "full_name", "email", "phone", "dob", "dateofbirth",
    "date_of_birth", "birthdate", "birth_date", "gender", "sex", "age"
  ]);
  if (exact.has(n) || exact.has(compact)) return false;
  if (n.endsWith("_id") || n.endsWith("id") || n.includes("identifier") || n.includes("record_number")) return false;
  // Past/historical/outcome values are context, not current levers.
  const historical = ["previous", "prev_", "past", "prior", "historical", "history", "last_", "baseline", "old_", "former", "earlier"];
  if (historical.some(t => n.includes(t))) return false;
  if (n.includes("timestamp") || n.includes("created_at") || n.includes("updated_at") || n.includes("date_of_birth") || n.includes("birth_date")) return false;
  if (n.includes("outcome") || n.endsWith("_result")) return false;
  // Common measurable/actionable controls should remain editable even when
  // their values are unique across the dataset.
  const actionableTokens = [
    "attendance", "completion", "study_hours", "hours_per_day",
    "practice", "exercise", "training", "bathroom", "bedroom",
    "garage", "pool", "neighborhood", "sqft", "square_feet",
    "internet_access", "access", "commute", "distance_to_center",
    "quality", "spending", "budget", "price", "income", "salary",
    "experience", "rating", "credit_limit", "utilization"
  ];
  if (actionableTokens.some(t => n.includes(t))) return true;
  return true;
}

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("predictorx_user") || "null"); }
  catch { return null; }
}


function Landing({ onGetStarted }) {
  return <div className="landing-page">
    <nav className="landing-nav">
      <button className="brand brand-button landing-brand" onClick={() => window.scrollTo({top:0, behavior:"smooth"})}>
        <span className="brand-mark"><Sparkles size={17}/></span>
        <span>Predictor<span className="brand-x">X</span></span>
      </button>
      <div className="landing-nav-actions">
        <button className="landing-link" onClick={() => onGetStarted("login")}>Sign In</button>
        <button className="new-btn" onClick={() => onGetStarted("signup")}>Get Started <ArrowRight size={15}/></button>
      </div>
    </nav>
    <section className="landing-hero">
      <div className="landing-glow landing-glow-a"/>
      <div className="landing-glow landing-glow-b"/>
      <div className="landing-badge"><Sparkles size={14}/> AI-POWERED MACHINE LEARNING</div>
      <h1>Turn your data into<br/><span>confident predictions.</span></h1>
      <p>PredictorX automates dataset analysis, model selection, prediction, and explainability — all in one intelligent workspace.</p>
      <div className="landing-cta">
        <button className="primary-btn compact" onClick={() => onGetStarted("signup")}>Start predicting <ArrowRight size={16}/></button>
        <button className="landing-secondary" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({behavior:"smooth"})}>See how it works</button>
      </div>
      <div className="landing-dashboard">
        <div className="landing-window">
          <div className="landing-window-head"><span/><span/><span/><label>PredictorX / AI Workspace</label></div>
          <div className="landing-window-body">
            <div className="mock-sidebar">
              <div className="mock-logo"><span className="brand-mark"><Sparkles size={10}/></span> Predictor<span>X</span></div>
              <i/><i/><i/><i/><i/>
            </div>
            <div className="mock-main">
              <small>AI PREDICTION WORKSPACE</small><h3>Your next prediction<br/><em>starts with your data.</em></h3>
              <div className="mock-stats"><b><span>DATASETS</span><strong>12</strong><small>uploaded</small></b><b><span>MODELS</span><strong>36</strong><small>evaluated</small></b><b><span>BEST SCORE</span><strong>94.8%</strong><small>cross-validated</small></b></div>
              <div className="mock-chart">
                <div className="mock-chart-title"><span>Model performance</span><strong>94.8%</strong></div>
                <div className="mock-chart-area"><i/><i/><i/><i/><i/><i/><i/></div>
                <div className="mock-chart-labels"><span>LR</span><span>RF</span><span>XGB</span><span>ET</span><span>GB</span><span>CAT</span><span>BEST</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section className="landing-features" id="how-it-works">
      <div><span><Database size={19}/></span><h3>Upload your data</h3><p>Bring a CSV dataset into your private workspace.</p></div>
      <div><span><BrainCircuit size={19}/></span><h3>AutoML does the work</h3><p>Analyze, train, compare, and recommend suitable models.</p></div>
      <div><span><Target size={19}/></span><h3>Predict & explain</h3><p>Generate predictions and understand why the model decided.</p></div>
    </section>
    <footer className="landing-footer"><span>© 2026 PredictorX</span><button onClick={() => onGetStarted("signup")}>Create your workspace <ArrowRight size={13}/></button></footer>
  </div>;
}

function Auth({ mode, setMode, onAuth, onHome }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const data = mode === "signup"
        ? await api.signup(form)
        : await api.login({ email: form.email, password: form.password });
      if (mode === "signup" && data.status === "pending") {
        setSuccess(data.message || "Account created. Please wait for admin approval before signing in.");
        setForm({ name: "", email: form.email, password: "" });
        setMode("login");
        return;
      }
      localStorage.setItem("predictorx_token", data.access_token);
      localStorage.setItem("predictorx_user", JSON.stringify(data.user));
      onAuth(data.user);
    } catch (err) {
      setError(err.message || "Unable to connect to PredictorX API");
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-glow glow-a" /><div className="auth-glow glow-b" />
      <div className="auth-card">
        <button className="brand brand-center brand-button auth-brand" onClick={() => onHome()} title="PredictorX Home"><span className="brand-mark"><Sparkles size={18}/></span><span>Predictor<span className="brand-x">X</span></span></button><button className="auth-home-link" onClick={() => onHome()}><Home size={13}/> Home</button>
        <div className="eyebrow">{mode === "signup" ? "CREATE YOUR WORKSPACE" : "WELCOME BACK"}</div>
        <h1>{mode === "signup" ? "Start predicting." : "Welcome back."}</h1>
        <p className="auth-sub">{mode === "signup" ? "Build your ML workspace in minutes." : "Sign in to continue to your AI workspace."}</p>
        <form onSubmit={submit}>
          {mode === "signup" && <input placeholder="Full name" value={form.name} onChange={e => setForm({...form, name:e.target.value})} required />}
          <input type="email" placeholder="Email address" value={form.email} onChange={e => setForm({...form, email:e.target.value})} required />
          <input type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} required />
          {success && <div className="success-box">{success}</div>}{error && <div className="error-box">{error}</div>}
          <button className="primary-btn" disabled={loading}>{loading ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"} <ArrowRight size={17}/></button>
        </form>
        <div className="auth-switch">{mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => {setMode(mode === "signup" ? "login" : "signup"); setError("");}}>{mode === "signup" ? "Sign In" : "Create Account"}</button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, user, onLogout, theme, toggleTheme }) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("predictorx_workspace") || "My Workspace");

  const chooseWorkspace = (name) => {
    setWorkspace(name);
    localStorage.setItem("predictorx_workspace", name);
    setWorkspaceOpen(false);
  };

  return (
    <aside className="sidebar">
      <button className="brand brand-button" onClick={() => setActive("overview")} title="Go to PredictorX overview"><span className="brand-mark"><Sparkles size={17}/></span><span>Predictor<span className="brand-x">X</span></span></button>
      <div className="workspace-wrap">
        <button className="workspace workspace-button" onClick={() => setWorkspaceOpen(v => !v)} aria-expanded={workspaceOpen}>
          <div className="workspace-icon"><Gauge size={16}/></div>
          <div><small>WORKSPACE</small><strong>{workspace}</strong></div>
          <ChevronDown size={15} className={workspaceOpen ? "muted rotate" : "muted"}/>
        </button>
        {workspaceOpen && <div className="workspace-menu">
          <button onClick={() => chooseWorkspace("My Workspace")}><span className="workspace-dot"/>My Workspace{workspace === "My Workspace" && <Check size={14}/>}</button>
          <button onClick={() => chooseWorkspace("ML Experiments")}><span className="workspace-dot"/>ML Experiments{workspace === "ML Experiments" && <Check size={14}/>}</button>
          <button onClick={() => chooseWorkspace("College Project")}><span className="workspace-dot"/>College Project{workspace === "College Project" && <Check size={14}/>}</button>
          <div className="workspace-menu-divider"/>
          <button className="workspace-create" onClick={() => { chooseWorkspace("New Workspace"); alert("Workspace created locally. You can rename it later in Settings."); }}> <Plus size={14}/> Create workspace</button>
        </div>}
      </div>
      <div className="side-label">MAIN MENU</div>
      <nav>{navItems.map(({id,label,icon:Icon}) =>
        <button key={id} className={active === id ? "nav-item active" : "nav-item"} onClick={() => setActive(id)}><Icon size={18}/><span>{label}</span>{id==="predictions" && <em>3</em>}</button>
      )}</nav>
      {user?.role === "admin" && <><div className="side-label admin-side-label">ADMINISTRATION</div><button className={active === "admin" ? "nav-item active admin-nav" : "nav-item admin-nav"} onClick={() => setActive("admin")}><ShieldCheck size={18}/><span>Admin Dashboard</span></button></>}
      <div className="side-spacer"/>
      <div className="side-label">WORKSPACE</div>
      <button className={active === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActive("settings")}><Settings size={18}/><span>Settings</span></button>
      <button className="nav-item theme-side" onClick={toggleTheme}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}<span>{theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
      <button className="nav-item logout-nav" onClick={onLogout}><LogOut size={18}/><span>Logout</span></button>
      <div className="upgrade-card">
        <div className="upgrade-icon"><Zap size={16}/></div>
        <strong>Unlock more AI</strong>
        <p>Train bigger models and advanced analysis.</p>
        <button onClick={() => alert("Pro workspace coming in a later phase.")}>Explore Pro <ArrowRight size={14}/></button>
      </div>
      <div className="profile">
        <div className="avatar">{(user?.name || "K").slice(0,1).toUpperCase()}</div>
        <div className="profile-info"><strong>{user?.name || "Kaif"}</strong><span>{user?.email || "user@example.com"}</span></div>
        <button className="icon-btn" onClick={onLogout} title="Logout"><LogOut size={16}/></button>
      </div>
    </aside>
  );
}
function StatCard({ icon:Icon, label, value, note, positive }) {
  return <div className="stat-card">
    <div className="stat-top"><div className="stat-icon"><Icon size={18}/></div><span className={positive ? "trend up" : "trend"}>{positive || "—"}</span></div>
    <div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div>
  </div>;
}

function EmptyState({ setActive }) {
  return <div className="empty-workspace">
    <div className="empty-orbit"><div className="empty-core"><Upload size={27}/></div></div>
    <h2>Bring your data to life</h2>
    <p>Upload a CSV dataset and PredictorX will analyze it, select suitable ML models, and prepare your prediction workspace.</p>
    <button className="primary-btn compact" onClick={() => setActive("datasets")}><Upload size={16}/> Upload CSV <ArrowRight size={16}/></button>
    <div className="empty-hint"><ShieldCheck size={15}/> Your dataset stays inside your workspace.</div>
  </div>;
}

function Overview({ user, setActive, onSearch, theme, toggleTheme }) {
  const firstName = (user?.name || "Kaif").split(" ")[0];
  const token = localStorage.getItem("predictorx_token");
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadSummary = async () => {
      try {
        const [ds, ms] = await Promise.all([api.listDatasets(token), api.listModels(token)]);
        if (!cancelled) {
          setDatasets(ds.datasets || []);
          setModels(ms.models || []);
        }
      } catch (_) {
        if (!cancelled) { setDatasets([]); setModels([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadSummary();
    return () => { cancelled = true; };
  }, [token]);

  const best = models.find(m => m.is_best) || models[0];
  const bestMetric = best?.metrics?.primary_metric;
  const bestScore = typeof bestMetric === "number" ? `${(bestMetric * 100).toFixed(1)}%` : "—";

  return <main className="content">
    <header className="topbar">
      <div><div className="page-kicker">AI PREDICTION WORKSPACE</div><h1>Good to see you, {firstName}.</h1><p>Turn your data into confident decisions.</p></div>
      <div className="top-actions"><button className="icon-btn" onClick={onSearch} title="Search"><Search size={18}/></button><button className="icon-btn" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="new-btn" onClick={() => setActive("datasets")}><Plus size={17}/> New Project</button></div>
    </header>
    <section className="hero-panel">
      <div className="hero-copy"><div className="hero-badge"><Sparkles size={14}/> AI-POWERED AUTOMATION</div><h2>Your next prediction<br/><span>starts with your data.</span></h2><p>Upload a CSV to automatically profile your dataset, find the right target, compare models, and build a prediction workflow.</p><button className="primary-btn compact" onClick={() => setActive("datasets")}>Start with a dataset <ArrowRight size={16}/></button></div>
      <div className="hero-visual"><div className="mini-window"><div className="mini-head"><span/><span/><span/><label>PredictorX / AutoML</label></div><div className="mini-chart"><div className="chart-line"/></div><div className="mini-bars"><i style={{height:"35%"}}/><i style={{height:"52%"}}/><i style={{height:"44%"}}/><i style={{height:"72%"}}/><i style={{height:"61%"}}/><i style={{height:"88%"}}/><i style={{height:"77%"}}/></div><div className="floating-score"><small>MODEL SCORE</small><strong>{bestScore}</strong><span>{best ? best.name : "Waiting for model"}</span></div></div></div>
    </section>
    <div className="stats-grid">
      <StatCard icon={FileSpreadsheet} label="Datasets" value={loading ? "…" : String(datasets.length)} note={datasets.length ? `${datasets.length} uploaded dataset${datasets.length === 1 ? "" : "s"}` : "No datasets uploaded"} />
      <StatCard icon={BrainCircuit} label="Models trained" value={loading ? "…" : String(models.length)} note={models.length ? `${models.length} trained model${models.length === 1 ? "" : "s"}` : "AutoML is ready"} />
      <StatCard icon={Target} label="Predictions" value="0" note="Prediction history coming next" />
      <StatCard icon={Activity} label="Best accuracy" value={bestScore} note={best ? `${best.name} recommended` : "Train a model to see score"} />
    </div>
    <section className="lower-grid">
      <div className="panel"><div className="panel-head"><div><h3>Recent projects</h3><p>Your latest datasets and models will appear here.</p></div><button className="text-btn" onClick={() => setActive("datasets")}>View all <ArrowRight size={14}/></button></div>
        {datasets.length ? <div className="dataset-list">{datasets.slice(0,3).map(d => <button className="dataset-row" key={d.id} onClick={() => setActive("datasets")}><span className="dataset-file-icon"><FileSpreadsheet size={18}/></span><span className="dataset-name"><strong>{d.name}</strong><small>{d.rows.toLocaleString()} rows · {d.columns} columns</small></span><ArrowRight size={16}/></button>)}</div> : <EmptyState setActive={setActive}/>} 
      </div>
      <div className="panel quick-panel"><div className="panel-head"><div><h3>Quick start</h3><p>Build your ML workflow.</p></div></div>
        {[['1','Upload data','Add your CSV dataset.','datasets'],['2','Train models','Let AutoML compare models.','models'],['3','Make predictions','Use the best model on new data.','predictions']].map(([n,t,d,id]) => <button className="quick-row" key={n} onClick={() => setActive(id)}><span className="step">{n}</span><span><strong>{t}</strong><small>{d}</small></span><ArrowRight size={15}/></button>)}
      </div>
    </section>
  </main>;
}

function formatBytes(bytes=0) {
  if (!bytes) return "0 B";
  const units = ["B","KB","MB","GB"];
  const i = Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1);
  return `${(bytes/Math.pow(1024,i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function DatasetDetail({ dataset, onBack }) {
  if (!dataset) return null;
  const a = dataset;
  return <div className="dataset-detail-wrap">
    <div className="dataset-detail-head">
      <button className="outline-btn" onClick={onBack}>← Back to datasets</button>
      <div><div className="page-kicker">DATASET PROFILE</div><h2>{a.name}</h2><p>Uploaded CSV analyzed by PredictorX.</p></div>
    </div>
    <div className="analysis-stat-grid">
      <div className="analysis-stat"><span>ROWS</span><strong>{a.rows.toLocaleString()}</strong></div>
      <div className="analysis-stat"><span>COLUMNS</span><strong>{a.columns}</strong></div>
      <div className="analysis-stat"><span>MISSING VALUES</span><strong>{a.missing_total}</strong><small>{a.missing_percentage}% of cells</small></div>
      <div className="analysis-stat"><span>DUPLICATES</span><strong>{a.duplicate_rows}</strong></div>
    </div>
    <div className="analysis-grid">
      <div className="panel"><div className="panel-head"><div><h3>Column profile</h3><p>PredictorX detected these feature types.</p></div></div>
        <div className="type-columns"><div><h4><span className="type-dot numeric"/> Numerical ({a.numerical_columns.length})</h4>{a.numerical_columns.length ? a.numerical_columns.map(x=><span className="column-chip" key={x}>{x}</span>) : <em>None detected</em>}</div>
        <div><h4><span className="type-dot categorical"/> Categorical ({a.categorical_columns.length})</h4>{a.categorical_columns.length ? a.categorical_columns.map(x=><span className="column-chip" key={x}>{x}</span>) : <em>None detected</em>}</div></div>
      </div>
      <div className="panel"><div className="panel-head"><div><h3>Target candidates</h3><p>Columns that may be suitable prediction targets.</p></div></div>
        <div className="candidate-list">{a.target_candidates?.length ? a.target_candidates.map(c=><div className="candidate" key={c.name}><span><strong>{c.name}</strong><small>{c.reason}</small></span><b>{c.unique_values} unique</b></div>) : <div className="mini-empty">No obvious target candidate detected.</div>}</div>
      </div>
    </div>
    <div className="panel"><div className="panel-head"><div><h3>Data preview</h3><p>First {Math.min(a.preview?.length || 0, 8)} rows from the uploaded CSV.</p></div><span className="status-pill"><span/> Analysis complete</span></div>
      <div className="preview-table-wrap">{a.preview?.length ? <table className="preview-table"><thead><tr>{a.column_names.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{a.preview.map((row,i)=><tr key={i}>{a.column_names.map(c=><td key={c}>{row[c] === null || row[c] === undefined ? <span className="null-cell">null</span> : String(row[c])}</td>)}</tr>)}</tbody></table> : <div className="mini-empty">No preview available.</div>}</div>
    </div>
    {Object.keys(a.missing_by_column || {}).length > 0 && <div className="panel"><div className="panel-head"><div><h3>Missing-value report</h3><p>Columns containing missing cells.</p></div></div><div className="missing-list">{Object.entries(a.missing_by_column).map(([name,count])=><div className="missing-row" key={name}><strong>{name}</strong><span>{count} missing</span></div>)}</div></div>}
  </div>;
}

function Datasets({ setActive, user }) {
  const [drag, setDrag] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const token = localStorage.getItem("predictorx_token");

  const load = async () => {
    setLoading(true); setError("");
    try { const data = await api.listDatasets(token); setDatasets(data.datasets || []); }
    catch (e) { setError(e.message || "Unable to load datasets"); }
    finally { setLoading(false); }
  };
  React.useEffect(() => { load(); }, []);

  const upload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("Only CSV files are supported."); return; }
    setUploading(true); setError("");
    try {
      const data = await api.uploadDataset(token, file);
      setSelected(data.dataset);
      await load();
    } catch (e) { setError(e.message || "Dataset upload failed"); }
    finally { setUploading(false); }
  };

  if (selected) return <main className="content"><DatasetDetail dataset={selected} onBack={() => setSelected(null)}/></main>;

  return <main className="content">
    <header className="topbar"><div><div className="page-kicker">DATA MANAGEMENT</div><h1>Datasets</h1><p>Upload a CSV and PredictorX will profile it automatically before modeling.</p></div><label className="new-btn upload-label"><Upload size={17}/> {uploading ? "Analyzing…" : "Upload CSV"}<input type="file" accept=".csv,text/csv" hidden disabled={uploading} onChange={e => upload(e.target.files?.[0])}/></label></header>
    {error && <div className="error-box dataset-error">{error}</div>}
    <div className={"upload-zone " + (drag ? "drag" : "") + (uploading ? " uploading" : "")} onDragOver={e => {e.preventDefault();setDrag(true)}} onDragLeave={() => setDrag(false)} onDrop={e => {e.preventDefault();setDrag(false);upload(e.dataTransfer.files?.[0])}}>
      <div className="upload-icon">{uploading ? <Activity size={27}/> : <FileSpreadsheet size={27}/>}</div>
      <h2>{uploading ? "Analyzing your dataset…" : "Drop your CSV here"}</h2><p>{uploading ? "Reading structure, missing values, feature types and target candidates." : "or choose a file from your computer"}</p>
      <label className="primary-btn compact upload-label"><Upload size={16}/> {uploading ? "Please wait…" : "Choose CSV"}<input type="file" accept=".csv,text/csv" hidden disabled={uploading} onChange={e => upload(e.target.files?.[0])}/></label>
      <div className="upload-meta"><span>CSV only</span><span>•</span><span>Max 15 MB</span><span>•</span><span>Automatic analysis</span></div>
    </div>
    <div className="panel info-panel"><div className="info-icon"><ShieldCheck size={19}/></div><div><h3>What PredictorX analyzes</h3><p>Rows & columns, missing values, numerical/categorical features, duplicate rows, target candidates, and a safe data preview.</p></div></div>
    <div className="panel"><div className="panel-head"><div><h3>My datasets</h3><p>{datasets.length ? `${datasets.length} dataset${datasets.length === 1 ? "" : "s"} in your workspace.` : "No datasets in this workspace yet."}</p></div><button className="text-btn" onClick={load}>Refresh</button></div>
      {loading ? <div className="table-empty"><Activity size={25}/><strong>Loading datasets…</strong></div> : datasets.length ? <div className="dataset-list">{datasets.map(d => <button className="dataset-row" key={d.id} onClick={async()=>{try{const r=await api.getDataset(token,d.id);setSelected(r.dataset)}catch(e){setError(e.message)}}}><span className="dataset-file-icon"><FileSpreadsheet size={18}/></span><span className="dataset-name"><strong>{d.name}</strong><small>{formatBytes(d.size_bytes)} · uploaded {new Date(d.created_at).toLocaleString()}</small></span><span className="dataset-metrics"><b>{d.rows.toLocaleString()}</b><small>rows</small></span><span className="dataset-metrics"><b>{d.columns}</b><small>columns</small></span><span className="dataset-metrics"><b>{d.missing_values}</b><small>missing</small></span><ArrowRight size={16}/></button>)}</div> : <div className="table-empty"><Database size={28}/><strong>No datasets yet</strong><span>Upload your first CSV to start automatic dataset analysis.</span><button className="text-btn" onClick={() => setActive("overview")}>Back to overview <ArrowRight size={14}/></button></div>}
    </div>
  </main>;
}

function Models({ token }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [detail, setDetail] = useState(null);
  const [target, setTarget] = useState("");
  const [task, setTask] = useState("auto");
  const [models, setModels] = useState([]);
  const [training, setTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    try { const [ds, ms] = await Promise.all([api.listDatasets(token), api.listModels(token)]); setDatasets(ds.datasets || []); setModels(ms.models || []); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const chooseDataset = async (id) => {
    setSelectedDataset(String(id)); setError("");
    try { const r = await api.getDataset(token, id); setDetail(r.dataset); const c = r.dataset.target_candidates?.[0]?.name || r.dataset.column_names?.[r.dataset.column_names.length-1] || ""; setTarget(c); } catch(e) { setError(e.message); }
  };
  const train = async () => {
    if (!selectedDataset || !target) return;
    setTraining(true); setError("");
    try { const r = await api.trainModels(token, selectedDataset, target, task === "auto" ? "" : task); setModels(r.models || []); await load(); }
    catch(e) { setError(e.message); } finally { setTraining(false); }
  };
  const removeModel = async (id, name) => {
    if (!window.confirm(`Delete model "${name}"? Its prediction history will also be deleted.`)) return;
    setError("");
    try { await api.deleteModel(token, id); await load(); } catch (e) { setError(e.message || "Unable to delete model"); }
  };
  const fmt = (v) => typeof v === "number" ? (v * 100).toFixed(1) + "%" : "—";
  const current = models.filter(m => String(m.dataset_id) === String(selectedDataset) && m.target === target);
  const visible = current.length ? current : models;
  const best = visible.find(m => m.is_best) || visible[0];
  return <main className="content"><header className="topbar"><div><div className="page-kicker">AUTOMATED MACHINE LEARNING</div><h1>Models</h1><p>Train, compare and select the strongest model from your uploaded dataset.</p></div><div className="status-pill"><span/> AutoML engine</div></header>
    {error && <div className="error-box dataset-error">{error}</div>}
    <div className="automl-builder panel"><div className="panel-head"><div><h3>Start AutoML training</h3><p>Choose a dataset and target. PredictorX will infer the problem type and train suitable algorithms.</p></div></div>
      <div className="automl-controls">
        <label><span>Dataset</span><select value={selectedDataset} onChange={e => chooseDataset(e.target.value)}><option value="">Select a dataset</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name} · {d.rows} rows</option>)}</select></label>
        <label><span>Target column</span><select value={target} onChange={e => setTarget(e.target.value)} disabled={!detail}><option value="">Select target</option>{(detail?.column_names || []).map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label><span>Problem type</span><select value={task} onChange={e => setTask(e.target.value)}><option value="auto">Auto-detect</option><option value="classification">Classification</option><option value="regression">Regression</option></select></label>
        <button className="primary-btn compact train-btn" disabled={training || !selectedDataset || !target} onClick={train}>{training ? <><Activity size={16}/> Training…</> : <><Zap size={16}/> Train models</>}</button>
      </div>
      {detail && <div className="target-hint"><Check size={14}/> {detail.rows.toLocaleString()} rows · {detail.columns} columns · Suggested targets: {(detail.target_candidates || []).slice(0,4).map(c=>c.name).join(", ") || "none"}</div>}
    </div>
    {loading ? <div className="panel table-empty"><Activity size={25}/><strong>Loading AutoML workspace…</strong></div> : !visible.length ? <div className="model-empty panel"><div className="model-icon"><BrainCircuit size={31}/></div><h2>No models trained yet</h2><p>Upload a dataset, select a target, then click <b>Train models</b>. PredictorX will actually train multiple algorithms on your data and compare their metrics.</p><div className="model-features"><span><Zap size={14}/> Automatic model selection</span><span><BarChart3 size={14}/> Metric comparison</span><span><Sparkles size={14}/> Best-model recommendation</span></div></div> : <>
      {best && <div className="best-model panel"><div className="best-badge"><Sparkles size={14}/> RECOMMENDED</div><div><small>Best model</small><h2>{best.name}</h2><p>{best.task_type || "Model"} · target <b>{best.target || target}</b></p></div><div className="best-score"><span>{best.metrics?.primary_label || "Primary score"}</span><strong>{fmt(best.metrics?.primary_metric)}</strong></div></div>}
      <div className="panel"><div className="panel-head"><div><h3>Model comparison</h3><p>{visible.length} trained model{visible.length===1?"":"s"}. Higher primary score is better.</p></div><button className="text-btn" onClick={load}>Refresh</button></div><div className="model-table">{visible.map((m,i)=><div className={"model-row "+(m.is_best?"winner":"")} key={m.id || i}><div className="model-rank">{i+1}</div><div className="model-name"><strong>{m.name}</strong>{m.is_best && <span>Best</span>}<small>{m.target ? `Target: ${m.target}` : ""}</small></div><div className="metric"><small>Primary</small><strong>{fmt(m.metrics?.primary_metric)}</strong></div><div className="metric"><small>{m.task_type === "regression" ? "R²" : "Accuracy"}</small><strong>{fmt(m.task_type === "regression" ? m.metrics?.r2 : m.metrics?.accuracy)}</strong></div><div className="metric"><small>{m.task_type === "regression" ? "RMSE" : "F1"}</small><strong>{m.task_type === "regression" ? (m.metrics?.rmse ?? "—") : fmt(m.metrics?.f1)}</strong></div><button className="icon-btn danger" title="Delete model" onClick={() => removeModel(m.id, m.name)}><Trash2 size={16}/></button></div>)}</div></div>
    </>}
  </main>;
}

function Predictions({ token }) {
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [targets, setTargets] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [detail, setDetail] = useState(null);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [error, setError] = useState("");

  const datasetModels = models.filter(m => String(m.dataset_id) === String(selectedDataset));
  const targetModels = datasetModels.filter(m => m.target === selectedTarget);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [ds, ms] = await Promise.all([api.listDatasets(token), api.listModels(token)]);
      const datasetRows = ds.datasets || [];
      const modelRows = ms.models || [];
      setDatasets(datasetRows);
      setModels(modelRows);

      if (!modelRows.length) {
        setSelectedDataset(""); setTargets([]); setSelectedTarget(""); setSelectedModel(""); setDetail(null);
        return;
      }

      const firstDataset = modelRows.find(m => m.is_best)?.dataset_id || modelRows[0].dataset_id;
      const nextDataset = String(firstDataset);
      setSelectedDataset(nextDataset);

      const nextTargets = [...new Set(modelRows.filter(m => String(m.dataset_id) === nextDataset).map(m => m.target))];
      setTargets(nextTargets);
      const bestForDataset = modelRows.find(m => String(m.dataset_id) === nextDataset && m.is_best);
      const nextTarget = bestForDataset?.target || nextTargets[0] || "";
      setSelectedTarget(nextTarget);

      const candidates = modelRows.filter(m => String(m.dataset_id) === nextDataset && m.target === nextTarget);
      const best = candidates.find(m => m.is_best) || candidates[0];
      if (best) await chooseModel(best.id);
    } catch (e) { setError(e.message || "Unable to load trained models"); }
    finally { setLoading(false); }
  };

  const chooseDataset = (id) => {
    setSelectedDataset(String(id));
    setSelectedTarget("");
    setSelectedModel("");
    setDetail(null);
    setValues({});
    setResult(null);
    setError("");
    const nextTargets = [...new Set(models.filter(m => String(m.dataset_id) === String(id)).map(m => m.target))];
    setTargets(nextTargets);
    const best = models.find(m => String(m.dataset_id) === String(id) && m.is_best);
    const nextTarget = best?.target || nextTargets[0] || "";
    setSelectedTarget(nextTarget);
    if (nextTarget) {
      const candidates = models.filter(m => String(m.dataset_id) === String(id) && m.target === nextTarget);
      const bestModel = candidates.find(m => m.is_best) || candidates[0];
      if (bestModel) chooseModel(bestModel.id);
    }
  };

  const chooseTarget = (target) => {
    setSelectedTarget(target);
    setSelectedModel(""); setDetail(null); setValues({}); setResult(null); setError("");
    const candidates = models.filter(m => String(m.dataset_id) === String(selectedDataset) && m.target === target);
    const best = candidates.find(m => m.is_best) || candidates[0];
    if (best) chooseModel(best.id);
  };

  const chooseModel = async (id) => {
    if (!id) { setSelectedModel(""); setDetail(null); setResult(null); return; }
    setSelectedModel(String(id)); setResult(null); setExplanation(null); setError("");
    try {
      const r = await api.getModel(token, id);
      setDetail(r.model);
      const initial = {};
      (r.model.features || []).forEach(f => {
        initial[f.name] = f.type === "number" && f.median !== undefined ? String(f.median) : (f.options?.[0] || "");
      });
      setValues(initial);
    } catch (e) { setError(e.message || "Unable to load model details"); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!selectedModel || !detail) return;
    setPredicting(true); setExplanation(null); setError("");
    try { const r = await api.predict(token, selectedModel, values); setResult(r); setHistoryId(r.history_id || null); }
    catch (e) { setError(e.message || "Prediction failed"); }
    finally { setPredicting(false); }
  };

  const explain = async () => {
    if (!selectedModel || !result) return;
    setExplaining(true); setError("");
    try { const r = await api.explain(token, selectedModel, values, historyId); setExplanation(r.explanation); }
    catch (e) { setError(e.message || "Unable to generate SHAP explanation"); }
    finally { setExplaining(false); }
  };

  const fmt = v => typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—";

  return <main className="content">
    <header className="topbar">
      <div><div className="page-kicker">INFERENCE</div><h1>Predictions</h1><p>Choose a dataset, target and trained model, then generate a real prediction from its features.</p></div>
      <button className="text-btn" onClick={load}>Refresh</button>
    </header>
    {error && <div className="error-box dataset-error">{error}</div>}
    {loading ? <div className="panel table-empty"><Activity size={25}/><strong>Loading trained models…</strong></div> : !models.length ? <div className="panel prediction-empty"><div className="target-icon"><BrainCircuit size={28}/></div><h2>No trained model yet</h2><p>Go to Models, choose a dataset and target, then train AutoML. Your trained model will appear here automatically.</p></div> : <>
      <div className="panel prediction-builder">
        <div className="panel-head"><div><h3>Prediction setup</h3><p>Follow the workflow: dataset → target → model. Only compatible trained models are shown at each step.</p></div></div>
        <div className="prediction-cascade">
          <label className="prediction-model-select"><span>1. Dataset</span><select value={selectedDataset} onChange={e => chooseDataset(e.target.value)}><option value="">Select dataset</option>{datasets.filter(d => models.some(m => String(m.dataset_id) === String(d.id))).map(d => <option key={d.id} value={d.id}>{d.name} · {d.rows} rows</option>)}</select></label>
          <label className="prediction-model-select"><span>2. Target</span><select value={selectedTarget} onChange={e => chooseTarget(e.target.value)} disabled={!selectedDataset}><option value="">Select target</option>{targets.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="prediction-model-select"><span>3. Trained model</span><select value={selectedModel} onChange={e => chooseModel(e.target.value)} disabled={!selectedTarget}><option value="">Select model</option>{targetModels.map(m => <option key={m.id} value={m.id}>{m.name}{m.is_best ? " · Recommended" : ""}</option>)}</select></label>
        </div>
      </div>
      {detail && <div className="prediction-layout">
        <div className="panel prediction-form-panel"><div className="panel-head"><div><h3>Input features</h3><p>Enter values for <b>{detail.target}</b>. Numeric ranges and categorical options come from the dataset.</p></div><span className="status-pill"><span/> {detail.task_type}</span></div>
          <div className="dynamic-form">{(detail.features || []).map(f => <label className="feature-field" key={f.name}><span>{f.name}</span>{f.type === "category" && f.options?.length ? <select value={values[f.name] ?? ""} onChange={e => setValues(v => ({...v, [f.name]:e.target.value}))}><option value="">Select value</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input type={f.type === "number" ? "number" : "text"} step={f.type === "number" ? "any" : undefined} value={values[f.name] ?? ""} placeholder={f.type === "number" && f.median !== undefined ? `e.g. ${f.median}` : "Enter value"} onChange={e => setValues(v => ({...v, [f.name]:e.target.value}))}/>}<small>{f.type === "number" ? (f.min !== undefined ? `Range ${f.min} – ${f.max}` : "Numeric feature") : "Categorical feature"}</small></label>)}</div>
          <button className="primary-btn prediction-btn" disabled={predicting || !(detail.features || []).length} onClick={submit}>{predicting ? <><Activity size={16}/> Predicting…</> : <><Target size={16}/> Generate prediction <ArrowRight size={16}/></>}</button>
        </div>
        <div className="panel prediction-result-panel"><div className="panel-head"><div><h3>Prediction result</h3><p>{detail.name} · {detail.dataset_name} · target <b>{detail.target}</b></p></div></div>{result ? <div className="prediction-result"><div className="result-label">PREDICTED {result.target.toUpperCase()}</div><div className="result-value">{String(result.prediction)}</div>{result.confidence !== undefined && <div className="confidence"><span>Confidence</span><strong>{fmt(result.confidence)}</strong></div>}{result.probabilities?.length ? <div className="probability-list">{result.probabilities.map(p => <div className="prob-row" key={p.class}><span>{p.class}</span><b>{fmt(p.probability)}</b><div><i style={{width:`${Math.max(2,p.probability*100)}%`}}/></div></div>)}</div> : <div className="result-note"><Sparkles size={16}/> Prediction generated by the trained {detail.name} model.</div>}</div> : <div className="result-placeholder"><Target size={26}/><span>Enter feature values and click <b>Generate prediction</b>.</span></div>}
          {result && <div className="shap-section">
            <div className="shap-head"><div><h3>Why this prediction?</h3><p>SHAP explains how each feature influenced this specific result.</p></div><button className="outline-btn" onClick={explain} disabled={explaining}>{explaining ? "Explaining…" : "Explain with SHAP"}</button></div>
            {explanation && <div className="shap-content">
              <div className="shap-summary"><span>Base value</span><strong>{Number(explanation.base_value).toFixed(3)}</strong>{explanation.predicted_class && <><span>Explained class</span><strong>{explanation.predicted_class}</strong></>}</div>
              <div className="shap-list">{(explanation.features || []).map(x => <div className="shap-row" key={x.feature}><div><strong>{x.feature}</strong><small>{x.direction} prediction</small></div><b className={x.contribution >= 0 ? "shap-positive" : "shap-negative"}>{x.contribution >= 0 ? "+" : ""}{Number(x.contribution).toFixed(4)}</b></div>)}</div>
              <div className="global-importance"><h4>Global feature importance</h4>{(explanation.global_importance || []).slice(0,8).map(x => <div className="importance-row" key={x.feature}><span>{x.feature}</span><div><i style={{width:`${Math.max(3, Math.min(100, x.importance * 100))}%`}}/></div></div>)}</div>
            </div>}
          </div>}
        </div>
      </div>}
    </>}
  </main>;
}

function WhatIf({ token }) {
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [targets, setTargets] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [detail, setDetail] = useState(null);
  const [baseline, setBaseline] = useState({});
  const [scenario, setScenario] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [error, setError] = useState("");

  const datasetModels = models.filter(m => String(m.dataset_id) === String(selectedDataset));
  const targetModels = datasetModels.filter(m => m.target === selectedTarget);

  const initialValues = (model) => {
    const values = {};
    (model?.features || []).forEach(f => {
      values[f.name] = f.type === "number" && f.median !== undefined
        ? String(f.median)
        : (f.options?.[0] || "");
    });
    return values;
  };

  const chooseModel = async (id) => {
    if (!id) { setSelectedModel(""); setDetail(null); setBaseline({}); setScenario({}); setResult(null); return; }
    setSelectedModel(String(id)); setResult(null); setRecommendations(null); setError("");
    try {
      const r = await api.getModel(token, id);
      setDetail(r.model);
      const initial = initialValues(r.model);
      setBaseline(initial);
      setScenario({...initial});
    } catch (e) { setError(e.message || "Unable to load model details"); }
  };

  const chooseDataset = (id) => {
    setSelectedDataset(String(id));
    setSelectedTarget(""); setSelectedModel(""); setDetail(null); setBaseline({}); setScenario({}); setResult(null); setRecommendations(null); setError("");
    const nextTargets = [...new Set(models.filter(m => String(m.dataset_id) === String(id)).map(m => m.target))];
    setTargets(nextTargets);
    const best = models.find(m => String(m.dataset_id) === String(id) && m.is_best);
    const nextTarget = best?.target || nextTargets[0] || "";
    setSelectedTarget(nextTarget);
    if (nextTarget) {
      const candidates = models.filter(m => String(m.dataset_id) === String(id) && m.target === nextTarget);
      const bestModel = candidates.find(m => m.is_best) || candidates[0];
      if (bestModel) chooseModel(bestModel.id);
    }
  };

  const chooseTarget = (target) => {
    setSelectedTarget(target); setSelectedModel(""); setDetail(null); setBaseline({}); setScenario({}); setResult(null); setRecommendations(null); setError("");
    const candidates = models.filter(m => String(m.dataset_id) === String(selectedDataset) && m.target === target);
    const best = candidates.find(m => m.is_best) || candidates[0];
    if (best) chooseModel(best.id);
  };

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [ds, ms] = await Promise.all([api.listDatasets(token), api.listModels(token)]);
      const dsRows = ds.datasets || [];
      const modelRows = ms.models || [];
      setDatasets(dsRows); setModels(modelRows);
      if (!modelRows.length) return;
      const firstDataset = modelRows.find(m => m.is_best)?.dataset_id || modelRows[0].dataset_id;
      const nextDataset = String(firstDataset);
      setSelectedDataset(nextDataset);
      const nextTargets = [...new Set(modelRows.filter(m => String(m.dataset_id) === nextDataset).map(m => m.target))];
      setTargets(nextTargets);
      const bestForDataset = modelRows.find(m => String(m.dataset_id) === nextDataset && m.is_best);
      const nextTarget = bestForDataset?.target || nextTargets[0] || "";
      setSelectedTarget(nextTarget);
      const candidates = modelRows.filter(m => String(m.dataset_id) === nextDataset && m.target === nextTarget);
      const best = candidates.find(m => m.is_best) || candidates[0];
      if (best) await chooseModel(best.id);
    } catch (e) { setError(e.message || "Unable to load trained models"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const simulate = async () => {
    if (!selectedModel || !detail) return;
    setSimulating(true); setResult(null); setRecommendations(null); setError("");
    try {
      const whatIfResult = await api.whatIf(token, selectedModel, scenario, baseline);
      setResult(whatIfResult);
      // Always regenerate recommendations from the exact values that were
      // just simulated. This prevents stale recommendations after an input
      // change and keeps the recommendation panel synchronized with the
      // current What-if scenario.
      try {
        const recommendationResult = await api.recommend(token, selectedModel, scenario, baseline);
        setRecommendations(recommendationResult);
      } catch (recommendationError) {
        setError(recommendationError.message || "Unable to generate recommendations");
      }
    } catch (e) { setError(e.message || "What-if simulation failed"); }
    finally { setSimulating(false); }
  };

  const updateScenario = (name, value) => {
    // Any input edit invalidates the previous simulation/recommendation.
    // The next Run what-if recalculates both from the new values.
    setScenario(v => ({...v, [name]: value}));
    setResult(null);
    setRecommendations(null);
    setError("");
  };

  const resetScenario = () => { setScenario({...baseline}); setResult(null); setRecommendations(null); };

  const getRecommendations = async () => {
    if (!selectedModel || !detail) return;
    setRecommending(true); setError("");
    try {
      setRecommendations(await api.recommend(token, selectedModel, scenario, baseline));
    } catch (e) { setError(e.message || "Unable to generate recommendations"); }
    finally { setRecommending(false); }
  };

  const fmt = v => typeof v === "number" ? `${(v * 100).toFixed(1)}%` : String(v ?? "—");

  return <main className="content">
    <header className="topbar">
      <div><div className="page-kicker">DECISION SIMULATOR</div><h1>What-if Analysis</h1><p>Change valid feature values and run the trained model again to see the real impact.</p></div>
      <button className="text-btn" onClick={load}>Refresh</button>
    </header>
    {error && <div className="error-box dataset-error">{error}</div>}
    {loading ? <div className="panel table-empty"><Activity size={25}/><strong>Loading trained models…</strong></div> : !models.length ? <div className="panel prediction-empty"><div className="whatif-orb"><WandSparkles size={28}/></div><h2>No trained model yet</h2><p>Train a model first. The simulator uses the same trained model for real what-if inference.</p></div> : <>
      <div className="panel prediction-builder">
        <div className="panel-head"><div><h3>Simulation setup</h3><p>Follow the same workflow: dataset → target → trained model.</p></div></div>
        <div className="prediction-cascade">
          <label className="prediction-model-select"><span>1. Dataset</span><select value={selectedDataset} onChange={e => chooseDataset(e.target.value)}><option value="">Select dataset</option>{datasets.filter(d => models.some(m => String(m.dataset_id) === String(d.id))).map(d => <option key={d.id} value={d.id}>{d.name} · {d.rows} rows</option>)}</select></label>
          <label className="prediction-model-select"><span>2. Target</span><select value={selectedTarget} onChange={e => chooseTarget(e.target.value)} disabled={!selectedDataset}><option value="">Select target</option>{targets.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="prediction-model-select"><span>3. Trained model</span><select value={selectedModel} onChange={e => chooseModel(e.target.value)} disabled={!selectedTarget}><option value="">Select model</option>{targetModels.map(m => <option key={m.id} value={m.id}>{m.name}{m.is_best ? " · Recommended" : ""}</option>)}</select></label>
        </div>
      </div>
      {detail && <div className="whatif-grid">
        <div className="panel whatif-form-panel">
          <div className="panel-head"><div><h3>What-if values</h3><p>Baseline is taken from the model's dataset-derived defaults. Change any feature to test a scenario.</p></div><span className="status-pill"><span/> {detail.task_type}</span></div>
          <div className="whatif-table">
            <div className="whatif-table-head"><span>Feature</span><span>Baseline</span><span>What-if</span></div>
            {(detail.features || []).map(f => {
              const editable = f.actionable !== false && isPracticalWhatIfFeature(f.name);
              return <div className="whatif-row" key={f.name}>
                <div><strong>{f.name}</strong><small>{editable ? (f.type === "number" ? `Range ${f.min} – ${f.max}` : "User-controllable feature") : (f.actionable_reason || "Not user-controllable — context only")}</small></div>
                <div className="whatif-baseline">{baseline[f.name] ?? "—"}</div>
                <div>{!editable ? <div className="whatif-locked" aria-label={`${f.name} is not user-controllable`}><span>{baseline[f.name] ?? "—"}</span><small>Read-only</small></div> : f.type === "category" && f.options?.length ? <select value={scenario[f.name] ?? ""} onChange={e => updateScenario(f.name, e.target.value)}><option value="">Select value</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input type="number" step="any" value={scenario[f.name] ?? ""} placeholder={String(f.median ?? "")} onChange={e => updateScenario(f.name, e.target.value)}/>}</div>
              </div>;
            })}
          </div>
          <div className="whatif-actions"><button className="outline-btn" onClick={resetScenario}>Reset</button><button className="outline-btn" disabled={recommending || !(detail.features || []).length} onClick={getRecommendations}>{recommending ? <><Activity size={16}/> Finding…</> : <><Sparkles size={16}/> Smart recommendations</>}</button><button className="primary-btn" disabled={simulating || !(detail.features || []).length} onClick={simulate}>{simulating ? <><Activity size={16}/> Simulating…</> : <><WandSparkles size={16}/> Run what-if</>}</button></div>
        </div>
        <div className="panel whatif-result-panel">
          <div className="panel-head"><div><h3>Simulation result</h3><p>Real inference from <b>{detail.name}</b>.</p></div></div>
          {result ? <div className="whatif-result">
            <div className="whatif-result-cards"><div><small>BASELINE</small><strong>{detail.task_type === "classification" ? fmt(result.baseline_confidence) : String(result.baseline_prediction)}</strong><span>{String(result.baseline_prediction)}</span></div><div><small>WHAT-IF</small><strong>{detail.task_type === "classification" ? fmt(result.scenario_confidence) : String(result.scenario_prediction)}</strong><span>{String(result.scenario_prediction)}</span></div></div>
            <div className={"whatif-change " + (result.change >= 0 ? "positive" : "negative")}><span>{result.change >= 0 ? "↑" : "↓"} {detail.task_type === "classification" ? `${Math.abs(result.change * 100).toFixed(1)} pp` : Math.abs(result.change).toFixed(4)}</span><small>{result.change_label}</small></div>
            {result.changed_features?.length ? <div className="changed-list"><h4>Changed features</h4>{result.changed_features.map(x => <div key={x.feature}><span>{x.feature}</span><b>{String(x.before)} → {String(x.after)}</b></div>)}</div> : <div className="result-note"><Sparkles size={16}/> No feature changed. Modify a value and run the simulator again.</div>}
            {detail.task_type === "classification" && result.scenario_probabilities?.length ? <div className="probability-list"><h4>What-if class probabilities</h4>{result.scenario_probabilities.map(p => <div className="prob-row" key={String(p.class)}><span>{String(p.class)}</span><b>{fmt(p.probability)}</b><div><i style={{width:`${Math.max(2,p.probability*100)}%`}}/></div></div>)}</div> : null}
          </div> : <div className="result-placeholder"><WandSparkles size={26}/><span>Change one or more values and click <b>Run what-if</b>.</span></div>}
          {recommendations && <div className="recommendation-box"><div className="recommendation-head"><div><h4><Sparkles size={15}/> Smart recommendations</h4><p>Based on your applied What-if changes and the trained model.</p></div></div>{recommendations.applied_changes?.length ? <div className="applied-change-box"><h5>Your applied change</h5>{recommendations.applied_changes.map((x, i) => <div className="applied-change-item" key={`${x.feature}-${i}`}><div><strong>{x.feature}</strong><p>{String(x.from)} → {String(x.to)}</p></div><span>{detail.task_type === "classification" ? `${(x.improvement * 100).toFixed(1)} pp` : `+${Number(x.improvement).toFixed(4)}`}</span></div>)}</div> : null}<div className="additional-recommendations-label">Additional smart suggestions</div>{recommendations.recommendations?.filter(r => isPracticalWhatIfFeature(r.feature)).length ? <div className="recommendation-list">{recommendations.recommendations.filter(r => isPracticalWhatIfFeature(r.feature)).map((r, i) => <div className="recommendation-item" key={`${r.feature}-${i}`}><div className="recommendation-top"><strong>{r.feature}</strong><span>Expected improvement: {detail.task_type === "classification" ? `${(r.improvement * 100).toFixed(1)} pp` : r.improvement.toFixed(4)}</span></div><div className="recommendation-change"><b>{String(r.from)} → {String(r.to)}</b><span>{detail.task_type === "classification" ? `Probability: ${(r.probability * 100).toFixed(1)}%` : `Predicted value: ${String(r.recommended_prediction)}`}</span></div><p>{r.why}</p></div>)}</div> : <div className="result-note"><Sparkles size={16}/> {detail.task_type === "classification" && result?.scenario_confidence >= 0.999 ? "The current prediction is already at 100%, so no additional actionable improvement is available for this scenario." : "No additional positive counterfactual was found within the values observed in this dataset."}</div>}</div>}
        </div>
      </div>}
    </>}
  </main>;
}

function History({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(null);
  const load = async () => { setLoading(true); setError(""); try { const r = await api.listHistory(token); setRows(r.history || []); } catch (e) { setError(e.message || "Unable to load prediction history"); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const remove = async (id) => { if (!window.confirm("Delete this prediction history record?")) return; try { await api.deleteHistory(token, id); setRows(v => v.filter(x => x.id !== id)); if (expanded === id) setExpanded(null); } catch (e) { setError(e.message || "Unable to delete history"); } };
  const filtered = rows.filter(h => `${h.model_name} ${h.target} ${h.prediction?.prediction ?? ""} ${h.prediction?.dataset_name ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <main className="content"><header className="topbar"><div><div className="page-kicker">ACTIVITY</div><h1>Prediction History</h1><p>Review predictions, inputs, models and explanations from your workspace.</p></div><button className="text-btn" onClick={load}>Refresh</button></header>
    {error && <div className="error-box dataset-error">{error}</div>}
    {loading ? <div className="panel table-empty"><Activity size={25}/><strong>Loading prediction history…</strong></div> : !rows.length ? <div className="panel history-empty"><Clock3 size={29}/><h2>No prediction history</h2><p>Generate a prediction and it will be recorded here automatically with its timestamp, model, result and input values.</p></div> : <div className="panel history-panel"><div className="panel-head"><div><h3>Prediction runs</h3><p>{filtered.length} of {rows.length} record{rows.length === 1 ? "" : "s"}</p></div><div className="history-tools"><div className="search-mini"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search history…"/></div></div></div><div className="history-list">{filtered.map(h => { const pred = h.prediction || {}; return <div className="history-card" key={h.id}><div className="history-main"><div className="history-icon"><Target size={17}/></div><div className="history-info"><strong>{String(pred.prediction ?? "—")}</strong><span>{h.model_name} · {h.target}</span><small>{pred.dataset_name || `Dataset #${h.dataset_id}`} · {new Date(h.created_at).toLocaleString()}</small></div><div className="history-meta">{pred.confidence !== undefined && <span>Confidence {(Number(pred.confidence) * 100).toFixed(1)}%</span>}{h.has_explanation && <span className="history-badge">SHAP</span>}</div><button className="text-btn small" onClick={() => setExpanded(expanded === h.id ? null : h.id)}>{expanded === h.id ? "Hide details" : "View details"}</button><button className="icon-btn danger" title="Delete history" onClick={() => remove(h.id)}><Trash2 size={16}/></button></div>{expanded === h.id && <div className="history-details"><div><h4>Input values</h4>{Object.entries(h.input || {}).map(([k,v]) => <div className="history-detail-row" key={k}><span>{k}</span><b>{String(v)}</b></div>)}</div>{h.has_explanation && h.explanation && <div><h4>SHAP explanation</h4><div className="history-explanation-summary"><span>Base value <b>{Number(h.explanation.base_value ?? 0).toFixed(3)}</b></span>{h.explanation.predicted_class && <span>Class <b>{h.explanation.predicted_class}</b></span>}</div>{(h.explanation.features || []).slice(0,8).map(x => <div className="history-detail-row" key={x.feature}><span>{x.feature}</span><b className={x.contribution >= 0 ? "shap-positive" : "shap-negative"}>{x.contribution >= 0 ? "+" : ""}{Number(x.contribution).toFixed(4)}</b></div>)}</div>}</div>}</div>})}{!filtered.length && <div className="history-empty compact"><Search size={23}/><strong>No matching history</strong><span>Try a different search term.</span></div>}</div></div>}
  </main>;
}

function SettingsPage({ user }) {
  return <main className="content"><header className="topbar"><div><div className="page-kicker">WORKSPACE</div><h1>Settings</h1><p>Manage your PredictorX workspace preferences.</p></div></header>
    <div className="settings-grid"><div className="panel setting-card"><div className="setting-icon"><UserRound size={19}/></div><h3>Profile</h3><p>Name</p><strong>{user?.name || "Kaif"}</strong><p>Email</p><strong>{user?.email || "—"}</strong></div><div className="panel setting-card"><div className="setting-icon"><ShieldCheck size={19}/></div><h3>Security</h3><p>Your account uses password hashing and JWT-based authentication.</p><div className="security-ok"><span/> Authentication active</div></div></div>
  </main>;
}

function AdminDashboard({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const load = async () => { setLoading(true); setError(""); try { const r = await api.adminUsers(token); setUsers(r.users || []); } catch (e) { setError(e.message || "Unable to load users"); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const setStatus = async (id, status) => { setBusy(`${id}:${status}`); setError(""); try { const r = await api.adminSetUserStatus(token, id, status); setUsers(v => v.map(u => u.id === id ? r.user : u)); } catch (e) { setError(e.message || "Unable to update user"); } finally { setBusy(null); } };
  const counts = { pending: users.filter(u => u.status === "pending").length, active: users.filter(u => u.status === "active").length, rejected: users.filter(u => u.status === "rejected").length, inactive: users.filter(u => u.status === "inactive").length };
  return <main className="content"><header className="topbar"><div><div className="page-kicker">ADMINISTRATION</div><h1>Admin Dashboard</h1><p>Review accounts, approve new users, and manage workspace access.</p></div><button className="text-btn" onClick={load}>Refresh</button></header>
    {error && <div className="error-box dataset-error">{error}</div>}
    <div className="admin-stats"><div className="panel admin-stat"><span>Pending</span><strong>{counts.pending}</strong><small>Awaiting approval</small></div><div className="panel admin-stat"><span>Active</span><strong>{counts.active}</strong><small>Can use PredictorX</small></div><div className="panel admin-stat"><span>Rejected</span><strong>{counts.rejected}</strong><small>Access denied</small></div><div className="panel admin-stat"><span>Inactive</span><strong>{counts.inactive}</strong><small>Temporarily disabled</small></div></div>
    <div className="panel admin-panel"><div className="panel-head"><div><h3>User management</h3><p>Approval is enforced by the backend, not only by the interface.</p></div></div>
      {loading ? <div className="table-empty"><Activity size={24}/><strong>Loading users…</strong></div> : <div className="admin-users">{users.map(u => <div className="admin-user-row" key={u.id}><div className="admin-avatar">{(u.name || "U").slice(0,1).toUpperCase()}</div><div className="admin-user-main"><strong>{u.name}</strong><span>{u.email}</span><small>Joined {new Date(u.created_at).toLocaleString()}</small></div><span className={`status-pill status-${u.status}`}>{u.status}</span><span className={`role-pill ${u.role === "admin" ? "role-admin" : ""}`}>{u.role}</span><div className="admin-actions">{u.status === "pending" && <><button className="primary-btn compact admin-action" disabled={busy===`${u.id}:active`} onClick={() => setStatus(u.id,"active")}>{busy===`${u.id}:active` ? "Approving…" : "Approve"}</button><button className="danger-btn admin-action" disabled={busy===`${u.id}:rejected`} onClick={() => setStatus(u.id,"rejected")}>{busy===`${u.id}:rejected` ? "Rejecting…" : "Reject"}</button></>}{u.status === "active" && u.role !== "admin" && <button className="danger-btn admin-action" disabled={busy===`${u.id}:inactive`} onClick={() => setStatus(u.id,"inactive")}>{busy===`${u.id}:inactive` ? "Deactivating…" : "Deactivate"}</button>}{u.status === "inactive" && <button className="primary-btn compact admin-action" disabled={busy===`${u.id}:active`} onClick={() => setStatus(u.id,"active")}>{busy===`${u.id}:active` ? "Reactivating…" : "Reactivate"}</button>}{u.status === "rejected" && <button className="primary-btn compact admin-action" disabled={busy===`${u.id}:active`} onClick={() => setStatus(u.id,"active")}>{busy===`${u.id}:active` ? "Approving…" : "Approve"}</button>}</div></div>)}{!users.length && <div className="history-empty compact"><strong>No users found</strong></div>}</div>}
    </div>
  </main>;
}

function SearchModal({ setActive, onClose }) {
  const [query, setQuery] = useState("");
  const items = [
    ...navItems.map(x => ({...x, keywords: `${x.label} ${x.id}`})),
    { id: "settings", label: "Settings", icon: Settings, keywords: "settings preferences profile" }
  ];
  const filtered = items.filter(item => item.keywords.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="search-overlay" onMouseDown={onClose}>
    <div className="search-modal" onMouseDown={e => e.stopPropagation()}>
      <div className="search-input-wrap"><Search size={18}/><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search workspace..."/><kbd>ESC</kbd></div>
      <div className="search-results">
        {filtered.length ? filtered.map(({id,label,icon:Icon}) => <button key={id} onClick={() => {setActive(id);onClose();}}><span className="search-result-icon"><Icon size={16}/></span><span><strong>{label}</strong><small>Open {label}</small></span><ArrowRight size={15}/></button>) : <div className="search-no-results"><Search size={22}/><strong>No results</strong><span>Try Overview, Datasets, Models or Settings.</span></div>}
      </div>
    </div>
  </div>;
}

function App() {
  const [user, setUser] = useState(getStoredUser());
  const token = localStorage.getItem("predictorx_token");
  const [authMode, setAuthMode] = useState("signup");
  const [showLanding, setShowLanding] = useState(true);
  const [active, setActive] = useState("overview");
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("predictorx_theme") || "dark");

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("predictorx_theme", theme);
  }, [theme]);

  React.useEffect(() => {
    const onNavigate = (e) => setActive(e.detail);
    window.addEventListener("predictorx:navigate", onNavigate);
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("predictorx:navigate", onNavigate); };
  }, []);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");
  const logout = () => { localStorage.removeItem("predictorx_token"); localStorage.removeItem("predictorx_user"); setUser(null); setActive("overview"); setShowLanding(true); };

  const page = useMemo(() => ({
    overview: <Overview user={user} setActive={setActive} onSearch={() => setSearchOpen(true)} theme={theme} toggleTheme={toggleTheme}/>,
    datasets: <Datasets setActive={setActive} user={user}/>,
    models: <Models token={token}/>,
    predictions: <Predictions token={token}/>,
    whatif: <WhatIf token={token}/>,
    history: <History token={token}/>,
    settings: <SettingsPage user={user}/>,
    admin: user?.role === "admin" ? <AdminDashboard token={token}/> : <Overview user={user} setActive={setActive} onSearch={() => setSearchOpen(true)} theme={theme} toggleTheme={toggleTheme}/>
  }[active] || <Overview user={user} setActive={setActive} onSearch={() => setSearchOpen(true)} theme={theme} toggleTheme={toggleTheme}/>), [active, user, theme]);

  if (!user && showLanding) return <Landing onGetStarted={(mode) => { setAuthMode(mode); setShowLanding(false); }}/>;
  if (!user) return <Auth mode={authMode} setMode={setAuthMode} onAuth={setUser} onHome={() => setShowLanding(true)}/>;

  return <div className="app-shell">
    {mobile && <div className="mobile-overlay" onClick={() => setMobile(false)}/>}
    <div className={mobile ? "sidebar-wrap mobile-open" : "sidebar-wrap"}><Sidebar active={active} setActive={(x)=>{setActive(x);setMobile(false)}} user={user} onLogout={logout} theme={theme} toggleTheme={toggleTheme}/></div>
    <button className="mobile-menu" onClick={() => setMobile(!mobile)}>{mobile ? <X size={20}/> : <Menu size={20}/>}</button>
    {page}
    {searchOpen && <SearchModal setActive={setActive} onClose={() => setSearchOpen(false)}/>} 
  </div>;
}
export default App;
