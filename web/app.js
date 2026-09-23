const API_BASE = window.FORMLY_API_BASE || '';
const defaultProfile = {
  fullName:'',firstName:'',lastName:'',email:'',mobile:'',dob:'',gender:'',college:'',course:'',branch:'',year:'',prn:'',tenth:'',twelfth:'',address:'',city:'',state:'',pincode:'',country:'India'
};

let profile = {...defaultProfile};
let currentUser = null;
let authMode = 'login';

function $(s){return document.querySelector(s)}
function $$(s){return [...document.querySelectorAll(s)]}
function token(){return localStorage.getItem('formly_token')||''}
function authHeaders(extra={}){return {...extra, ...(token()?{Authorization:`Bearer ${token()}`}:{})}}

async function api(path, options={}){
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: authHeaders(options.headers||{}) });
  let data = null;
  try { data = await res.json(); } catch {}
  if(!res.ok){ const err = new Error(data?.error || `Request failed (${res.status})`); err.status=res.status; throw err; }
  return data;
}

function setAuthMode(mode){
  authMode=mode;
  $('#loginTab')?.classList.toggle('active',mode==='login');
  $('#registerTab')?.classList.toggle('active',mode==='register');
  $('#nameField')?.classList.toggle('hidden',mode!=='register');
  $('#authName').required = mode==='register';
  $('#authTitle').textContent=mode==='login'?'Welcome back':'Create your Formly account';
  $('#authSubtitle').textContent=mode==='login'?'Sign in to access your personal Formly profile.':'Create an account and get your own private profile vault.';
  $('#authSubmit').textContent=mode==='login'?'Sign in':'Create account';
  $('#authPassword').autocomplete=mode==='login'?'current-password':'new-password';
  $('#authError').textContent='';
}

function showAuth(){
  $('#authScreen')?.classList.remove('hidden');
  $('#appShell')?.classList.add('auth-locked');
}
function hideAuth(){
  $('#authScreen')?.classList.add('hidden');
  $('#appShell')?.classList.remove('auth-locked');
}

async function submitAuth(event){
  event.preventDefault();
  const email=$('#authEmail').value.trim().toLowerCase();
  const password=$('#authPassword').value;
  const name=$('#authName').value.trim();
  const error=$('#authError');
  error.textContent='';
  const button=$('#authSubmit');
  button.disabled=true;
  button.textContent=authMode==='login'?'Signing in…':'Creating account…';
  try{
    const data=await api(`/api/auth/${authMode==='login'?'login':'register'}`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(authMode==='login'?{email,password}:{name,email,password})
    });
    localStorage.setItem('formly_token',data.token);
    window.dispatchEvent(new CustomEvent('formly-auth-changed',{detail:{token:data.token}}));
    currentUser=data.user;
    await bootWorkspace();
  }catch(err){
    error.textContent=err.message;
  }finally{
    button.disabled=false;
    button.textContent=authMode==='login'?'Sign in':'Create account';
  }
}

async function logout(){
  localStorage.removeItem('formly_token');
  window.dispatchEvent(new CustomEvent('formly-auth-changed',{detail:{token:''}}));
  currentUser=null;
  profile={...defaultProfile};
  showAuth();
  setAuthMode('login');
  toast('Signed out');
}

function showPage(page){
  $$('.page').forEach(x=>x.classList.remove('active'));
  $('#'+page)?.classList.add('active');
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  const titles={dashboard:'Command Center',profile:'My Profile',autofill:'Autofill a form',history:'Autofill history',settings:'Settings & extension'};
  if($('#pageTitle')) $('#pageTitle').textContent=titles[page]||'Formly';
  window.scrollTo(0,0);
}
$$('.nav').forEach(b=>b.onclick=()=>showPage(b.dataset.page));

function showProfileSection(section){
  const target=`sec-${section}`;
  $$('.profile-section').forEach(x=>x.classList.toggle('visible',x.id===target));
  $$('.section-tab').forEach(x=>x.classList.toggle('active',x.dataset.section===section));
}

$$('.section-tab').forEach(tab=>{
  tab.addEventListener('click',()=>showProfileSection(tab.dataset.section));
});

function readFormIntoProfile(){
  $$('[data-key]').forEach(el=>profile[el.dataset.key]=el.value.trim());
}
function loadProfile(){
  $$('[data-key]').forEach(el=>el.value=profile[el.dataset.key]??'');
  updateCompletion();
}
async function saveProfile(){
  readFormIntoProfile();
  try{
    const data=await api('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});
    profile=data.profile||profile;
    updateCompletion();
    toast('Profile saved to your private vault');
  }catch(err){toast(err.message)}
}
function updateCompletion(){
  const vals=Object.values(profile);
  const done=vals.filter(v=>String(v).trim()).length;
  const pct=Math.round(done/vals.length*100);
  if($('#completion')) $('#completion').textContent=pct+'%';
  if($('#completionBar')) $('#completionBar').style.width=pct+'%';
  if($('#profilePct')) $('#profilePct').textContent=pct+'%';
  if($('#dashboardProfilePct')) $('#dashboardProfilePct').textContent=pct+'%';
}
function toast(t){
  const el=$('#toast'); if(!el)return;
  el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2300);
}

