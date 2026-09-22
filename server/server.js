const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'formly-development-secret-change-me';
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const USERS_FILE = path.join(DATA, 'users.json');
const USERS_DIR = path.join(DATA, 'users');
const WEB_DIR = path.join(ROOT, '..', 'web');

fs.mkdirSync(USERS_DIR, {recursive:true});
if(!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');

app.use(express.json({limit:'2mb'}));
app.use(cors({origin:(origin,cb)=>{
  const allowed=(process.env.CORS_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!origin || !allowed.length || allowed.includes(origin) || origin.startsWith('chrome-extension://')) return cb(null,true);
  cb(new Error('CORS origin not allowed'));
}}));

function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2))}
function userDir(id){return path.join(USERS_DIR,id)}
function userFile(id,name){return path.join(userDir(id),name)}
function safeUser(user){return {id:user.id,email:user.email,name:user.name,createdAt:user.createdAt}}
function createUserFiles(id){
  fs.mkdirSync(userDir(id),{recursive:true});
  if(!fs.existsSync(userFile(id,'profile.json'))) writeJson(userFile(id,'profile.json'),{});
  if(!fs.existsSync(userFile(id,'history.json'))) writeJson(userFile(id,'history.json'),[]);
  if(!fs.existsSync(userFile(id,'sessions.json'))) writeJson(userFile(id,'sessions.json'),[]);
}
function issueToken(user){return jwt.sign({sub:user.id,email:user.email},JWT_SECRET,{expiresIn:'30d'})}
function auth(req,res,next){
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token) return res.status(401).json({error:'Authentication required'});
  try{
    req.auth=jwt.verify(token,JWT_SECRET);
    const users=readJson(USERS_FILE,{});
    if(!users[req.auth.sub]) return res.status(401).json({error:'Account not found'});
    next();
  }catch{return res.status(401).json({error:'Invalid or expired session'})}
}
function validateEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'formly',version:'3.0.0'}));

app.post('/api/auth/register',async(req,res)=>{
  const name=String(req.body.name||'').trim();
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  if(name.length<2) return res.status(400).json({error:'Enter your name'});
  if(!validateEmail(email)) return res.status(400).json({error:'Enter a valid email'});
  if(password.length<8) return res.status(400).json({error:'Password must be at least 8 characters'});
  const users=readJson(USERS_FILE,{});
  if(Object.values(users).some(u=>u.email===email)) return res.status(409).json({error:'An account with this email already exists'});
  const id=crypto.randomUUID();
  const user={id,name,email,passwordHash:await bcrypt.hash(password,12),createdAt:new Date().toISOString()};
  users[id]=user;writeJson(USERS_FILE,users);createUserFiles(id);
  return res.status(201).json({token:issueToken(user),user:safeUser(user)});
});

app.post('/api/auth/login',async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  const users=readJson(USERS_FILE,{});
  const user=Object.values(users).find(u=>u.email===email);
  if(!user || !(await bcrypt.compare(password,user.passwordHash))) return res.status(401).json({error:'Incorrect email or password'});
  createUserFiles(user.id);
  res.json({token:issueToken(user),user:safeUser(user)});
});

app.get('/api/auth/me',auth,(req,res)=>{
  const users=readJson(USERS_FILE,{});res.json({user:safeUser(users[req.auth.sub])});
});

app.get('/api/profile',auth,(req,res)=>res.json({profile:readJson(userFile(req.auth.sub,'profile.json'),{})}));
app.post('/api/profile',auth,(req,res)=>{
  const profile=req.body && typeof req.body==='object'?req.body:{};
  writeJson(userFile(req.auth.sub,'profile.json'),profile);
  res.json({ok:true,profile});
});

app.get('/api/history',auth,(req,res)=>res.json({history:readJson(userFile(req.auth.sub,'history.json'),[])}));
app.post('/api/history',auth,(req,res)=>{
  const history=readJson(userFile(req.auth.sub,'history.json'),[]);
  const item={...req.body,createdAt:req.body.createdAt||new Date().toISOString()};
  history.unshift(item);writeJson(userFile(req.auth.sub,'history.json'),history.slice(0,100));res.json({ok:true,item});
});

app.post('/api/autofill/session',auth,(req,res)=>{
  const url=String(req.body.url||'').trim();
  if(!url) return res.status(400).json({error:'Form URL is required'});
  let parsed;try{parsed=new URL(url)}catch{return res.status(400).json({error:'Invalid form URL'})}
  const profile=req.body.profile && typeof req.body.profile==='object' ? req.body.profile : readJson(userFile(req.auth.sub,'profile.json'),{});
  const session={id:crypto.randomUUID(),userId:req.auth.sub,url:parsed.toString(),profile,createdAt:Date.now(),expiresAt:Date.now()+5*60*1000,consumed:false};
  const sessions=readJson(userFile(req.auth.sub,'sessions.json'),[]).filter(s=>s.expiresAt>Date.now() && !s.consumed);
  sessions.push(session);writeJson(userFile(req.auth.sub,'sessions.json'),sessions);
  const launchUrl = new URL(session.url); launchUrl.searchParams.set('formly_session', session.id);
  res.status(201).json({ok:true,url:launchUrl.toString(),sessionId:session.id,expiresAt:session.expiresAt});
});

app.get('/api/autofill/session/:id', (req,res)=>{
  const id=String(req.params.id||'');
  const users=readJson(USERS_FILE,{});
  for(const user of Object.values(users)){
    const sessions=readJson(userFile(user.id,'sessions.json'),[]);
    const session=sessions.find(s=>s.id===id && !s.consumed && s.expiresAt>Date.now());
    if(session) return res.json({session});
  }
  res.status(404).json({error:'Autofill session not found or expired'});
});

app.post('/api/autofill/consume', (req,res)=>{
  const id=String(req.body.sessionId||'');
  const users=readJson(USERS_FILE,{});
  for(const user of Object.values(users)){
    const sessions=readJson(userFile(user.id,'sessions.json'),[]);
    const session=sessions.find(s=>s.id===id && !s.consumed);
    if(session){
      session.consumed=true;
      writeJson(userFile(user.id,'sessions.json'),sessions);
      const history=readJson(userFile(user.id,'history.json'),[]);
      history.unshift({url:session.url,fields:Object.keys(session.profile||{}).filter(k=>String(session.profile[k]||'').trim()).length,match:'—',createdAt:new Date().toISOString()});
      writeJson(userFile(user.id,'history.json'),history.slice(0,100));
      return res.json({ok:true});
    }
  }
  res.status(404).json({error:'Autofill session not found'});
});

app.use(express.static(WEB_DIR));
app.get('*',(req,res)=>res.sendFile(path.join(WEB_DIR,'index.html')));

app.listen(PORT,()=>console.log(`Formly running at http://localhost:${PORT}`));
