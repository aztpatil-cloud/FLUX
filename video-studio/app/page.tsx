"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  Activity, ArrowUpRight, AudioLines, BrainCircuit, Check, ChevronDown, Clapperboard,
  Clock3, CloudUpload, Film, FolderOpen, Gauge, HardDrive, Layers3, Library,
  LogOut, Menu, Plus, Search, Settings2, Sparkles, Upload, WandSparkles, X
} from "lucide-react";

type Project = { id: string; title: string; status: string; created_at: string; updated_at: string };
type Asset = { id: string; project_id: string | null; filename: string; asset_type: string; mime_type: string | null; size_bytes: number | null; processing_status: string; created_at: string };
type Style = { id: string; name: string; category: string | null; description: string | null; tags: string[] };
type Tab = "Overview" | "Reference Lab" | "Style Library" | "Editing Studio" | "Usage";

const nav: { label: Tab; icon: typeof Activity; note?: string }[] = [
  { label: "Overview", icon: Layers3 },
  { label: "Reference Lab", icon: Clapperboard },
  { label: "Style Library", icon: Library },
  { label: "Editing Studio", icon: WandSparkles, note: "Soon" },
  { label: "Usage", icon: Gauge },
];
const formatSize = (n?: number | null) => !n ? "—" : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const formatDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [usage, setUsage] = useState({ input: 0, output: 0, cost: 0 });
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState<"reference_video" | "stock_video">("reference_video");
  const [selectedProject, setSelectedProject] = useState("");
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (uid: string) => {
    if (!supabase) return;
    const [p, a, s, u] = await Promise.all([
      supabase.from("video_projects").select("id,title,status,created_at,updated_at").order("updated_at", { ascending: false }),
      supabase.from("video_assets").select("id,project_id,filename,asset_type,mime_type,size_bytes,processing_status,created_at").order("created_at", { ascending: false }).limit(30),
      supabase.from("style_library").select("id,name,category,description,tags").order("created_at", { ascending: false }).limit(50),
      supabase.from("video_api_usage").select("input_tokens,output_tokens,estimated_cost_usd").limit(500),
    ]);
    if (p.data) setProjects(p.data as Project[]);
    if (a.data) setAssets(a.data as Asset[]);
    if (s.data) setStyles(s.data as Style[]);
    if (u.data) setUsage(u.data.reduce((acc, row) => ({ input: acc.input + (row.input_tokens || 0), output: acc.output + (row.output_tokens || 0), cost: acc.cost + Number(row.estimated_cost_usd || 0) }), { input: 0, output: 0, cost: 0 }));
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      const current = data.session?.user ?? null;
      setUser(current);
      if (current) refresh(current.id);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user ?? null;
      setUser(current);
      if (current) refresh(current.id);
      else { setProjects([]); setAssets([]); setStyles([]); }
    });
    return () => listener.subscription.unsubscribe();
  }, [refresh]);

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !email.trim()) return;
    setSendingLink(true); setNotice("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setNotice(error ? error.message : "Magic link sent. Check your email to sign in.");
    setSendingLink(false);
  };

  const createProject = async () => {
    if (!supabase || !user) return null;
    const title = window.prompt("Name this video project", "New reference study");
    if (!title?.trim()) return null;
    const { data, error } = await supabase.from("video_projects").insert({ owner_id: user.id, title: title.trim() }).select().single();
    if (error) { setNotice(error.message); return null; }
    await refresh(user.id); setSelectedProject(data.id); setTab("Reference Lab"); return data.id as string;
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!supabase || !user || !files?.length) return;
    setUploading(true); setNotice("");
    let projectId = selectedProject || projects[0]?.id;
    if (!projectId) {
      const { data, error } = await supabase.from("video_projects").insert({ owner_id: user.id, title: "Reference study" }).select().single();
      if (error || !data) { setNotice(error?.message || "Could not create project."); setUploading(false); return; }
      projectId = data.id;
    }
    let uploaded = 0;
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${projectId}/${crypto.randomUUID()}-${safeName}`;
      const { error: storageError } = await supabase.storage.from("flux-video-assets").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (storageError) { setNotice(`${file.name}: ${storageError.message}`); continue; }
      const { error: rowError } = await supabase.from("video_assets").insert({ owner_id: user.id, project_id: projectId, asset_type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : selectedType, filename: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, metadata: { source: "dashboard_upload" } });
      if (rowError) setNotice(`${file.name}: uploaded but metadata failed — ${rowError.message}`);
      else uploaded++;
    }
    await refresh(user.id);
    setNotice(uploaded ? `${uploaded} file${uploaded === 1 ? "" : "s"} added to your project.` : "No files were added. Check the upload error.");
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const signOut = async () => { await supabase?.auth.signOut(); setUser(null); };
  const filteredAssets = useMemo(() => assets.filter(a => a.filename.toLowerCase().includes(query.toLowerCase())), [assets, query]);
  const recentProjects = projects.slice(0, 4);

  if (!loading && !isSupabaseConfigured) return <main className="setup-screen"><div className="setup-card"><div className="brand-mark"><Film size={22}/></div><p className="eyebrow">FLUX / VIDEO STUDIO</p><h1>Connect your workspace</h1><p className="muted">Add the Supabase URL and publishable key to this app's environment variables to activate sign-in, projects and uploads.</p><pre>NEXT_PUBLIC_SUPABASE_URL=…{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=…</pre></div></main>;

  if (loading) return <main className="loading-screen"><div className="brand-mark"><Film size={22}/></div><span>Loading Flux Studio…</span></main>;

  if (!user) return <main className="login-screen"><div className="login-card"><div className="brand-mark"><Film size={22}/></div><p className="eyebrow">FLUX / VIDEO STUDIO</p><h1>Your creative reference lab.</h1><p className="muted">Sign in to manage reference reels, footage and editing styles in one workspace.</p><form onSubmit={sendMagicLink}><label htmlFor="email">Email address</label><input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/><button className="primary-btn full" disabled={sendingLink}>{sendingLink ? "Sending link…" : "Continue with email"} <ArrowUpRight size={16}/></button></form>{notice && <p className="notice">{notice}</p>}<p className="tiny muted">A secure sign-in link will be sent to your inbox.</p></div></main>;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="sidebar-brand"><div className="brand-mark"><Film size={19}/></div><div><strong>FLUX</strong><span>VIDEO STUDIO</span></div><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">F</div><div><strong>Flux Workspace</strong><span>Personal workspace</span></div><ChevronDown size={15}/></div>
      <p className="nav-caption">WORKSPACE</p>
      <nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.label} className={`nav-item ${tab===item.label?"active":""}`} onClick={()=>{setTab(item.label);setMobileNav(false);}}><Icon size={17}/><span>{item.label}</span>{item.note&&<small>{item.note}</small>}</button>})}</nav>
      <div className="sidebar-bottom"><div className="engine-card"><div className="engine-top"><span className="status-dot"></span><strong>Analysis engine</strong></div><p>Worker connection pending</p><span className="engine-tag">SETUP NEXT</span></div><div className="user-row"><div className="user-avatar">{(user.email||"F").slice(0,1).toUpperCase()}</div><div className="user-copy"><strong>{user.email}</strong><span>Signed in</span></div><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button></div></div>
    </aside>
    {mobileNav&&<button className="mobile-scrim" onClick={()=>setMobileNav(false)} aria-label="Close navigation"/>}
    <section className="main-panel">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu size={19}/></button><span className="breadcrumb">Workspace</span><span className="crumb-slash">/</span><strong>{tab}</strong></div><div className="topbar-right"><span className="api-status"><span className="status-dot"></span> Supabase connected</span><button className="outline-btn" onClick={createProject}><Plus size={15}/> New project</button></div></header>
      <div className="content-wrap">
        {notice && <div className="toast"><span>{notice}</span><button onClick={()=>setNotice("")}><X size={15}/></button></div>}
        {tab==="Overview" && <>
          <div className="page-heading"><div><p className="eyebrow">YOUR CREATIVE WORKSPACE</p><h1>Make references <em>work.</em></h1><p className="muted">Study the edits you love. Build a reusable creative library.</p></div><button className="primary-btn" onClick={()=>setTab("Reference Lab")}><CloudUpload size={16}/> Add reference</button></div>
          <div className="stats-grid"><div className="stat-card"><div className="stat-icon purple"><FolderOpen size={18}/></div><span>Projects</span><strong>{projects.length}</strong><small>Video workspaces</small></div><div className="stat-card"><div className="stat-icon blue"><Film size={18}/></div><span>Uploaded assets</span><strong>{assets.length}</strong><small>References and footage</small></div><div className="stat-card"><div className="stat-icon amber"><BrainCircuit size={18}/></div><span>Saved styles</span><strong>{styles.length}</strong><small>Reusable editing profiles</small></div><div className="stat-card"><div className="stat-icon green"><Activity size={18}/></div><span>API spend</span><strong>${usage.cost.toFixed(3)}</strong><small>{usage.input.toLocaleString()} input tokens</small></div></div>
          <div className="overview-grid"><div className="panel-card"><div className="panel-heading"><div><h2>Recent projects</h2><p>Your latest video studies</p></div><button className="text-btn" onClick={()=>setTab("Reference Lab")}>View all <ArrowUpRight size={14}/></button></div>{recentProjects.length===0?<div className="empty-state"><div className="empty-icon"><FolderOpen size={22}/></div><strong>No projects yet</strong><p>Create a project to start collecting references and footage.</p><button className="outline-btn" onClick={createProject}><Plus size={15}/> Create project</button></div>:<div className="project-list">{recentProjects.map(p=><button className="project-row" key={p.id} onClick={()=>{setSelectedProject(p.id);setTab("Reference Lab");}}><div className="project-thumb"><Film size={17}/></div><div className="project-info"><strong>{p.title}</strong><span>Updated {formatDate(p.updated_at)}</span></div><span className={`pill ${p.status}`}>{p.status}</span><ArrowUpRight size={15}/></button>)}</div>}</div>
          <div className="panel-card quick-panel"><div className="panel-heading"><div><h2>Start creating</h2><p>Choose your next step</p></div><Sparkles size={18}/></div><button className="quick-action" onClick={()=>setTab("Reference Lab")}><div className="quick-icon"><Upload size={17}/></div><div><strong>Analyze a reference</strong><span>Upload a reel to break it down</span></div><ArrowUpRight size={15}/></button><button className="quick-action" onClick={()=>setTab("Style Library")}><div className="quick-icon"><Library size={17}/></div><div><strong>Explore style library</strong><span>Browse saved creative patterns</span></div><ArrowUpRight size={15}/></button><div className="coming-card"><div className="coming-icon"><AudioLines size={17}/></div><div><strong>Editing engine</strong><span>Automated timeline and rendering are next.</span></div><span className="pill soon">SOON</span></div></div></div>
        </>}
        {tab==="Reference Lab" && <><div className="page-heading"><div><p className="eyebrow">REFERENCE LAB</p><h1>Break down the <em>reference.</em></h1><p className="muted">Collect reference reels and stock footage. Analysis worker is the next integration.</p></div><div className="heading-actions"><select className="select-control" value={selectedType} onChange={e=>setSelectedType(e.target.value as "reference_video"|"stock_video")}><option value="reference_video">Reference video</option><option value="stock_video">Stock footage</option></select><button className="primary-btn" onClick={()=>fileInput.current?.click()} disabled={uploading}><Upload size={16}/>{uploading?"Uploading…":"Upload files"}</button><input ref={fileInput} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={e=>uploadFiles(e.target.files)}/></div></div>
          <div className="upload-zone" onClick={()=>fileInput.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();uploadFiles(e.dataTransfer.files);}}><div className="upload-symbol"><CloudUpload size={25}/></div><strong>{uploading?"Uploading your files…":"Drop reference reels or stock footage here"}</strong><span>MP4, MOV, WEBM, JPG, PNG, MP3 · up to 500 MB per file</span><button className="text-btn" type="button">Browse files</button></div>
          <div className="section-toolbar"><div><h2>Your assets</h2><p>{assets.length} files in this workspace</p></div><div className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search assets"/></div></div>
          {filteredAssets.length===0?<div className="panel-card empty-state large-empty"><div className="empty-icon"><Film size={23}/></div><strong>No assets uploaded yet</strong><p>Upload your first reference reel. We'll add scene analysis, color analysis and editing breakdown here.</p></div>:<div className="asset-table"><div className="asset-table-head"><span>FILE</span><span>TYPE</span><span>SIZE</span><span>STATUS</span><span>ADDED</span></div>{filteredAssets.map(a=><div className="asset-row" key={a.id}><div className="asset-name"><div className="asset-icon"><Film size={16}/></div><strong>{a.filename}</strong></div><span className="muted">{a.asset_type.replace("_"," ")}</span><span className="muted">{formatSize(a.size_bytes)}</span><span><span className="pill uploaded">{a.processing_status}</span></span><span className="muted">{formatDate(a.created_at)}</span></div>)}</div>}
          <div className="worker-note"><div className="worker-note-icon"><BrainCircuit size={18}/></div><div><strong>Analysis worker not connected yet</strong><p>Uploads are stored securely in Supabase. Next we'll connect FFmpeg scene extraction and Claude analysis to turn each reference into a timestamped editing breakdown.</p></div></div>
        </>}
        {tab==="Style Library" && <><div className="page-heading"><div><p className="eyebrow">CREATIVE INTELLIGENCE</p><h1>Your style <em>library.</em></h1><p className="muted">Reusable editing patterns extracted from analyzed references.</p></div><span className="pill soon">LEARNING ENGINE NEXT</span></div>{styles.length===0?<div className="panel-card empty-state large-empty"><div className="empty-icon"><BrainCircuit size={23}/></div><strong>Your library is ready for its first style.</strong><p>Once reference analysis is connected, saved profiles will appear here with pacing, transitions, color treatment, camera language and audio patterns.</p><button className="outline-btn" onClick={()=>setTab("Reference Lab")}>Go to Reference Lab <ArrowUpRight size={14}/></button></div>:<div className="style-grid">{styles.map(s=><div className="style-card" key={s.id}><div className="style-card-top"><div className="style-icon"><Sparkles size={18}/></div><span className="pill">{s.category||"Creative style"}</span></div><h3>{s.name}</h3><p>{s.description||"Saved editing profile"}</p><div className="tag-row">{(s.tags||[]).slice(0,4).map(t=><span key={t}>{t}</span>)}</div></div>)}</div>}</>}
        {tab==="Editing Studio" && <div className="panel-card empty-state large-empty"><div className="empty-icon"><WandSparkles size={23}/></div><span className="pill soon">NEXT PHASE</span><strong>Editing Studio is coming next.</strong><p>This is where reference blueprints, stock clips, adaptive color grading, speed ramps, transitions and audio will become an editable timeline.</p><button className="outline-btn" onClick={()=>setTab("Reference Lab")}>Prepare references <ArrowUpRight size={14}/></button></div>}
        {tab==="Usage" && <><div className="page-heading"><div><p className="eyebrow">COST CONTROL</p><h1>API <em>usage.</em></h1><p className="muted">Track model consumption as analysis is connected.</p></div></div><div className="stats-grid"><div className="stat-card"><div className="stat-icon purple"><Activity size={18}/></div><span>Estimated spend</span><strong>${usage.cost.toFixed(4)}</strong><small>Recorded API usage</small></div><div className="stat-card"><div className="stat-icon blue"><Layers3 size={18}/></div><span>Input tokens</span><strong>{usage.input.toLocaleString()}</strong><small>All recorded requests</small></div><div className="stat-card"><div className="stat-icon green"><Sparkles size={18}/></div><span>Output tokens</span><strong>{usage.output.toLocaleString()}</strong><small>All recorded responses</small></div><div className="stat-card"><div className="stat-icon amber"><HardDrive size={18}/></div><span>Assets stored</span><strong>{assets.length}</strong><small>Uploaded files</small></div></div><div className="panel-card usage-note"><Clock3 size={18}/><div><strong>Usage tracking is prepared.</strong><p>When the Claude worker is connected, each request will record input, output, cache reads, cache writes, model and estimated cost here.</p></div></div></>}
      </div>
      <footer className="footer"><span>FLUX VIDEO STUDIO</span><span>REFERENCE LAB · EARLY ACCESS</span></footer>
    </section>
  </main>;
}
