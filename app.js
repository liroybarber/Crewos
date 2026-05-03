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
var unlockTarget = null; // date string for unlock

/* ── NUMBER HELPERS ── */
function n(v){ return Number(v)||0; }
function r2(v){ return Math.round(n(v)*100)/100; }
function formatMoney(v){
  var num = r2(v);
  return "\u20AA" + (num % 1 === 0 ? num : num.toFixed(2));
}

/* ── UTILS ── */
function showPg(id){
  document.querySelectorAll(".pg").forEach(function(p){p.classList.remove("on");});
  var el = document.getElementById(id);
  if(el) el.classList.add("on");
  else console.error("[showPg] not found:", id);
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
function defS(bizName, ownerName, sitePassword, ownerPassword, phone){
  return {
    bizName: bizName||"המספרה שלי",
    ownerName: ownerName||"בעל העסק",
    sitePassword: sitePassword||"",
    ownerPassword: ownerPassword||"",
    phone: phone||"",
    nid: 3, goal: 0,
    svcs: [{id:"s1",lbl:"תספורת",price:60},{id:"s2",lbl:"זקן",price:40},{id:"s3",lbl:"שניהם",price:90}],
    emps: [], ownerEntries: {}, entries: {}
  };
}

function ensureS(data){
  if(!data) return defS();
  data.emps = data.emps||[];
  data.svcs = data.svcs||[{id:"s1",lbl:"תספורת",price:60},{id:"s2",lbl:"זקן",price:40},{id:"s3",lbl:"שניהם",price:90}];
  data.ownerEntries = data.ownerEntries||{};
  data.entries = data.entries||{};
  data.nid = n(data.nid)||3;
  data.goal = n(data.goal);
  data.closedDays = data.closedDays||{};
  if(!data.ownerPassword&&(data.ownerPin||data.accessPass||data.ownerPass))
    data.ownerPassword = data.ownerPin||data.accessPass||data.ownerPass;
  if(!data.sitePassword&&(data.sitePin||data.accessPass))
    data.sitePassword = data.sitePin||data.accessPass;
  // ensure prices are numbers
  (data.svcs||[]).forEach(function(s){s.price=n(s.price);});
  (data.emps||[]).forEach(function(e){e.pct=n(e.pct)||50;e.hr=n(e.hr);e.cr=n(e.cr);});
  return data;
}

function isDayClosed(date){
  return !!(S&&S.closedDays&&S.closedDays[date||td()]);
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
  if(!bizName)                          {err.textContent="נא להזין שם מספרה";return;}
  if(!ownerName)                        {err.textContent="נא להזין שם בעל העסק";return;}
  if(!phone)                            {err.textContent="נא להזין מספר טלפון";return;}
  if(!email||!email.includes("@"))      {err.textContent="נא להזין כתובת מייל תקינה";return;}
  if(!/^\d{4}$/.test(sitePass))         {err.textContent="סיסמת כניסה: 4 ספרות בלבד";return;}
  if(!/^\d{4}$/.test(ownerPass))        {err.textContent="סיסמת בעל עסק: 4 ספרות בלבד";return;}
  if(ownerPass!==ownerPass2)            {err.textContent="אישור סיסמת בעל עסק לא תואם";return;}
  err.textContent="רושם...";
  var phoneKey  = phone.replace(/\D/g,"");
  var emailKey  = email.replace(/\./g,","); /* Firebase לא מאפשר נקודות במפתח */
  db.ref("phones/"+phoneKey).once("value").then(function(snap){
    if(snap.val()){err.textContent="מספר טלפון כבר רשום"; return;}
    return db.ref("emails/"+emailKey).once("value");
  }).then(function(snap){
    if(!snap) return; /* כבר נתפס בשגיאת טלפון */
    if(snap.val()){err.textContent="מייל זה כבר רשום במערכת"; return;}
    var code    = genCode();
    var newData = defS(bizName,ownerName,sitePass,ownerPass,phone);
    newData.ownerEmail = email;
    return db.ref("businesses/"+code).set({
      bizName:bizName,ownerName:ownerName,phone:phone,
      ownerEmail:email,createdAt:new Date().toISOString(),data:newData
    }).then(function(){ return db.ref("phones/"+phoneKey).set(code); })
    .then(function(){ return db.ref("emails/"+emailKey).set(code); })
    .then(function(){
      bizCode=code; S=newData;
      try{localStorage.setItem("crewos_biz",code);}catch(e){}
      try{localStorage.setItem("crewos_cache_"+code,JSON.stringify(S));}catch(e){}
      document.getElementById("succ-name").textContent="ברוך הבא, "+ownerName+"!";
      document.getElementById("succ-biz").textContent=bizName;
      document.getElementById("succ-phone").textContent=phone;
      document.getElementById("succ-site-pass").textContent=sitePass;
      showPg("pg-reg-success");
    });
  }).catch(function(e){err.textContent="שגיאה ברישום, נסה שוב"; console.error(e);});
}

/* ── RECOVERY BY EMAIL ── */
async function recoverByEmail(){
  var emailEl = document.getElementById("login-forgot-email");
  var msg     = document.getElementById("login-forgot-msg");
  var btn     = document.getElementById("login-forgot-btn");
  var email   = (emailEl&&emailEl.value.trim().toLowerCase())||"";
  if(!email||!email.includes("@")){
    if(msg){msg.style.color="var(--re)";msg.textContent="נא להזין מייל תקין";}
    return;
  }
  if(btn) btn.disabled=true;
  if(msg){msg.style.color="var(--mu)";msg.textContent="מחפש...";}
  try{
    var emailKey = email.replace(/\./g,",");
    var snap = await db.ref("emails/"+emailKey).once("value");
    var code = snap.val();
    if(!code){
      if(msg){msg.style.color="var(--re)";msg.textContent="מייל לא נמצא במערכת";}
    } else {
      /* טען את שם העסק */
      var bizSnap = await db.ref("businesses/"+code+"/bizName").once("value");
      var name = bizSnap.val()||"";
      if(msg){
        msg.style.color="var(--gr)";
        msg.innerHTML="קוד העסק שלך: <strong style='font-size:22px;letter-spacing:4px'>"+code+"</strong>"+(name?"<br><span style='font-size:11px;color:var(--mu)'>"+name+"</span>":"");
      }
    }
  }catch(e){
    if(msg){msg.style.color="var(--re)";msg.textContent="שגיאת חיבור";}
    console.error("[RECOVER]",e);
  }finally{
    if(btn) btn.disabled=false;
  }
}

/* ── SITE LOGIN ── */
async function siteLogin(){
  var phone   = document.getElementById("login-phone").value.trim().replace(/\D/g,"");
  var sitePwd = document.getElementById("login-site-pass").value.replace(/\s/g,"");
  var err     = document.getElementById("login-err");
  var btn     = document.getElementById("login-btn-submit");
  err.textContent="";
  if(!phone)                    {err.textContent="נא להזין מספר טלפון";return;}
  if(!/^\d{4}$/.test(sitePwd)) {err.textContent="נא להזין סיסמה של 4 ספרות";return;}
  err.textContent="בודק..."; btn.disabled=true;
  try{
    var phoneSnap;
    try{ phoneSnap=await db.ref("phones/"+phone).once("value"); }
    catch(e){ err.textContent="שגיאת חיבור ("+( e.code||"unknown")+")"; btn.disabled=false; return; }
    var businessId=phoneSnap.val();
    if(!businessId){err.textContent="מספר טלפון לא נמצא"; btn.disabled=false; return;}
    var bizSnap;
    try{ bizSnap=await db.ref("businesses/"+businessId).once("value"); }
    catch(e){ err.textContent="שגיאה בטעינת העסק ("+( e.code||"unknown")+")"; btn.disabled=false; return; }
    var biz=bizSnap.val();
    if(!biz){err.textContent="עסק לא נמצא"; btn.disabled=false; return;}
    if(!biz.data){err.textContent="נתוני עסק חסרים"; btn.disabled=false; return;}
    var data=biz.data;
    var storedSite=(data.sitePassword||data.sitePin||data.accessPass||"").replace(/\s/g,"");
    console.log("[LOGIN] phone:",phone,"storedSite.length:",storedSite.length,"entered.length:",sitePwd.length,"match:",storedSite===sitePwd);
    if(!storedSite){err.textContent="סיסמת כניסה לא מוגדרת"; btn.disabled=false; return;}
    if(storedSite!==sitePwd){err.textContent="סיסמת כניסה שגויה"; btn.disabled=false; return;}
    err.textContent=""; btn.disabled=false;
    bizCode=businessId; S=ensureS(data);
    try{localStorage.setItem("crewos_biz",businessId);}catch(e){}
    try{localStorage.setItem("crewos_cache_"+businessId,JSON.stringify(S));}catch(e){}
    document.getElementById("biz-name-display").textContent=S.bizName||"המספרה";
    lSel="owner"; pin=""; renderLogin(); showPg("pg-login");
  }catch(e){ console.error("[LOGIN] unexpected:",e); err.textContent="שגיאה: "+(e.message||e); btn.disabled=false; }
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
  if(lSel==="owner") h.textContent="הזן סיסמת בעל העסק";
  else{ var e=(S.emps||[]).find(function(x){return x.id===lSel;}); h.textContent=e?"קוד "+e.name:"בחר מישהו"; }
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
    var ownerPwd=(S.ownerPassword||S.ownerPin||S.accessPass||S.ownerPass||"").replace(/\s/g,"");
    correct=ownerPwd;
    console.log("[DOLOGIN] owner inputCode.length:",inputCode.length,"ownerPassword.length:",correct.length,"match:",correct===inputCode);
    if(!correct){var pe=document.getElementById("pin-err");if(pe)pe.textContent="שגיאה: סיסמת בעל עסק חסרה"; pin="";rdots();return;}
  }else{
    emp=(S.emps||[]).find(function(e){return e.id===lSel;});
    if(!emp){var pe2=document.getElementById("pin-err");if(pe2)pe2.textContent="בחר עובד"; return;}
    correct=(emp.pin||"").replace(/\s/g,"");
    console.log("[DOLOGIN] emp:",emp.name,"inputCode.length:",inputCode.length,"pin.length:",correct.length,"match:",correct===inputCode);
    if(!correct){var pe3=document.getElementById("pin-err");if(pe3)pe3.textContent="שגיאה: קוד עובד חסר"; pin="";rdots();return;}
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
    var pe4=document.getElementById("pin-err");if(pe4)pe4.textContent="קוד שגוי";
    setTimeout(function(){var pe5=document.getElementById("pin-err");if(pe5)pe5.textContent="";},1500);
    pin="";rdots();
  }
}

