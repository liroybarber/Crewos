var COLS = ["#E8782A","#5ABFA0","#8A8AE8","#E06060","#E8C87E","#6090E0"];
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

var bizCode = null;
var S = null;
var ses = null, lSel = "owner", pin = "";
var eEid = null, eCtr = {}, eCan = 0, eTip = 0, eHrs = 0;
var edId = null, addM = "percent", edM = "percent", edSvc = null, owT = "today";
var syncTimeout = null;
var oeCtr = {};

/* -- UTILS -- */
function showPg(id) {
  document.querySelectorAll(".pg").forEach(function(p){p.classList.remove("on");});
  document.getElementById(id).classList.add("on");
}
function openM(id) { document.getElementById(id).classList.add("on"); }
function closeM(id) { document.getElementById(id).classList.remove("on"); }
function td() { return new Date().toISOString().slice(0,10); }
function ini(n) { return n.split(" ").map(function(w){return w[0]||"";}).slice(0,2).join(""); }
function logout() { ses=null; pin=""; lSel="owner"; renderLogin(); showPg("pg-login"); }
function changeBiz() { ses=null; pin=""; lSel="owner"; bizCode=null; S=null; localStorage.removeItem("crewos_biz"); showPg("pg-welcome"); }
function gsp(emp,sid) { if(emp.sp&&emp.sp[sid]!=null)return emp.sp[sid]; return emp.pct||50; }