async function analyzeFrom(id){
  const url=$('#'+id).value.trim();
  if(!url){toast('Paste a form URL first');return}
  showPage('autofill');$('#formUrl').value=url;
  const fields=[['Full Name','fullName',99],['Mobile Number','mobile',98],['Email Address','email',99],['College / Institution','college',95],['Course','course',94],['Date of Birth','dob',92],['City','city',96],['PIN Code','pincode',97]];
  const box=$('#analysis');box.classList.remove('hidden');
  box.innerHTML='<div class="mapping"><div class="panel-head"><div><h3>Form analyzed</h3><p>'+escapeHtml(url)+'</p></div><span>✓</span></div>'+fields.map(([label,key,conf])=>`<div class="mapping-row"><span>${label}</span><select data-map="${key}">${Object.entries(profile).map(([k,v])=>`<option value="${escapeHtml(k)}" ${k===key?'selected':''}>${escapeHtml(k)}${v?' — '+escapeHtml(v):''}</option>`).join('')}</select><span class="confidence">${conf}%</span></div>`).join('')+'<div style="display:flex;gap:10px;margin-top:20px"><button class="primary" onclick="openAndFill()">Open & Autofill</button><button class="ghost" style="color:#222;background:#f1f2f6" onclick="toast(\'Mapping saved\')">Save mapping</button></div></div>';
}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

async function openAndFill(){
  const url=$('#formUrl').value.trim();
  if(!url){toast('Paste a form URL first');return;}
  if(!token()){toast('Please sign in first');return;}
  try{
    await api('/api/auth/me');

    // The extension creates the target tab and immediately receives its
    // unique Chrome tabId. Activation is tied to that tab only.
    const resultPromise = new Promise(resolve => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onResult);
        resolve(null);
      }, 3000);
      function onResult(e){
        if(e.source !== window || e.origin !== location.origin) return;
        if(e.data?.source !== 'formly-extension' || e.data?.type !== 'OPEN_FORM_RESULT') return;
        clearTimeout(timer);
        window.removeEventListener('message', onResult);
        resolve(e.data.result || null);
      }
      window.addEventListener('message', onResult);
    });

    window.postMessage({source:'formly-web',type:'OPEN_FORM',url}, location.origin);
    const result = await resultPromise;
    if(result?.ok){
      toast('Form opened. Formly is active for this tab.');
      return;
    }

    if(result?.error){
      toast(result.error);
      return;
    }

    toast('Formly extension is not available. Reload the Formly page and try again.');
  }catch(err){toast(err.message)}
}

function openSample(){window.open('sample-form.html','_blank')}

function applyTheme(dark){
  document.body.classList.toggle('theme-dark',dark);
  const toggle=$('#themeToggle'); if(toggle) toggle.checked=dark;
  const label=document.querySelector('.theme-label'); if(label) label.textContent=dark?'Light':'Dark';
  localStorage.setItem('formly_theme',dark?'dark':'light');
}
function initTheme(){
  const saved=localStorage.getItem('formly_theme')||'light';
  applyTheme(saved==='dark');
  $('#themeToggle')?.addEventListener('change',e=>applyTheme(e.target.checked));
}

function updateUserUI(){
  const name=currentUser?.name||currentUser?.email?.split('@')[0]||'User';
  const initial=name.charAt(0).toUpperCase();
  $$('.avatar,.avatar-small').forEach(x=>x.textContent=initial);
  const status=$('#serverStatus'); if(status) status.textContent='Account secured';
  const dot=$('#serverDot'); if(dot) dot.classList.add('online');
  const side=$('#sidebarVaultStatus'); if(side) side.textContent=`Private vault · ${currentUser?.email||''}`;
}

async function loadHistory(){
  try{
    const data=await api('/api/history');
    const rows=$('#historyRows'); if(!rows)return;
    rows.innerHTML=(data.history||[]).map(item=>`<div class="history-row"><span title="${escapeHtml(item.url||'')}">${escapeHtml(item.url||'Form')}</span><span>${item.fields||0}</span><span>${item.match||'—'}</span><span>${new Date(item.createdAt).toLocaleString()}</span></div>`).join('')||'<div class="history-row"><span>No sessions yet</span><span>—</span><span>—</span><span>—</span></div>';
  }catch{}
}

async function bootWorkspace(){
  try{
    const me=await api('/api/auth/me');
    currentUser=me.user;
    const data=await api('/api/profile');
    profile={...defaultProfile,...(data.profile||{})};
    loadProfile();
    updateUserUI();
    hideAuth();
    loadHistory();
  }catch(err){
    localStorage.removeItem('formly_token');
    showAuth();
  }
}

async function init(){
  initTheme();
  setAuthMode('login');
  if(token()) await bootWorkspace(); else showAuth();
}

init();