/* ── CALC ── */
function calc(list, emp){
  var gross=0, es=0, tips=0, hpay=0;
  list.forEach(function(e){
    gross+=n(e.total); tips+=n(e.tip);
    if(emp.pm==="hourly") hpay+=n(e.hrs)*n(emp.hr);
    (e.svcs||[]).forEach(function(s){
      if(emp.pm==="percent"||emp.pm==="chair_pct")
        es+=n(s.cnt)*n(s.price)*(gsp(emp,s.id)/100);
    });
  });
  var os=0;
  if(emp.pm==="hourly"){es=hpay+tips;os=gross-hpay;}
  else if(emp.pm==="chair"){es=gross+tips;os=n(emp.cr);}
  else if(emp.pm==="chair_pct"){es+=tips;os=gross-(es-tips)+n(emp.cr);}
  else{es+=tips;os=gross-es+tips;}
  return{gross:r2(gross),es:r2(es),os:r2(os),hpay:r2(hpay)};
}

/* ── CLOSE DAY ── */
function closeDay(){
  if(!ses||ses.role!=="owner"){alert("רק בעל עסק יכול לסגור יום");return;}
  var date=td();
  if(isDayClosed(date)){alert("היום כבר סגור");return;}
  if(!confirm("לסגור את יום "+date+"?\n\nאחרי הסגירה לא ניתן לערוך נתונים ללא פתיחה מחדש.")){return;}
  // Build daily report snapshot
  var report={date:date,closed:true,closedAt:new Date().toISOString(),workers:{}};
  // owner
  var ownerTe=(S.ownerEntries||{})[date];
  if(ownerTe) report.workers["owner"]={name:S.ownerName,role:"owner",entry:ownerTe,gross:n(ownerTe.total),salary:n(ownerTe.total),ownerShare:n(ownerTe.total)};
  // employees
  (S.emps||[]).forEach(function(e){
    var te=((S.entries&&S.entries[e.id])||{})[date];
    if(te){
      var r=calc([te],e);
      report.workers[e.id]={name:e.name,role:e.role,pm:e.pm,entry:te,gross:r.gross,salary:r.es,ownerShare:r.os,cancels:n(te.cancels)};
    }
  });
  if(!S.closedDays) S.closedDays={};
  S.closedDays[date]={closed:true,closedAt:report.closedAt};
  sv();
  // Also save to dailyReports
  db.ref("businesses/"+bizCode+"/dailyReports/"+date).set(report)
    .catch(function(e){console.error("dailyReports save error:",e);});
  rOwner();
  alert("היום נסגר בהצלחה.");
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
  if(enteredPin!==ownerPwd){ue.textContent="סיסמה שגויה";return;}
  if(S.closedDays&&S.closedDays[unlockTarget]) delete S.closedDays[unlockTarget];
  sv();
  closeM("m-unlock");
  rOwner();
}

