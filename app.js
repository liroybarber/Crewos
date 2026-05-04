/* ── CONFIG ── */
var COLS = ["#E8782A","#10B981","#8B5CF6","#EF4444","#F59E0B","#3B82F6"];
var MDL = [
  {id:"percent",   lbl:"אחוז מכל שירות"},
  {id:"hourly",    lbl:"שכיר לפי שעה"},
  {id:"chair",     lbl:"שכירת כיסא בלבד"},
  {id:"chair_pct", lbl:"כיסא + אחוזים"}
];

var fbConfig = {
  apiKey: "AIzaSyB6Js1Xbas9S_cQ7-Japn12vFGJ8UJ1ous",
  authDomain: "crewos-fc781.firebaseapp.com",
  databaseURL: "https://crewos-fc781-default-rtdb.firebaseio.com",
  projectId: "crewos-fc781",
  storageBucket: "crewos-fc781.firebasestorage.app",
  messagingSenderId: "824881537537",
  appId: "1:824881537537:web:cc8a03746624e9c43f5600"
};
firebase.initializeApp(fbConfig);
var db = firebase.database();

/* ── STATE ── */
var bizCode = null, S = null;
var ses = null, lSel = "owner", pin = "";
var eEid = null, eCtr = {}, eCan = 0, eTip = 0, eHrs = 0;
var edId = null, addM = "percent", edM = "percent", edSvc = null, owT = "today";
var syncTimeout = null, oeCtr = {};
var histMonth = new Date().toISOString().slice(0,7);
var histFilter = "all", histSort = "desc";
var unlockTarget = null;

/* ── NUMBER HELPERS ── */
/* ri() = round-to-integer. All money values are integers (no cents). */
function n(v){ return Number(v)||0; }
function ri(v){ return Math.round(n(v)); }
function formatMoney(v){ return "\u20AA" + ri(v); }

/* ── UTILS ── */
function showPg(id){
  document.querySelectorAll(".pg").forEach(function(p){p.classList.remove("on");});
  var el=document.getElementById(id);
  if(el) el.classList.add("on");
  else console.error("[showPg] not found:",id);
}
function openM(id){ var el=document.getElementById(id); if(el)el.classList.add("on"); }
function closeM(id){ var el=document.getElementById(id); if(el)el.classList.remove("on"); }
function td(){ return new Date().toISOString().slice(0,10); }
function ini(nm){ return (nm||"").split(" ").map(function(w){return w[0]||"";}).slice(0,2).join("").toUpperCase(); }
function gsp(emp,sid){ if(emp.sp&&emp.sp[sid]!=null)return n(emp.sp[sid]); return n(emp.pct)||50; }
function logout(){ ses=null; pin=""; lSel="owner"; renderLogin(); showPg("pg-login"); }
function changeBiz(){ ses=null; pin=""; lSel="owner"; bizCode=null; S=null; localStorage.removeItem("crewos_biz"); showPg("pg-welcome"); }

function sb(lbl,val,sub,col){
  return "<div class=st style='border-color:"+col+"33'><div class=lb>"+lbl+"</div><div class=vl style='color:"+col+"'>"+val+"</div>"+(sub?"<div class=sb2>"+sub+"</div>":"")+"</div>";
}

