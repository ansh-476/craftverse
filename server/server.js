const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const emptyProfile = {
  personal: { fullName:'', firstName:'', middleName:'', lastName:'', preferredName:'', dob:'', age:'', gender:'', nationality:'Indian', maritalStatus:'', bloodGroup:'', placeOfBirth:'', motherTongue:'', profilePhoto:'', signature:'' },
  contact: { primaryMobile:'', secondaryMobile:'', whatsapp:'', email:'', secondaryEmail:'', alternateEmail:'', preferredMethod:'' },
  addresses: { current:{address1:'',address2:'',area:'',landmark:'',city:'',district:'',state:'',country:'India',pincode:''}, permanent:{address1:'',address2:'',area:'',landmark:'',city:'',district:'',state:'',country:'India',pincode:''}, hostel:{address1:'',address2:'',area:'',landmark:'',city:'',district:'',state:'',country:'India',pincode:''} },
  education: { current:{level:"Bachelor's",school:'',college:'',university:'',degree:'B.Tech',branch:'IT',specialization:'',year:'',semester:'',prn:'',studentId:'',admissionYear:'',graduationYear:'',cgpa:'',backlogs:''}, tenth:{school:'',board:'',passingYear:'',percentage:'',cgpa:'',rollNumber:''}, twelfth:{school:'',board:'',passingYear:'',percentage:'',cgpa:'',rollNumber:''}, additional:[] },
  professional: { currentTitle:'',company:'',employmentType:'',totalExperience:'',noticePeriod:'',expectedSalary:'',currentSalary:'',preferredLocation:'',workMode:'',relocate:'',previous:[] },
  skills: { programming:[], frameworks:[], databases:[], tools:[], softSkills:[], languages:[] },
  certifications: [], achievements: [],
  online: { github:'', linkedin:'', portfolio:'', leetcode:'', codechef:'', hackerrank:'', geeksforgeeks:'', kaggle:'', stackoverflow:'', youtube:'', x:'', instagram:'' },
  documents: { resume:'', cv:'', photo:'', signature:'', marksheet10:'', marksheet12:'', degree:'', aadhaar:'', pan:'', passport:'', drivingLicence:'', domicile:'', incomeCertificate:'' },
  family: { father:{name:'',occupation:'',mobile:'',email:'',organization:''}, mother:{name:'',occupation:'',mobile:'',email:'',organization:''}, guardian:{name:'',relationship:'',mobile:'',email:'',address:''} },
  emergency: { name:'', relationship:'', mobile:'', secondaryMobile:'', email:'', address:'' },
  financial: { bankName:'', accountHolder:'', accountNumber:'', ifsc:'', upi:'', pan:'', annualIncome:'', familyIncome:'' },
  vehicle: { type:'', number:'', manufacturer:'', model:'', licenceNumber:'', licenceExpiry:'', insuranceNumber:'' },
  preferences: { language:'English', contactMethod:'Email', jobLocation:'', workMode:'', willingToRelocate:'', dietaryPreference:'' },
  customFields: []
};

function readJson(file, fallback){ try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; } }
function writeJson(file, value){ fs.writeFileSync(file, JSON.stringify(value,null,2), 'utf8'); }
if(!fs.existsSync(PROFILE_FILE)) writeJson(PROFILE_FILE, emptyProfile);
if(!fs.existsSync(HISTORY_FILE)) writeJson(HISTORY_FILE, []);
if(!fs.existsSync(SESSION_FILE)) writeJson(SESSION_FILE, []);

app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(ROOT,'web')));

app.get('/api/health',(req,res)=>res.json({ok:true,service:'CraftVerse',version:'2.0.0'}));
function mergeDefaults(defaults, value){
  if(Array.isArray(defaults)) return Array.isArray(value) ? value : defaults;
  if(defaults && typeof defaults==='object'){
    const out={...defaults};
    if(value && typeof value==='object') for(const key of Object.keys(value)) out[key]=key in defaults ? mergeDefaults(defaults[key],value[key]) : value[key];
    return out;
  }
  return value === undefined || value === null ? defaults : value;
}
app.get('/api/profile',(req,res)=>res.json(mergeDefaults(emptyProfile,readJson(PROFILE_FILE,{}))));
app.post('/api/profile',(req,res)=>{ writeJson(PROFILE_FILE, req.body); res.json({success:true,profile:req.body}); });

app.post('/api/analyze',(req,res)=>{
  const fields=['fullName','primaryMobile','email','college','course','dob','city','pincode','state','branch','prn'];
  res.json({url:req.body.url||'',fields:fields.map((key,i)=>({key,confidence:99-(i%6)}))});
});

app.get('/api/history',(req,res)=>res.json(readJson(HISTORY_FILE,[])));
app.post('/api/history',(req,res)=>{ const history=readJson(HISTORY_FILE,[]); history.unshift({...req.body,id:crypto.randomUUID(),createdAt:new Date().toISOString()}); writeJson(HISTORY_FILE,history.slice(0,100)); res.json({success:true}); });

app.post('/api/autofill/session',(req,res)=>{
  const sessions=readJson(SESSION_FILE,[]).filter(s=>!s.consumed && Date.now()-s.createdAt < 120000);
  const session={id:crypto.randomUUID(),url:req.body.url,createdAt:Date.now(),consumed:false};
  sessions.push(session); writeJson(SESSION_FILE,sessions); res.json({success:true,sessionId:session.id});
});
app.get('/api/autofill/pending',(req,res)=>{
  const target=req.query.url||''; const sessions=readJson(SESSION_FILE,[]);
  const hit=sessions.find(s=>!s.consumed && Date.now()-s.createdAt<120000 && s.url===target);
  res.json(hit||null);
});
app.post('/api/autofill/consume',(req,res)=>{
  const sessions=readJson(SESSION_FILE,[]); const s=sessions.find(x=>x.id===req.body.id); if(s){s.consumed=true;writeJson(SESSION_FILE,sessions);} res.json({success:true});
});

app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'web','index.html')));
app.listen(PORT,()=>console.log(`CraftVerse API on http://localhost:${PORT}`));