/* ── OWNER DASHBOARD ── */
function rOwner(){
  var dn=document.getElementById("ow-date");
  if(dn)dn.textContent=S.bizName+" \u2013 "+new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
  var tt=0,mt=0,om=0,tc=0;
  (S.emps||[]).forEach(function(e){
    var all=Object.values((S.entries&&S.entries[e.id])||{}),te=((S.entries&&S.entries[e.id])||{})[td()],r=calc(all,e);
    if(te){tt+=n(te.total);tc+=n(te.cancels);}
    mt+=n(r.gross);om+=n(r.os);
    if(e.pm==="chair"||e.pm==="chair_pct")om+=n(e.cr);
  });
  var ownerAll=Object.values(S.ownerEntries||{});
  var ownerTe=(S.ownerEntries||{})[td()];
  tt+=ownerTe?n(ownerTe.total):0;
  var ownerMonth=r2(ownerAll.reduce(function(s,e){return s+n(e.total);},0));
  mt=r2(mt+ownerMonth); om=r2(om+ownerMonth);
  var otd=document.getElementById("ow-today"); if(otd)otd.textContent=formatMoney(tt);
  var os=document.getElementById("ow-stats");
  if(os)os.innerHTML=sb("סה\"כ חודש",formatMoney(mt),"","#E8782A")+sb("רווח שלך",formatMoney(om),"","#10B981")+sb("ביטולים",tc,"היום","#EF4444");
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
    h+="<div class='closed-banner'><div><div class='msg'>\uD83D\uDD12 יום נסגר</div><div class='sub'>לא ניתן לערוך נתונים</div></div><button onclick='openUnlockModal()' style='height:34px;padding:0 12px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:var(--re);border-radius:10px;font-size:12px;font-weight:700'>פתח לעריכה</button></div>";
  }else{
    h+="<button onclick='closeDay()' style='width:100%;height:46px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:var(--gr);font-size:14px;font-weight:700;margin-bottom:12px'>\uD83D\uDD12 סגור יום</button>";
  }
  h+="<div class=sl>סיכום יום זה</div>";
  var ownerTe=(S.ownerEntries||{})[td()];
  var ownerGross=ownerTe?n(ownerTe.total):0;
  var ownerSm=ownerTe?(ownerTe.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+": "+s.cnt;}).join(" | "):"אין נתונים";
  h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between'>";
  h+="<div style='display:flex;align-items:center;gap:12px'>";
  h+="<div class=av style='width:40px;height:40px;background:rgba(232,120,42,.15);border:2px solid var(--or);font-size:11px;font-weight:900;color:var(--or)'>BOS</div>";
  h+="<div><div style='font-weight:700;font-size:14px'>"+S.ownerName+"</div><div style='color:var(--dm);font-size:11px'>"+ownerSm+"</div></div></div>";
  h+="<div style='text-align:left'><div style='color:var(--or);font-weight:900;font-size:18px'>"+formatMoney(ownerGross)+"</div><div style='color:var(--gr);font-size:11px'>הכנסה שלך</div></div></div>";
  if(!closed){
    h+="<button onclick='openOwnerEntry()' style='width:100%;height:38px;border-radius:10px;margin-top:12px;background:"+(ownerTe?"var(--btn)":"rgba(232,120,42,.1)")+";border:1px solid "+(ownerTe?"var(--br)":"var(--or)")+";color:"+(ownerTe?"var(--mu)":"var(--or)")+";font-size:13px;font-weight:700'>"+(ownerTe?"עדכן יום שלי":"הזן יום שלי")+"</button>";
  }
  h+="</div>";
  (S.emps||[]).forEach(function(e){
    var te=((S.entries&&S.entries[e.id])||{})[td()],r=calc(te?[te]:[],e);
    var c2=te?n(te.cancels):0,tip=te?n(te.tip):0;
    var sm=te?(te.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+": "+s.cnt;}).join(" | "):"אין נתונים";
    h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between'>";
    h+="<div style='display:flex;align-items:center;gap:12px'>";
    h+="<div class=av style='width:40px;height:40px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:12px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:700;font-size:14px'>"+e.name+"</div><div style='color:var(--dm);font-size:11px'>"+sm+(c2?" \u00b7 ביטולים:"+c2:"")+(tip?" \u00b7 טיפ:"+tip:"")+"</div></div></div>";
    h+="<div style='text-align:left'><div style='color:var(--or);font-weight:900;font-size:18px'>"+formatMoney(r.gross)+"</div><div style='color:var(--gr);font-size:11px'>שלך: "+formatMoney(r.os)+"</div></div></div>";
    if(!closed&&e.pm!=="chair"){
      h+="<button onclick='openEntry("+e.id+")' style='width:100%;height:36px;border-radius:10px;margin-top:10px;background:"+(te?"var(--btn)":"e.color+'18'")+";border:1px solid "+(te?"var(--br)":e.color)+";color:"+(te?"var(--mu)":e.color)+";font-size:13px;font-weight:700'>"+(te?"עדכן":"הזן יום")+"</button>";
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
    var tc=all.reduce(function(s,x){return s+n(x.cancels);},0);
    var oMon=n(mo.os)+(e.pm==="chair"||e.pm==="chair_pct"?n(e.cr):0);
    var isC=e.pm==="chair";
    h+="<div class=card>";
    h+="<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:14px'>";
    h+="<div style='display:flex;align-items:center;gap:12px'>";
    h+="<div class=av style='width:44px;height:44px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:13px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:800;font-size:15px'>"+e.name+"</div><div style='color:var(--dm);font-size:11px'>"+e.role+"</div></div></div>";
    h+="<span class=bdg style='background:"+e.color+"18;color:"+e.color+";border:1px solid "+e.color+"33'>"+ml+"</span></div>";
    h+="<div class=stats style='margin-top:0;margin-bottom:12px'>";
    if(isC){h+=sb("שכירת כיסא",formatMoney(e.cr),"חודשי","#E8782A")+sb("רווח שלך",formatMoney(e.cr),"חודשי","#10B981");}
    else{h+=sb("הכנסות היום",formatMoney(td2.gross),"",e.color)+sb("שכר עובד",formatMoney(td2.es),"",e.color)+sb("סה\"כ חודש",formatMoney(mo.gross),"שלך: "+formatMoney(oMon),"#10B981")+sb("ביטולים",tc,"","#EF4444");}
    h+="</div><div style='display:flex;gap:8px'>";
    h+="<button onclick='openEditModal("+e.id+")' class='btn-secondary' style='flex:1;height:40px;font-size:12px'>הגדרות</button>";
    if(!isC){
      var dayClosed=isDayClosed(td());
      h+="<button onclick='openEntry("+e.id+")' style='flex:2;height:40px;border-radius:12px;background:"+(hasT?"var(--btn)":e.color+"18")+";border:1px solid "+(hasT?"var(--br)":e.color)+";color:"+(hasT?"var(--mu)":e.color)+";font-size:13px;font-weight:700;"+(dayClosed?"opacity:.5;cursor:not-allowed":"")+"\'"+(dayClosed?" disabled":"")+">"+( hasT?"עדכן יום":"הזן יום")+"</button>";
    }else{
      h+="<div style='flex:2;height:40px;border-radius:12px;background:var(--btn);border:1px solid var(--br);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--dm)'>כיסא בלבד</div>";
    }
    h+="</div></div>";
  });
  h+="<button onclick='openM(\"m-add\")' class='bg2' style='width:100%;height:48px;font-size:14px;margin-top:4px'>+ הוסף עובד</button>";
  var te=document.getElementById("t-emps"); if(te)te.innerHTML=h;
}