/* ── FIREBASE SAVE ── */
function sv(){
  if(!bizCode||!S) return;
  ensureS(S);
  try{localStorage.setItem("crewos_cache_"+bizCode,JSON.stringify(S));}catch(e){}
  if(syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(function(){
    db.ref("businesses/"+bizCode+"/data").set(S)
      .catch(function(e){console.error("Firebase save error:",e);});
  }, 500);
}

/* ── DEFAULT DATA STRUCTURE ── */
var DEFAULT_SVCS = [{id:"s1",lbl:"\u05ea\u05e1\u05e4\u05d5\u05e8\u05ea",price:120},{id:"s2",lbl:"\u05d6\u05e7\u05df",price:60},{id:"s3",lbl:"\u05e9\u05e0\u05d9\u05d4\u05dd",price:160}];

function defS(bizName, ownerName, sitePassword, ownerPassword, phone){
  return {
    bizName: bizName||"\u05d4\u05de\u05e1\u05e4\u05e8\u05d4 \u05e9\u05dc\u05d9",
    ownerName: ownerName||"\u05d1\u05e2\u05dc \u05d4\u05e2\u05e1\u05e7",
    sitePassword: sitePassword||"",
    ownerPassword: ownerPassword||"",
    phone: phone||"",
    nid: 3, goal: 0,
    svcs: JSON.parse(JSON.stringify(DEFAULT_SVCS)),
    emps: [], ownerEntries: {}, entries: {}, closedDays: {}
  };
}

function ensureS(data){
  if(!data) return defS();
  data.emps         = data.emps||[];
  data.svcs         = data.svcs||JSON.parse(JSON.stringify(DEFAULT_SVCS));
  data.ownerEntries = data.ownerEntries||{};
  data.entries      = data.entries||{};
  data.nid          = n(data.nid)||3;
  data.goal         = n(data.goal);
  data.closedDays   = data.closedDays||{};
  if(!data.ownerPassword&&(data.ownerPin||data.accessPass||data.ownerPass))
    data.ownerPassword = data.ownerPin||data.accessPass||data.ownerPass;
  if(!data.sitePassword&&(data.sitePin||data.accessPass))
    data.sitePassword = data.sitePin||data.accessPass;
  (data.svcs||[]).forEach(function(s){s.price=ri(n(s.price));});
  (data.emps||[]).forEach(function(e){
    e.pct=n(e.pct)||50; e.hr=ri(n(e.hr)); e.cr=ri(n(e.cr));
    if(e.svcs) e.svcs.forEach(function(s){s.price=ri(n(s.price));});
  });
  return data;
}

function isDayClosed(date){
  return !!(S&&S.closedDays&&S.closedDays[date||td()]);
}

/* Returns worker's personal services, or global fallback */
function getWorkerSvcs(emp){
  if(emp && emp.svcs && emp.svcs.length > 0) return emp.svcs;
  return S.svcs||[];
}

/* ── REGISTRATION ── */
function genCode(){ return String(Math.floor(1000+Math.random()*9000)); }

function registerBiz(){
  var bizName   = document.getElementById("reg-biz-name").value.trim();
  var ownerName = document.getElementById("reg-owner-name").value.trim();
  var phone     = document.getElementById("reg-phone").value.trim();
  var email     = document.getElementById("reg-email").value.trim().toLowerCase();
  var sitePass  = document.getElementById("reg-site-pass").value.replace(/\s/g,"");
  var ownerPass = document.getElementById("reg-owner-pass").value.replace(/\s/g,"");
  var ownerPass2= document.getElementById("reg-owner-pass2").value.replace(/\s/g,"");
  var err       = document.getElementById("reg-err");
  err.textContent="";
  if(!bizName)                          {err.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05e9\u05dd \u05de\u05e1\u05e4\u05e8\u05d4";return;}
  if(!ownerName)                        {err.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05e9\u05dd \u05d1\u05e2\u05dc \u05d4\u05e2\u05e1\u05e7";return;}
  if(!phone)                            {err.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05de\u05e1\u05e4\u05e8 \u05d8\u05dc\u05e4\u05d5\u05df";return;}
  if(!email||!email.includes("@"))      {err.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05de\u05d9\u05d9\u05dc \u05ea\u05e7\u05d9\u05df (\u05dc\u05e9\u05d7\u05d6\u05d5\u05e8 \u05e1\u05d9\u05e1\u05de\u05d0)";return;}
  if(!/^\d{4}$/.test(sitePass))         {err.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4: 4 \u05e1\u05e4\u05e8\u05d5\u05ea \u05d1\u05dc\u05d1\u05d3";return;}
  if(!/^\d{4}$/.test(ownerPass))        {err.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7: 4 \u05e1\u05e4\u05e8\u05d5\u05ea \u05d1\u05dc\u05d1\u05d3";return;}
  if(ownerPass!==ownerPass2)            {err.textContent="\u05d0\u05d9\u05e9\u05d5\u05e8 \u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7 \u05dc\u05d0 \u05ea\u05d5\u05d0\u05dd";return;}
  err.textContent="\u05e8\u05d5\u05e9\u05dd...";
  var phoneKey = phone.replace(/\D/g,"");
  db.ref("phones/"+phoneKey).once("value").then(function(snap){
    if(snap.val()){err.textContent="\u05de\u05e1\u05e4\u05e8 \u05d8\u05dc\u05e4\u05d5\u05df \u05db\u05d1\u05e8 \u05e8\u05e9\u05d5\u05dd";return;}
    var code = genCode();
    var newData = defS(bizName,ownerName,sitePass,ownerPass,phone);
    newData.ownerEmail = email;
    var emailKey = email.replace(/\./g,",");
    db.ref("businesses/"+code).set({
      bizName:bizName,ownerName:ownerName,phone:phone,
      ownerEmail:email,createdAt:new Date().toISOString(),data:newData
    })
    .then(function(){ return db.ref("phones/"+phoneKey).set(code); })
    .then(function(){ return db.ref("emails/"+emailKey).set(code); })
    .then(function(){
      bizCode=code; S=newData;
      try{localStorage.setItem("crewos_biz",code);}catch(e){}
      try{localStorage.setItem("crewos_cache_"+code,JSON.stringify(S));}catch(e){}
      document.getElementById("succ-name").textContent="\u05d1\u05e8\u05d5\u05da \u05d4\u05d1\u05d0, "+ownerName+"!";
      document.getElementById("succ-biz").textContent=bizName;
      document.getElementById("succ-phone").textContent=phone;
      document.getElementById("succ-site-pass").textContent=sitePass;
      showPg("pg-reg-success");
    }).catch(function(e){err.textContent="\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e8\u05d9\u05e9\u05d5\u05dd, \u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1"; console.error(e);});
  }).catch(function(){err.textContent="\u05e9\u05d2\u05d9\u05d0\u05ea \u05d7\u05d9\u05d1\u05d5\u05e8";});
}

/* ── SITE LOGIN ── */
async function siteLogin(){
  var phone   = document.getElementById("login-phone").value.trim().replace(/\D/g,"");
  var sitePwd = document.getElementById("login-site-pass").value.replace(/\s/g,"");
  var err     = document.getElementById("login-err");
  var btn     = document.getElementById("login-btn-submit");
  err.textContent="";
  if(!phone)                    {err.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05de\u05e1\u05e4\u05e8 \u05d8\u05dc\u05e4\u05d5\u05df";return;}
  if(!/^\d{4}$/.test(sitePwd)) {err.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05e1\u05d9\u05e1\u05de\u05d0 \u05e9\u05dc 4 \u05e1\u05e4\u05e8\u05d5\u05ea";return;}
  err.textContent="\u05d1\u05d5\u05d3\u05e7..."; btn.disabled=true;
  try{
    var phoneSnap;
    try{ phoneSnap=await db.ref("phones/"+phone).once("value"); }
    catch(e){ err.textContent="\u05e9\u05d2\u05d9\u05d0\u05ea \u05d7\u05d9\u05d1\u05d5\u05e8 ("+(e.code||"unknown")+")"; btn.disabled=false; return; }
    var businessId=phoneSnap.val();
    if(!businessId){err.textContent="\u05de\u05e1\u05e4\u05e8 \u05d8\u05dc\u05e4\u05d5\u05df \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0"; btn.disabled=false; return;}
    var bizSnap;
    try{ bizSnap=await db.ref("businesses/"+businessId).once("value"); }
    catch(e){ err.textContent="\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05d8\u05e2\u05d9\u05e0\u05ea \u05d4\u05e2\u05e1\u05e7 ("+(e.code||"unknown")+")"; btn.disabled=false; return; }
    var biz=bizSnap.val();
    if(!biz||!biz.data){err.textContent="\u05e0\u05ea\u05d5\u05e0\u05d9 \u05e2\u05e1\u05e7 \u05d7\u05e1\u05e8\u05d9\u05dd"; btn.disabled=false; return;}
    var data=biz.data;
    var storedSite=(data.sitePassword||data.sitePin||data.accessPass||"").replace(/\s/g,"");
    if(!storedSite){err.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4 \u05dc\u05d0 \u05de\u05d5\u05d2\u05d3\u05e8\u05ea"; btn.disabled=false; return;}
    if(storedSite!==sitePwd){err.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4 \u05e9\u05d2\u05d5\u05d9\u05d4"; btn.disabled=false; return;}
    err.textContent=""; btn.disabled=false;
    bizCode=businessId; S=ensureS(data);
    try{localStorage.setItem("crewos_biz",businessId);}catch(e){}
    try{localStorage.setItem("crewos_cache_"+businessId,JSON.stringify(S));}catch(e){}
    document.getElementById("biz-name-display").textContent=S.bizName||"\u05d4\u05de\u05e1\u05e4\u05e8\u05d4";
    lSel="owner"; pin=""; renderLogin(); showPg("pg-login");
  }catch(e){ console.error("[LOGIN]",e); err.textContent="\u05e9\u05d2\u05d9\u05d0\u05d4: "+(e.message||e); btn.disabled=false; }
}

/* ── FORGOT PASSWORD ── */
async function ownerForgotPassword(){
  var emailEl=document.getElementById("forgot-email");
  var msg=document.getElementById("forgot-msg");
  var btn=document.getElementById("forgot-btn");
  var email=(emailEl&&emailEl.value.trim().toLowerCase())||"";
  if(!email||!email.includes("@")){if(msg){msg.style.color="var(--re)";msg.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05de\u05d9\u05d9\u05dc \u05ea\u05e7\u05d9\u05df";}return;}
  if(btn)btn.disabled=true;
  try{
    var eSnap=await db.ref("emails/"+email.replace(/\./g,",")).once("value");
    var code=eSnap.val();
    if(!code){
      if(msg){msg.style.color="var(--re)";msg.textContent="\u05de\u05d9\u05d9\u05dc \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0 \u05d1\u05de\u05e2\u05e8\u05db\u05ea";}
      if(btn)btn.disabled=false; return;
    }
    var rf=document.getElementById("forgot-reset-form");
    if(rf){rf.style.display="block";rf.dataset.bizCode=code;}
    if(msg){msg.style.color="var(--gr)";msg.textContent="\u05de\u05d9\u05d9\u05dc \u05e0\u05de\u05e6\u05d0 \u2713 \u05d4\u05d2\u05d3\u05e8 \u05e1\u05d9\u05e1\u05de\u05d0\u05d5\u05ea \u05d7\u05d3\u05e9\u05d5\u05ea:";}
  }catch(e){
    if(msg){msg.style.color="var(--re)";msg.textContent="\u05e9\u05d2\u05d9\u05d0\u05d4: "+(e.message||e);}
  }finally{if(btn)btn.disabled=false;}
}
async function ownerResetPasswords(){
  var rf=document.getElementById("forgot-reset-form");
  var code=rf&&rf.dataset.bizCode;
  var msg=document.getElementById("forgot-msg");
  var newSite=(document.getElementById("forgot-new-site").value||"").replace(/\s/g,"");
  var newOwner=(document.getElementById("forgot-new-owner").value||"").replace(/\s/g,"");
  if(!code){if(msg){msg.style.color="var(--re)";msg.textContent="\u05e9\u05d2\u05d9\u05d0\u05d4: \u05e2\u05e1\u05e7 \u05dc\u05d0 \u05d6\u05d5\u05d4\u05d4";}return;}
  if(!/^\d{4}$/.test(newSite))  {if(msg){msg.style.color="var(--re)";msg.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4: 4 \u05e1\u05e4\u05e8\u05d5\u05ea";}return;}
  if(!/^\d{4}$/.test(newOwner)) {if(msg){msg.style.color="var(--re)";msg.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05e0\u05d9\u05d4\u05d5\u05dc: 4 \u05e1\u05e4\u05e8\u05d5\u05ea";}return;}
  try{
    await db.ref("businesses/"+code+"/data/sitePassword").set(newSite);
    await db.ref("businesses/"+code+"/data/ownerPassword").set(newOwner);
    if(msg){msg.style.color="var(--gr)";msg.textContent="\u05e1\u05d9\u05e1\u05de\u05d0\u05d5\u05ea \u05e2\u05d5\u05d3\u05db\u05e0\u05d5! \u2713 \u05db\u05e2\u05ea \u05ea\u05d5\u05db\u05dc \u05dc\u05d4\u05ea\u05d7\u05d1\u05e8.";}
    if(rf)rf.style.display="none";
  }catch(e){
    if(msg){msg.style.color="var(--re)";msg.textContent="\u05e9\u05d2\u05d9\u05d0\u05d4: "+(e.message||e);}
  }
}

/* ── PICK USER LOGIN ── */
function renderLogin(){
  if(!S) return;
  var h="";
  (S.emps||[]).forEach(function(e){
    var sel=lSel===e.id;
    h+="<div class=eo id='lo-"+e.id+"' onclick='selUser("+e.id+")' style='border-color:"+(sel?e.color:"rgba(255,255,255,.08)")+";background:"+(sel?e.color+"18":"var(--btn)")+"'>";
    h+="<div class=av style='width:40px;height:40px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:12px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:700;font-size:14px'>"+e.name+"</div><div style='color:var(--dm);font-size:11px'>"+e.role+"</div></div></div>";
  });
  document.getElementById("login-emp-list").innerHTML=h;
  var oel=document.getElementById("lo-owner");
  if(oel){
    oel.onclick=function(){selUser("owner");};
    oel.style.borderColor=lSel==="owner"?"var(--or)":"rgba(255,255,255,.08)";
    oel.style.background=lSel==="owner"?"rgba(232,120,42,.1)":"var(--btn)";
  }
  updHint(); rdots();
}
function selUser(id){
  lSel=id; pin="";
  var oel=document.getElementById("lo-owner");
  if(oel){oel.style.borderColor=id==="owner"?"var(--or)":"rgba(255,255,255,.08)";oel.style.background=id==="owner"?"rgba(232,120,42,.1)":"var(--btn)";}
  (S.emps||[]).forEach(function(e){
    var el=document.getElementById("lo-"+e.id); if(!el)return;
    el.style.borderColor=id===e.id?e.color:"rgba(255,255,255,.08)";
    el.style.background=id===e.id?e.color+"18":"var(--btn)";
  });
  var pe=document.getElementById("pin-err"); if(pe)pe.textContent="";
  updHint(); rdots();
}
function updHint(){
  var h=document.getElementById("login-hint"); if(!h)return;
  if(lSel==="owner") h.textContent="\u05d4\u05d6\u05df \u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05d4\u05e2\u05e1\u05e7";
  else{ var e=(S.emps||[]).find(function(x){return x.id===lSel;}); h.textContent=e?"\u05e7\u05d5\u05d3 "+e.name:"\u05d1\u05d7\u05e8 \u05de\u05d9\u05e9\u05d4\u05d5"; }
}
function rdots(){
  for(var i=0;i<4;i++){ var d=document.getElementById("d"+i); if(d)d.className="dt"+(pin.length>i?" on":""); }
  var b=document.getElementById("login-btn"); if(!b)return;
  b.disabled=pin.length<4; b.style.opacity=pin.length<4?".4":"1";
}
function pk(nm){ if(pin.length<4){pin+=nm; rdots();} }
function pdel(){ pin=pin.slice(0,-1); rdots(); }
function doLogin(){
  var inputCode=pin.replace(/\s/g,"");
  var correct, emp;
  if(lSel==="owner"){
    correct=(S.ownerPassword||S.ownerPin||S.accessPass||S.ownerPass||"").replace(/\s/g,"");
    if(!correct){var pe=document.getElementById("pin-err");if(pe)pe.textContent="\u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7 \u05d7\u05e1\u05e8\u05d4"; pin="";rdots();return;}
  }else{
    emp=(S.emps||[]).find(function(e){return e.id===lSel;});
    if(!emp){var pe2=document.getElementById("pin-err");if(pe2)pe2.textContent="\u05d1\u05d7\u05e8 \u05e2\u05d5\u05d1\u05d3"; return;}
    correct=(emp.pin||"").replace(/\s/g,"");
    if(!correct){var pe3=document.getElementById("pin-err");if(pe3)pe3.textContent="\u05e7\u05d5\u05d3 \u05e2\u05d5\u05d1\u05d3 \u05d7\u05e1\u05e8"; pin="";rdots();return;}
  }
  if(inputCode===correct){
    pin="";
    if(lSel==="owner"){ses={role:"owner"};rOwner();showPg("pg-owner");}
    else{
      ses={role:"emp",eid:lSel};
      if(emp.pm==="chair"){
        var av=document.getElementById("chair-av");
        av.textContent=emp.av;av.style.background=emp.color+"22";av.style.border="2px solid "+emp.color;av.style.color=emp.color;
        document.getElementById("chair-name").textContent=emp.name;
        document.getElementById("chair-rent").textContent=formatMoney(emp.cr);
        showPg("pg-chair");
      }else{rEmp();showPg("pg-emp");}
    }
  }else{
    var pe4=document.getElementById("pin-err");if(pe4)pe4.textContent="\u05e7\u05d5\u05d3 \u05e9\u05d2\u05d5\u05d9";
    setTimeout(function(){var pe5=document.getElementById("pin-err");if(pe5)pe5.textContent="";},1500);
    pin="";rdots();
  }
}

/* ── CALC (integer arithmetic) ── */
function calc(list, emp){
  var gross=0, es=0, tips=0, hpay=0;
  list.forEach(function(e){
    gross+=ri(n(e.total)); tips+=ri(n(e.tip));
    if(emp.pm==="hourly") hpay+=ri(n(e.hrs)*n(emp.hr));
    (e.svcs||[]).forEach(function(s){
      if(emp.pm==="percent"||emp.pm==="chair_pct")
        es+=ri(n(s.cnt)*n(s.price)*(gsp(emp,s.id)/100));
    });
  });
  var os=0;
  if(emp.pm==="hourly"){es=ri(hpay+tips);os=ri(gross-hpay);}
  else if(emp.pm==="chair"){es=ri(gross+tips);os=ri(n(emp.cr));}
  else if(emp.pm==="chair_pct"){es=ri(es+tips);os=ri(gross-(es-tips)+n(emp.cr));}
  else{es=ri(es+tips);os=ri(gross-es+tips);}
  return{gross:ri(gross),es:ri(es),os:ri(os),hpay:ri(hpay)};
}

/* ── CLOSE DAY ── */
function closeDay(){
  if(!ses||ses.role!=="owner"){alert("\u05e8\u05e7 \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7 \u05d9\u05db\u05d5\u05dc \u05dc\u05e1\u05d2\u05d5\u05e8 \u05d9\u05d5\u05dd");return;}
  var date=td();
  if(isDayClosed(date)){alert("\u05d4\u05d9\u05d5\u05dd \u05db\u05d1\u05e8 \u05e1\u05d2\u05d5\u05e8");return;}
  if(!confirm("\u05dc\u05e1\u05d2\u05d5\u05e8 \u05d0\u05ea \u05d9\u05d5\u05dd "+date+"?\n\n\u05d0\u05d7\u05e8\u05d9 \u05d4\u05e1\u05d2\u05d9\u05e8\u05d4 \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e2\u05e8\u05d5\u05da \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05dc\u05dc\u05d0 \u05e4\u05ea\u05d9\u05d7\u05d4 \u05de\u05d7\u05d3\u05e9.")){return;}
  var report={date:date,closed:true,closedAt:new Date().toISOString(),workers:{}};
  var ownerTe=(S.ownerEntries||{})[date];
  if(ownerTe) report.workers["owner"]={
    name:S.ownerName,role:"owner",entry:ownerTe,
    gross:ri(n(ownerTe.total)),salary:ri(n(ownerTe.total)),ownerShare:ri(n(ownerTe.total))
  };
  (S.emps||[]).forEach(function(e){
    var te=((S.entries&&S.entries[e.id])||{})[date];
    if(te){
      var r=calc([te],e);
      var svcSnap=(te.svcs||[]).filter(function(s){return ri(n(s.cnt))>0;}).map(function(s){
        return{id:s.id,name:s.lbl,price:ri(n(s.price)),count:ri(n(s.cnt)),total:ri(n(s.cnt))*ri(n(s.price))};
      });
      report.workers[e.id]={
        name:e.name,role:e.role,pm:e.pm,
        services:svcSnap,
        gross:r.gross,salary:r.es,ownerShare:r.os,
        cancels:ri(n(te.cancels)),tip:ri(n(te.tip))
      };
    }
  });
  if(!S.closedDays) S.closedDays={};
  S.closedDays[date]={closed:true,closedAt:report.closedAt};
  sv();
  db.ref("businesses/"+bizCode+"/dailyReports/"+date).set(report)
    .catch(function(e){console.error("dailyReports save error:",e);});
  rOwner();
  alert("\u05d4\u05d9\u05d5\u05dd \u05e0\u05e1\u05d2\u05e8 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4.");
}
function openUnlockModal(date){
  unlockTarget=date||td();
  var ui=document.getElementById("unlock-pin"); if(ui)ui.value="";
  var ue=document.getElementById("unlock-err"); if(ue)ue.textContent="";
  openM("m-unlock");
}
function confirmUnlock(){
  var enteredPin=(document.getElementById("unlock-pin").value||"").replace(/\s/g,"");
  var ownerPwd=(S.ownerPassword||"").replace(/\s/g,"");
  var ue=document.getElementById("unlock-err");
  if(enteredPin!==ownerPwd){ue.textContent="\u05e1\u05d9\u05e1\u05de\u05d0\u05d4 \u05e9\u05d2\u05d5\u05d9\u05d4";return;}
  if(S.closedDays&&S.closedDays[unlockTarget]) delete S.closedDays[unlockTarget];
  sv(); closeM("m-unlock"); rOwner();
}

/* ── OWNER DASHBOARD ── */
function rOwner(){
  var dn=document.getElementById("ow-date");
  if(dn)dn.textContent=S.bizName+" \u2013 "+new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
  var tt=0,mt=0,om=0,tc=0;
  (S.emps||[]).forEach(function(e){
    var all=Object.values((S.entries&&S.entries[e.id])||{}),te=((S.entries&&S.entries[e.id])||{})[td()],r=calc(all,e);
    if(te){tt+=ri(n(te.total));tc+=ri(n(te.cancels));}
    mt+=r.gross; om+=r.os;
    if(e.pm==="chair"||e.pm==="chair_pct") om+=ri(n(e.cr));
  });
  var ownerAll=Object.values(S.ownerEntries||{});
  var ownerTe=(S.ownerEntries||{})[td()];
  tt+=ownerTe?ri(n(ownerTe.total)):0;
  var ownerMonth=ri(ownerAll.reduce(function(s,e){return s+ri(n(e.total));},0));
  mt=ri(mt+ownerMonth); om=ri(om+ownerMonth);
  var otd=document.getElementById("ow-today"); if(otd)otd.textContent=formatMoney(tt);
  var os=document.getElementById("ow-stats");
  if(os)os.innerHTML=sb("\u05e1\u05d4\"\u05db \u05d7\u05d5\u05d3\u05e9",formatMoney(mt),"","#E8782A")+sb("\u05e8\u05d5\u05d5\u05d7 \u05e9\u05dc\u05da",formatMoney(om),"","#10B981")+sb("\u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd",tc,"\u05d4\u05d9\u05d5\u05dd","#EF4444");
  rOwTab(owT);
}
function owTab(t){
  owT=t;
  ["today","emps","report","history","svcs"].forEach(function(x){
    var el=document.getElementById("t-"+x); if(el)el.style.display=x===t?"":"none";
  });
  ["tbt","tbe","tbr","tbh","tbs"].forEach(function(id,i){
    var el=document.getElementById(id); if(!el)return;
    var tabs=["today","emps","report","history","svcs"];
    el.className="tab "+(t===tabs[i]?"on":"off");
  });
  rOwTab(t);
}
function rOwTab(t){
  if(t==="today")rToday();
  else if(t==="emps")rEmps();
  else if(t==="report")rReport();
  else if(t==="history")rHistory();
  else if(t==="svcs")rSvcs();
}

function rToday(){
  var closed=isDayClosed(td());
  var h="";
  if(closed){
    h+="<div class='closed-banner'><div><div class='msg'>\uD83D\uDD12 \u05d9\u05d5\u05dd \u05e0\u05e1\u05d2\u05e8</div><div class='sub'>\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e2\u05e8\u05d5\u05da \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd</div></div><button onclick='openUnlockModal()' style='height:34px;padding:0 12px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:var(--re);border-radius:10px;font-size:12px;font-weight:700'>\u05e4\u05ea\u05d7 \u05dc\u05e2\u05e8\u05d9\u05db\u05d4</button></div>";
  }else{
    h+="<button onclick='closeDay()' style='width:100%;height:46px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:var(--gr);font-size:14px;font-weight:700;margin-bottom:12px'>\uD83D\uDD12 \u05e1\u05d2\u05d5\u05e8 \u05d9\u05d5\u05dd</button>";
  }
  h+="<div class=sl>\u05e1\u05d9\u05db\u05d5\u05dd \u05d9\u05d5\u05dd \u05d6\u05d4</div>";
  var ownerTe=(S.ownerEntries||{})[td()];
  var ownerGross=ownerTe?ri(n(ownerTe.total)):0;
  var ownerSm=ownerTe?(ownerTe.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+": "+s.cnt;}).join(" | "):"\u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd";
  h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between'>";
  h+="<div style='display:flex;align-items:center;gap:12px'>";
  h+="<div class=av style='width:40px;height:40px;background:rgba(232,120,42,.15);border:2px solid var(--or);font-size:11px;font-weight:900;color:var(--or)'>BOS</div>";
  h+="<div><div style='font-weight:700;font-size:14px'>"+S.ownerName+"</div><div style='color:var(--dm);font-size:11px'>"+ownerSm+"</div></div></div>";
  h+="<div style='text-align:left'><div style='color:var(--or);font-weight:900;font-size:18px'>"+formatMoney(ownerGross)+"</div><div style='color:var(--gr);font-size:11px'>\u05d4\u05db\u05e0\u05e1\u05d4 \u05e9\u05dc\u05da</div></div></div>";
  if(!closed){
    h+="<button onclick='openOwnerEntry()' style='width:100%;height:38px;border-radius:10px;margin-top:12px;background:"+(ownerTe?"var(--btn)":"rgba(232,120,42,.1)")+";border:1px solid "+(ownerTe?"var(--br)":"var(--or)")+";color:"+(ownerTe?"var(--mu)":"var(--or)")+";font-size:13px;font-weight:700'>"+(ownerTe?"\u05e2\u05d3\u05db\u05df \u05d9\u05d5\u05dd \u05e9\u05dc\u05d9":"\u05d4\u05d6\u05df \u05d9\u05d5\u05dd \u05e9\u05dc\u05d9")+"</button>";
  }
  h+="</div>";
  (S.emps||[]).forEach(function(e){
    var te=((S.entries&&S.entries[e.id])||{})[td()],r=calc(te?[te]:[],e);
    var c2=te?ri(n(te.cancels)):0,tip=te?ri(n(te.tip)):0;
    var sm=te?(te.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+": "+s.cnt;}).join(" | "):"\u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd";
    h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between'>";
    h+="<div style='display:flex;align-items:center;gap:12px'>";
    h+="<div class=av style='width:40px;height:40px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:12px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:700;font-size:14px'>"+e.name+"</div><div style='color:var(--dm);font-size:11px'>"+sm+(c2?" \u00b7 \u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd:"+c2:"")+(tip?" \u00b7 \u05d8\u05d9\u05e4:"+tip:"")+"</div></div></div>";
    h+="<div style='text-align:left'><div style='color:var(--or);font-weight:900;font-size:18px'>"+formatMoney(r.gross)+"</div><div style='color:var(--gr);font-size:11px'>\u05e9\u05dc\u05da: "+formatMoney(r.os)+"</div></div></div>";
    if(!closed&&e.pm!=="chair"){
      h+="<button onclick='openEntry("+e.id+")' style='width:100%;height:36px;border-radius:10px;margin-top:10px;background:"+(te?"var(--btn)":e.color+"18")+";border:1px solid "+(te?"var(--br)":e.color)+";color:"+(te?"var(--mu)":e.color)+";font-size:13px;font-weight:700'>"+(te?"\u05e2\u05d3\u05db\u05df":"\u05d4\u05d6\u05df \u05d9\u05d5\u05dd")+"</button>";
    }
    h+="</div>";
  });
  var tt=document.getElementById("t-today"); if(tt)tt.innerHTML=h;
}

function rEmps(){
  var h="";
  (S.emps||[]).forEach(function(e){
    var ee=(S.entries&&S.entries[e.id])||{},te=ee[td()],all=Object.values(ee);
    var td2=calc(te?[te]:[],e),mo=calc(all,e),hasT=!!te;
    var ml=(MDL.find(function(m){return m.id===e.pm;})||{lbl:""}).lbl;
    var tc=all.reduce(function(s,x){return s+ri(n(x.cancels));},0);
    var oMon=ri(n(mo.os))+(e.pm==="chair"||e.pm==="chair_pct"?ri(n(e.cr)):0);
    var isC=e.pm==="chair";
    var empSvcsCount=(e.svcs&&e.svcs.length)?e.svcs.length:0;
    h+="<div class=card>";
    h+="<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:14px'>";
    h+="<div style='display:flex;align-items:center;gap:12px'>";
    h+="<div class=av style='width:44px;height:44px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:13px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:800;font-size:15px'>"+e.name+"</div><div style='color:var(--dm);font-size:11px'>"+e.role+(empSvcsCount?" \u00b7 "+empSvcsCount+" \u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd \u05d0\u05d9\u05e9\u05d9\u05d9\u05dd":"")+"</div></div></div>";
    h+="<span class=bdg style='background:"+e.color+"18;color:"+e.color+";border:1px solid "+e.color+"33'>"+ml+"</span></div>";
    h+="<div class=stats style='margin-top:0;margin-bottom:12px'>";
    if(isC){h+=sb("\u05e9\u05db\u05d9\u05e8\u05ea \u05db\u05d9\u05e1\u05d0",formatMoney(e.cr),"\u05d7\u05d5\u05d3\u05e9\u05d9","#E8782A")+sb("\u05e8\u05d5\u05d5\u05d7 \u05e9\u05dc\u05da",formatMoney(e.cr),"\u05d7\u05d5\u05d3\u05e9\u05d9","#10B981");}
    else{h+=sb("\u05d4\u05db\u05e0\u05e1\u05d5\u05ea \u05d4\u05d9\u05d5\u05dd",formatMoney(td2.gross),"",e.color)+sb("\u05e9\u05db\u05e8 \u05e2\u05d5\u05d1\u05d3",formatMoney(td2.es),"",e.color)+sb('\u05e1\u05d4"\u05db \u05d7\u05d5\u05d3\u05e9',formatMoney(mo.gross),"\u05e9\u05dc\u05da: "+formatMoney(oMon),"#10B981")+sb("\u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd",tc,"","#EF4444");}
    h+="</div><div style='display:flex;gap:8px'>";
    h+="<button onclick='openEditModal("+e.id+")' class='btn-secondary' style='flex:1;height:40px;font-size:12px'>\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea</button>";
    if(!isC){
      var dayClosed=isDayClosed(td());
      h+="<button onclick='openEntry("+e.id+")' style='flex:2;height:40px;border-radius:12px;background:"+(hasT?"var(--btn)":e.color+"18")+";border:1px solid "+(hasT?"var(--br)":e.color)+";color:"+(hasT?"var(--mu)":e.color)+";font-size:13px;font-weight:700;"+(dayClosed?"opacity:.5;cursor:not-allowed":"")+"\'"+(dayClosed?" disabled":"")+">"+(hasT?"\u05e2\u05d3\u05db\u05df \u05d9\u05d5\u05dd":"\u05d4\u05d6\u05df \u05d9\u05d5\u05dd")+"</button>";
    }else{
      h+="<div style='flex:2;height:40px;border-radius:12px;background:var(--btn);border:1px solid var(--br);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--dm)'>\u05db\u05d9\u05e1\u05d0 \u05d1\u05dc\u05d1\u05d3</div>";
    }
    h+="</div></div>";
  });
  h+="<button onclick='openM(\"m-add\")' class='bg2' style='width:100%;height:48px;font-size:14px;margin-top:4px'>+ \u05d4\u05d5\u05e1\u05e3 \u05e2\u05d5\u05d1\u05d3</button>";
  var te=document.getElementById("t-emps"); if(te)te.innerHTML=h;
}

function rReport(){
  var mt=0,om=0;
  (S.emps||[]).forEach(function(e){var all=Object.values((S.entries&&S.entries[e.id])||{}),r=calc(all,e);mt+=r.gross;om+=r.os;if(e.pm==="chair"||e.pm==="chair_pct")om+=ri(n(e.cr));});
  var ownerAll=Object.values(S.ownerEntries||{});
  var ownerMonth=ri(ownerAll.reduce(function(s,e){return s+ri(n(e.total));},0));
  mt=ri(mt+ownerMonth); om=ri(om+ownerMonth);
  var goal=ri(n(S.goal)),pct=goal>0?Math.min(100,Math.round(mt/goal*100)):0;
  var gH=goal>0?"<div class=card><div style='display:flex;justify-content:space-between;margin-bottom:6px'><div style='font-size:14px;font-weight:700'>\u05d9\u05e2\u05d3 \u05d7\u05d5\u05d3\u05e9\u05d9</div><div style='color:var(--or);font-weight:800'>"+pct+"%</div></div><div class=pw><div class=pbr style='width:"+pct+"%'></div></div><div style='font-size:11px;color:var(--dm);margin-top:5px'>\u05e0\u05e9\u05d0\u05e8 "+formatMoney(Math.max(0,goal-mt))+"</div></div>":"";
  var ym=new Date().toISOString().slice(0,7),days={};
  (S.emps||[]).forEach(function(e){Object.entries((S.entries&&S.entries[e.id])||{}).forEach(function(p){if(p[0].startsWith(ym))days[p[0]]=(days[p[0]]||0)+ri(n(p[1].total));});});
  Object.entries(S.ownerEntries||{}).forEach(function(p){if(p[0].startsWith(ym))days[p[0]]=(days[p[0]]||0)+ri(n(p[1].total));});
  var dks=Object.keys(days).sort(),mx=Math.max.apply(null,dks.map(function(k){return days[k];}).concat([1]));
  var cH="";
  if(dks.length){cH="<div class=cw3><div style='font-size:11px;color:var(--dm);margin-bottom:8px;font-weight:700'>\u05d4\u05db\u05e0\u05e1\u05d5\u05ea \u05d9\u05d5\u05de\u05d9\u05d5\u05ea</div><div class=cb2>";dks.forEach(function(k){cH+="<div class=bw><div class=bf style='height:"+Math.round(days[k]/mx*100)+"%'></div><div class=bl2>"+parseInt(k.slice(8))+"</div></div>";});cH+="</div></div>";}
  var mx2=Math.max.apply(null,(S.emps||[]).map(function(e){return calc(Object.values((S.entries&&S.entries[e.id])||{}),e).gross;}).concat([ownerMonth,1]));
  var cpH="<div class=card><div style='font-size:13px;font-weight:700;margin-bottom:14px'>\u05d4\u05e9\u05d5\u05d5\u05d0\u05d4</div>";
  cpH+="<div class=cbr><div class=cnr><span>"+S.ownerName+"</span><span style='color:var(--or)'>"+formatMoney(ownerMonth)+"</span></div><div class=cbg><div class=cf style='width:"+Math.round(ownerMonth/mx2*100)+"%;background:var(--or)'></div></div></div>";
  (S.emps||[]).forEach(function(e){var r=calc(Object.values((S.entries&&S.entries[e.id])||{}),e),p=Math.round(r.gross/mx2*100);cpH+="<div class=cbr><div class=cnr><span>"+e.name+"</span><span style='color:"+e.color+"'>"+formatMoney(r.gross)+"</span></div><div class=cbg><div class=cf style='width:"+p+"%;background:"+e.color+"'></div></div></div>";});
  cpH+="</div>";
  var mn=new Date().toLocaleDateString("he-IL",{month:"long",year:"numeric"});
  var tr=document.getElementById("t-report");
  if(tr)tr.innerHTML="<div class=card><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><div><div style='font-size:14px;font-weight:700'>\u05e1\u05d9\u05db\u05d5\u05dd \u05d7\u05d5\u05d3\u05e9</div><div style='font-size:11px;color:var(--dm)'>"+mn+"</div></div><button onclick='openM(\"m-goal\")' style='background:var(--btn);border:1px solid var(--br);color:var(--mu);padding:7px 12px;border-radius:10px;font-size:12px;font-weight:700'>\u05d9\u05e2\u05d3</button></div><div class=stats>"+sb('\u05e1\u05d4"\u05db',formatMoney(mt),"","#E8782A")+sb("\u05e8\u05d5\u05d5\u05d7 \u05e9\u05dc\u05da",formatMoney(om),"","#10B981")+"</div></div>"+gH+cH+cpH;
}

/* ── HISTORY ── */
function histToggleSort(){ histSort=(histSort==="desc"?"asc":"desc"); rHistory(); }
function rHistory(){
  var allMonths={};
  (S.emps||[]).forEach(function(e){Object.keys((S.entries&&S.entries[e.id])||{}).forEach(function(d){allMonths[d.slice(0,7)]=1;});});
  Object.keys(S.ownerEntries||{}).forEach(function(d){allMonths[d.slice(0,7)]=1;});
  var months=Object.keys(allMonths).sort().reverse();
  var th=document.getElementById("t-history");
  if(!months.length){if(th)th.innerHTML="<div style='text-align:center;padding:40px 0;color:var(--dm)'>\u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05e2\u05d3\u05d9\u05d9\u05df</div>";return;}
  if(months.indexOf(histMonth)===-1) histMonth=months[0];
  var empOpts="<option value='all'>\u05db\u05dc \u05d4\u05e2\u05d5\u05d1\u05d3\u05d9\u05dd</option>";
  (S.emps||[]).forEach(function(e){empOpts+="<option value='"+e.id+"'>"+e.name+"</option>";});
  empOpts+="<option value='owner'>"+S.ownerName+"</option>";
  var monthOpts=months.map(function(m){var d=new Date(m+"-01");return "<option value='"+m+"'"+(m===histMonth?" selected":"")+">"+d.toLocaleDateString("he-IL",{month:"long",year:"numeric"})+"</option>";}).join("");
  var h="<div class=card style='margin-bottom:12px'><div style='display:flex;gap:8px;flex-wrap:wrap;align-items:center'>";
  h+="<select id='hist-month' onchange='histMonth=this.value;rHistory()' style='flex:1;min-width:120px'>"+monthOpts+"</select>";
  h+="<select id='hist-filter' onchange='histFilter=this.value;rHistory()' style='flex:1;min-width:110px'>"+empOpts+"</select>";
  h+="<button onclick='histToggleSort()' class='btn-secondary' style='height:48px;padding:0 14px;font-size:13px'>"+(histSort==="desc"?"\u2191 \u05d9\u05e9\u05df":"\u2193 \u05d7\u05d3\u05e9")+"</button>";
  h+="</div></div>";
  var days={};
  (S.emps||[]).forEach(function(e){Object.entries((S.entries&&S.entries[e.id])||{}).forEach(function(p){if(p[0].startsWith(histMonth)){if(!days[p[0]])days[p[0]]={};days[p[0]][e.id]={entry:p[1],emp:e};}});});
  Object.entries(S.ownerEntries||{}).forEach(function(p){if(p[0].startsWith(histMonth)){if(!days[p[0]])days[p[0]]={};days[p[0]]["owner"]={entry:p[1],emp:{id:"owner",name:S.ownerName,color:"#E8782A",pm:"percent",pct:100,sp:{}}};}});
  var sortedDays=Object.keys(days).sort(function(a,b){return histSort==="desc"?b.localeCompare(a):a.localeCompare(b);});
  var mTotal=0,mSalary=0,mOwner=0,mCancel=0;
  sortedDays.forEach(function(d){Object.values(days[d]).forEach(function(row){
    if(row.emp.id==="owner"){mTotal+=ri(n(row.entry.total));mOwner+=ri(n(row.entry.total));}
    else{var r=calc([row.entry],row.emp);mTotal+=r.gross;mSalary+=r.es;mOwner+=r.os;mCancel+=ri(n(row.entry.cancels));if(row.emp.pm==="chair"||row.emp.pm==="chair_pct")mOwner+=ri(n(row.emp.cr));}
  });});
  h+="<div class=card style='border-color:rgba(232,120,42,.2)'><div style='font-size:13px;font-weight:700;margin-bottom:12px;color:var(--or)'>\u05e1\u05d9\u05db\u05d5\u05dd \u05d7\u05d5\u05d3\u05e9\u05d9</div><div class=stats>"+sb('\u05e1\u05d4"\u05db \u05d4\u05db\u05e0\u05e1\u05d5\u05ea',formatMoney(mTotal),"","#E8782A")+sb('\u05e9\u05db\u05e8 \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd',formatMoney(mSalary),"","#8B5CF6")+sb('\u05e8\u05d5\u05d5\u05d7 \u05e9\u05dc\u05da',formatMoney(mOwner),"","#10B981")+sb('\u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd',mCancel,"","#EF4444")+"</div></div>";
  if(!sortedDays.length){h+="<div style='text-align:center;padding:30px 0;color:var(--dm)'>\u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05dc\u05d7\u05d5\u05d3\u05e9 \u05d6\u05d4</div>";if(th)th.innerHTML=h;return;}
  sortedDays.forEach(function(d){
    var dateObj=new Date(d),dateLbl=dateObj.toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
    var closed=!!(S.closedDays&&S.closedDays[d]);
    var rows=Object.values(days[d]).filter(function(row){if(histFilter==="all")return true;if(histFilter==="owner")return row.emp.id==="owner";return String(row.emp.id)===String(histFilter);});
    if(!rows.length)return;
    var dayTotal=0;
    h+="<div class=card>";
    h+="<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>";
    h+="<div style='font-size:13px;font-weight:800'>"+(closed?"\uD83D\uDD12 ":"")+dateLbl+"</div>";
    if(closed&&ses&&ses.role==="owner"){h+="<button onclick='openUnlockModal(\""+d+"\")' style='height:28px;padding:0 10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--re);border-radius:8px;font-size:11px;font-weight:700'>\u05e4\u05ea\u05d7</button>";}
    h+="</div>";
    rows.forEach(function(row){
      var empName=row.emp.name,empColor=row.emp.color||"#E8782A";
      var sm=(row.entry.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+" x"+s.cnt;}).join(" | ")||"---";
      var gross=0,sal=0,ownerShare=0;
      if(row.emp.id==="owner"){gross=ri(n(row.entry.total));ownerShare=gross;}
      else{var r=calc([row.entry],row.emp);gross=r.gross;sal=r.es;ownerShare=r.os;if(row.emp.pm==="chair"||row.emp.pm==="chair_pct")ownerShare+=ri(n(row.emp.cr));}
      dayTotal+=gross;
      h+="<div style='display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--br)'>";
      h+="<div style='display:flex;align-items:center;gap:10px'>";
      h+="<div class=av style='width:34px;height:34px;background:"+empColor+"22;border:2px solid "+empColor+";font-size:10px;color:"+empColor+"'>"+ini(empName)+"</div>";
      h+="<div><div style='font-weight:700;font-size:13px'>"+empName+"</div><div style='color:var(--dm);font-size:11px'>"+sm+"</div></div></div>";
      h+="<div style='text-align:left'>";
      if(row.emp.id!=="owner"){h+="<div style='font-size:11px;color:#8B5CF6'>\u05e9\u05db\u05e8: "+formatMoney(sal)+"</div><div style='font-size:11px;color:#10B981'>\u05e9\u05dc\u05da: "+formatMoney(ownerShare)+"</div>";}
      h+="<div style='font-size:14px;font-weight:900;color:var(--or)'>"+formatMoney(gross)+"</div>";
      if(ri(n(row.entry.cancels))>0)h+="<div style='font-size:10px;color:var(--re)'>\u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd: "+row.entry.cancels+"</div>";
      h+="</div></div>";
    });
    h+="<div style='display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--br)'><span style='font-size:12px;color:var(--dm)'>\u05e1\u05d4\"\u05db \u05d9\u05d5\u05dd</span><span style='font-size:14px;font-weight:900;color:var(--or)'>"+formatMoney(dayTotal)+"</span></div></div>";
  });
  if(th)th.innerHTML=h;
}

function rSvcs(){
  var h="<div class=sl>\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd \u05d1\u05e8\u05d9\u05e8\u05ea \u05de\u05d7\u05d3\u05dc</div><div class=card>";
  (S.svcs||[]).forEach(function(s){
    h+="<div class=smr><div><div style='font-weight:700'>"+s.lbl+"</div><div style='color:var(--or);font-size:12px'>"+formatMoney(s.price)+"</div></div>";
    h+="<div style='display:flex;gap:8px'><button class=ib style='background:rgba(139,92,246,.1);color:#8B5CF6;border:1px solid rgba(139,92,246,.2)' onclick='openEditSvc(\""+s.id+"\")'>\u05e2\u05e8\u05d9\u05db\u05d4</button><button class=ib style='background:rgba(239,68,68,.1);color:var(--re);border:1px solid rgba(239,68,68,.2)' onclick='delSvc(\""+s.id+"\")'>\u05de\u05d7\u05e7</button></div></div>";
  });
  h+="</div><button onclick='openAddSvc()' class='bg2' style='width:100%;height:48px;font-size:14px'>+ \u05d4\u05d5\u05e1\u05e3 \u05e9\u05d9\u05e8\u05d5\u05ea</button>";
  h+="<div style='margin-top:22px'></div><div class=sl>\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7</div><div class=card>";
  h+="<div class=fw><div class=fl>\u05e9\u05e0\u05d4 \u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4 \u05dc\u05e2\u05e1\u05e7</div><input type='password' id='new-site-pass' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div class=fw><div class=fl>\u05d0\u05e9\u05e8 \u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4</div><input type='password' id='new-site-pass2' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div id='site-pass-msg' style='font-size:12px;min-height:16px;margin-bottom:8px'></div>";
  h+="<button onclick='changeSitePass()' class=bg style='width:100%;height:44px;border-radius:12px;font-size:14px;margin-bottom:16px'>\u05e9\u05de\u05d5\u05e8 \u05e1\u05d9\u05e1\u05de\u05ea \u05db\u05e0\u05d9\u05e1\u05d4</button>";
  h+="<div style='border-top:1px solid var(--br);padding-top:16px'></div>";
  h+="<div class=fw><div class=fl>\u05e9\u05e0\u05d4 \u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7</div><input type='password' id='new-owner-pass' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div class=fw><div class=fl>\u05d0\u05e9\u05e8 \u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7</div><input type='password' id='new-owner-pass2' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div id='owner-pass-msg' style='font-size:12px;min-height:16px;margin-bottom:8px'></div>";
  h+="<button onclick='changeOwnerPass()' class=bg style='width:100%;height:44px;border-radius:12px;font-size:14px'>\u05e9\u05de\u05d5\u05e8 \u05e1\u05d9\u05e1\u05de\u05ea \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7</button></div>";
  var ts=document.getElementById("t-svcs"); if(ts)ts.innerHTML=h;
}
function changeSitePass(){
  var np=(document.getElementById("new-site-pass").value||"").trim();
  var cp=(document.getElementById("new-site-pass2").value||"").trim();
  var msg=document.getElementById("site-pass-msg");
  if(!/^\d{4}$/.test(np)){msg.style.color="var(--re)";msg.textContent="4 \u05e1\u05e4\u05e8\u05d5\u05ea \u05d1\u05dc\u05d1\u05d3";return;}
  if(np!==cp){msg.style.color="var(--re)";msg.textContent="\u05d4\u05e1\u05d9\u05e1\u05de\u05d0\u05d5\u05ea \u05dc\u05d0 \u05ea\u05d5\u05d0\u05de\u05d5\u05ea";return;}
  S.sitePassword=np; sv(); msg.style.color="var(--gr)"; msg.textContent="\u05e2\u05d5\u05d3\u05db\u05df!";
  setTimeout(function(){msg.textContent="";},3000);
}
function changeOwnerPass(){
  var np=(document.getElementById("new-owner-pass").value||"").trim();
  var cp=(document.getElementById("new-owner-pass2").value||"").trim();
  var msg=document.getElementById("owner-pass-msg");
  if(!/^\d{4}$/.test(np)){msg.style.color="var(--re)";msg.textContent="4 \u05e1\u05e4\u05e8\u05d5\u05ea \u05d1\u05dc\u05d1\u05d3";return;}
  if(np!==cp){msg.style.color="var(--re)";msg.textContent="\u05d4\u05e1\u05d9\u05e1\u05de\u05d0\u05d5\u05ea \u05dc\u05d0 \u05ea\u05d5\u05d0\u05de\u05d5\u05ea";return;}
  S.ownerPassword=np; sv(); msg.style.color="var(--gr)"; msg.textContent="\u05e2\u05d5\u05d3\u05db\u05df!";
  setTimeout(function(){msg.textContent="";},3000);
}

/* ── OWNER ENTRY (with event delegation) ── */
function openOwnerEntry(){
  if(isDayClosed(td())&&ses.role!=="owner"){alert("\u05d4\u05d9\u05d5\u05dd \u05e0\u05e1\u05d2\u05e8");return;}
  var ex=(S.ownerEntries||{})[td()];
  oeCtr={};
  (S.svcs||[]).forEach(function(s){
    var sid=String(s.id);
    oeCtr[sid]=ex?ri(n(((ex.svcs||[]).find(function(x){return String(x.id)===sid;})||{cnt:0}).cnt)):0;
  });
  var ot=document.getElementById("oe-title"); if(ot)ot.textContent="\u05d4\u05d6\u05e0\u05ea \u05d9\u05d5\u05dd \u05e9\u05dc\u05d9 \u2013 "+new Date().toLocaleDateString("he-IL");
  rOwnerEntrySvcs(); openM("m-owner-entry");
}
function rOwnerEntrySvcs(){
  var html="";
  (S.svcs||[]).forEach(function(s){
    var sid=String(s.id);
    html+="<div class=sr data-svc-row='"+sid+"'>";
    html+="<div><div style='font-size:14px;font-weight:600'>"+s.lbl+"</div><div style='color:var(--dm);font-size:11px'>"+formatMoney(ri(n(s.price)))+" / \u05d9\u05d7\u05d9\u05d3\u05d4</div></div>";
    html+="<div class=cr style='pointer-events:auto'>";
    html+="<button type='button' class='cb m' data-service-id='"+sid+"' data-action='minus' style='pointer-events:auto'>-</button>";
    html+="<span class=cv id='oecv-"+sid+"' style='pointer-events:none'>"+(oeCtr[sid]||0)+"</span>";
    html+="<button type='button' class='cb p' data-service-id='"+sid+"' data-action='plus' style='pointer-events:auto'>+</button>";
    html+="</div></div>";
  });
  var os=document.getElementById("oe-svcs");
  if(os){
    os.innerHTML=html;
    os.onclick=function(ev){
      var btn=ev.target.closest("button[data-service-id]"); if(!btn)return;
      adjOE(btn.getAttribute("data-service-id"), btn.getAttribute("data-action")==="plus"?1:-1);
    };
  }
  updOETot();
}
function adjOE(id,d){
  var sid=String(id);
  oeCtr[sid]=Math.max(0,(ri(n(oeCtr[sid]))||0)+d);
  var el=document.getElementById("oecv-"+sid); if(el)el.textContent=oeCtr[sid];
  updOETot();
}
function updOETot(){
  var cnt=0,amt=0;
  (S.svcs||[]).forEach(function(s){var sid=String(s.id);cnt+=ri(n(oeCtr[sid]));amt+=ri(n(oeCtr[sid]))*ri(n(s.price));});
  var oc=document.getElementById("oe-tcnt"),oa=document.getElementById("oe-tamt");
  if(oc)oc.textContent=cnt; if(oa)oa.textContent=formatMoney(ri(amt));
  var b=document.getElementById("oe-save"); if(b){b.disabled=false;b.style.opacity="1";}
}
function saveOwnerEntry(){
  var svcs=(S.svcs||[]).map(function(s){var sid=String(s.id);return{id:sid,lbl:s.lbl,cnt:ri(n(oeCtr[sid])),price:ri(n(s.price))};});
  var ts=svcs.reduce(function(s,x){return s+ri(n(x.cnt));},0);
  var tot=ri(svcs.reduce(function(s,x){return s+ri(n(x.cnt))*ri(n(x.price));},0));
  if(!S.ownerEntries)S.ownerEntries={};
  S.ownerEntries[td()]={date:td(),svcs:svcs,totalSvcs:ts,total:tot};
  sv(); closeM("m-owner-entry"); rOwner();
}

/* ── EMPLOYEE DASHBOARD (worker sees own salary only) ── */
function rEmp(){
  var e=(S.emps||[]).find(function(x){return x.id===ses.eid;}); if(!e)return;
  var av=document.getElementById("emp-av");
  if(av){av.textContent=e.av;av.style.background=e.color+"22";av.style.border="2px solid "+e.color;av.style.color=e.color;}
  var en=document.getElementById("emp-name"); if(en)en.textContent=e.name;
  var md=e.pm==="percent"?"\u05d0\u05d7\u05d5\u05d6 \u05dc\u05e4\u05d9 \u05e9\u05d9\u05e8\u05d5\u05ea":e.pm==="hourly"?ri(n(e.hr))+"\u20AA \u05dc\u05e9\u05e2\u05d4":e.pm==="chair_pct"?"\u05db\u05d9\u05e1\u05d0 + \u05d0\u05d7\u05d5\u05d6\u05d9\u05dd":"\u05e9\u05db\u05d9\u05e8\u05ea \u05db\u05d9\u05e1\u05d0";
  var esub=document.getElementById("emp-sub"); if(esub)esub.textContent=e.role+" \u2013 "+md;
  var ee=(S.entries&&S.entries[e.id])||{},te=ee[td()],all=Object.values(ee),t2=calc(te?[te]:[],e),mo=calc(all,e);
  var tc=te?ri(n(te.cancels)):0,tca=ri(all.reduce(function(s,x){return s+ri(n(x.cancels));},0));
  var avg=all.length?ri(mo.es/all.length):0;
  var stats=document.getElementById("emp-stats");
  if(stats)stats.innerHTML=
    sb("\u05e9\u05db\u05e8\u05d9 \u05d4\u05d9\u05d5\u05dd",formatMoney(t2.es),"","#E8782A")+
    sb("\u05e9\u05db\u05e8\u05d9 \u05d4\u05d7\u05d5\u05d3\u05e9",formatMoney(mo.es),all.length+" \u05d9\u05de\u05d9\u05dd","#10B981")+
    sb("\u05de\u05de\u05d5\u05e6\u05e2/\u05d9\u05d5\u05dd",formatMoney(avg),"","#E8782A")+
    sb("\u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd",tc,'\u05e1\u05d4"\u05db: '+tca,"#EF4444");
  var act=document.getElementById("emp-act");
  var dayClosed=isDayClosed(td());
  if(act){
    if(dayClosed){act.className="ab locked";act.textContent="\uD83D\uDD12 \u05d9\u05d5\u05dd \u05e0\u05e1\u05d2\u05e8 \u2013 \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e2\u05e8\u05d5\u05da";act.onclick=null;}
    else{act.className="ab "+(te?"done":"pend");act.textContent=te?"\u05e2\u05d3\u05db\u05df \u05e1\u05d9\u05db\u05d5\u05dd \u05d9\u05d5\u05dd":"\u05d4\u05d6\u05df \u05e1\u05d9\u05db\u05d5\u05dd \u05d9\u05d5\u05dd";act.onclick=function(){openEntry(0);};}
  }
  var sorted=all.slice().sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});
  var hist=sorted.length?"":"<div style='text-align:center;padding:32px 0;color:var(--dm)'>\u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05e2\u05d3\u05d9\u05d9\u05df</div>";
  sorted.forEach(function(en){
    var er=calc([en],e);
    var ds=en.date?new Date(en.date).toLocaleDateString("he-IL",{weekday:"short",day:"numeric",month:"short"}):"--";
    var sm=(en.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+" x"+s.cnt;}).join(" | ");
    var c2=ri(n(en.cancels)),t=ri(n(en.tip)),h=ri(n(en.hrs));
    var isClosed=isDayClosed(en.date);
    hist+="<div class=card><div style='display:flex;justify-content:space-between;align-items:center'>";
    hist+="<div><div style='font-weight:700;font-size:13px'>"+(isClosed?"\uD83D\uDD12 ":"")+ds+"</div>";
    hist+="<div style='color:var(--dm);font-size:11px;margin-top:2px'>"+sm+(h?" "+h+"h":"")+(c2?" \u05d1\u05d9\u05d8\u05d5\u05dc\u05d9\u05dd:"+c2:"")+(t?" \u05d8\u05d9\u05e4:"+t:"")+"</div></div>";
    hist+="<div style='text-align:left'>";
    hist+="<div style='color:var(--or);font-weight:900;font-size:16px'>"+formatMoney(er.es)+"</div>";
    hist+="<div style='color:var(--dm);font-size:10px'>"+ri(n(en.totalSvcs))+" \u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd</div>";
    hist+="</div></div></div>";
  });
  var eh=document.getElementById("emp-hist"); if(eh)eh.innerHTML=hist;
}

/* ── ENTRY MODAL (uses worker's personal services) ── */
function openEntry(eid){
  var resolvedEid=eid>0?eid:(ses&&ses.role==="emp"?ses.eid:null); if(!resolvedEid)return;
  if(isDayClosed(td())){
    if(!ses||ses.role!=="owner"){alert("\u05d9\u05d5\u05dd \u05e0\u05e1\u05d2\u05e8 \u2013 \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e2\u05e8\u05d5\u05da");return;}
  }
  eEid=resolvedEid;
  var e=(S.emps||[]).find(function(x){return x.id===eEid;}); if(!e)return;
  var workerSvcs=getWorkerSvcs(e);
  var ex=((S.entries&&S.entries[eEid])||{})[td()];
  eCtr={};eCan=0;eTip=0;eHrs=0;
  workerSvcs.forEach(function(s){
    var sid=String(s.id);
    eCtr[sid]=ex?ri(n(((ex.svcs||[]).find(function(x){return String(x.id)===sid;})||{cnt:0}).cnt)):0;
  });
  if(ex){eCan=ri(n(ex.cancels));eTip=ri(n(ex.tip));eHrs=ri(n(ex.hrs));}
  var etit=document.getElementById("et-title"); if(etit)etit.textContent="\u05e1\u05d9\u05db\u05d5\u05dd \u05d9\u05d5\u05dd \u2013 "+new Date().toLocaleDateString("he-IL");
  var esub=document.getElementById("et-sub"); if(esub)esub.textContent=e.name;
  var ecan=document.getElementById("e-cancel"); if(ecan)ecan.textContent=eCan;
  var etip=document.getElementById("e-tip"); if(etip)etip.textContent=eTip;
  var hw=document.getElementById("e-hours");
  if(e.pm==="hourly"&&hw){
    hw.innerHTML="<div class=xb2 style='background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.2);margin-bottom:10px'><div><div style='font-size:13px;font-weight:700;color:#8B5CF6'>\u05e9\u05e2\u05d5\u05ea \u05e2\u05d1\u05d5\u05d3\u05d4</div><div style='font-size:11px;color:var(--dm);margin-top:1px'>"+formatMoney(ri(n(e.hr)))+" \u05dc\u05e9\u05e2\u05d4</div></div><div class=cr><button class='cb mb' onclick='adjH(-1)'>-</button><span id=e-hrs style='color:#8B5CF6;font-weight:800;font-size:18px;min-width:36px;text-align:center'>"+eHrs+"</span><button class='cb pb' onclick='adjH(1)'>+</button></div></div>";
    var eh=document.getElementById("e-hrow"); if(eh)eh.style.display="flex";
  }else{if(hw)hw.innerHTML="";var eh2=document.getElementById("e-hrow");if(eh2)eh2.style.display="none";}
  rEntrySvcs(workerSvcs); openM("m-entry");
}

function rEntrySvcs(workerSvcs){
  var svcs=workerSvcs||getWorkerSvcs((S.emps||[]).find(function(x){return x.id===eEid;})||{});
  var html="";
  svcs.forEach(function(s){
    var sid=String(s.id);
    html+="<div class=sr data-svc-row='"+sid+"'>";
    html+="<div><div style='font-size:14px;font-weight:600'>"+s.lbl+"</div><div style='color:var(--dm);font-size:11px'>"+formatMoney(ri(n(s.price)))+" / \u05d9\u05d7\u05d9\u05d3\u05d4</div></div>";
    html+="<div class=cr style='pointer-events:auto'>";
    html+="<button type='button' class='cb m' data-service-id='"+sid+"' data-action='minus' style='pointer-events:auto'>-</button>";
    html+="<span class=cv id='cv-"+sid+"' style='pointer-events:none'>"+(eCtr[sid]||0)+"</span>";
    html+="<button type='button' class='cb p' data-service-id='"+sid+"' data-action='plus' style='pointer-events:auto'>+</button>";
    html+="</div></div>";
  });
  var es=document.getElementById("e-svcs");
  if(es){
    es.innerHTML=html;
    es.onclick=function(ev){
      var btn=ev.target.closest("button[data-service-id]"); if(!btn)return;
      var sid=btn.getAttribute("data-service-id");
      var act=btn.getAttribute("data-action");
      var svc=(getWorkerSvcs((S.emps||[]).find(function(x){return x.id===eEid;})||{})).find(function(x){return String(x.id)===sid;});
      console.log("[SVC CLICK] serviceId:",sid,"serviceName:",svc?svc.lbl:"?","action:",act);
      adjS(sid, act==="plus"?1:-1);
    };
  }
  updTot();
}

function adjS(id,d){
  var sid=String(id);
  eCtr[sid]=Math.max(0,(ri(n(eCtr[sid]))||0)+d);
  var el=document.getElementById("cv-"+sid); if(el)el.textContent=eCtr[sid];
  updTot();
}
function adjC(d){eCan=Math.max(0,eCan+d);var el=document.getElementById("e-cancel");if(el)el.textContent=eCan;updTot();}
function adjT(d){eTip=Math.max(0,eTip+d);var el=document.getElementById("e-tip");if(el)el.textContent=eTip;updTot();}
function adjH(d){eHrs=Math.max(0,eHrs+d);var el=document.getElementById("e-hrs");if(el)el.textContent=eHrs;updTot();}

function updTot(){
  var e=(S.emps||[]).find(function(x){return x.id===eEid;})||{};
  var svcs=getWorkerSvcs(e);
  var cnt=0,amt=0;
  svcs.forEach(function(s){var sid=String(s.id);cnt+=ri(n(eCtr[sid]));amt+=ri(n(eCtr[sid]))*ri(n(s.price));});
  var hp=e.pm==="hourly"?ri(ri(n(eHrs))*ri(n(e.hr))):0;
  var el;
  el=document.getElementById("e-tcnt");if(el)el.textContent=cnt;
  el=document.getElementById("e-tcan");if(el)el.textContent=eCan;
  el=document.getElementById("e-ttip");if(el)el.textContent=eTip;
  el=document.getElementById("e-tamt");if(el)el.textContent=formatMoney(ri(amt));
  el=document.getElementById("e-hpay");if(el)el.textContent=formatMoney(hp);
  var b=document.getElementById("e-save");if(b){b.disabled=false;b.style.opacity="1";}
}

function saveEntry(){
  var e=(S.emps||[]).find(function(x){return x.id===eEid;})||{};
  var svcs=getWorkerSvcs(e);
  /* snapshot: name+price locked at time of entry — historical reports immutable */
  var svcSnap=svcs.map(function(s){
    var sid=String(s.id);
    return{id:sid,lbl:s.lbl,cnt:ri(n(eCtr[sid])),price:ri(n(s.price))};
  });
  var ts=svcSnap.reduce(function(s,x){return s+ri(n(x.cnt));},0);
  var tot=ri(svcSnap.reduce(function(s,x){return s+ri(n(x.cnt))*ri(n(x.price));},0));
  if(!S.entries)S.entries={};
  if(!S.entries[eEid])S.entries[eEid]={};
  S.entries[eEid][td()]={date:td(),svcs:svcSnap,totalSvcs:ts,total:tot,cancels:ri(n(eCan)),tip:ri(n(eTip)),hrs:ri(n(eHrs))};
  sv(); closeM("m-entry"); if(ses&&ses.role==="owner")rOwner();else rEmp();
}

/* ── EDIT EMP ── */
function openEditModal(id){
  edId=id; var e=(S.emps||[]).find(function(x){return x.id===id;}); if(!e)return;
  var en=document.getElementById("ed-name"),er=document.getElementById("ed-role"),ep=document.getElementById("ed-pin");
  if(en)en.value=e.name; if(er)er.value=e.role; if(ep)ep.value="";
  edM=e.pm; rEdMdl(); openM("m-edit");
}
function rEdMdl(){
  var e=(S.emps||[]).find(function(x){return x.id===edId;})||{};
  var h="";MDL.forEach(function(m){h+="<div class='mo"+(edM===m.id?" on":"")+"' onclick='setEdM(\""+m.id+"\")'><span style='font-size:14px'>"+m.lbl+"</span></div>";});
  var em=document.getElementById("ed-models"); if(em)em.innerHTML=h;
  var f="";
  if(edM==="percent")f="<div class=fw><div class=fl>\u05d0\u05d7\u05d5\u05d6 \u05d1\u05e8\u05d9\u05e8\u05ea \u05de\u05d7\u05d3\u05dc (%)</div><input type='number' id='ef-pct' value='"+(ri(n(e.pct))||50)+"' min='1' max='99'></div>";
  else if(edM==="hourly")f="<div class=fw><div class=fl>\u05ea\u05e2\u05e8\u05d9\u05e3 \u05dc\u05e9\u05e2\u05d4 (\u20AA)</div><input type='number' id='ef-hr' value='"+ri(n(e.hr))+"' min='0'></div>";
  else if(edM==="chair")f="<div class=fw><div class=fl>\u05e9\u05db\u05d9\u05e8\u05ea \u05db\u05d9\u05e1\u05d0 \u05d7\u05d5\u05d3\u05e9\u05d9\u05ea (\u20AA)</div><input type='number' id='ef-cr' value='"+ri(n(e.cr))+"' min='0'></div>";
  else if(edM==="chair_pct")f="<div class=fw><div class=fl>\u05e9\u05db\u05d9\u05e8\u05ea \u05db\u05d9\u05e1\u05d0 (\u20AA)</div><input type='number' id='ef-cr' value='"+ri(n(e.cr))+"' min='0'></div><div class=fw><div class=fl>\u05d0\u05d7\u05d5\u05d6 \u05dc\u05e2\u05d5\u05d1\u05d3 (%)</div><input type='number' id='ef-pct' value='"+(ri(n(e.pct))||50)+"' min='1' max='99'></div>";
  var ef=document.getElementById("ed-mfields"); if(ef)ef.innerHTML=f;
  var sp=edM==="percent"||edM==="chair_pct";
  var ew=document.getElementById("ed-spw"); if(ew)ew.style.display=sp?"block":"none";
  if(sp)rEdSp();
  rEdWorkerSvcs(e);
}
function setEdM(m){edM=m;rEdMdl();}
function rEdSp(){
  var e=(S.emps||[]).find(function(x){return x.id===edId;})||{sp:{}};
  var h="";
  (S.svcs||[]).forEach(function(s){
    var p=(e.sp&&e.sp[s.id]!=null)?ri(n(e.sp[s.id])):(ri(n(e.pct))||50);
    h+="<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'><span style='font-size:13px'>"+s.lbl+"</span><div style='display:flex;align-items:center;gap:6px'><input type='number' id='sp-"+s.id+"' value='"+p+"' min='0' max='100' style='width:60px;height:40px;font-size:14px;padding:0;text-align:center'><span style='color:var(--dm);font-size:13px'>%</span></div></div>";
  });
  var es=document.getElementById("ed-spct"); if(es)es.innerHTML=h;
}

/* ── PER-WORKER SERVICES EDITOR ── */
function rEdWorkerSvcs(e){
  var empSvcs=e.svcs||[];
  var globalSvcs=S.svcs||[];
  var h="<div style='margin-top:16px;padding-top:16px;border-top:1px solid var(--br)'>";
  h+="<div style='font-size:12px;color:var(--or);font-weight:700;margin-bottom:6px'>\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd \u05d0\u05d9\u05e9\u05d9\u05d9\u05dd \u05dc\u05e2\u05d5\u05d1\u05d3 \u05d6\u05d4</div>";
  if(!empSvcs.length){
    h+="<div style='font-size:12px;color:var(--dm);margin-bottom:8px'>\u05db\u05e8\u05d2\u05e2 \u05de\u05e9\u05ea\u05de\u05e9 \u05d1\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd \u05d4\u05db\u05dc\u05dc\u05d9\u05d9\u05dd. \u05d4\u05d5\u05e1\u05e3 \u05e9\u05d9\u05e8\u05d5\u05ea \u05d0\u05d9\u05e9\u05d9 \u05db\u05d3\u05d9 \u05dc\u05e2\u05e7\u05d5\u05e3.</div>";
    h+="<div style='background:var(--dk);border-radius:10px;padding:10px 12px;margin-bottom:10px'>";
    h+="<div style='font-size:11px;color:var(--dm);margin-bottom:6px'>\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd \u05db\u05dc\u05dc\u05d9\u05d9\u05dd (\u05d1\u05e8\u05d9\u05e8\u05ea \u05de\u05d7\u05d3\u05dc):</div>";
    globalSvcs.forEach(function(s){
      h+="<div style='display:flex;justify-content:space-between;font-size:12px;color:var(--mu);margin-bottom:4px'><span>"+s.lbl+"</span><span>"+formatMoney(s.price)+"</span></div>";
    });
    h+="</div>";
  }else{
    empSvcs.forEach(function(s){
      h+="<div style='display:flex;align-items:center;gap:8px;margin-bottom:8px'>";
      h+="<input type='text' id='esvc-name-"+s.id+"' value='"+s.lbl+"' placeholder='\u05e9\u05dd \u05e9\u05d9\u05e8\u05d5\u05ea' style='flex:2;height:40px;font-size:13px'>";
      h+="<input type='number' id='esvc-price-"+s.id+"' value='"+ri(n(s.price))+"' min='0' placeholder='\u05de\u05d7\u05d9\u05e8' style='flex:1;height:40px;font-size:13px;text-align:center'>";
      h+="<button type='button' onclick='delWorkerSvc(\""+s.id+"\")' style='width:36px;height:36px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--re);font-size:14px;flex-shrink:0'>\u2715</button>";
      h+="</div>";
    });
  }
  h+="<button type='button' onclick='addWorkerSvc()' style='width:100%;height:38px;border-radius:10px;background:rgba(232,120,42,.08);border:1px solid var(--or);color:var(--or);font-size:13px;font-weight:700;margin-top:4px'>+ \u05d4\u05d5\u05e1\u05e3 \u05e9\u05d9\u05e8\u05d5\u05ea \u05d0\u05d9\u05e9\u05d9</button>";
  h+="</div>";
  var ew=document.getElementById("ed-emp-svcs"); if(ew)ew.innerHTML=h;
}

function addWorkerSvc(){
  var e=(S.emps||[]).find(function(x){return x.id===edId;}); if(!e)return;
  if(!e.svcs||!e.svcs.length){
    /* first time: copy global as starting point with new IDs */
    e.svcs=(S.svcs||[]).map(function(s){
      return{id:"ws"+Date.now()+Math.floor(Math.random()*9999),lbl:s.lbl,price:ri(n(s.price))};
    });
  }else{
    e.svcs.push({id:"ws"+Date.now(),lbl:"\u05e9\u05d9\u05e8\u05d5\u05ea \u05d7\u05d3\u05e9",price:0});
  }
  rEdMdl();
}
function delWorkerSvc(sid){
  var e=(S.emps||[]).find(function(x){return x.id===edId;}); if(!e||!e.svcs)return;
  e.svcs=e.svcs.filter(function(s){return String(s.id)!==String(sid);});
  rEdMdl();
}

function saveEdit(){
  var e=(S.emps||[]).find(function(x){return x.id===edId;}); if(!e)return;
  var en=document.getElementById("ed-name"),er=document.getElementById("ed-role"),ep=document.getElementById("ed-pin");
  if(en)e.name=en.value.trim()||e.name;
  if(er)e.role=er.value.trim()||e.role;
  e.av=ini(e.name);
  if(ep){var np=ep.value.trim();if(/^\d{4}$/.test(np))e.pin=np;}
  e.pm=edM;
  var efp=document.getElementById("ef-pct");if(efp)e.pct=ri(n(parseInt(efp.value)))||50;
  var efh=document.getElementById("ef-hr");if(efh)e.hr=ri(n(parseInt(efh.value)));
  var efc=document.getElementById("ef-cr");if(efc)e.cr=ri(n(parseInt(efc.value)));
  e.sp=e.sp||{};
  (S.svcs||[]).forEach(function(s){var el=document.getElementById("sp-"+s.id);if(el)e.sp[s.id]=ri(n(parseInt(el.value)));});
  if(e.svcs&&e.svcs.length){
    e.svcs.forEach(function(s){
      var nl=document.getElementById("esvc-name-"+s.id);
      var np=document.getElementById("esvc-price-"+s.id);
      if(nl)s.lbl=nl.value.trim()||s.lbl;
      if(np)s.price=ri(n(parseInt(np.value)));
    });
  }
  sv(); closeM("m-edit"); rOwner();
}
function deleteEmp(id){
  if(!ses||ses.role!=="owner"){alert("\u05e8\u05e7 \u05d1\u05e2\u05dc \u05e2\u05e1\u05e7 \u05d9\u05db\u05d5\u05dc \u05dc\u05de\u05d7\u05d5\u05e7 \u05e2\u05d5\u05d1\u05d3");return;}
  var e=(S.emps||[]).find(function(x){return x.id===id;}); if(!e){alert("\u05e2\u05d5\u05d1\u05d3 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0");return;}
  if(!confirm("\u05dc\u05de\u05d7\u05d5\u05e7 \u05d0\u05ea "+e.name+"?\n\n\u05d4\u05d3\u05d9\u05d5\u05d5\u05d7\u05d9\u05dd \u05d4\u05d9\u05e1\u05d8\u05d5\u05e8\u05d9\u05d9\u05dd \u05d9\u05d9\u05e9\u05de\u05e8\u05d5.")){return;}
  S.emps=(S.emps||[]).filter(function(x){return x.id!==id;});
  sv();
  db.ref("businesses/"+bizCode+"/data/emps").set(S.emps).catch(function(e){console.error("deleteEmp error:",e);});
  closeM("m-edit"); rOwner();
}

/* ── ADD EMP ── */
function openAddModal(){
  addM="percent";
  ["ad-name","ad-role","ad-pin"].forEach(function(id){var el=document.getElementById(id);if(el)el.value="";});
  rAddMdl(); openM("m-add");
}
function rAddMdl(){
  var h="";MDL.forEach(function(m){h+="<div class='mo"+(addM===m.id?" on":"")+"' onclick='setAdM(\""+m.id+"\")'><span style='font-size:14px'>"+m.lbl+"</span></div>";});
  var am=document.getElementById("ad-models"); if(am)am.innerHTML=h;
  var f="";
  if(addM==="percent")f="<div class=fw><div class=fl>\u05d0\u05d7\u05d5\u05d6 (%)</div><input type='number' id='af-pct' value='50' min='1' max='99'></div>";
  else if(addM==="hourly")f="<div class=fw><div class=fl>\u05ea\u05e2\u05e8\u05d9\u05e3 \u05dc\u05e9\u05e2\u05d4 (\u20AA)</div><input type='number' id='af-hr' value='0' min='0'></div>";
  else if(addM==="chair")f="<div class=fw><div class=fl>\u05e9\u05db\u05d9\u05e8\u05ea \u05db\u05d9\u05e1\u05d0 (\u20AA)</div><input type='number' id='af-cr' value='0' min='0'></div>";
  else if(addM==="chair_pct")f="<div class=fw><div class=fl>\u05e9\u05db\u05d9\u05e8\u05ea \u05db\u05d9\u05e1\u05d0 (\u20AA)</div><input type='number' id='af-cr' value='0' min='0'></div><div class=fw><div class=fl>\u05d0\u05d7\u05d5\u05d6 \u05dc\u05e2\u05d5\u05d1\u05d3 (%)</div><input type='number' id='af-pct' value='50' min='1' max='99'></div>";
  var af=document.getElementById("ad-mfields"); if(af)af.innerHTML=f;
}
function setAdM(m){addM=m;rAddMdl();}
function saveAdd(){
  var anEl=document.getElementById("ad-name"); if(!anEl)return;
  var name=anEl.value.trim(); if(!name)return;
  var arEl=document.getElementById("ad-role"); var role=(arEl&&arEl.value.trim())||"\u05e1\u05e4\u05e8";
  var apEl=document.getElementById("ad-pin"); var np=(apEl&&apEl.value.trim())||"";
  if(!/^\d{4}$/.test(np))np="1234";
  var c=COLS[(S.emps||[]).length%COLS.length];
  var e={id:S.nid++,name:name,role:role,av:ini(name),pm:addM,pct:50,hr:0,cr:0,sp:{},svcs:[],color:c,pin:np};
  var afp=document.getElementById("af-pct");if(afp)e.pct=ri(n(parseInt(afp.value)))||50;
  var afh=document.getElementById("af-hr");if(afh)e.hr=ri(n(parseInt(afh.value)));
  var afc=document.getElementById("af-cr");if(afc)e.cr=ri(n(parseInt(afc.value)));
  (S.emps=S.emps||[]).push(e); sv(); closeM("m-add"); renderLogin(); rOwner();
}

/* ── GLOBAL SERVICES ── */
function openAddSvc(){
  edSvc=null;
  var sn=document.getElementById("sv-name"),sp=document.getElementById("sv-price"),se=document.getElementById("sv-err");
  if(sn)sn.value="";if(sp)sp.value="";if(se)se.textContent="";
  var st=document.getElementById("svc-title");if(st)st.textContent="\u05d4\u05d5\u05e1\u05e3 \u05e9\u05d9\u05e8\u05d5\u05ea";
  openM("m-svc");
}
function openEditSvc(id){
  var s=(S.svcs||[]).find(function(x){return x.id===id;});if(!s)return;
  edSvc=id;
  var sn=document.getElementById("sv-name"),sp=document.getElementById("sv-price"),se=document.getElementById("sv-err"),st=document.getElementById("svc-title");
  if(st)st.textContent="\u05e2\u05e8\u05d9\u05db\u05ea \u05e9\u05d9\u05e8\u05d5\u05ea";if(sn)sn.value=s.lbl;if(sp)sp.value=ri(n(s.price));if(se)se.textContent="";
  openM("m-svc");
}
function saveSvc(){
  var snEl=document.getElementById("sv-name"),spEl=document.getElementById("sv-price"),seEl=document.getElementById("sv-err");
  var svcName=(snEl&&snEl.value.trim())||"";
  var pr=ri(n(parseInt((spEl&&spEl.value)||"0")));
  if(!svcName){if(seEl)seEl.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05e9\u05dd \u05e9\u05d9\u05e8\u05d5\u05ea";return;}
  if(isNaN(pr)||pr<0){if(seEl)seEl.textContent="\u05e0\u05d0 \u05dc\u05d4\u05d6\u05d9\u05df \u05de\u05d7\u05d9\u05e8 \u05ea\u05e7\u05d9\u05df";return;}
  if(seEl)seEl.textContent="";
  if(edSvc){var s=(S.svcs||[]).find(function(x){return x.id===edSvc;});if(s){s.lbl=svcName;s.price=ri(pr);}}
  else{(S.svcs=S.svcs||[]).push({id:"s"+Date.now(),lbl:svcName,price:ri(pr)});}
  sv(); closeM("m-svc"); rSvcs();
}
function delSvc(id){
  if(!confirm("\u05dc\u05de\u05d7\u05d5\u05e7 \u05e9\u05d9\u05e8\u05d5\u05ea \u05d6\u05d4?"))return;
  S.svcs=(S.svcs||[]).filter(function(s){return s.id!==id;});
  sv(); rSvcs();
}
function saveGoal(){
  S.goal=ri(n(parseInt((document.getElementById("goal-v")&&document.getElementById("goal-v").value)||"0")));
  sv(); closeM("m-goal"); rReport();
}

/* ── INIT ── */
(function(){
  function bindBtn(id, fn){
    var el=document.getElementById(id);
    if(el){ el.onclick=fn; }
    else{ console.error("[INIT] element not found:", id); }
  }
  bindBtn("btn-go-login",     function(){ showPg("pg-site-login"); });
  bindBtn("btn-go-register",  function(){ showPg("pg-register"); });
  bindBtn("login-btn-submit", function(){ siteLogin(); });
  bindBtn("login-back",       function(){ showPg("pg-welcome"); });
  bindBtn("reg-btn",          function(){ registerBiz(); });
  bindBtn("reg-back",         function(){ showPg("pg-welcome"); });
  bindBtn("succ-enter-btn",   function(){ ses={role:"owner"}; rOwner(); showPg("pg-owner"); });

  var saved=localStorage.getItem("crewos_biz");
  if(saved){
    try{var c=localStorage.getItem("crewos_cache_"+saved);if(c){S=ensureS(JSON.parse(c));bizCode=saved;}}catch(e){}
    db.ref("businesses/"+saved).once("value").then(function(snap){
      var biz=snap.val();
      if(biz&&biz.data){S=ensureS(biz.data);bizCode=saved;try{localStorage.setItem("crewos_cache_"+saved,JSON.stringify(S));}catch(e){}}
      if(S&&bizCode){
        var bd=document.getElementById("biz-name-display");if(bd)bd.textContent=S.bizName||"\u05d4\u05de\u05e1\u05e4\u05e8\u05d4";
        lSel="owner";pin="";renderLogin();showPg("pg-login");
      }
    }).catch(function(e){console.error("[AUTO-LOGIN ERROR]",e);});
  }
})();
