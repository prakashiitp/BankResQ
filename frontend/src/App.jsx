import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, Check,
  ChevronRight, CircleHelp, Clock3, CreditCard, Eye, EyeOff, History,
  LayoutDashboard, LogOut, Menu, Moon, Plus, RefreshCw, ShieldCheck,
  Sun, Wallet, X, Landmark, Send, CircleDollarSign
} from "lucide-react";
import "./App.css";

// Change this if your EC2 public IP changes.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    throw new Error(`Cannot reach BankResQ API at ${API_BASE}. Check EC2, port 8000, and backend CORS settings.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status})`);
  }
  return data;
}

const money = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));

const dateText = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("bankresq-theme") || "dark");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bankresq-user") || "null"); } catch { return null; }
  });
  const [account, setAccount] = useState(null);
  const [active, setActive] = useState("Overview");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [form, setForm] = useState({ amount: "", sender_account_id: "", receiver_account_id: "" });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAction, setShowAction] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [health, setHealth] = useState("Checking");

  const announce = (message = "", err = "") => { setNotice(message); setError(err); };

  const loadAccount = useCallback(async (currentUser = user) => {
    if (!currentUser?.user_id) return;
    try {
      const data = await api(`/accounts/${currentUser.user_id}`);
      setAccount(data);
    } catch (e) {
      if (e.message.toLowerCase().includes("account not found")) setAccount(null);
      else setError(e.message);
    }
  }, [user]);

  const loadTransactions = useCallback(async () => {
    try {
      const data = await api("/transactions/");
      const list = Array.isArray(data) ? data : [];
      setTransactions(list.filter((t) => {
        const id = account?.account_id;
        return !id || Number(t.sender_account_id) === Number(id) || Number(t.receiver_account_id) === Number(id);
      }));
    } catch (e) { setError(e.message); }
  }, [account]);

  const refreshAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      await loadAccount(user);
      await loadTransactions();
    } finally { setLoading(false); }
  }, [user, loadAccount, loadTransactions]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("bankresq-theme", theme);
  }, [theme]);

  useEffect(() => {
    api("/health").then(() => setHealth("Operational")).catch(() => setHealth("Unavailable"));
  }, []);

  useEffect(() => {
    if (user) {
      loadAccount(user);
      loadTransactions();
    }
  }, [user, loadAccount, loadTransactions]);

  useEffect(() => {
    if (!user || !account) return;
    const timer = setInterval(() => { loadAccount(user); loadTransactions(); }, 7000);
    return () => clearInterval(timer);
  }, [user, account, loadAccount, loadTransactions]);

  const filteredTransactions = useMemo(() => transactions.slice(0, 8), [transactions]);
  const totalIn = transactions.filter(t => Number(t.receiver_account_id) === Number(account?.account_id) && String(t.status).toUpperCase() === "SUCCESS").reduce((s,t) => s + Number(t.amount || 0), 0);
  const totalOut = transactions.filter(t => Number(t.sender_account_id) === Number(account?.account_id) && String(t.status).toUpperCase() === "SUCCESS").reduce((s,t) => s + Number(t.amount || 0), 0);

  async function submitAuth(e) {
    e.preventDefault(); setAuthLoading(true); announce();
    try {
      const path = authMode === "register" ? "/auth/register" : "/auth/login";
      const payload = authMode === "register"
        ? { name: authForm.name.trim(), email: authForm.email.trim(), password: authForm.password }
        : { email: authForm.email.trim(), password: authForm.password };
      const result = await api(path, { method: "POST", body: JSON.stringify(payload) });
      const nextUser = { user_id: result.user_id, name: result.name, email: result.email };
      setUser(nextUser); localStorage.setItem("bankresq-user", JSON.stringify(nextUser));
      announce(authMode === "register" ? "Account profile created. Create your banking account to continue." : "Welcome back.");
      setAuthForm({ name: "", email: "", password: "" });
    } catch (e) { setError(e.message); }
    finally { setAuthLoading(false); }
  }

  async function createAccount() {
    if (!user) return;
    setLoading(true); announce();
    try {
      const result = await api("/accounts/create", { method: "POST", body: JSON.stringify({ user_id: user.user_id }) });
      await loadAccount(user);
      announce(`${result.message}. Your starting balance is ${money(result.balance)}.`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function submitMoneyAction(e) {
    e.preventDefault(); announce(); setLoading(true);
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter an amount greater than zero."); setLoading(false); return; }
    try {
      let result;
      if (showAction === "deposit" || showAction === "withdraw") {
        result = await api(`/accounts/${user.user_id}/${showAction}`, { method: "POST", body: JSON.stringify({ amount }) });
        await loadAccount(user);
        announce(`${result.message}. Updated balance: ${money(result.balance)}.`);
      } else if (showAction === "transfer") {
        if (!form.sender_account_id || !form.receiver_account_id) throw new Error("Enter both sender and receiver account IDs.");
        result = await api("/transactions/transfer", {
          method: "POST",
          body: JSON.stringify({
            sender_account_id: Number(form.sender_account_id),
            receiver_account_id: Number(form.receiver_account_id),
            amount,
          }),
        });
        announce(`Transfer queued. Transaction #${result.transaction_id} is ${result.status}. Status will refresh automatically.`);
        await loadAccount(user);
        await loadTransactions();
      }
      setForm(f => ({ ...f, amount: "" }));
      setShowAction("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function logout() {
    localStorage.removeItem("bankresq-user");
    setUser(null); setAccount(null); setTransactions([]); setActive("Overview"); announce();
  }

  if (!user) {
    return <div className="auth-page">
      <div className="auth-top">
        <a className="brand" href="#"><span className="brand-mark"><Wallet size={21} /></span><span>BankRes<span className="brand-accent">Q</span><small>RESILIENT DIGITAL BANKING</small></span></a>
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button>
      </div>
      <div className="auth-layout">
        <section className="auth-copy">
          <div className="eyebrow"><span/> FAULT-TOLERANT TRANSACTION PLATFORM</div>
          <h1>Banking that keeps moving.</h1>
          <p>Manage your account and track transfers through a cloud-based transaction queue designed with recovery in mind.</p>
          <div className="auth-benefits">
            <div><ShieldCheck/><span><b>Reliable processing</b><small>Queued transfers with live status checks</small></span></div>
            <div><Activity/><span><b>Clear visibility</b><small>Account activity from your actual backend</small></span></div>
            <div><Clock3/><span><b>Recovery aware</b><small>Pending transactions can be checked again</small></span></div>
          </div>
        </section>
        <section className="auth-card">
          <div className="auth-card-head"><span className="mini-icon"><Landmark size={19}/></span><span className={`health-pill ${health === "Operational" ? "good" : "bad"}`}><i/>{health}</span></div>
          <h2>{authMode === "login" ? "Welcome back" : "Create your profile"}</h2>
          <p className="muted">{authMode === "login" ? "Sign in to access your BankResQ account." : "Register first, then create your banking account."}</p>
          <form onSubmit={submitAuth} className="form-stack">
            {authMode === "register" && <Field label="Full name" placeholder="Your name" value={authForm.name} onChange={e=>setAuthForm({...authForm,name:e.target.value})} required autoComplete="name"/>}
            <Field label="Email address" type="email" placeholder="you@example.com" value={authForm.email} onChange={e=>setAuthForm({...authForm,email:e.target.value})} required autoComplete="email"/>
            <label className="field"><span>Password</span><div className="password-field"><input type={showPassword ? "text" : "password"} placeholder="Enter password" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} required autoComplete={authMode === "login" ? "current-password" : "new-password"}/><button type="button" className="plain-icon" onClick={()=>setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}
            <button className="primary-button full" disabled={authLoading}>{authLoading ? "Please wait…" : authMode === "login" ? "Sign in" : "Create profile"} <ChevronRight size={17}/></button>
          </form>
          <p className="auth-switch">{authMode === "login" ? "New to BankResQ?" : "Already registered?"} <button onClick={()=>{setAuthMode(authMode==="login"?"register":"login");announce();}}>{authMode === "login" ? "Create profile" : "Sign in"}</button></p>
          <p className="auth-foot"><ShieldCheck size={14}/> Passwords are verified by the BankResQ API.</p>
        </section>
      </div>
      <footer className="auth-footer">© 2026 BankResQ <span>Reliable banking, built for resilience.</span></footer>
    </div>;
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "nav-open" : ""}`}>
      <a className="brand" href="#"><span className="brand-mark"><Wallet size={21}/></span><span>BankRes<span className="brand-accent">Q</span><small>RESILIENT DIGITAL BANKING</small></span></a>
      <p className="nav-label">WORKSPACE</p>
      {[[LayoutDashboard,"Overview"],[ArrowLeftRight,"Transactions"],[CreditCard,"Accounts"]].map(([Icon,label]) =>
        <button key={label} className={`nav-item ${active===label?"active":""}`} onClick={()=>{setActive(label);setMobileNav(false);}}>
          <Icon size={18}/>{label}{label==="Transactions" && transactions.length>0 && <span className="nav-count">{transactions.length}</span>}
        </button>)}
      <div className="sidebar-bottom">
        <div className="security-card"><ShieldCheck size={21}/><strong>Resilience status</strong><p>Transfer requests are queued and processed by the backend worker.</p><span className={health==="Operational"?"online":"offline"}><i/>{health==="Operational"?"API reachable":"API unavailable"}</span></div>
        <button className="nav-item" onClick={()=>announce("Use the Accounts page to create an account or manage your balance.")}><CircleHelp size={18}/>Help & support</button>
        <div className="profile"><div className="avatar">{(user.name||"U").slice(0,1).toUpperCase()}</div><div className="profile-name"><strong>{user.name}</strong><small>{user.email}</small></div><button className="plain-icon" title="Sign out" onClick={logout}><LogOut size={17}/></button></div>
      </div>
    </aside>
    {mobileNav && <button className="nav-scrim" onClick={()=>setMobileNav(false)} aria-label="Close menu"/>}
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Menu" onClick={()=>setMobileNav(!mobileNav)}><Menu size={20}/></button>
        <div className="breadcrumb">Workspace <span>/</span> <strong>{active}</strong></div>
        <div className="top-actions">
          <span className={`live-status ${health!=="Operational"?"offline":""}`}><i/>{health==="Operational"?"API operational":"API unavailable"}</span>
          <button className="icon-button" title="Refresh data" onClick={refreshAll}><RefreshCw size={17} className={loading?"spin":""}/></button>
          <button className="icon-button" title="Notifications" onClick={()=>announce("Transactions refresh automatically every 7 seconds while signed in.")}><Bell size={18}/></button>
          <button className="theme-toggle" title="Toggle dark/light mode" onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?<Sun size={17}/>:<Moon size={17}/>}</button>
          <div className="top-avatar">{(user.name||"U").slice(0,1).toUpperCase()}</div>
        </div>
      </header>
      <section className="content">
        <div className="welcome-row"><div><div className="eyebrow"><span/> YOUR MONEY, IN CONTROL</div><h1>{active==="Overview" ? `Welcome, ${(user.name||"there").split(" ")[0]}.` : active}</h1><p className="muted">{active==="Overview"?"Here’s your account activity, straight from the BankResQ API.":active==="Accounts"?"Your account details and money management actions.":"Track queued transfers and transaction statuses."}</p></div>
          <button className="primary-button" onClick={()=>{setShowAction("transfer");setForm(f=>({...f,sender_account_id:account?.account_id?String(account.account_id):"",receiver_account_id:"",amount:""}));announce();}}><Send size={16}/> New transfer</button>
        </div>

        {(error || notice) && <div className={`alert page-alert ${error?"error":"success"}`}><span>{error || notice}</span><button className="plain-icon" onClick={()=>announce()}><X size={16}/></button></div>}

        {!account ? <section className="empty-account panel"><div className="empty-icon"><Landmark size={27}/></div><h2>Your banking account isn’t set up yet</h2><p className="muted">Your profile is registered. Create an account to get an account number and the backend’s starting balance.</p><button className="primary-button" disabled={loading} onClick={createAccount}><Plus size={17}/>{loading?"Creating…":"Create banking account"}</button></section> : <>
          <section className="balance-card">
            <div className="balance-orb orb-a"/><div className="balance-orb orb-b"/>
            <div className="balance-card-top"><span className="card-label">AVAILABLE BALANCE</span><span className="balance-chip"><Wallet size={14}/> Primary account</span></div>
            <h2>{money(account.balance)}</h2><p className="balance-caption">Live balance from your BankResQ account</p>
            <div className="balance-details"><div><small>ACCOUNT HOLDER</small><strong>{user.name}</strong></div><div><small>ACCOUNT NUMBER</small><strong>{account.account_number || "—"}</strong></div><div><small>ACCOUNT ID</small><strong>#{account.account_id}</strong></div></div>
          </section>
          <div className="quick-actions">
            <button onClick={()=>{setShowAction("deposit");setForm({...form,amount:""});announce();}}><span className="quick-icon deposit"><ArrowDownLeft size={19}/></span><span><b>Deposit</b><small>Add money</small></span><ChevronRight size={17}/></button>
            <button onClick={()=>{setShowAction("withdraw");setForm({...form,amount:""});announce();}}><span className="quick-icon withdraw"><ArrowUpRight size={19}/></span><span><b>Withdraw</b><small>Take out money</small></span><ChevronRight size={17}/></button>
            <button onClick={()=>{setShowAction("transfer");setForm({...form,sender_account_id:String(account.account_id),receiver_account_id:"",amount:""});announce();}}><span className="quick-icon transfer"><ArrowLeftRight size={19}/></span><span><b>Transfer</b><small>Send to account</small></span><ChevronRight size={17}/></button>
          </div>
          {showAction && <section className="panel action-panel">
            <div className="panel-heading"><div><span className="eyebrow"><span/> MONEY MOVEMENT</span><h3>{showAction==="deposit"?"Deposit money":showAction==="withdraw"?"Withdraw money":"Transfer money"}</h3><p className="muted">{showAction==="transfer"?"Transfers enter the processing queue and may remain pending until the worker processes them.":"This action updates your account balance through the backend."}</p></div><button className="icon-button" onClick={()=>setShowAction("")}><X size={18}/></button></div>
            <form className="action-form" onSubmit={submitMoneyAction}>
              {showAction==="transfer" && <><Field label="Sender account ID" type="number" min="1" value={form.sender_account_id} onChange={e=>setForm({...form,sender_account_id:e.target.value})} required/><Field label="Receiver account ID" type="number" min="1" value={form.receiver_account_id} onChange={e=>setForm({...form,receiver_account_id:e.target.value})} required/></>}
              <Field label="Amount (INR)" type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} required/>
              <div className="form-actions"><button type="button" className="secondary-button" onClick={()=>setShowAction("")}>Cancel</button><button className="primary-button" disabled={loading}>{loading?"Processing…":showAction==="deposit"?"Deposit money":showAction==="withdraw"?"Withdraw money":"Queue transfer"}<ChevronRight size={17}/></button></div>
            </form>
          </section>}

          {active==="Overview" && <div className="stats-grid">
            <article className="stat-card"><div className="stat-top"><span>Money received</span><div className="stat-icon income"><ArrowDownLeft size={19}/></div></div><strong>{money(totalIn)}</strong><small>Successful incoming transactions in loaded history</small></article>
            <article className="stat-card"><div className="stat-top"><span>Money sent</span><div className="stat-icon expense"><ArrowUpRight size={19}/></div></div><strong>{money(totalOut)}</strong><small>Successful outgoing transactions in loaded history</small></article>
            <article className="stat-card"><div className="stat-top"><span>Transactions</span><div className="stat-icon transfer"><Activity size={19}/></div></div><strong>{transactions.length}</strong><small>Transactions visible for this account</small></article>
          </div>}

          <section className="panel transactions-panel">
            <div className="panel-heading"><div><h3>{active==="Transactions"?"Transaction history":"Recent transactions"}</h3><p className="muted">Actual records returned by the transactions API</p></div><button className="text-button" onClick={()=>active==="Transactions"?refreshAll():setActive("Transactions")}>{active==="Transactions"?"Refresh":"View all"} <ChevronRight size={15}/></button></div>
            {filteredTransactions.length===0 ? <div className="empty-transactions"><History size={25}/><strong>No transactions found</strong><span>Deposits and withdrawals update your balance directly; transfers appear here.</span></div> :
              <div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>CREATED</th><th>STATUS</th><th className="amount-col">AMOUNT</th><th>ID</th></tr></thead><tbody>
                {(active==="Transactions"?transactions:filteredTransactions).map((tx,i)=>{
                  const incoming=Number(tx.receiver_account_id)===Number(account.account_id);
                  const status=String(tx.status||"UNKNOWN").toUpperCase();
                  return <tr key={tx.id ?? tx.transaction_id ?? i}><td><div className="transaction-name"><span className={`tx-avatar tx-${i%4}`}>{incoming?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><span><strong>{incoming?"Incoming transfer":"Outgoing transfer"}</strong><small>Account {tx.sender_account_id ?? "—"} → {tx.receiver_account_id ?? "—"}</small></span></div></td><td className="date-cell">{dateText(tx.created_at)}</td><td><span className={`status ${status.toLowerCase()}`}><i/>{status}</span></td><td className={`amount-col amount ${incoming?"positive":""}`}>{incoming?"+":"−"} {money(tx.amount)}</td><td className="id-cell">#{tx.id ?? tx.transaction_id ?? "—"}</td></tr>;
                })}
              </tbody></table></div>}
            <div className="table-footer"><span>Auto-refreshes every 7 seconds</span><span className="secure-footer"><ShieldCheck size={15}/> BankResQ API</span></div>
          </section>
        </>}
        <footer className="footer"><span>© 2026 BankResQ</span><span>Reliable banking, built for resilience.</span></footer>
      </section>
    </main>
  </div>;
}

export default App;