function rReport(){
  var mt=0,om=0;
  (S.emps||[]).forEach(function(e){var all=Object.values((S.entries&&S.entries[e.id])||{}),r=calc(all,e);mt+=n(r.gross);om+=n(r.os);if(e.pm==="chair"||e.pm==="chair_pct")om+=n(e.cr);});
  var ownerAll=Object.values(S.ownerEntries||{});
  var ownerMonth=r2(ownerAll.reduce(function(s,e){return s+n(e.total);},0));
  mt=r2(mt+ownerMonth); om=r2(om+ownerMonth);
  var goal=n(S.goal),pct=goal>0?Math.min(100,Math.round(mt/goal*100)):0;
  var gH=goal>0?"<div class=card><div style='display:flex;justify-content:space-between;margin-bottom:6px'><div style='font-size:14px;font-weight:700'>יעד חודשי</div><div style='color:var(--or);font-weight:800'>"+pct+"%</div></div><div class=pw><div class=pbr style='width:"+pct+"%'></div></div><div style='font-size:11px;color:var(--dm);margin-top:5px'>נשאר "+formatMoney(Math.max(0,goal-mt))+"</div></div>":"";
  var ym=new Date().toISOString().slice(0,7),days={};
  (S.emps||[]).forEach(function(e){Object.entries((S.entries&&S.entries[e.id])||{}).forEach(function(p){if(p[0].startsWith(ym))days[p[0]]=(days[p[0]]||0)+n(p[1].total);});});
  Object.entries(S.ownerEntries||{}).forEach(function(p){if(p[0].startsWith(ym))days[p[0]]=(days[p[0]]||0)+n(p[1].total);});
  var dks=Object.keys(days).sort(),mx=Math.max.apply(null,dks.map(function(k){return days[k];}).concat([1]));
  var cH="";
  if(dks.length){cH="<div class=cw3><div style='font-size:11px;color:var(--dm);margin-bottom:8px;font-weight:700'>הכנסות יומיות</div><div class=cb2>";dks.forEach(function(k){cH+="<div class=bw><div class=bf style='height:"+Math.round(days[k]/mx*100)+"%'></div><div class=bl2>"+parseInt(k.slice(8))+"</div></div>";});cH+="</div></div>";}
  var mx2=Math.max.apply(null,(S.emps||[]).map(function(e){return n(calc(Object.values((S.entries&&S.entries[e.id])||{}),e).gross);}).concat([n(ownerMonth),1]));
  var cpH="<div class=card><div style='font-size:13px;font-weight:700;margin-bottom:14px'>השוואה</div>";
  cpH+="<div class=cbr><div class=cnr><span>"+S.ownerName+"</span><span style='color:var(--or)'>"+formatMoney(ownerMonth)+"</span></div><div class=cbg><div class=cf style='width:"+Math.round(ownerMonth/mx2*100)+"%;background:var(--or)'></div></div></div>";
  (S.emps||[]).forEach(function(e){var r=calc(Object.values((S.entries&&S.entries[e.id])||{}),e),p=Math.round(n(r.gross)/mx2*100);cpH+="<div class=cbr><div class=cnr><span>"+e.name+"</span><span style='color:"+e.color+"'>"+formatMoney(r.gross)+"</span></div><div class=cbg><div class=cf style='width:"+p+"%;background:"+e.color+"'></div></div></div>";});
  cpH+="</div>";
  var mn=new Date().toLocaleDateString("he-IL",{month:"long",year:"numeric"});
  var tr=document.getElementById("t-report");
  if(tr)tr.innerHTML="<div class=card><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><div><div style='font-size:14px;font-weight:700'>סיכום חודש</div><div style='font-size:11px;color:var(--dm)'>"+mn+"</div></div><button onclick='openM(\"m-goal\")' style='background:var(--btn);border:1px solid var(--br);color:var(--mu);padding:7px 12px;border-radius:10px;font-size:12px;font-weight:700'>יעד</button></div><div class=stats>"+sb("סה\"כ",formatMoney(mt),"","#E8782A")+sb("רווח שלך",formatMoney(om),"","#10B981")+"</div></div>"+gH+cH+cpH;
}

/* ── HISTORY ── */
function histToggleSort(){ histSort=(histSort==="desc"?"asc":"desc"); rHistory(); }