function sv() {
  if(!bizCode||!S) return;
  try{localStorage.setItem("crewos_cache_"+bizCode, JSON.stringify(S));}catch(e){}
  if(syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(function(){
    db.ref("businesses/"+bizCode+"/data").set(S).catch(function(e){console.log("Firebase save error:",e);});
  }, 500);
}

function sb(lbl,val,sub,col) {
  return "<div class=st style='border-color:"+col+"33'><div class=lb>"+lbl+"</div><div class=vl style='color:"+col+"'>"+val+"</div>"+(sub?"<div class=sb2>"+sub+"</div>":"")+"</div>";
}

function defS(bizName, ownerName, ownerPin, sitePin, phone) {
  return {
    bizName: bizName||"המספרה שלי",
    ownerName: ownerName||"בעל העסק",
    ownerPin: ownerPin||"0000",
    sitePin: sitePin||"0000",
    phone: phone||"",
    nid: 3, goal: 0,
    svcs: [{id:"s1",lbl:"תספורת",price:60},{id:"s2",lbl:"זקן",price:40},{id:"s3",lbl:"שניהם",price:90}],
    emps: [],
    ownerEntries: {},
    entries: {}
  };
}

/* -- REGISTRATION -- */
function genCode() {
  return String(Math.floor(1000 + Math.random()*9000));
}

function registerBiz() {
  var bizName = document.getElementById("reg-biz-name").value.trim();
  var ownerName = document.getElementById("reg-owner-name").value.trim();
  var phone = document.getElementById("reg-phone").value.trim();
  var sitePin = document.getElementById("reg-site-pin").value.trim();
  var p1 = document.getElementById("reg-pin").value.trim();
  var p2 = document.getElementById("reg-pin2").value.trim();
  var err = document.getElementById("reg-err");

  if(!bizName){err.textContent="נא להזין שם מספרה";return;}
  if(!ownerName){err.textContent="נא להזין שם בעל העסק";return;}
  if(!phone){err.textContent="נא להזין מספר טלפון";return;}
  if(sitePin.length!==4||isNaN(sitePin)){err.textContent="סיסמת האתר חייבת להיות 4 ספרות";return;}
  if(p1.length!==4||isNaN(p1)){err.textContent="הסיסמה האישית חייבת להיות 4 ספרות";return;}
  if(p1!==p2){err.textContent="הסיסמאות האישיות לא תואמות";return;}
  err.textContent="בודק...";

  var phoneKey = phone.replace(/\D/g,"");
  db.ref("phones/"+phoneKey).once("value").then(function(snap){
    if(snap.val()){err.textContent="מספר טלפון כבר רשום במערכת";return;}
    tryRegister(phoneKey, bizName, ownerName, phone, sitePin, p1, err);
  }).catch(function(){
    tryRegister(phoneKey, bizName, ownerName, phone, sitePin, p1, err);
  });
}

function tryRegister(phoneKey, bizName, ownerName, phone, sitePin, ownerPin, err) {
  var code = genCode();
  var newData = defS(bizName, ownerName, ownerPin, sitePin, phone);
  db.ref("businesses/"+code).set({
    bizName: bizName,
    ownerName: ownerName,
    phone: phone,
    createdAt: new Date().toISOString(),
    data: newData
  }).then(function(){
    return db.ref("phones/"+phoneKey).set(code);
  }).then(function(){
    bizCode = code;
    S = newData;
    try{localStorage.setItem("crewos_biz", code);}catch(e){}
    try{localStorage.setItem("crewos_cache_"+code, JSON.stringify(S));}catch(e){}
    document.getElementById("reg-biz-welcome").textContent = "ברוך הבא, "+ownerName+"!";
    document.getElementById("succ-phone").textContent = phone;
    document.getElementById("enter-after-reg-btn").onclick = function(){
      ses = {role:"owner"};
      rOwner();
      showPg("pg-owner");
    };
    showPg("pg-reg-success");
  }).catch(function(e){
    err.textContent="שגיאה ברישום, נסה שוב";
    console.log(e);
  });
}

/* -- BIZ LOGIN (phone + site pin) -- */
function bizLogin() {
  var phone = document.getElementById("biz-phone-input").value.trim().replace(/\D/g,"");
  var sitePinInput = document.getElementById("biz-site-pin-input").value.trim();
  var err = document.getElementById("biz-login-err");
  if(!phone){err.textContent="נא להזין מספר טלפון";return;}
  if(sitePinInput.length!==4){err.textContent="נא להזין סיסמת כניסה של 4 ספרות";return;}
  err.textContent="בודק...";

  db.ref("phones/"+phone).once("value").then(function(snap){
    var code = snap.val();
    if(!code){err.textContent="מספר טלפון לא נמצא";return;}
    db.ref("businesses/"+code+"/data").once("value").then(function(snap2){
      var data = snap2.val();
      if(!data){err.textContent="שגיאה, נסה שוב";return;}
      if(data.sitePin !== sitePinInput){err.textContent="סיסמת כניסה שגויה";return;}
      err.textContent="";
      bizCode = code;
      S = data;
      try{localStorage.setItem("crewos_biz", code);}catch(e){}
      try{localStorage.setItem("crewos_cache_"+code, JSON.stringify(S));}catch(e){}
      document.getElementById("biz-name-display").textContent = S.bizName||"המספרה";
      lSel = "owner"; pin = "";
      renderLogin();
      showPg("pg-login");
    });
  }).catch(function(e){err.textContent="שגיאת חיבור, נסה שוב";});
}

/* -- SELECT USER & PIN LOGIN -- */
function renderLogin() {
  if(!S) return;
  var h="";
  S.emps.forEach(function(e){
    var sel = lSel===e.id;
    h+="<div class=eo id='lo-"+e.id+"' onclick='selUser("+e.id+")' style='border-color:"+(sel?e.color:"#222")+";background:"+(sel?e.color+"22":"#161616")+"'>";
    h+="<div class=av style='width:40px;height:40px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:13px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:700;font-size:14px'>"+e.name+"</div><div style='color:#555;font-size:11px'>"+e.role+"</div></div></div>";
  });
  document.getElementById("login-emp-list").innerHTML=h;
  var ownerEl = document.getElementById("lo-owner");
  ownerEl.style.borderColor = lSel==="owner"?"var(--or)":"#222";
  ownerEl.style.background = lSel==="owner"?"rgba(232,120,42,.1)":"#161616";
  updHint(); rdots();
}

function selUser(id){
  lSel=id; pin="";
  var ownerEl = document.getElementById("lo-owner");
  ownerEl.style.borderColor = id==="owner"?"var(--or)":"#222";
  ownerEl.style.background = id==="owner"?"rgba(232,120,42,.1)":"#161616";
  S.emps.forEach(function(e){
    var el=document.getElementById("lo-"+e.id); if(!el)return;
    el.style.borderColor=id===e.id?e.color:"#222";
    el.style.background=id===e.id?e.color+"22":"#161616";
  });
  document.getElementById("pin-err").textContent="";
  updHint(); rdots();
}

function updHint(){
  var h=document.getElementById("login-hint");
  if(lSel==="owner"){h.textContent="קוד בעל עסק";}
  else{var e=S.emps.find(function(x){return x.id===lSel;}); h.textContent=e?"קוד "+e.name:"בחר מישהו";}
}
function rdots(){
  for(var i=0;i<4;i++) document.getElementById("d"+i).className="dt"+(pin.length>i?" on":"");
  var b=document.getElementById("login-btn"); b.disabled=pin.length<4; b.style.opacity=pin.length<4?".4":"1";
}
function pk(n){if(pin.length<4){pin+=n;rdots();}}
function pdel(){pin=pin.slice(0,-1);rdots();}

function doLogin(){
  var emp = lSel!=="owner" ? S.emps.find(function(e){return e.id===lSel;}) : null;
  var ok = lSel==="owner" ? S.ownerPin : (emp?emp.pin:"----");
  if(pin===ok){
    ses = lSel==="owner" ? {role:"owner"} : {role:"emp",eid:lSel};
    pin="";
    if(ses.role==="owner"){rOwner();showPg("pg-owner");}
    else if(emp&&emp.pm==="chair"){
      var av=document.getElementById("chair-av");
      av.textContent=emp.av; av.style.background=emp.color+"22";
      av.style.border="2px solid "+emp.color; av.style.color=emp.color;
      document.getElementById("chair-name").textContent=emp.name;
      document.getElementById("chair-rent").textContent="\u20AA"+(emp.cr||0);
      showPg("pg-chair");
    }else{rEmp();showPg("pg-emp");}
  }else{
    document.getElementById("pin-err").textContent="קוד שגוי";
    setTimeout(function(){document.getElementById("pin-err").textContent="";},1500);
    pin=""; rdots();
  }
}

/* -- CALC -- */
function calc(list,emp){
  var gross=0,es=0,tips=0,hpay=0;
  list.forEach(function(e){
    gross+=e.total; tips+=(e.tip||0);
    if(emp.pm==="hourly") hpay+=(e.hrs||0)*(emp.hr||0);
    (e.svcs||[]).forEach(function(s){
      if(emp.pm==="percent"||emp.pm==="chair_pct") es+=s.cnt*s.price*(gsp(emp,s.id)/100);
    });
  });
  var os=0;
  if(emp.pm==="hourly"){es=hpay+tips;os=gross-hpay;}
  else if(emp.pm==="chair"){es=gross+tips;os=emp.cr||0;}
  else if(emp.pm==="chair_pct"){es+=tips;os=gross-(es-tips)+(emp.cr||0);}
  else{es+=tips;os=gross-es+tips;}
  return{gross:gross,es:es,os:os,hpay:hpay};
}

/* -- OWNER DASHBOARD -- */
function rOwner(){
  document.getElementById("ow-date").textContent=S.bizName+" - "+new Date().toLocaleDateString("he-IL",{weekday:"long",day:"numeric",month:"long"});
  var tt=0,mt=0,om=0,tc=0;
  S.emps.forEach(function(e){
    var all=Object.values(S.entries[e.id]||{}),te=(S.entries[e.id]||{})[td()],r=calc(all,e);
    if(te){tt+=te.total;tc+=(te.cancels||0);}
    mt+=r.gross; om+=r.os;
    if(e.pm==="chair"||e.pm==="chair_pct") om+=(e.cr||0);
  });
  var ownerAll=Object.values(S.ownerEntries||{});
  var ownerTe=(S.ownerEntries||{})[td()];
  tt+=(ownerTe?ownerTe.total:0);
  var ownerMonth=ownerAll.reduce(function(s,e){return s+e.total;},0);
  mt+=ownerMonth; om+=ownerMonth;
  document.getElementById("ow-today").textContent="\u20AA"+tt;
  document.getElementById("ow-stats").innerHTML=
    sb("סה\"כ חודש","\u20AA"+mt,"","#E8782A")+
    sb("רווח שלך","\u20AA"+om,"","#5ABFA0")+
    sb("ביטולים",tc,"היום","#E06060");
  rOwTab(owT);
}
function owTab(t){
  owT=t;
  ["today","emps","report","svcs"].forEach(function(x){document.getElementById("t-"+x).style.display=x===t?"":"none";});
  document.getElementById("tbt").className="tab "+(t==="today"?"on":"off");
  document.getElementById("tbe").className="tab "+(t==="emps"?"on":"off");
  document.getElementById("tbr").className="tab "+(t==="report"?"on":"off");
  document.getElementById("tbs").className="tab "+(t==="svcs"?"on":"off");
  rOwTab(t);
}
function rOwTab(t){
  if(t==="today")rToday();
  else if(t==="emps")rEmps();
  else if(t==="report")rReport();
  else if(t==="svcs")rSvcs();
}
function rToday(){
  var h="<div class=sl>סיכום יום זה</div>";
  var ownerTe=(S.ownerEntries||{})[td()];
  var ownerGross=ownerTe?ownerTe.total:0;
  var ownerSm=ownerTe?(ownerTe.svcs||[]).filter(function(s){return s.cnt>0;}).map(function(s){return s.lbl+": "+s.cnt;}).join(" | "):"---";
  h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between'>";
  h+="<div style='display:flex;align-items:center;gap:10px'>";
  h+="<div class=av style='width:38px;height:38px;background:#E8782A22;border:2px solid #E8782A;font-size:11px;font-weight:900;color:#E8782A'>BOS</div>";
  h+="<div><div style='font-weight:700;font-size:14px'>"+S.ownerName+"</div><div style='color:#555;font-size:11px'>"+ownerSm+"</div></div></div>";
  h+="<div style='text-align:left'><div style='color:#E8782A;font-weight:800;font-size:17px'>\u20AA"+ownerGross+"</div><div style='color:#5ABFA0;font-size:11px'>הכנסה שלך</div></div></div>";
  h+="<button onclick='openOwnerEntry()' style='width:100%;height:36px;border-radius:10px;margin-top:10px;background:"+(ownerTe?"#2a2a1a":"#E8782A22")+";border:1px solid "+(ownerTe?"#444":"#E8782A")+";color:"+(ownerTe?"#888":"#E8782A")+";font-size:13px;font-weight:700'>"+(ownerTe?"עדכן יום שלי":"הזן יום שלי")+"</button></div>";
  S.emps.forEach(function(e){
    var te=(S.entries[e.id]||{})[td()],r=calc(te?[te]:[],e);
    var c2=te?(te.cancels||0):0,tip=te?(te.tip||0):0;
    var sm=te?(te.svcs||[]).filter(function(s){return s.cnt>0;}).map(function(s){return s.lbl+": "+s.cnt;}).join(" | "):"---";
    h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between'>";
    h+="<div style='display:flex;align-items:center;gap:10px'>";
    h+="<div class=av style='width:38px;height:38px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:12px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:700;font-size:14px'>"+e.name+"</div><div style='color:#555;font-size:11px'>"+sm+(c2?" ביטולים:"+c2:"")+(tip?" טיפ:"+tip:"")+"</div></div></div>";
    h+="<div style='text-align:left'><div style='color:#E8782A;font-weight:800;font-size:17px'>\u20AA"+r.gross+"</div><div style='color:#5ABFA0;font-size:11px'>שלך: \u20AA"+r.os+"</div></div></div></div>";
  });
  document.getElementById("t-today").innerHTML=h;
}
function rEmps(){
  var h="";
  S.emps.forEach(function(e){
    var ee=S.entries[e.id]||{},te=ee[td()],all=Object.values(ee);
    var td2=calc(te?[te]:[],e),mo=calc(all,e),hasT=!!te;
    var ml=(MDL.find(function(m){return m.id===e.pm;})||{lbl:""}).lbl;
    var tc=all.reduce(function(s,x){return s+(x.cancels||0);},0);
    var oMon=mo.os+(e.pm==="chair"||e.pm==="chair_pct"?(e.cr||0):0);
    var isC=e.pm==="chair";
    h+="<div class=card><div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px'>";
    h+="<div style='display:flex;align-items:center;gap:10px'>";
    h+="<div class=av style='width:42px;height:42px;background:"+e.color+"22;border:2px solid "+e.color+";font-size:13px;color:"+e.color+"'>"+e.av+"</div>";
    h+="<div><div style='font-weight:800;font-size:15px'>"+e.name+"</div><div style='color:#555;font-size:11px'>"+e.role+"</div></div></div>";
    h+="<span class=bdg style='background:"+e.color+"22;color:"+e.color+";border:1px solid "+e.color+"44'>"+ml+"</span></div>";
    h+="<div class=stats style='margin-top:0;margin-bottom:10px'>";
    if(isC){h+=sb("שכירת כיסא","\u20AA"+(e.cr||0),"חודשי","#E8782A")+sb("רווח שלך","\u20AA"+(e.cr||0),"חודשי","#5ABFA0");}
    else{h+=sb("הכנסת שירותים","\u20AA"+td2.gross,"היום",e.color)+sb("שכר עובד","\u20AA"+td2.es,"היום",e.color)+sb("סה\"כ חודש","\u20AA"+mo.gross,"לך: \u20AA"+oMon,"#5ABFA0")+sb("ביטולים",tc,"","#E06060");}
    h+="</div><div style='display:flex;gap:8px'>";
    h+="<button onclick='openEditModal("+e.id+")' style='flex:1;height:38px;border-radius:10px;background:#1E1E1E;border:1px solid #2A2A2A;color:#888;font-size:12px'>הגדרות</button>";
    if(!isC){
      h+="<button onclick='openEntry("+e.id+")' style='flex:2;height:38px;border-radius:10px;background:"+(hasT?"#2a2a1a":e.color+"22")+";border:1px solid "+(hasT?"#444":e.color)+";color:"+(hasT?"#888":e.color)+";font-size:13px;font-weight:700'>"+(hasT?"עדכן יום":"הזן יום")+"</button>";
    }else{
      h+="<div style='flex:2;height:38px;border-radius:10px;background:#1a1a1a;border:1px solid #2a2a2a;display:flex;align-items:center;justify-content:center;font-size:12px;color:#555'>כיסא בלבד</div>";
    }
    h+="</div></div>";
  });
  h+="<button onclick='openM(\"m-add\")' style='width:100%;height:46px;border-radius:12px;background:transparent;border:1px solid #E8782A;color:#E8782A;font-size:14px;font-weight:700;margin-top:4px'>+ הוסף עובד</button>";
  document.getElementById("t-emps").innerHTML=h;
}
function rReport(){
  var mt=0,om=0;
  S.emps.forEach(function(e){var all=Object.values(S.entries[e.id]||{}),r=calc(all,e);mt+=r.gross;om+=r.os;if(e.pm==="chair"||e.pm==="chair_pct")om+=(e.cr||0);});
  var ownerAll=Object.values(S.ownerEntries||{});
  var ownerMonth=ownerAll.reduce(function(s,e){return s+e.total;},0);
  mt+=ownerMonth; om+=ownerMonth;
  var goal=S.goal||0,pct=goal>0?Math.min(100,Math.round(mt/goal*100)):0;
  var gH=goal>0?"<div class=card><div style='display:flex;justify-content:space-between;margin-bottom:6px'><div style='font-size:14px;font-weight:700'>יעד חודשי</div><div style='color:#E8782A;font-weight:800'>"+pct+"%</div></div><div class=pw><div class=pbr style='width:"+pct+"%'></div></div><div style='font-size:11px;color:#555;margin-top:5px'>נשאר \u20AA"+Math.max(0,goal-mt)+"</div></div>":"";
  var ym=new Date().toISOString().slice(0,7),days={};
  S.emps.forEach(function(e){Object.entries(S.entries[e.id]||{}).forEach(function(p){if(p[0].startsWith(ym))days[p[0]]=(days[p[0]]||0)+p[1].total;});});
  Object.entries(S.ownerEntries||{}).forEach(function(p){if(p[0].startsWith(ym))days[p[0]]=(days[p[0]]||0)+p[1].total;});
  var dks=Object.keys(days).sort(),mx=Math.max.apply(null,dks.map(function(k){return days[k];}).concat([1]));
  var cH="";
  if(dks.length){cH="<div class=cw3><div style='font-size:11px;color:#888;margin-bottom:8px;font-weight:700'>הכנסות יומיות</div><div class=cb2>";dks.forEach(function(k){cH+="<div class=bw><div class=bf style='height:"+Math.round(days[k]/mx*100)+"%'></div><div class=bl2>"+parseInt(k.slice(8))+"</div></div>";});cH+="</div></div>";}
  var mx2=Math.max.apply(null,S.emps.map(function(e){return calc(Object.values(S.entries[e.id]||{}),e).gross;}).concat([ownerMonth,1]));
  var cpH="<div class=card><div style='font-size:13px;font-weight:700;margin-bottom:12px'>השוואה</div>";
  cpH+="<div class=cbr><div class=cnr><span>"+S.ownerName+"</span><span style='color:#E8782A'>\u20AA"+ownerMonth+"</span></div><div class=cbg><div class=cf style='width:"+Math.round(ownerMonth/mx2*100)+"%;background:#E8782A'></div></div></div>";
  S.emps.forEach(function(e){var r=calc(Object.values(S.entries[e.id]||{}),e),p=Math.round(r.gross/mx2*100);cpH+="<div class=cbr><div class=cnr><span>"+e.name+"</span><span style='color:"+e.color+"'>\u20AA"+r.gross+"</span></div><div class=cbg><div class=cf style='width:"+p+"%;background:"+e.color+"'></div></div></div>";});
  cpH+="</div>";
  var mn=new Date().toLocaleDateString("he-IL",{month:"long",year:"numeric"});
  document.getElementById("t-report").innerHTML="<div class=card><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'><div><div style='font-size:14px;font-weight:700'>סיכום חודש</div><div style='font-size:11px;color:#555'>"+mn+"</div></div><button onclick='openM(\"m-goal\")' style='background:#1E1E1E;border:1px solid #E8782A;color:#E8782A;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700'>יעד</button></div><div class=stats>"+sb("סה\"כ","\u20AA"+mt,"","#E8782A")+sb("רווח שלך","\u20AA"+om,"","#5ABFA0")+"</div></div>"+gH+cH+cpH;
}
function rSvcs(){
  var h="<div class=sl>שירותים ומחירים</div><div class=card>";
  S.svcs.forEach(function(s){
    h+="<div class=smr><div><div style='font-weight:700'>"+s.lbl+"</div><div style='color:#E8782A;font-size:12px'>\u20AA"+s.price+"</div></div>";
    h+="<div style='display:flex;gap:8px'><button class=ib style='background:#1a1a2a;color:#8a8ae8' onclick='openEditSvc(\""+s.id+"\")'>עריכה</button><button class=ib style='background:#2a1010;color:#E06060' onclick='delSvc(\""+s.id+"\")'>מחק</button></div></div>";
  });
  h+="</div><button onclick='openM(\"m-svc\")' style='width:100%;height:46px;border-radius:12px;background:transparent;border:1px solid #E8782A;color:#E8782A;font-size:14px;font-weight:700'>+ הוסף שירות</button>";
  h+="<div style='margin-top:20px'></div><div class=sl>הגדרות בעל עסק</div><div class=card>";
  h+="<div class=fw><div class=fl>שנה סיסמת אתר (4 ספרות)</div><input type='password' id='owner-site-pin-new' maxlength='4' inputmode='numeric' placeholder='סיסמה חדשה'></div>";
  h+="<div class=fw><div class=fl>שנה סיסמה אישית (4 ספרות)</div><input type='password' id='owner-pin-new' maxlength='4' inputmode='numeric' placeholder='סיסמה חדשה'></div>";
  h+="<div class=fw><div class=fl>אשר סיסמה אישית</div><input type='password' id='owner-pin-confirm' maxlength='4' inputmode='numeric' placeholder='אשר'></div>";
  h+="<div id='owner-pin-msg' style='font-size:12px;min-height:18px;margin-bottom:10px'></div>";
  h+="<button onclick='changeOwnerPins()' class=bg style='width:100%;height:44px;border-radius:12px;font-size:14px'>שמור שינויים</button></div>";
  document.getElementById("t-svcs").innerHTML=h;
}
function changeOwnerPins(){
  var sp=document.getElementById("owner-site-pin-new").value.trim();
  var np=document.getElementById("owner-pin-new").value.trim();
  var cp=document.getElementById("owner-pin-confirm").value.trim();
  var msg=document.getElementById("owner-pin-msg");
  var changed=false;
  if(sp.length===4&&!isNaN(sp)){S.sitePin=sp;changed=true;}
  if(np.length===4&&!isNaN(np)){
    if(np!==cp){msg.style.color="#E06060";msg.textContent="הסיסמאות האישיות לא תואמות";return;}
    S.ownerPin=np;changed=true;
  }
  if(!changed){msg.style.color="#E06060";msg.textContent="לא הוזנה סיסמה לשינוי";return;}
  sv();
  msg.style.color="#5ABFA0";msg.textContent="נשמר!";
  setTimeout(function(){msg.textContent="";},3000);
}

/* -- OWNER ENTRY -- */
function openOwnerEntry(){
  var ex=(S.ownerEntries||{})[td()];
  oeCtr={};
  S.svcs.forEach(function(s){oeCtr[s.id]=ex?((ex.svcs||[]).find(function(x){return x.id===s.id;})||{cnt:0}).cnt:0;});
  document.getElementById("oe-title").textContent="הזנת יום שלי - "+new Date().toLocaleDateString("he-IL");
  rOwnerEntrySvcs();openM("m-owner-entry");
}
function rOwnerEntrySvcs(){
  var html="";
  S.svcs.forEach(function(s){
    html+="<div class=sr><div><div style='font-size:14px;font-weight:600'>"+s.lbl+"</div><div style='color:#555;font-size:11px'>\u20AA"+s.price+" / יחידה</div></div>";
    html+="<div class=cr><button class='cb m' onclick='adjOE(\""+s.id+"\",-1)'>-</button><span class=cv id='oecv-"+s.id+"'>"+(oeCtr[s.id]||0)+"</span><button class='cb p' onclick='adjOE(\""+s.id+"\",1)'>+</button></div></div>";
  });
  document.getElementById("oe-svcs").innerHTML=html;updOETot();
}
function adjOE(id,d){oeCtr[id]=Math.max(0,(oeCtr[id]||0)+d);document.getElementById("oecv-"+id).textContent=oeCtr[id];updOETot();}
function updOETot(){
  var cnt=0,amt=0;S.svcs.forEach(function(s){cnt+=oeCtr[s.id]||0;amt+=(oeCtr[s.id]||0)*s.price;});
  document.getElementById("oe-tcnt").textContent=cnt;document.getElementById("oe-tamt").textContent="\u20AA"+amt;
  var b=document.getElementById("oe-save");b.disabled=cnt===0;b.style.opacity=cnt===0?".4":"1";
}
function saveOwnerEntry(){
  var svcs=S.svcs.map(function(s){return{id:s.id,lbl:s.lbl,cnt:oeCtr[s.id]||0,price:s.price};});
  var ts=svcs.reduce(function(s,x){return s+x.cnt;},0),tot=svcs.reduce(function(s,x){return s+x.cnt*x.price;},0);
  if(!S.ownerEntries)S.ownerEntries={};
  S.ownerEntries[td()]={date:td(),svcs:svcs,totalSvcs:ts,total:tot};
  sv();closeM("m-owner-entry");rOwner();
}

/* -- EMPLOYEE -- */
function rEmp(){
  var e=S.emps.find(function(x){return x.id===ses.eid;});if(!e)return;
  var av=document.getElementById("emp-av");
  av.textContent=e.av;av.style.background=e.color+"22";av.style.border="2px solid "+e.color;av.style.color=e.color;
  document.getElementById("emp-name").textContent=e.name;
  var md=e.pm==="percent"?"אחוז לפי שירות":e.pm==="hourly"?(e.hr||0)+" \u20AA לשעה":e.pm==="chair_pct"?"כיסא + אחוזים":"שכירת כיסא";
  document.getElementById("emp-sub").textContent=e.role+" - "+md;
  var ee=S.entries[e.id]||{},te=ee[td()],all=Object.values(ee),t2=calc(te?[te]:[],e),mo=calc(all,e);
  var tc=te?(te.cancels||0):0,tca=all.reduce(function(s,x){return s+(x.cancels||0);},0),avg=all.length?Math.round(mo.es/all.length):0;
  document.getElementById("emp-stats").innerHTML=
    sb("השתכרת היום","\u20AA"+Math.round(t2.es),"","#E8782A")+
    sb("סה\"כ החודש","\u20AA"+Math.round(mo.es),all.length+" ימים","#5ABFA0")+
    sb("ממוצע / יום","\u20AA"+avg,"","#E8782A")+
    sb("ביטולים",tc,"סה\"כ: "+tca,"#E06060");
  var act=document.getElementById("emp-act");
  act.className="ab "+(te?"done":"pend");
  act.textContent=te?"עדכן סיכום יום":"הזן סיכום יום";
  var sorted=all.slice().sort(function(a,b){return(b.date||"").localeCompare(a.date||"");});
  var hist=sorted.length?"":"<div style='text-align:center;padding:32px 0;color:#444'>אין נתונים עדיין</div>";
  sorted.forEach(function(en){
    var er=calc([en],e),ds=en.date?new Date(en.date).toLocaleDateString("he-IL",{weekday:"short",day:"numeric",month:"short"}):"--";
    var sm=(en.svcs||[]).filter(function(s){return s.cnt>0;}).map(function(s){return s.lbl+" x"+s.cnt;}).join(" | ");
    var c2=en.cancels||0,t=en.tip||0,hrs=en.hrs||0;
    hist+="<div class=card><div style='display:flex;justify-content:space-between;align-items:center'><div><div style='font-weight:700;font-size:13px'>"+ds+"</div><div style='color:#555;font-size:11px;margin-top:2px'>"+sm+(hrs?" "+hrs+"h":"")+(c2?" ביטולים:"+c2:"")+(t?" טיפ:"+t:"")+"</div></div><div style='text-align:left'><div style='color:#E8782A;font-weight:800;font-size:15px'>\u20AA"+Math.round(er.es)+"</div><div style='color:#444;font-size:10px'>"+en.totalSvcs+" שירותים</div></div></div></div>";
  });
  document.getElementById("emp-hist").innerHTML=hist;
}

/* -- ENTRY MODAL -- */
function openEntry(eid){
  eEid=eid>0?eid:(ses.role==="emp"?ses.eid:null);if(!eEid)return;
  var e=S.emps.find(function(x){return x.id===eEid;});if(!e)return;
  var ex=(S.entries[eEid]||{})[td()];
  eCtr={};eCan=0;eTip=0;eHrs=0;
  S.svcs.forEach(function(s){eCtr[s.id]=ex?((ex.svcs||[]).find(function(x){return x.id===s.id;})||{cnt:0}).cnt:0;});
  if(ex){eCan=ex.cancels||0;eTip=ex.tip||0;eHrs=ex.hrs||0;}
  document.getElementById("et-title").textContent="סיכום יום - "+new Date().toLocaleDateString("he-IL");
  document.getElementById("et-sub").textContent=e.name;
  document.getElementById("e-cancel").textContent=eCan;
  document.getElementById("e-tip").textContent=eTip;
  var hw=document.getElementById("e-hours");
  if(e.pm==="hourly"){
    hw.innerHTML="<div class=xb2 style='background:#0d0d1a;border:1px solid #202060;margin-bottom:10px'><div><div style='font-size:13px;font-weight:700;color:#6090E0'>שעות עבודה</div><div style='font-size:11px;color:#404080;margin-top:1px'>"+(e.hr||0)+" \u20AA לשעה</div></div><div class=cr><button class='cb mb' onclick='adjH(-1)'>-</button><span id=e-hrs style='color:#6090E0;font-weight:800;font-size:18px;min-width:36px;text-align:center'>"+eHrs+"</span><button class='cb pb' onclick='adjH(1)'>+</button></div></div>";
    document.getElementById("e-hrow").style.display="flex";
  }else{hw.innerHTML="";document.getElementById("e-hrow").style.display="none";}
  rEntrySvcs();openM("m-entry");
}
function rEntrySvcs(){
  var html="";
  S.svcs.forEach(function(s){
    html+="<div class=sr><div><div style='font-size:14px;font-weight:600'>"+s.lbl+"</div><div style='color:#555;font-size:11px'>\u20AA"+s.price+" / יחידה</div></div>";
    html+="<div class=cr><button class='cb m' onclick='adjS(\""+s.id+"\",-1)'>-</button><span class=cv id='cv-"+s.id+"'>"+(eCtr[s.id]||0)+"</span><button class='cb p' onclick='adjS(\""+s.id+"\",1)'>+</button></div></div>";
  });
  document.getElementById("e-svcs").innerHTML=html;updTot();
}
function adjS(id,d){eCtr[id]=Math.max(0,(eCtr[id]||0)+d);document.getElementById("cv-"+id).textContent=eCtr[id];updTot();}
function adjC(d){eCan=Math.max(0,eCan+d);document.getElementById("e-cancel").textContent=eCan;updTot();}
function adjT(d){eTip=Math.max(0,eTip+d);document.getElementById("e-tip").textContent=eTip;updTot();}
function adjH(d){eHrs=Math.max(0,eHrs+d);var el=document.getElementById("e-hrs");if(el)el.textContent=eHrs;updTot();}
function updTot(){
  var cnt=0,amt=0;S.svcs.forEach(function(s){cnt+=eCtr[s.id]||0;amt+=(eCtr[s.id]||0)*s.price;});
  var e=S.emps.find(function(x){return x.id===eEid;})||{};
  var hp=e.pm==="hourly"?eHrs*(e.hr||0):0;
  document.getElementById("e-tcnt").textContent=cnt;document.getElementById("e-tcan").textContent=eCan;
  document.getElementById("e-ttip").textContent=eTip;document.getElementById("e-tamt").textContent="\u20AA"+amt;
  var hr=document.getElementById("e-hpay");if(hr)hr.textContent="\u20AA"+hp;
  var ok=cnt>0||eCan>0||eTip>0||eHrs>0;
  var b=document.getElementById("e-save");b.disabled=!ok;b.style.opacity=ok?"1":".4";
}
function saveEntry(){
  var svcs=S.svcs.map(function(s){return{id:s.id,lbl:s.lbl,cnt:eCtr[s.id]||0,price:s.price};});
  var ts=svcs.reduce(function(s,x){return s+x.cnt;},0),tot=svcs.reduce(function(s,x){return s+x.cnt*x.price;},0);
  if(!S.entries[eEid])S.entries[eEid]={};
  S.entries[eEid][td()]={date:td(),svcs:svcs,totalSvcs:ts,total:tot,cancels:eCan,tip:eTip,hrs:eHrs};
  sv();closeM("m-entry");if(ses.role==="owner")rOwner();else rEmp();
}

/* -- EDIT EMP -- */
function openEditModal(id){
  edId=id;var e=S.emps.find(function(x){return x.id===id;});if(!e)return;
  document.getElementById("ed-name").value=e.name;document.getElementById("ed-role").value=e.role;document.getElementById("ed-pin").value="";
  edM=e.pm;rEdMdl();openM("m-edit");
}
function rEdMdl(){
  var e=S.emps.find(function(x){return x.id===edId;})||{};
  var h="";MDL.forEach(function(m){h+="<div class='mo"+(edM===m.id?" on":"")+"' onclick='setEdM(\""+m.id+"\")'><span style='font-size:14px'>"+m.lbl+"</span></div>";});
  document.getElementById("ed-models").innerHTML=h;
  var f="";
  if(edM==="percent")f="<div class=fw><div class=fl>אחוז ברירת מחדל (%)</div><input type='number' id='ef-pct' value='"+(e.pct||50)+"' min='1' max='99'></div>";
  else if(edM==="hourly")f="<div class=fw><div class=fl>תעריף לשעה (\u20AA)</div><input type='number' id='ef-hr' value='"+(e.hr||0)+"' min='0'></div>";
  else if(edM==="chair")f="<div class=fw><div class=fl>שכירת כיסא חודשית (\u20AA)</div><input type='number' id='ef-cr' value='"+(e.cr||0)+"' min='0'></div>";
  else if(edM==="chair_pct")f="<div class=fw><div class=fl>שכירת כיסא (\u20AA)</div><input type='number' id='ef-cr' value='"+(e.cr||0)+"' min='0'></div><div class=fw><div class=fl>אחוז לעובד (%)</div><input type='number' id='ef-pct' value='"+(e.pct||50)+"' min='1' max='99'></div>";
  document.getElementById("ed-mfields").innerHTML=f;
  var sp=edM==="percent"||edM==="chair_pct";
  document.getElementById("ed-spw").style.display=sp?"block":"none";
  if(sp)rEdSp();
}
function setEdM(m){edM=m;rEdMdl();}
function rEdSp(){
  var e=S.emps.find(function(x){return x.id===edId;})||{sp:{}};
  var h="";
  S.svcs.forEach(function(s){
    var p=(e.sp&&e.sp[s.id]!=null)?e.sp[s.id]:(e.pct||50);
    h+="<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px'><span style='font-size:13px'>"+s.lbl+"</span><div style='display:flex;align-items:center;gap:6px'><input type='number' id='sp-"+s.id+"' value='"+p+"' min='0' max='100' style='width:58px;height:36px;font-size:14px;padding:0;text-align:center'><span style='color:#555;font-size:13px'>%</span></div></div>";
  });
  document.getElementById("ed-spct").innerHTML=h;
}
function saveEdit(){
  var e=S.emps.find(function(x){return x.id===edId;});if(!e)return;
  e.name=document.getElementById("ed-name").value.trim()||e.name;
  e.role=document.getElementById("ed-role").value.trim()||e.role;
  e.av=ini(e.name);
  var np=document.getElementById("ed-pin").value.trim();if(np.length===4&&!isNaN(np))e.pin=np;
  e.pm=edM;
  var ep=document.getElementById("ef-pct");if(ep)e.pct=parseInt(ep.value)||50;
  var eh=document.getElementById("ef-hr");if(eh)e.hr=parseInt(eh.value)||0;
  var ec=document.getElementById("ef-cr");if(ec)e.cr=parseInt(ec.value)||0;
  e.sp=e.sp||{};S.svcs.forEach(function(s){var el=document.getElementById("sp-"+s.id);if(el)e.sp[s.id]=parseInt(el.value)||0;});
  sv();closeM("m-edit");rOwner();
}

/* -- ADD EMP -- */
function openAddModal(){addM="percent";document.getElementById("ad-name").value="";document.getElementById("ad-role").value="";document.getElementById("ad-pin").value="";rAddMdl();openM("m-add");}
function rAddMdl(){
  var h="";MDL.forEach(function(m){h+="<div class='mo"+(addM===m.id?" on":"")+"' onclick='setAdM(\""+m.id+"\")'><span style='font-size:14px'>"+m.lbl+"</span></div>";});
  document.getElementById("ad-models").innerHTML=h;
  var f="";
  if(addM==="percent")f="<div class=fw><div class=fl>אחוז (%)</div><input type='number' id='af-pct' value='50' min='1' max='99'></div>";
  else if(addM==="hourly")f="<div class=fw><div class=fl>תעריף לשעה (\u20AA)</div><input type='number' id='af-hr' value='0' min='0'></div>";
  else if(addM==="chair")f="<div class=fw><div class=fl>שכירת כיסא (\u20AA)</div><input type='number' id='af-cr' value='0' min='0'></div>";
  else if(addM==="chair_pct")f="<div class=fw><div class=fl>שכירת כיסא (\u20AA)</div><input type='number' id='af-cr' value='0' min='0'></div><div class=fw><div class=fl>אחוז לעובד (%)</div><input type='number' id='af-pct' value='50' min='1' max='99'></div>";
  document.getElementById("ad-mfields").innerHTML=f;
}
function setAdM(m){addM=m;rAddMdl();}
function saveAdd(){
  var name=document.getElementById("ad-name").value.trim();if(!name)return;
  var role=document.getElementById("ad-role").value.trim()||"ספר";
  var np=document.getElementById("ad-pin").value.trim();if(np.length!==4||isNaN(np))np="1234";
  var c=COLS[S.emps.length%COLS.length];
  var e={id:S.nid++,name:name,role:role,av:ini(name),pm:addM,pct:50,hr:0,cr:0,sp:{},color:c,pin:np};
  var ap=document.getElementById("af-pct");if(ap)e.pct=parseInt(ap.value)||50;
  var ah=document.getElementById("af-hr");if(ah)e.hr=parseInt(ah.value)||0;
  var ac=document.getElementById("af-cr");if(ac)e.cr=parseInt(ac.value)||0;
  S.emps.push(e);sv();closeM("m-add");renderLogin();rOwner();
}

/* -- SERVICES -- */
function openEditSvc(id){edSvc=id;var s=S.svcs.find(function(x){return x.id===id;});if(!s)return;document.getElementById("svc-title").textContent="עריכת שירות";document.getElementById("sv-name").value=s.lbl;document.getElementById("sv-price").value=s.price;openM("m-svc");}
function openAddSvc(){edSvc=null;document.getElementById("svc-title").textContent="הוסף שירות";document.getElementById("sv-name").value="";document.getElementById("sv-price").value="";openM("m-svc");}
function saveSvc(){var n=document.getElementById("sv-name").value.trim(),pr=parseInt(document.getElementById("sv-price").value)||0;if(!n)return;if(edSvc){var s=S.svcs.find(function(x){return x.id===edSvc;});if(s){s.lbl=n;s.price=pr;}}else{S.svcs.push({id:"s"+Date.now(),lbl:n,price:pr});}sv();closeM("m-svc");rSvcs();}
function delSvc(id){S.svcs=S.svcs.filter(function(s){return s.id!==id;});sv();rSvcs();}
function saveGoal(){S.goal=parseInt(document.getElementById("goal-v").value)||0;sv();closeM("m-goal");rReport();}

/* -- INIT -- */
(function(){
  showPg("pg-welcome");
})();