function rHistory(){
  var allMonths={};
  (S.emps||[]).forEach(function(e){Object.keys((S.entries&&S.entries[e.id])||{}).forEach(function(d){allMonths[d.slice(0,7)]=1;});});
  Object.keys(S.ownerEntries||{}).forEach(function(d){allMonths[d.slice(0,7)]=1;});
  var months=Object.keys(allMonths).sort().reverse();
  var th=document.getElementById("t-history");
  if(!months.length){if(th)th.innerHTML="<div style='text-align:center;padding:40px 0;color:var(--dm)'>אין נתונים עדיין</div>";return;}
  if(months.indexOf(histMonth)===-1) histMonth=months[0];
  var empOpts="<option value='all'>כל העובדים</option>";
  (S.emps||[]).forEach(function(e){empOpts+="<option value='"+e.id+"'>"+e.name+"</option>";});
  empOpts+="<option value='owner'>"+S.ownerName+"</option>";
  var monthOpts=months.map(function(m){var d=new Date(m+"-01");var lbl=d.toLocaleDateString("he-IL",{month:"long",year:"numeric"});return "<option value='"+m+"'"+(m===histMonth?" selected":"")+">"+lbl+"</option>";}).join("");
  var h="<div class=card style='margin-bottom:12px'><div style='display:flex;gap:8px;flex-wrap:wrap;align-items:center'>";
  h+="<select id='hist-month' onchange='histMonth=this.value;rHistory()' style='flex:1;min-width:120px'>"+monthOpts+"</select>";
  h+="<select id='hist-filter' onchange='histFilter=this.value;rHistory()' style='flex:1;min-width:110px'>"+empOpts+"</select>";
  h+="<button onclick='histToggleSort()' class='btn-secondary' style='height:48px;padding:0 14px;font-size:13px'>"+(histSort==="desc"?"↑ ישן":"↓ חדש")+"</button>";
  h+="</div></div>";
  var days={};
  (S.emps||[]).forEach(function(e){Object.entries((S.entries&&S.entries[e.id])||{}).forEach(function(p){if(p[0].startsWith(histMonth)){if(!days[p[0]])days[p[0]]={};days[p[0]][e.id]={entry:p[1],emp:e};}});});
  Object.entries(S.ownerEntries||{}).forEach(function(p){if(p[0].startsWith(histMonth)){if(!days[p[0]])days[p[0]]={};days[p[0]]["owner"]={entry:p[1],emp:{id:"owner",name:S.ownerName,color:"#E8782A",pm:"percent",pct:100,sp:{}}};}});
  var sortedDays=Object.keys(days).sort(function(a,b){return histSort==="desc"?b.localeCompare(a):a.localeCompare(b);});
  var mTotal=0,mSalary=0,mOwner=0,mCancel=0;
  sortedDays.forEach(function(d){Object.values(days[d]).forEach(function(row){if(row.emp.id==="owner"){mTotal+=n(row.entry.total);mOwner+=n(row.entry.total);}else{var r=calc([row.entry],row.emp);mTotal+=n(r.gross);mSalary+=n(r.es);mOwner+=n(r.os);mCancel+=n(row.entry.cancels);if(row.emp.pm==="chair"||row.emp.pm==="chair_pct")mOwner+=n(row.emp.cr);}});});
  h+="<div class=card style='border-color:rgba(232,120,42,.2)'><div style='font-size:13px;font-weight:700;margin-bottom:12px;color:var(--or)'>סיכום חודשי</div><div class=stats>"+sb("סה\"כ הכנסות",formatMoney(mTotal),"","#E8782A")+sb("שכר עובדים",formatMoney(mSalary),"","#8B5CF6")+sb("רווח שלך",formatMoney(mOwner),"","#10B981")+sb("ביטולים",mCancel,"","#EF4444")+"</div></div>";
  if(!sortedDays.length){h+="<div style='text-align:center;padding:30px 0;color:var(--dm)'>אין נתונים לחודש זה</div>";if(th)th.innerHTML=h;return;}
  sortedDays.forEach(function(d){
    var dateObj=new Date(d),dateLbl=dateObj.toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
    var closed=!!(S.closedDays&&S.closedDays[d]);
    var rows=Object.values(days[d]).filter(function(row){if(histFilter==="all")return true;if(histFilter==="owner")return row.emp.id==="owner";return String(row.emp.id)===String(histFilter);});
    if(!rows.length)return;
    var dayTotal=0,daySalary=0,dayOwner=0;
    h+="<div class=card>";
    h+="<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:12px'>";
    h+="<div style='font-size:13px;font-weight:800'>"+(closed?"\uD83D\uDD12 ":"")+dateLbl+"</div>";
    if(closed&&ses&&ses.role==="owner"){h+="<button onclick='openUnlockModal(\""+d+"\")' style='height:28px;padding:0 10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:var(--re);border-radius:8px;font-size:11px;font-weight:700'>פתח</button>";}
    h+="</div>";
    rows.forEach(function(row){
      var empName=row.emp.name,empColor=row.emp.color||"#E8782A";
      var sm=(row.entry.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+" x"+s.cnt;}).join(" | ")||"---";
      var gross=0,sal=0,ownerShare=0;
      if(row.emp.id==="owner"){gross=n(row.entry.total);ownerShare=gross;}
      else{var r=calc([row.entry],row.emp);gross=n(r.gross);sal=n(r.es);ownerShare=n(r.os);if(row.emp.pm==="chair"||row.emp.pm==="chair_pct")ownerShare+=n(row.emp.cr);}
      dayTotal+=gross;daySalary+=sal;dayOwner+=ownerShare;
      h+="<div style='display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--br)'>";
      h+="<div style='display:flex;align-items:center;gap:10px'>";
      h+="<div class=av style='width:34px;height:34px;background:"+empColor+"22;border:2px solid "+empColor+";font-size:10px;color:"+empColor+"'>"+ini(empName)+"</div>";
      h+="<div><div style='font-weight:700;font-size:13px'>"+empName+"</div><div style='color:var(--dm);font-size:11px'>"+sm+"</div></div></div>";
      h+="<div style='text-align:left'>";
      if(row.emp.id!=="owner"){h+="<div style='font-size:11px;color:#8B5CF6'>שכר: "+formatMoney(sal)+"</div><div style='font-size:11px;color:#10B981'>שלך: "+formatMoney(ownerShare)+"</div>";}
      h+="<div style='font-size:14px;font-weight:900;color:var(--or)'>"+formatMoney(gross)+"</div>";
      if(n(row.entry.cancels)>0)h+="<div style='font-size:10px;color:var(--re)'>ביטולים: "+row.entry.cancels+"</div>";
      h+="</div></div>";
    });
    h+="<div style='display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--br)'><span style='font-size:12px;color:var(--dm)'>סה\"כ יום</span><span style='font-size:14px;font-weight:900;color:var(--or)'>"+formatMoney(dayTotal)+"</span></div></div>";
  });
  if(th)th.innerHTML=h;
}

function rSvcs(){
  var h="<div class=sl>שירותים ומחירים</div><div class=card>";
  (S.svcs||[]).forEach(function(s){
    h+="<div class=smr><div><div style='font-weight:700'>"+s.lbl+"</div><div style='color:var(--or);font-size:12px'>"+formatMoney(s.price)+"</div></div>";
    h+="<div style='display:flex;gap:8px'><button class=ib style='background:rgba(139,92,246,.1);color:#8B5CF6;border:1px solid rgba(139,92,246,.2)' onclick='openEditSvc(\""+s.id+"\")'>עריכה</button><button class=ib style='background:rgba(239,68,68,.1);color:var(--re);border:1px solid rgba(239,68,68,.2)' onclick='delSvc(\""+s.id+"\")'>מחק</button></div></div>";
  });
  h+="</div><button onclick='openAddSvc()' class='bg2' style='width:100%;height:48px;font-size:14px'>+ הוסף שירות</button>";
  h+="<div style='margin-top:22px'></div><div class=sl>הגדרות בעל עסק</div><div class=card>";
  h+="<div class=fw><div class=fl>שנה סיסמת כניסה לעסק</div><input type='password' id='new-site-pass' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div class=fw><div class=fl>אשר סיסמת כניסה</div><input type='password' id='new-site-pass2' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div id='site-pass-msg' style='font-size:12px;min-height:16px;margin-bottom:8px'></div>";
  h+="<button onclick='changeSitePass()' class=bg style='width:100%;height:44px;border-radius:12px;font-size:14px;margin-bottom:16px'>שמור סיסמת כניסה</button>";
  h+="<div style='border-top:1px solid var(--br);padding-top:16px'></div>";
  h+="<div class=fw><div class=fl>שנה סיסמת בעל עסק</div><input type='password' id='new-owner-pass' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div class=fw><div class=fl>אשר סיסמת בעל עסק</div><input type='password' id='new-owner-pass2' maxlength='4' inputmode='numeric' placeholder='••••'></div>";
  h+="<div id='owner-pass-msg' style='font-size:12px;min-height:16px;margin-bottom:8px'></div>";
  h+="<button onclick='changeOwnerPass()' class=bg style='width:100%;height:44px;border-radius:12px;font-size:14px'>שמור סיסמת בעל עסק</button></div>";
  var ts=document.getElementById("t-svcs"); if(ts)ts.innerHTML=h;
}

function changeSitePass(){
  var np=(document.getElementById("new-site-pass").value||"").trim();
  var cp=(document.getElementById("new-site-pass2").value||"").trim();
  var msg=document.getElementById("site-pass-msg");
  if(!/^\d{4}$/.test(np)){msg.style.color="var(--re)";msg.textContent="4 ספרות בלבד";return;}
  if(np!==cp){msg.style.color="var(--re)";msg.textContent="הסיסמאות לא תואמות";return;}
  S.sitePassword=np; sv();
  msg.style.color="var(--gr)"; msg.textContent="עודכן!";
  setTimeout(function(){msg.textContent="";},3000);
}
function changeOwnerPass(){
  var np=(document.getElementById("new-owner-pass").value||"").trim();
  var cp=(document.getElementById("new-owner-pass2").value||"").trim();
  var msg=document.getElementById("owner-pass-msg");
  if(!/^\d{4}$/.test(np)){msg.style.color="var(--re)";msg.textContent="4 ספרות בלבד";return;}
  if(np!==cp){msg.style.color="var(--re)";msg.textContent="הסיסמאות לא תואמות";return;}
  S.ownerPassword=np; sv();
  msg.style.color="var(--gr)"; msg.textContent="עודכן!";
  setTimeout(function(){msg.textContent="";},3000);
}

/* ── OWNER ENTRY ── */
function openOwnerEntry(){
  if(isDayClosed(td())&&ses.role!=="owner"){alert("היום נסגר");return;}
  var ex=(S.ownerEntries||{})[td()];
  oeCtr={};
  (S.svcs||[]).forEach(function(s){oeCtr[s.id]=ex?n(((ex.svcs||[]).find(function(x){return x.id===s.id;})||{cnt:0}).cnt):0;});
  var ot=document.getElementById("oe-title"); if(ot)ot.textContent="הזנת יום שלי \u2013 "+new Date().toLocaleDateString("he-IL");
  rOwnerEntrySvcs(); openM("m-owner-entry");
}
function rOwnerEntrySvcs(){
  var html="";
  (S.svcs||[]).forEach(function(s){
    html+="<div class=sr><div><div style='font-size:14px;font-weight:600'>"+s.lbl+"</div><div style='color:var(--dm);font-size:11px'>"+formatMoney(s.price)+" / יחידה</div></div>";
    html+="<div class=cr><button class='cb m' onclick='adjOE(\""+s.id+"\",-1)'>-</button><span class=cv id='oecv-"+s.id+"'>"+(oeCtr[s.id]||0)+"</span><button class='cb p' onclick='adjOE(\""+s.id+"\",1)'>+</button></div></div>";
  });
  var os=document.getElementById("oe-svcs"); if(os)os.innerHTML=html;
  updOETot();
}
function adjOE(id,d){oeCtr[id]=Math.max(0,n(oeCtr[id])+d);var el=document.getElementById("oecv-"+id);if(el)el.textContent=oeCtr[id];updOETot();}
function updOETot(){
  var cnt=0,amt=0;
  (S.svcs||[]).forEach(function(s){cnt+=n(oeCtr[s.id]);amt+=n(oeCtr[s.id])*n(s.price);});
  var oc=document.getElementById("oe-tcnt"),oa=document.getElementById("oe-tamt");
  if(oc)oc.textContent=cnt; if(oa)oa.textContent=formatMoney(amt);
  var b=document.getElementById("oe-save"); if(b){b.disabled=false;b.style.opacity="1";}
}
function saveOwnerEntry(){
  var svcs=(S.svcs||[]).map(function(s){return{id:s.id,lbl:s.lbl,cnt:n(oeCtr[s.id]),price:n(s.price)};});
  var ts=svcs.reduce(function(s,x){return s+n(x.cnt);},0);
  var tot=r2(svcs.reduce(function(s,x){return s+n(x.cnt)*n(x.price);},0));
  if(!S.ownerEntries)S.ownerEntries={};
  S.ownerEntries[td()]={date:td(),svcs:svcs,totalSvcs:n(ts),total:tot};
  sv(); closeM("m-owner-entry"); rOwner();
}

/* ── EMPLOYEE ── */
function rEmp(){
  var e=(S.emps||[]).find(function(x){return x.id===ses.eid;}); if(!e)return;
  var av=document.getElementById("emp-av");
  if(av){av.textContent=e.av;av.style.background=e.color+"22";av.style.border="2px solid "+e.color;av.style.color=e.color;}
  var en=document.getElementById("emp-name"); if(en)en.textContent=e.name;
  var md=e.pm==="percent"?"אחוז לפי שירות":e.pm==="hourly"?n(e.hr)+"\u20AA לשעה":e.pm==="chair_pct"?"כיסא + אחוזים":"שכירת כיסא";
  var es=document.getElementById("emp-sub"); if(es)es.textContent=e.role+" \u2013 "+md;
  var ee=(S.entries&&S.entries[e.id])||{},te=ee[td()],all=Object.values(ee),t2=calc(te?[te]:[],e),mo=calc(all,e);
  var tc=te?n(te.cancels):0,tca=all.reduce(function(s,x){return s+n(x.cancels);},0),avg=all.length?r2(mo.es/all.length):0;
  var estats=document.getElementById("emp-stats");
  if(estats)estats.innerHTML=sb("השתכרת היום",formatMoney(t2.es),"","#E8782A")+sb("סה\"כ החודש",formatMoney(mo.es),all.length+" ימים","#10B981")+sb("ממוצע / יום",formatMoney(avg),"","#E8782A")+sb("ביטולים",tc,"סה\"כ: "+tca,"#EF4444");
  var act=document.getElementById("emp-act");
  var dayClosed=isDayClosed(td());
  if(act){
    if(dayClosed){act.className="ab locked";act.textContent="\uD83D\uDD12 יום נסגר \u2013 לא ניתן לערוך";act.onclick=null;}
    else{act.className="ab "+(te?"done":"pend");act.textContent=te?"עדכן סיכום יום":"הזן סיכום יום";act.onclick=function(){openEntry(0);};}
  }
  var sorted=all.slice().sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});
  var hist=sorted.length?"":"<div style='text-align:center;padding:32px 0;color:var(--dm)'>אין נתונים עדיין</div>";
  sorted.forEach(function(en){
    var er=calc([en],e),ds=en.date?new Date(en.date).toLocaleDateString("he-IL",{weekday:"short",day:"numeric",month:"short"}):"--";
    var sm=(en.svcs||[]).filter(function(s){return n(s.cnt)>0;}).map(function(s){return s.lbl+" x"+s.cnt;}).join(" | ");
    var c2=n(en.cancels),t=n(en.tip),h=n(en.hrs);
    var isClosed=isDayClosed(en.date);
    hist+="<div class=card><div style='display:flex;justify-content:space-between;align-items:center'><div><div style='font-weight:700;font-size:13px'>"+(isClosed?"\uD83D\uDD12 ":"")+ds+"</div><div style='color:var(--dm);font-size:11px;margin-top:2px'>"+sm+(h?" "+h+"h":"")+(c2?" ביטולים:"+c2:"")+(t?" טיפ:"+t:"")+"</div></div><div style='text-align:left'><div style='color:var(--or);font-weight:900;font-size:16px'>"+formatMoney(er.es)+"</div><div style='color:var(--dm);font-size:10px'>"+en.totalSvcs+" שירותים</div></div></div></div>";
  });
  var eh=document.getElementById("emp-hist"); if(eh)eh.innerHTML=hist;
}

/* ── ENTRY MODAL ── */
function openEntry(eid){
  var resolvedEid=eid>0?eid:(ses&&ses.role==="emp"?ses.eid:null); if(!resolvedEid)return;
  if(isDayClosed(td())){
    if(!ses||ses.role!=="owner"){alert("יום נסגר \u2013 לא ניתן לערוך");return;}
  }
  eEid=resolvedEid;
  var e=(S.emps||[]).find(function(x){return x.id===eEid;}); if(!e)return;
  var ex=((S.entries&&S.entries[eEid])||{})[td()];
  eCtr={};eCan=0;eTip=0;eHrs=0;
  (S.svcs||[]).forEach(function(s){eCtr[s.id]=ex?n(((ex.svcs||[]).find(function(x){return x.id===s.id;})||{cnt:0}).cnt):0;});
  if(ex){eCan=n(ex.cancels);eTip=n(ex.tip);eHrs=n(ex.hrs);}
  var etit=document.getElementById("et-title"); if(etit)etit.textContent="סיכום יום \u2013 "+new Date().toLocaleDateString("he-IL");
  var esub=document.getElementById("et-sub"); if(esub)esub.textContent=e.name;
  var ecan=document.getElementById("e-cancel"); if(ecan)ecan.textContent=eCan;
  var etip=document.getElementById("e-tip"); if(etip)etip.textContent=eTip;
  var hw=document.getElementById("e-hours");
  if(e.pm==="hourly"&&hw){
    hw.innerHTML="<div class=xb2 style='background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.2);margin-bottom:10px'><div><div style='font-size:13px;font-weight:700;color:#8B5CF6'>שעות עבודה</div><div style='font-size:11px;color:var(--dm);margin-top:1px'>"+formatMoney(n(e.hr))+" לשעה</div></div><div class=cr><button class='cb mb' onclick='adjH(-1)'>-</button><span id=e-hrs style='color:#8B5CF6;font-weight:800;font-size:18px;min-width:36px;text-align:center'>"+eHrs+"</span><button class='cb pb' onclick='adjH(1)'>+</button></div></div>";
    var eh=document.getElementById("e-hrow"); if(eh)eh.style.display="flex";
  }else{if(hw)hw.innerHTML="";var eh2=document.getElementById("e-hrow");if(eh2)eh2.style.display="none";}
  rEntrySvcs(); openM("m-entry");
}
function rEntrySvcs(){
  var html="";
  (S.svcs||[]).forEach(function(s){
    html+="<div class=sr><div><div style='font-size:14px;font-weight:600'>"+s.lbl+"</div><div style='color:var(--dm);font-size:11px'>"+formatMoney(s.price)+" / יחידה</div></div>";
    html+="<div class=cr><button class='cb m' onclick='adjS(\""+s.id+"\",-1)'>-</button><span class=cv id='cv-"+s.id+"'>"+(eCtr[s.id]||0)+"</span><button class='cb p' onclick='adjS(\""+s.id+"\",1)'>+</button></div></div>";
  });
  var es=document.getElementById("e-svcs"); if(es)es.innerHTML=html;
  updTot();
}
function adjS(id,d){eCtr[id]=Math.max(0,n(eCtr[id])+d);var el=document.getElementById("cv-"+id);if(el)el.textContent=eCtr[id];updTot();}
function adjC(d){eCan=Math.max(0,eCan+d);var el=document.getElementById("e-cancel");if(el)el.textContent=eCan;updTot();}
function adjT(d){eTip=Math.max(0,eTip+d);var el=document.getElementById("e-tip");if(el)el.textContent=eTip;updTot();}
function adjH(d){eHrs=Math.max(0,eHrs+d);var el=document.getElementById("e-hrs");if(el)el.textContent=eHrs;updTot();}
function updTot(){
  var cnt=0,amt=0;
  (S.svcs||[]).forEach(function(s){cnt+=n(eCtr[s.id]);amt+=n(eCtr[s.id])*n(s.price);});
  var e=(S.emps||[]).find(function(x){return x.id===eEid;})||{};
  var hp=e.pm==="hourly"?r2(n(eHrs)*n(e.hr)):0;
  var el;
  el=document.getElementById("e-tcnt");if(el)el.textContent=cnt;
  el=document.getElementById("e-tcan");if(el)el.textContent=eCan;
  el=document.getElementById("e-ttip");if(el)el.textContent=eTip;
  el=document.getElementById("e-tamt");if(el)el.textContent=formatMoney(r2(amt));
  el=document.getElementById("e-hpay");if(el)el.textContent=formatMoney(hp);
  var b=document.getElementById("e-save");if(b){b.disabled=false;b.style.opacity="1";}
}
function saveEntry(){
  var svcs=(S.svcs||[]).map(function(s){return{id:s.id,lbl:s.lbl,cnt:n(eCtr[s.id]),price:n(s.price)};});
  var ts=svcs.reduce(function(s,x){return s+n(x.cnt);},0);
  var tot=r2(svcs.reduce(function(s,x){return s+n(x.cnt)*n(x.price);},0));
  if(!S.entries)S.entries={};
  if(!S.entries[eEid])S.entries[eEid]={};
  S.entries[eEid][td()]={date:td(),svcs:svcs,totalSvcs:n(ts),total:tot,cancels:n(eCan),tip:n(eTip),hrs:n(eHrs)};
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
  if(edM==="percent")f="<div class=fw><div class=fl>אחוז ברירת מחדל (%)</div><input type='number' id='ef-pct' value='"+(n(e.pct)||50)+"' min='1' max='99'></div>";
  else if(edM==="hourly")f="<div class=fw><div class=fl>תעריף לשעה (\u20AA)</div><input type='number' id='ef-hr' value='"+n(e.hr)+"' min='0'></div>";
  else if(edM==="chair")f="<div class=fw><div class=fl>שכירת כיסא חודשית (\u20AA)</div><input type='number' id='ef-cr' value='"+n(e.cr)+"' min='0'></div>";
  else if(edM==="chair_pct")f="<div class=fw><div class=fl>שכירת כיסא (\u20AA)</div><input type='number' id='ef-cr' value='"+n(e.cr)+"' min='0'></div><div class=fw><div class=fl>אחוז לעובד (%)</div><input type='number' id='ef-pct' value='"+(n(e.pct)||50)+"' min='1' max='99'></div>";
  var ef=document.getElementById("ed-mfields"); if(ef)ef.innerHTML=f;
  var sp=edM==="percent"||edM==="chair_pct";
  var ew=document.getElementById("ed-spw"); if(ew)ew.style.display=sp?"block":"none";
  if(sp)rEdSp();
}
function setEdM(m){edM=m;rEdMdl();}
function rEdSp(){
  var e=(S.emps||[]).find(function(x){return x.id===edId;})||{sp:{}};
  var h="";
  (S.svcs||[]).forEach(function(s){
    var p=(e.sp&&e.sp[s.id]!=null)?n(e.sp[s.id]):(n(e.pct)||50);
    h+="<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'><span style='font-size:13px'>"+s.lbl+"</span><div style='display:flex;align-items:center;gap:6px'><input type='number' id='sp-"+s.id+"' value='"+p+"' min='0' max='100' style='width:60px;height:40px;font-size:14px;padding:0;text-align:center'><span style='color:var(--dm);font-size:13px'>%</span></div></div>";
  });
  var es=document.getElementById("ed-spct"); if(es)es.innerHTML=h;
}
function saveEdit(){
  var e=(S.emps||[]).find(function(x){return x.id===edId;}); if(!e)return;
  var en=document.getElementById("ed-name"),er=document.getElementById("ed-role"),ep=document.getElementById("ed-pin");
  if(en)e.name=en.value.trim()||e.name;
  if(er)e.role=er.value.trim()||e.role;
  e.av=ini(e.name);
  if(ep){var np=ep.value.trim();if(/^\d{4}$/.test(np))e.pin=np;}
  e.pm=edM;
  var efp=document.getElementById("ef-pct");if(efp)e.pct=n(parseInt(efp.value))||50;
  var efh=document.getElementById("ef-hr");if(efh)e.hr=n(parseInt(efh.value));
  var efc=document.getElementById("ef-cr");if(efc)e.cr=n(parseInt(efc.value));
  e.sp=e.sp||{};(S.svcs||[]).forEach(function(s){var el=document.getElementById("sp-"+s.id);if(el)e.sp[s.id]=n(parseInt(el.value));});
  sv(); closeM("m-edit"); rOwner();
}

function deleteEmp(id){
  if(!ses||ses.role!=="owner"){alert("רק בעל עסק יכול למחוק עובד");return;}
  var e=(S.emps||[]).find(function(x){return x.id===id;}); if(!e){alert("עובד לא נמצא");return;}
  if(!confirm("למחוק את "+e.name+"?\n\nהדיווחים ההיסטוריים יישמרו.")){return;}
  S.emps=(S.emps||[]).filter(function(x){return x.id!==id;});
  sv();
  db.ref("businesses/"+bizCode+"/data/emps").set(S.emps).catch(function(e){console.error("deleteEmp error:",e);});
  closeM("m-edit"); rOwner();
}

/* ── ADD EMP ── */
function openAddModal(){addM="percent";var f=["ad-name","ad-role","ad-pin"];f.forEach(function(id){var el=document.getElementById(id);if(el)el.value="";});rAddMdl();openM("m-add");}
function rAddMdl(){
  var h="";MDL.forEach(function(m){h+="<div class='mo"+(addM===m.id?" on":"")+"' onclick='setAdM(\""+m.id+"\")'><span style='font-size:14px'>"+m.lbl+"</span></div>";});
  var am=document.getElementById("ad-models"); if(am)am.innerHTML=h;
  var f="";
  if(addM==="percent")f="<div class=fw><div class=fl>אחוז (%)</div><input type='number' id='af-pct' value='50' min='1' max='99'></div>";
  else if(addM==="hourly")f="<div class=fw><div class=fl>תעריף לשעה (\u20AA)</div><input type='number' id='af-hr' value='0' min='0'></div>";
  else if(addM==="chair")f="<div class=fw><div class=fl>שכירת כיסא (\u20AA)</div><input type='number' id='af-cr' value='0' min='0'></div>";
  else if(addM==="chair_pct")f="<div class=fw><div class=fl>שכירת כיסא (\u20AA)</div><input type='number' id='af-cr' value='0' min='0'></div><div class=fw><div class=fl>אחוז לעובד (%)</div><input type='number' id='af-pct' value='50' min='1' max='99'></div>";
  var af=document.getElementById("ad-mfields"); if(af)af.innerHTML=f;
}
function setAdM(m){addM=m;rAddMdl();}
function saveAdd(){
  var anEl=document.getElementById("ad-name"); if(!anEl)return;
  var name=anEl.value.trim(); if(!name)return;
  var arEl=document.getElementById("ad-role"); var role=(arEl&&arEl.value.trim())||"ספר";
  var apEl=document.getElementById("ad-pin"); var np=(apEl&&apEl.value.trim())||"";
  if(!/^\d{4}$/.test(np))np="1234";
  var c=COLS[(S.emps||[]).length%COLS.length];
  var e={id:S.nid++,name:name,role:role,av:ini(name),pm:addM,pct:50,hr:0,cr:0,sp:{},color:c,pin:np};
  var afp=document.getElementById("af-pct");if(afp)e.pct=n(parseInt(afp.value))||50;
  var afh=document.getElementById("af-hr");if(afh)e.hr=n(parseInt(afh.value));
  var afc=document.getElementById("af-cr");if(afc)e.cr=n(parseInt(afc.value));
  (S.emps=S.emps||[]).push(e); sv(); closeM("m-add"); renderLogin(); rOwner();
}

/* ── SERVICES ── */
function openAddSvc(){edSvc=null;var sn=document.getElementById("sv-name"),sp=document.getElementById("sv-price"),se=document.getElementById("sv-err");if(sn)sn.value="";if(sp)sp.value="";if(se)se.textContent="";var st=document.getElementById("svc-title");if(st)st.textContent="הוסף שירות";openM("m-svc");}
function openEditSvc(id){var s=(S.svcs||[]).find(function(x){return x.id===id;});if(!s)return;edSvc=id;var sn=document.getElementById("sv-name"),sp=document.getElementById("sv-price"),se=document.getElementById("sv-err"),st=document.getElementById("svc-title");if(st)st.textContent="עריכת שירות";if(sn)sn.value=s.lbl;if(sp)sp.value=s.price;if(se)se.textContent="";openM("m-svc");}
function saveSvc(){
  var snEl=document.getElementById("sv-name"),spEl=document.getElementById("sv-price"),seEl=document.getElementById("sv-err");
  var svcName=(snEl&&snEl.value.trim())||"";
  var pr=parseInt((spEl&&spEl.value)||"0");
  if(!svcName){if(seEl)seEl.textContent="נא להזין שם שירות";return;}
  if(isNaN(pr)||pr<0){if(seEl)seEl.textContent="נא להזין מחיר תקין";return;}
  if(seEl)seEl.textContent="";
  if(edSvc){var s=(S.svcs||[]).find(function(x){return x.id===edSvc;});if(s){s.lbl=svcName;s.price=n(pr);}}
  else{(S.svcs=S.svcs||[]).push({id:"s"+Date.now(),lbl:svcName,price:n(pr)});}
  sv(); closeM("m-svc"); rSvcs();
}
function delSvc(id){if(!confirm("למחוק שירות זה?"))return;S.svcs=(S.svcs||[]).filter(function(s){return s.id!==id;});sv();rSvcs();}
function saveGoal(){S.goal=n(parseInt((document.getElementById("goal-v")&&document.getElementById("goal-v").value)||"0"));sv();closeM("m-goal");rReport();}

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

  /* Auto-login */
  var saved=localStorage.getItem("crewos_biz");
  if(saved){
    try{var c=localStorage.getItem("crewos_cache_"+saved);if(c){S=ensureS(JSON.parse(c));bizCode=saved;}}catch(e){}
    db.ref("businesses/"+saved).once("value").then(function(snap){
      var biz=snap.val();
      if(biz&&biz.data){S=ensureS(biz.data);bizCode=saved;try{localStorage.setItem("crewos_cache_"+saved,JSON.stringify(S));}catch(e){}}
      if(S&&bizCode){
        console.log("[AUTO-LOGIN] biz:",bizCode,"ownerPassword.length:",(S.ownerPassword||"").length,"sitePassword.length:",(S.sitePassword||"").length);
        var bd=document.getElementById("biz-name-display");if(bd)bd.textContent=S.bizName||"המספרה";
        lSel="owner";pin="";renderLogin();showPg("pg-login");
      }
    }).catch(function(e){console.error("[AUTO-LOGIN ERROR]",e);});
  }
})();
