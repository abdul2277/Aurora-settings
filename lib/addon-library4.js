/* Fourth batch: macOS-style and Linux-style add-ons. Everything here runs inside the add-on sandbox. */
const lib = require('./addon-library'); const { def } = lib; const R = String.raw;

/* A tiny safe calculator (no eval). Shared by Spotlight and the mini terminal. */
const CALC = R`function calc(s){
  var t=String(s).toLowerCase().replace(/\s+/g,'').replace(/×/g,'*').replace(/÷/g,'/'),i=0;
  function num(){var m=/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(t.slice(i));if(!m)throw 0;i+=m[0].length;return parseFloat(m[0])}
  function atom(){
    var c=t[i];
    if(c==='('){i++;var v=expr();if(t[i]!==')')throw 0;i++;return v}
    var w=/^[a-z]+/.exec(t.slice(i));
    if(w){w=w[0];i+=w.length;if(w==='pi')return Math.PI;if(w==='e')return Math.E;
      var f={sqrt:Math.sqrt,sin:Math.sin,cos:Math.cos,tan:Math.tan,log:Math.log10,ln:Math.log,abs:Math.abs,round:Math.round,floor:Math.floor,ceil:Math.ceil}[w];
      if(!f||t[i]!=='(')throw 0;i++;var a=expr();if(t[i]!==')')throw 0;i++;return f(a)}
    return num()}
  function un(){if(t[i]==='-'){i++;return -un()}if(t[i]==='+'){i++;return un()}return atom()}
  function pw(){var b=un();if(t[i]==='^'){i++;return Math.pow(b,pw())}return b}
  function term(){var v=pw();while(t[i]==='*'||t[i]==='/'||t[i]==='%'){var o=t[i++],r=pw();v=o==='*'?v*r:o==='/'?v/r:v%r}return v}
  function expr(){var v=term();while(t[i]==='+'||t[i]==='-'){var o=t[i++],r=term();v=o==='+'?v+r:v-r}return v}
  try{if(!t)return null;var v=expr();if(i!==t.length||typeof v!=='number'||!isFinite(v))return null;return Math.round(v*1e10)/1e10}catch(e){return null}
}
`;

/* ---------------- macOS style ---------------- */

def('spotlight', 'spotlight-calc', 'Spotlight calculator', '🔍', 'Type maths, unit conversions or percentages and get the answer instantly, like Spotlight.', ['clipboard'],
  `<h3>Spotlight</h3><input id="q" class="spot" placeholder="Try: 12*(3+4)   5 km to mi   20 c to f   15% of 80" autofocus><div id="out" class="spotout"></div><p class="muted" id="hint">Press Enter to copy the answer.</p>
<style>.spot{width:100%;box-sizing:border-box;font-size:20px;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 40px rgba(0,0,0,.35)}.spotout{margin-top:14px;font-size:34px;font-weight:700;min-height:44px;background:linear-gradient(90deg,var(--accent),#c49bff);-webkit-background-clip:text;background-clip:text;color:transparent}</style>`,
  CALC + R`var U={m:['l',1],km:['l',1000],cm:['l',.01],mm:['l',.001],mi:['l',1609.344],ft:['l',.3048],in:['l',.0254],yd:['l',.9144],kg:['m',1],g:['m',.001],lb:['m',.45359237],oz:['m',.028349523125],l:['v',1],ml:['v',.001],gal:['v',3.785411784],c:['t'],f:['t'],k:['t']};
function convert(q){
  var m=/^(-?\d*\.?\d+)\s*([a-z]+)\s*(?:to|in|->)\s*([a-z]+)$/i.exec(String(q).trim());if(!m)return null;
  var v=parseFloat(m[1]),a=U[m[2].toLowerCase()],b=U[m[3].toLowerCase()];if(!a||!b||a[0]!==b[0])return null;
  var out;if(a[0]==='t'){var x=m[2].toLowerCase(),y=m[3].toLowerCase(),c=x==='c'?v:x==='f'?(v-32)*5/9:v-273.15;out=y==='c'?c:y==='f'?c*9/5+32:c+273.15}
  else out=v*a[1]/b[1];
  return Math.round(out*1e6)/1e6+' '+m[3].toLowerCase()}
function percent(q){var m=/^(\d*\.?\d+)\s*%\s*of\s*(\d*\.?\d+)$/i.exec(String(q).trim());if(!m)return null;return Math.round(parseFloat(m[1])*parseFloat(m[2])/100*1e6)/1e6}
function answer(q){q=String(q).trim();if(!q)return '';var p=percent(q);if(p!==null)return String(p);var c=convert(q);if(c!==null)return c;var v=calc(q);return v===null?'':String(v)}
var q=document.getElementById('q'),out=document.getElementById('out');
q.oninput=function(){out.textContent=answer(q.value)};
q.onkeydown=function(e){if(e.key==='Enter'&&out.textContent){aurora.copy(out.textContent).then(function(){aurora.toast('Copied '+out.textContent)}).catch(function(){})}};
window.__spot={calc:calc,convert:convert,percent:percent,answer:answer};`);

def('stickies', 'stickies', 'Stickies', '🗒️', 'Colourful sticky notes that stay on your desktop page and remember what you wrote.', ['storage'],
  `<h3>Stickies <button class="p" id="add">+ New note</button></h3><div id="wall" class="wall"></div>
<style>.wall{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.note{border-radius:6px 6px 14px 6px;padding:8px;color:#222;box-shadow:0 8px 20px rgba(0,0,0,.35);transform:rotate(-1deg);display:flex;flex-direction:column;gap:4px}.note:nth-child(even){transform:rotate(1.2deg)}.note textarea{background:transparent;border:0;color:#222;min-height:110px;resize:vertical;font:15px/1.3 "Segoe Print","Comic Sans MS",cursive;outline:0}.note .x{align-self:flex-end;background:rgba(0,0,0,.12);color:#222;border:0;border-radius:8px;padding:2px 8px;cursor:pointer}</style>`,
  R`var $=function(i){return document.getElementById(i)},COL=['#ffe66d','#9ef0c4','#ffb3c7','#a9d6ff','#d9b8ff'],N=[],timer=null;
function normalize(l){return (Array.isArray(l)?l:[]).filter(function(n){return n&&typeof n.text==='string'}).slice(0,30).map(function(n){return{text:n.text.slice(0,2000),color:COL.indexOf(n.color)>=0?n.color:COL[0]}})}
function save(){clearTimeout(timer);timer=setTimeout(function(){aurora.storage.set('notes',N).catch(function(){})},300)}
function draw(){var w=$('wall');w.textContent='';N.forEach(function(n,i){var d=document.createElement('div');d.className='note';d.style.background=n.color;var t=document.createElement('textarea');t.value=n.text;t.maxLength=2000;t.oninput=function(){n.text=t.value;save()};var x=document.createElement('button');x.className='x';x.textContent='✕';x.onclick=function(){N.splice(i,1);save();draw()};d.appendChild(t);d.appendChild(x);w.appendChild(d)})}
$('add').onclick=function(){if(N.length>=30)return;N.push({text:'',color:COL[N.length%COL.length]});save();draw()};
aurora.storage.get('notes').then(function(v){N=normalize(v);if(!N.length)N=[{text:'Click here and type…',color:COL[0]}];draw()}).catch(function(){N=[{text:'',color:COL[0]}];draw()});
window.__sticky={normalize:normalize,colors:COL};`);

def('menubar', 'menu-bar', 'Menu bar', '🍎', 'A glassy menu bar with the date, time, processor and memory, in macOS style.', ['system'],
  `<div class="mbar"><span class="ap">◆ Vorynth</span><span class="mi">File</span><span class="mi">Edit</span><span class="mi">View</span><span class="sp"></span><span id="cpu">CPU –</span><span id="ram">RAM –</span><span id="clk"></span></div><p class="muted">A live status strip. Open it beside your other tools for a quick look at your PC.</p>
<style>.mbar{display:flex;gap:14px;align-items:center;padding:6px 14px;border-radius:12px;background:rgba(255,255,255,.12);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.2);font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.3)}.mbar .ap{font-weight:800}.mbar .sp{flex:1}.mi{opacity:.85}</style>`,
  R`var D=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function pad(n){return (n<10?'0':'')+n}
function fmt(d){return D[d.getDay()]+' '+d.getDate()+' '+M[d.getMonth()]+'  '+pad(d.getHours())+':'+pad(d.getMinutes())}
function tick(){document.getElementById('clk').textContent=fmt(new Date())}
function stats(){aurora.system.stats().then(function(s){document.getElementById('cpu').textContent='CPU '+s.cpu+'%';document.getElementById('ram').textContent='RAM '+Math.round(s.ramUsed/s.ramTotal*100)+'%'}).catch(function(){})}
tick();stats();setInterval(tick,1000);setInterval(stats,2000);window.__menubar={fmt:fmt};`);

def('dock', 'dock-actions', 'Dock', '🧷', 'A magnifying dock of quick actions: copy the time, a password, a unique ID, flip a coin, roll dice.', ['clipboard'],
  `<h3>Dock</h3><div id="out" class="dockout">Hover the icons, click one.</div><div class="dockwrap"><div id="dock" class="dock"></div></div>
<style>.dockwrap{display:flex;justify-content:center;margin-top:40px}.dock{display:flex;align-items:flex-end;gap:8px;padding:8px 12px;border-radius:22px;background:rgba(255,255,255,.1);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.22);box-shadow:0 14px 40px rgba(0,0,0,.4);height:64px}.dock button{font-size:34px;background:none;border:0;cursor:pointer;transform-origin:bottom center;transition:transform .08s;padding:0 2px}.dockout{min-height:48px;font-size:22px;font-weight:700;word-break:break-all}</style>`,
  R`var ACT=[['🕒','Time'],['📅','Date'],['🔐','Password'],['🆔','Unique ID'],['🪙','Coin'],['🎲','Dice']];
function scale(dx){return 1+0.9*Math.max(0,1-Math.abs(dx)/90)}
function rnd(n){var a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n}
function password(len){var cs='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*',s='';len=Math.max(8,Math.min(64,len||16));for(var i=0;i<len;i++)s+=cs[rnd(cs.length)];return s}
function uuid(){var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return (x<16?'0':'')+x.toString(16)}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
function run(i){var d=new Date();return [d.toLocaleTimeString(),d.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'}),password(16),uuid(),rnd(2)?'Heads':'Tails',String(rnd(6)+1)][i]}
var dock=document.getElementById('dock'),btns=[];
ACT.forEach(function(a,i){var b=document.createElement('button');b.textContent=a[0];b.title=a[1];b.onclick=function(){var v=run(i);document.getElementById('out').textContent=v;if(i<4)aurora.copy(v).then(function(){aurora.toast(a[1]+' copied')}).catch(function(){})};dock.appendChild(b);btns.push(b)});
dock.onmousemove=function(e){btns.forEach(function(b){var r=b.getBoundingClientRect();b.style.transform='scale('+scale(e.clientX-(r.left+r.width/2))+')'})};
dock.onmouseleave=function(){btns.forEach(function(b){b.style.transform=''})};
window.__dock={scale:scale,password:password,uuid:uuid,count:ACT.length};`);

const KEYS = [
  ['Copy', '⌘ C', 'Ctrl + C'], ['Cut', '⌘ X', 'Ctrl + X'], ['Paste', '⌘ V', 'Ctrl + V'], ['Undo', '⌘ Z', 'Ctrl + Z'], ['Redo', '⇧ ⌘ Z', 'Ctrl + Y'],
  ['Select all', '⌘ A', 'Ctrl + A'], ['Find', '⌘ F', 'Ctrl + F'], ['Save', '⌘ S', 'Ctrl + S'], ['Print', '⌘ P', 'Ctrl + P'], ['Open', '⌘ O', 'Ctrl + O'],
  ['New window or file', '⌘ N', 'Ctrl + N'], ['New tab', '⌘ T', 'Ctrl + T'], ['Reopen closed tab', '⇧ ⌘ T', 'Ctrl + Shift + T'], ['Close tab or window', '⌘ W', 'Ctrl + W'],
  ['Quit the app', '⌘ Q', 'Alt + F4'], ['Switch app', '⌘ Tab', 'Alt + Tab'], ['Search everything', '⌘ Space', 'Win + S'], ['Screenshot of an area', '⇧ ⌘ 4', 'Win + Shift + S'],
  ['Lock the screen', '⌃ ⌘ Q', 'Win + L'], ['See all windows', '⌃ ↑', 'Win + Tab'], ['Show the desktop', 'F11', 'Win + D'], ['Force quit / task manager', '⌥ ⌘ Esc', 'Ctrl + Shift + Esc'],
  ['Emoji picker', '⌃ ⌘ Space', 'Win + .'], ['Minimize window', '⌘ M', 'Win + ↓'], ['Settings', '⌘ ,', 'Win + I'], ['Rename a file', 'Return', 'F2'],
  ['Move to bin', '⌘ Delete', 'Delete'], ['Next desktop', '⌃ →', 'Win + Ctrl + →'], ['Zoom in', '⌘ +', 'Ctrl + +'], ['Go to the address bar', '⌘ L', 'Ctrl + L'],
  ['Clipboard history', '—', 'Win + V'], ['Preview a file', 'Space', 'Alt + P (preview pane)']
];
def('keymap', 'mac-windows-keys', 'Mac and Windows keys', '⌨️', 'A searchable cheat sheet that translates macOS shortcuts to Windows shortcuts and back.', [],
  `<h3>Shortcut translator</h3><p><input id="f" placeholder="Search, for example: screenshot" style="width:55%"> <button id="dir">Mac → Windows</button></p><table class="tbl" id="t"></table>
<style>.tbl{width:100%;border-collapse:collapse}.tbl td,.tbl th{padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.09);text-align:left}kbd{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:2px 8px;font-size:13px}</style>`,
  'var K=' + JSON.stringify(KEYS) + ';' + R`var flip=false;
function filter(q){q=String(q||'').toLowerCase().trim();return K.filter(function(r){return !q||r.join(' ').toLowerCase().indexOf(q)>=0})}
function draw(){var t=document.getElementById('t');t.textContent='';var h=document.createElement('tr');['Action',flip?'Windows':'Mac',flip?'Mac':'Windows'].forEach(function(x){var th=document.createElement('th');th.textContent=x;h.appendChild(th)});t.appendChild(h);
  filter(document.getElementById('f').value).forEach(function(r){var tr=document.createElement('tr');[r[0],flip?r[2]:r[1],flip?r[1]:r[2]].forEach(function(x,i){var td=document.createElement('td');if(i){var k=document.createElement('kbd');k.textContent=x;td.appendChild(k)}else td.textContent=x;tr.appendChild(td)});t.appendChild(tr)})}
document.getElementById('f').oninput=draw;document.getElementById('dir').onclick=function(){flip=!flip;this.textContent=flip?'Windows → Mac':'Mac → Windows';draw()};draw();
window.__keys={all:K,filter:filter};`);

def('spaces', 'mission-spaces', 'Mission spaces', '🪟', 'Four desktops (spaces) as columns. Park tasks and ideas in a space and move them between spaces.', ['storage'],
  `<h3>Spaces</h3><div id="b" class="spaces"></div>
<style>.spaces{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.sp{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:8px;min-height:220px}.sp h4{margin:2px 4px 8px}.cd{background:rgba(255,255,255,.1);border-radius:10px;padding:6px 8px;margin-bottom:6px;font-size:13px;display:flex;gap:4px;align-items:center}.cd span{flex:1;word-break:break-word}.cd button{padding:0 6px;border-radius:6px}.sp input{width:100%;box-sizing:border-box}</style>`,
  R`var NAMES=['Desktop 1','Desktop 2','Desktop 3','Desktop 4'],B=[[],[],[],[]],$=function(i){return document.getElementById(i)};
function normalize(b){var o=[[],[],[],[]];if(Array.isArray(b))for(var c=0;c<4;c++)if(Array.isArray(b[c]))o[c]=b[c].filter(function(x){return typeof x==='string'&&x.trim()}).slice(0,40).map(function(x){return x.slice(0,200)});return o}
function move(b,col,idx,dir){var to=col+dir;if(to<0||to>3||idx<0||idx>=b[col].length)return b;var c=b[col].splice(idx,1)[0];b[to].push(c);return b}
function save(){aurora.storage.set('board',B).catch(function(){})}
function draw(){var box=$('b');box.textContent='';B.forEach(function(list,c){var s=document.createElement('div');s.className='sp';var h=document.createElement('h4');h.textContent=NAMES[c]+' ('+list.length+')';s.appendChild(h);
  list.forEach(function(t,i){var d=document.createElement('div');d.className='cd';var l=document.createElement('button');l.textContent='◀';l.onclick=function(){move(B,c,i,-1);save();draw()};var sp=document.createElement('span');sp.textContent=t;var r=document.createElement('button');r.textContent='▶';r.onclick=function(){move(B,c,i,1);save();draw()};var x=document.createElement('button');x.textContent='✕';x.onclick=function(){B[c].splice(i,1);save();draw()};d.appendChild(l);d.appendChild(sp);d.appendChild(r);d.appendChild(x);s.appendChild(d)});
  var inp=document.createElement('input');inp.placeholder='Add…';inp.maxLength=200;inp.onkeydown=function(e){if(e.key==='Enter'&&inp.value.trim()&&B[c].length<40){B[c].push(inp.value.trim());save();draw()}};s.appendChild(inp);box.appendChild(s)})}
aurora.storage.get('board').then(function(v){B=normalize(v);draw()}).catch(draw);draw();window.__board={normalize:normalize,move:move};`);

def('focus', 'focus-modes', 'Focus modes', '🌙', 'Pick Work, Reading, Sleep wind-down or Gaming, run a timer and get a message when it ends.', ['storage', 'notify'],
  `<h3>Focus</h3><div id="modes" class="modes"></div><div class="big" id="t">25:00</div><p><button class="p" id="go">Start</button> <span class="muted" id="tot"></span></p>
<style>.modes{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.modes button{border-radius:20px;padding:8px 16px}.modes button.on{background:linear-gradient(90deg,var(--accent),#8f7bff);color:#fff}#t{font-size:64px;font-weight:800;font-variant-numeric:tabular-nums}</style>`,
  R`var MODES=[['💼 Work',25],['📖 Reading',45],['🌙 Wind down',30],['🎮 Gaming',90]],cur=0,left=25*60,iv=null,done={},$=function(i){return document.getElementById(i)};
function fmt(s){s=Math.max(0,Math.round(s));var m=Math.floor(s/60),x=s%60;return (m<10?'0':'')+m+':'+(x<10?'0':'')+x}
function today(){return new Date().toISOString().slice(0,10)}
function show(){$('t').textContent=fmt(left);var m=done[today()]||0;$('tot').textContent=m?'Focused today: '+m+' min':''}
function pick(i){if(iv)return;cur=i;left=MODES[i][1]*60;[].forEach.call($('modes').children,function(b,j){b.className=j===i?'on':''});show()}
MODES.forEach(function(m,i){var b=document.createElement('button');b.textContent=m[0];b.onclick=function(){pick(i)};$('modes').appendChild(b)});
$('go').onclick=function(){if(iv){clearInterval(iv);iv=null;this.textContent='Start';left=MODES[cur][1]*60;show();return}this.textContent='Stop';iv=setInterval(function(){left--;if(left<=0){clearInterval(iv);iv=null;$('go').textContent='Start';done[today()]=(done[today()]||0)+MODES[cur][1];aurora.storage.set('done',done).catch(function(){});aurora.notify(MODES[cur][0]+' finished').catch(function(){});left=MODES[cur][1]*60}show()},1000)};
aurora.storage.get('done').then(function(v){if(v&&typeof v==='object'&&!Array.isArray(v))done=v;show()}).catch(show);pick(0);window.__focus={fmt:fmt,modes:MODES.length};`);

/* ---------------- Linux style ---------------- */

def('neofetch', 'neofetch-aurora', 'Neofetch', '🐧', 'The famous system summary screen with a logo, for your Vorynth session. Copy it to share.', ['system', 'clipboard'],
  `<h3>neofetch</h3><pre id="nf" class="nf"></pre><p><button id="copy">Copy</button></p>
<style>.nf{background:#0b0f19;border-radius:14px;padding:16px;line-height:1.35;font:14px/1.35 Consolas,monospace;overflow:auto;border:1px solid rgba(255,255,255,.12)}</style>`,
  R`var LOGO=['      /\\      ','     /  \\     ','    / /\\ \\    ','   / /__\\ \\   ','  /_/    \\_\\  ','  Vorynth      '];
function lines(i){var rows=[['',i.user+'@'+i.host],['','-----------------'],['OS',i.os],['Shell','Vorynth add-on sandbox'],['Resolution',i.res],['Theme',i.theme],['CPU',i.cpu],['Memory',i.mem],['Uptime',i.up],['Locale',i.lang]];
  var out=[];for(var n=0;n<Math.max(rows.length,LOGO.length);n++){var l=LOGO[n]||'              ',r=rows[n];out.push(l+'  '+(r?(r[0]?r[0]+': ':'')+r[1]:''))}return out}
function upText(s){var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return (d?d+'d ':'')+(h?h+'h ':'')+m+'m'}
function info(s){var os=/Windows/.test(navigator.userAgent)?'Windows':/Linux/.test(navigator.userAgent)?'Linux':'Other';
  return{user:'you',host:'aurora',os:os+' (Vorynth Settings)',res:screen.width+'x'+screen.height,theme:(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#4cc2ff').trim()+' accent',cpu:s?s.cpu+'% in use':'n/a',mem:s?(s.ramUsed/1073741824).toFixed(1)+' GiB / '+(s.ramTotal/1073741824).toFixed(1)+' GiB':'n/a',up:s&&s.uptime?upText(s.uptime):'n/a',lang:navigator.language||'n/a'}}
function render(s){document.getElementById('nf').textContent=lines(info(s)).join('\n')}
aurora.system.stats().then(render).catch(function(){render(null)});
document.getElementById('copy').onclick=function(){aurora.copy(document.getElementById('nf').textContent).then(function(){aurora.toast('Copied')}).catch(function(){})};
window.__nf={lines:lines,upText:upText};`);

def('htop', 'htop-meters', 'Htop meters', '📊', 'Colourful processor and memory bars with a live history graph, like htop.', ['system'],
  `<h3>htop</h3><pre id="m" class="ht"></pre><canvas id="cv" width="480" height="120" style="width:100%;max-width:480px;border-radius:10px;background:#0a0f1c"></canvas>
<style>.ht{font:15px/1.5 Consolas,monospace;background:#0b0f19;padding:12px;border-radius:12px;margin:0 0 10px}.g{color:#5ce07a}.y{color:#f2d04f}.r{color:#ff6b6b}</style>`,
  R`var H=[],$=function(i){return document.getElementById(i)};
function bar(p,w){p=Math.max(0,Math.min(100,Math.round(p)));var n=Math.round(p/100*w),s='';for(var i=0;i<w;i++)s+=i<n?'|':' ';return '['+s+'] '+p+'%'}
function cls(p){return p>=85?'r':p>=60?'y':'g'}
function paint(){var c=$('cv').getContext('2d');c.clearRect(0,0,480,120);c.strokeStyle='rgba(255,255,255,.08)';for(var y=0;y<=120;y+=30){c.beginPath();c.moveTo(0,y);c.lineTo(480,y);c.stroke()}c.strokeStyle='#5ce07a';c.lineWidth=2;c.beginPath();H.forEach(function(v,i){var x=i*8,y=120-v/100*120;if(i)c.lineTo(x,y);else c.moveTo(x,y)});c.stroke()}
function show(s){var cp=s.cpu,rp=s.ramUsed/s.ramTotal*100;H.push(cp);if(H.length>60)H.shift();var m=$('m');m.textContent='';[['CPU',cp],['Mem',rp]].forEach(function(r){var sp=document.createElement('span');sp.className=cls(r[1]);sp.textContent=r[0]+' '+bar(r[1],30);m.appendChild(sp);m.appendChild(document.createTextNode('\n'))});paint()}
function poll(){aurora.system.stats().then(show).catch(function(){})}
poll();setInterval(poll,1000);window.__htop={bar:bar,cls:cls};`);

def('miniterm', 'mini-terminal', 'Mini terminal', '💻', 'A safe pretend terminal: calculator, base64, uuid, cowsay and more. It cannot touch your files.', [],
  `<h3>Mini terminal</h3><div id="scr" class="term"></div><div class="term2"><span>aurora@pc:~$</span><input id="in" autofocus autocomplete="off" spellcheck="false"></div><p class="muted">Type <b>help</b>. Arrow up brings back earlier commands.</p>
<style>.term{background:#0b0f19;border-radius:12px 12px 0 0;padding:12px;height:260px;overflow:auto;white-space:pre-wrap;font:14px/1.4 Consolas,monospace;border:1px solid rgba(255,255,255,.12)}.term2{display:flex;gap:8px;background:#0b0f19;padding:8px 12px;border-radius:0 0 12px 12px;border:1px solid rgba(255,255,255,.12);border-top:0;font:14px Consolas,monospace}.term2 span{color:#5ce07a}.term2 input{flex:1;background:transparent;border:0;color:inherit;font:inherit;outline:0}</style>`,
  CALC + R`var FORT=['A tidy desk is a calm start.','Small steps still reach the top.','Back up before you tinker.','Restart it. Seriously.','Read the error message first.','Slow is smooth, smooth is fast.'];
function cowsay(t){t=t||'moo';var b='-'.repeat(t.length+2);return ' '+'_'.repeat(t.length+2)+'\n< '+t+' >\n '+b+'\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||'}
function cal(d){var y=d.getFullYear(),m=d.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),names=['January','February','March','April','May','June','July','August','September','October','November','December'],h=names[m]+' '+y,pad=Math.max(0,Math.floor((20-h.length)/2)),o=' '.repeat(pad)+h+'\nSu Mo Tu We Th Fr Sa\n'+'   '.repeat(first);for(var i=1;i<=days;i++){o+=(i<10?' ':'')+i+((first+i)%7===0?'\n':' ')}return o.replace(/\s+$/,'')}
function uuid(){var b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return (x<16?'0':'')+x.toString(16)}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
function rot13(s){return s.replace(/[a-z]/gi,function(c){var b=c<='Z'?65:97;return String.fromCharCode((c.charCodeAt(0)-b+13)%26+b)})}
function b64(s){try{return btoa(unescape(encodeURIComponent(s)))}catch(e){return 'error: cannot encode'}}
function unb64(s){try{return decodeURIComponent(escape(atob(s)))}catch(e){return 'error: not valid base64'}}
var HELP='Commands: help  clear  date  whoami  echo  calc  uuid  base64  unbase64  rot13  upper  lower  rev  wc  cal  cowsay  fortune  seq  history';
function run(line,hist){line=String(line).trim();if(!line)return{out:''};var sp=line.indexOf(' '),cmd=(sp<0?line:line.slice(0,sp)).toLowerCase(),arg=sp<0?'':line.slice(sp+1).trim();
  switch(cmd){case 'help':return{out:HELP};case 'clear':return{clear:true,out:''};case 'date':return{out:new Date().toString()};case 'whoami':return{out:'you'};case 'echo':return{out:arg};
  case 'calc':{var v=calc(arg);return{out:v===null?'error: cannot calculate that':String(v)}}
  case 'uuid':return{out:uuid()};case 'base64':return{out:b64(arg)};case 'unbase64':return{out:unb64(arg)};case 'rot13':return{out:rot13(arg)};case 'upper':return{out:arg.toUpperCase()};case 'lower':return{out:arg.toLowerCase()};case 'rev':return{out:arg.split('').reverse().join('')};
  case 'wc':return{out:(arg?arg.split(/\s+/).length:0)+' words, '+arg.length+' characters'};case 'cal':return{out:cal(new Date())};case 'cowsay':return{out:cowsay(arg.slice(0,40))};case 'fortune':return{out:FORT[Math.floor(Math.random()*FORT.length)]};
  case 'seq':{var n=parseInt(arg,10);if(!(n>=1&&n<=100))return{out:'usage: seq 1-100'};var a=[];for(var i=1;i<=n;i++)a.push(i);return{out:a.join(' ')}}
  case 'history':return{out:(hist||[]).map(function(h,i){return (i+1)+'  '+h}).join('\n')};
  default:return{out:cmd+': command not found. Type help.'}}}
var scr=document.getElementById('scr'),inp=document.getElementById('in'),hist=[],hp=0;
function put(t){var d=document.createElement('div');d.textContent=t;scr.appendChild(d);scr.scrollTop=scr.scrollHeight}
put('Vorynth mini terminal. '+HELP);
inp.onkeydown=function(e){if(e.key==='Enter'){var l=inp.value;inp.value='';put('$ '+l);var r=run(l,hist);if(l.trim()){hist.push(l);if(hist.length>200)hist.shift();hp=hist.length}if(r.clear)scr.textContent='';else if(r.out)put(r.out)}else if(e.key==='ArrowUp'){if(hp>0)hp--;inp.value=hist[hp]||'';e.preventDefault()}else if(e.key==='ArrowDown'){if(hp<hist.length)hp++;inp.value=hist[hp]||'';e.preventDefault()}};
window.__term={run:run,cowsay:cowsay,rot13:rot13,cal:cal};`);

def('cron', 'cron-helper', 'Cron helper', '⏰', 'Type a cron schedule and see in plain words when it runs next. Handy for Linux servers.', [],
  `<h3>Cron helper</h3><p><input id="e" value="*/15 9-17 * * 1-5" style="width:60%;font-family:Consolas,monospace"></p><p id="d" class="muted"></p><ol id="n"></ol><p class="muted">Five fields: minute, hour, day of month, month, weekday (0-6, Sunday is 0).</p>`,
  R`var RANGE=[[0,59],[0,23],[1,31],[1,12],[0,6]],NAME=['minute','hour','day of month','month','weekday'];
function field(s,lo,hi,isDow){var set={},ok=true;s.split(',').forEach(function(p){var m=/^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(p);if(!m){ok=false;return}var step=m[4]?parseInt(m[4],10):1;if(step<1){ok=false;return}var a,b;if(m[1]==='*'){a=lo;b=hi}else{a=parseInt(m[2],10);b=m[3]!==undefined?parseInt(m[3],10):(m[4]?hi:a)}
  if(isDow){if(a===7)a=0;if(b===7)b=m[3]!==undefined?6:0}
  if(a<lo||b>hi||a>b){ok=false;return}for(var v=a;v<=b;v+=step)set[v]=1});
  if(!ok)return null;return Object.keys(set).map(Number).sort(function(x,y){return x-y})}
function parse(e){var f=String(e).trim().split(/\s+/);if(f.length!==5)return null;var out=[];for(var i=0;i<5;i++){var v=field(f[i],RANGE[i][0],RANGE[i][1],i===4);if(!v||!v.length)return null;out.push({list:v,star:f[i].charAt(0)==='*'})}return out}
function matches(p,d){if(p[0].list.indexOf(d.getMinutes())<0||p[1].list.indexOf(d.getHours())<0||p[3].list.indexOf(d.getMonth()+1)<0)return false;var dm=p[2].list.indexOf(d.getDate())>=0,dw=p[4].list.indexOf(d.getDay())>=0;if(!p[2].star&&!p[4].star)return dm||dw;return dm&&dw}
function next(e,from,n){var p=parse(e);if(!p)return null;var d=new Date(from.getTime());d.setSeconds(0,0);d.setMinutes(d.getMinutes()+1);var out=[],guard=0;while(out.length<n&&guard++<527040){if(matches(p,d))out.push(new Date(d.getTime()));d.setMinutes(d.getMinutes()+1)}return out}
function describe(e){var p=parse(e);if(!p)return 'That is not a valid cron schedule.';return p.map(function(f,i){return NAME[i]+': '+(f.list.length===RANGE[i][1]-RANGE[i][0]+1?'every':f.list.join(', '))}).join(' | ')}
function draw(){var e=document.getElementById('e').value;document.getElementById('d').textContent=describe(e);var l=document.getElementById('n');l.textContent='';var r=next(e,new Date(),5);(r||[]).forEach(function(d){var li=document.createElement('li');li.textContent=d.toLocaleString();l.appendChild(li)})}
document.getElementById('e').oninput=draw;draw();window.__cron={parse:parse,next:next,describe:describe};`);

def('chmod', 'chmod-calculator', 'Chmod calculator', '🔐', 'Tick read, write and run boxes and get the Linux permission number, or the other way around.', [],
  `<h3>Permissions</h3><table class="pt" id="g"></table><p>Number <input id="oc" value="644" maxlength="4" style="width:70px;font-family:Consolas,monospace"> <b id="sy" style="font-family:Consolas,monospace"></b></p><p class="muted" id="cmd"></p>
<style>.pt td,.pt th{padding:6px 14px;text-align:center}</style>`,
  R`var W=['Owner','Group','Others'],P=['Read','Write','Run'],$=function(i){return document.getElementById(i)};
function toOctal(b){var s='';for(var i=0;i<3;i++)s+=(b[i][0]?4:0)+(b[i][1]?2:0)+(b[i][2]?1:0);return s}
function fromOctal(s){s=String(s).trim();if(s.length===4&&s[0]==='0')s=s.slice(1);if(!/^[0-7]{3}$/.test(s))return null;return s.split('').map(function(c){var n=+c;return[!!(n&4),!!(n&2),!!(n&1)]})}
function sym(b){return b.map(function(t){return (t[0]?'r':'-')+(t[1]?'w':'-')+(t[2]?'x':'-')}).join('')}
var B=fromOctal('644'),boxes=[];
function build(){var g=$('g'),h=document.createElement('tr');h.appendChild(document.createElement('th'));P.forEach(function(p){var th=document.createElement('th');th.textContent=p;h.appendChild(th)});g.appendChild(h);
  W.forEach(function(w,i){var tr=document.createElement('tr'),td=document.createElement('td');td.textContent=w;tr.appendChild(td);boxes[i]=[];P.forEach(function(p,j){var c=document.createElement('td'),cb=document.createElement('input');cb.type='checkbox';cb.onchange=function(){B[i][j]=cb.checked;show(true)};boxes[i][j]=cb;c.appendChild(cb);tr.appendChild(c)});g.appendChild(tr)})}
function show(fromBoxes){$('sy').textContent=sym(B);if(fromBoxes)$('oc').value=toOctal(B);boxes.forEach(function(r,i){r.forEach(function(cb,j){cb.checked=B[i][j]})});$('cmd').textContent='chmod '+toOctal(B)+' file'}
$('oc').oninput=function(){var b=fromOctal($('oc').value);if(b){B=b;show(false)}};
build();show(false);window.__chmod={toOctal:toOctal,fromOctal:fromOctal,sym:sym};`);

/* ---------------- Animation add-ons ---------------- */

def('pixelanim', 'pixel-animator', 'Pixel animator', '🎞️', 'Draw frame by frame on a pixel grid, onion-skin the last frame, play it as an animation and copy it as a sprite sheet.', ['storage', 'clipboard'],
  `<h3>Pixel animator <span class="muted" id="inf"></span></h3>
<div class="pa"><canvas id="cv" width="288" height="288"></canvas><div class="side"><div id="pal" class="pal"></div><canvas id="pv" width="96" height="96"></canvas><label class="muted">Speed <input type="range" id="fps" min="1" max="24" value="8"> <span id="fv">8</span> fps</label><label class="muted"><input type="checkbox" id="onion" checked> Onion skin</label></div></div>
<div id="strip" class="strip"></div>
<p><button id="add">+ Frame</button> <button id="dup">Duplicate</button> <button id="del">Delete</button> <button id="clr">Clear</button> <button class="p" id="play">Play</button> <button id="sheet">Copy sprite sheet</button></p>
<style>.pa{display:flex;gap:14px;flex-wrap:wrap}#cv{border-radius:12px;cursor:crosshair;background:conic-gradient(#2a3042 25%,#1d2231 0 50%,#2a3042 0 75%,#1d2231 0) 0 0/24px 24px;touch-action:none}.side{display:flex;flex-direction:column;gap:10px}.pal{display:grid;grid-template-columns:repeat(4,28px);gap:6px}.pal b{width:28px;height:28px;border-radius:8px;cursor:pointer;border:2px solid transparent}.pal b.on{border-color:#fff}#pv{border-radius:10px;background:#1d2231;image-rendering:pixelated}.strip{display:flex;gap:6px;overflow:auto;padding:8px 0}.strip canvas{width:56px;height:56px;border-radius:8px;background:#1d2231;cursor:pointer;border:2px solid transparent;image-rendering:pixelated;flex:none}.strip canvas.on{border-color:var(--accent)}</style>`,
  R`var N=24,MAXF=30,COL=['','#ff5c7a','#ffb347','#ffe66d','#6be58a','#4cc2ff','#a98bff','#ffffff'],F=[blank()],cur=0,color=1,playing=null,pi=0,timer=null,$=function(i){return document.getElementById(i)};
function blank(){return new Array(N*N+1).join('0')}
function frameAt(t,fps,n){if(n<1)return 0;return Math.floor(t*fps)%n}
function sheetSize(n,cols){cols=Math.max(1,Math.min(cols||n,n));return{cols:cols,rows:Math.ceil(n/cols),w:cols*N,h:Math.ceil(n/cols)*N}}
function normalize(l){if(!Array.isArray(l))return[blank()];var o=l.filter(function(f){return typeof f==='string'&&f.length===N*N&&/^[0-7]+$/.test(f)}).slice(0,MAXF);return o.length?o:[blank()]}
function setPx(f,x,y,c){if(x<0||y<0||x>=N||y>=N)return f;var i=y*N+x;return f.slice(0,i)+c+f.slice(i+1)}
function paint(ctx,f,px,alpha){ctx.globalAlpha=alpha==null?1:alpha;for(var i=0;i<f.length;i++){var c=+f[i];if(!c)continue;ctx.fillStyle=COL[c];ctx.fillRect((i%N)*px,Math.floor(i/N)*px,px,px)}ctx.globalAlpha=1}
function save(){clearTimeout(timer);timer=setTimeout(function(){aurora.storage.set('proj',F).catch(function(){})},400)}
function draw(){var cv=$('cv'),g=cv.getContext('2d');g.clearRect(0,0,288,288);if($('onion').checked&&cur>0)paint(g,F[cur-1],12,.3);paint(g,F[cur],12,1);g.strokeStyle='rgba(255,255,255,.06)';for(var i=1;i<N;i++){g.beginPath();g.moveTo(i*12,0);g.lineTo(i*12,288);g.stroke();g.beginPath();g.moveTo(0,i*12);g.lineTo(288,i*12);g.stroke()}
  var st=$('strip');st.textContent='';F.forEach(function(f,i){var c=document.createElement('canvas');c.width=N;c.height=N;paint(c.getContext('2d'),f,1);c.className=i===cur?'on':'';c.onclick=function(){cur=i;draw()};st.appendChild(c)});$('inf').textContent='frame '+(cur+1)+' of '+F.length}
function pv(){var g=$('pv').getContext('2d');g.clearRect(0,0,96,96);paint(g,F[pi%F.length],4,1)}
function pal(){var p=$('pal');p.textContent='';COL.forEach(function(c,i){var b=document.createElement('b');b.style.background=i?c:'transparent';b.style.border=i?'':'2px dashed #888';b.title=i?'Colour '+i:'Eraser';b.className=i===color?'on':'';b.onclick=function(){color=i;pal()};p.appendChild(b)})}
var down=false;function hit(e){var r=$('cv').getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*N),y=Math.floor((e.clientY-r.top)/r.height*N);F[cur]=setPx(F[cur],x,y,String(color));draw();save()}
$('cv').onpointerdown=function(e){down=true;hit(e)};$('cv').onpointermove=function(e){if(down)hit(e)};window.onpointerup=function(){down=false};
$('add').onclick=function(){if(F.length>=MAXF)return;F.splice(cur+1,0,blank());cur++;draw();save()};$('dup').onclick=function(){if(F.length>=MAXF)return;F.splice(cur+1,0,F[cur]);cur++;draw();save()};
$('del').onclick=function(){if(F.length>1){F.splice(cur,1);cur=Math.min(cur,F.length-1)}else F[0]=blank();draw();save()};$('clr').onclick=function(){F[cur]=blank();draw();save()};
$('onion').onchange=draw;$('fps').oninput=function(){$('fv').textContent=this.value;if(playing)$('play').onclick(),$('play').onclick()};
$('play').onclick=function(){if(playing){clearInterval(playing);playing=null;this.textContent='Play';pi=0;return}this.textContent='Stop';playing=setInterval(function(){pi++;pv()},1000/Number($('fps').value))};
$('sheet').onclick=function(){var z=sheetSize(F.length,F.length),c=document.createElement('canvas');c.width=z.w;c.height=z.h;F.forEach(function(f,i){var g=c.getContext('2d');g.save();g.translate((i%z.cols)*N,Math.floor(i/z.cols)*N);paint(g,f,1);g.restore()});aurora.copy(c.toDataURL('image/png')).then(function(){aurora.toast('Copied. Paste it into a browser address bar to see and save the image.')}).catch(function(){})};
setInterval(function(){if(!playing){pi=Math.floor(Date.now()/1000*Number($('fps').value))%F.length}pv()},120);
aurora.storage.get('proj').then(function(v){F=normalize(v);cur=0;draw()}).catch(draw);pal();draw();pv();
window.__pa={N:N,frameAt:frameAt,sheetSize:sheetSize,normalize:normalize,setPx:setPx,blank:blank};`);

def('keyframes', 'keyframe-mover', 'Keyframe mover', '🎬', 'Drag shapes around, set keyframes on a timeline and watch them move with easing. Copy the result as CSS.', ['storage', 'clipboard'],
  `<h3>Keyframe mover</h3>
<div id="stage" class="stage"></div>
<p><input type="range" id="tl" min="0" max="3000" value="0" style="width:100%"></p>
<p><button class="p" id="play">Play</button> <button id="key">Set keyframe here</button> <button id="rmk">Remove keyframe here</button> <select id="ease"><option value="linear">Linear</option><option value="inout" selected>Ease in-out</option><option value="out">Ease out</option><option value="bounce">Bounce</option></select> <select id="sel"></select> <button id="add">+ Shape</button></p>
<p><button id="pre1">Preset: bounce</button> <button id="pre2">Preset: orbit</button> <button id="pre3">Preset: pulse</button> <button id="css">Copy as CSS</button> <span class="muted" id="t">0.0 s</span></p>
<style>.stage{position:relative;height:260px;border-radius:14px;overflow:hidden;background:linear-gradient(160deg,#141a2b,#1f2740);border:1px solid rgba(255,255,255,.14)}.sh{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;cursor:grab;touch-action:none;display:grid;place-items:center;font-size:26px}.sh.sel{outline:2px dashed rgba(255,255,255,.6);outline-offset:6px}</style>`,
  R`var DUR=3000,SHAPES=['⚽','🟦','⭐','🔺','💜'],W=480,H=260,S=[],sel=0,t=0,playing=false,last=0,timer=null,$=function(i){return document.getElementById(i)},PR=['x','y','scale','rot','op'];
function ease(n,u){u=Math.max(0,Math.min(1,u));if(n==='inout')return u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;if(n==='out')return 1-Math.pow(1-u,3);if(n==='bounce'){var a=7.5625,d=2.75;if(u<1/d)return a*u*u;if(u<2/d){u-=1.5/d;return a*u*u+.75}if(u<2.5/d){u-=2.25/d;return a*u*u+.9375}u-=2.625/d;return a*u*u+.984375}return u}
function valueAt(keys,tm,p){if(!keys.length)return null;var k=keys.slice().sort(function(a,b){return a.t-b.t});if(tm<=k[0].t)return k[0][p];if(tm>=k[k.length-1].t)return k[k.length-1][p];for(var i=0;i<k.length-1;i++){if(tm>=k[i].t&&tm<=k[i+1].t){var u=(tm-k[i].t)/(k[i+1].t-k[i].t),e=ease(k[i].ease,u);return k[i][p]+(k[i+1][p]-k[i][p])*e}}return k[0][p]}
function stateAt(sh,tm){var o={};PR.forEach(function(p){var v=valueAt(sh.keys,tm,p);o[p]=v==null?sh[p]:v});return o}
function mk(i){return{icon:SHAPES[i%SHAPES.length],x:60+i*40,y:130,scale:1,rot:0,op:1,keys:[]}}
function normalize(l){if(!Array.isArray(l)||!l.length)return[mk(0)];return l.slice(0,8).map(function(s,i){var b=mk(i);if(!s||typeof s!=='object')return b;b.icon=SHAPES.indexOf(s.icon)>=0?s.icon:b.icon;PR.forEach(function(p){if(typeof s[p]==='number'&&isFinite(s[p]))b[p]=s[p]});b.keys=(Array.isArray(s.keys)?s.keys:[]).slice(0,40).filter(function(k){return k&&typeof k.t==='number'&&k.t>=0&&k.t<=DUR&&PR.every(function(p){return typeof k[p]==='number'&&isFinite(k[p])})}).map(function(k){return{t:k.t,x:k.x,y:k.y,scale:k.scale,rot:k.rot,op:k.op,ease:['linear','inout','out','bounce'].indexOf(k.ease)>=0?k.ease:'inout'}});return b})}
function cssOf(sh,idx){var ks=sh.keys.slice().sort(function(a,b){return a.t-b.t});if(!ks.length)return '/* no keyframes */';var o='@keyframes move'+(idx+1)+' {\n';ks.forEach(function(k){o+='  '+Math.round(k.t/DUR*100)+'% { transform: translate('+Math.round(k.x)+'px, '+Math.round(k.y)+'px) scale('+(Math.round(k.scale*100)/100)+') rotate('+Math.round(k.rot)+'deg); opacity: '+(Math.round(k.op*100)/100)+'; }\n'});return o+'}\n.shape'+(idx+1)+' { animation: move'+(idx+1)+' '+(DUR/1000)+'s infinite; }'}
function save(){clearTimeout(timer);timer=setTimeout(function(){aurora.storage.set('scene',S).catch(function(){})},400)}
function render(){var st=$('stage');if(st.children.length!==S.length){st.textContent='';S.forEach(function(sh,i){var d=document.createElement('div');d.className='sh';d.textContent=sh.icon;d.onpointerdown=function(e){sel=i;$('sel').value=i;d.setPointerCapture(e.pointerId);d._drag=true;render()};d.onpointermove=function(e){if(!d._drag)return;var r=st.getBoundingClientRect();sh.x=Math.max(0,Math.min(W,(e.clientX-r.left)/r.width*W));sh.y=Math.max(0,Math.min(H,(e.clientY-r.top)/r.height*H));if(sh.keys.length){var k=sh.keys.filter(function(k){return Math.abs(k.t-t)<20})[0];if(k){k.x=sh.x;k.y=sh.y}}render();save()};d.onpointerup=function(){d._drag=false};st.appendChild(d)})}
  S.forEach(function(sh,i){var d=st.children[i],v=d._drag||!sh.keys.length?{x:sh.x,y:sh.y,scale:sh.scale,rot:sh.rot,op:sh.op}:stateAt(sh,t);d.style.left=v.x/W*100+'%';d.style.top=v.y/H*100+'%';d.style.transform='scale('+v.scale+') rotate('+v.rot+'deg)';d.style.opacity=v.op;d.className='sh'+(i===sel?' sel':'')});$('t').textContent=(t/1000).toFixed(1)+' s';$('tl').value=t}
function fillSel(){var s=$('sel');s.textContent='';S.forEach(function(sh,i){var o=document.createElement('option');o.value=i;o.textContent='Shape '+(i+1)+' '+sh.icon;s.appendChild(o)});s.value=sel}
$('sel').onchange=function(){sel=+this.value;render()};$('tl').oninput=function(){t=+this.value;render()};
$('add').onclick=function(){if(S.length>=8)return;S.push(mk(S.length));sel=S.length-1;$('stage').textContent='';fillSel();render();save()};
$('key').onclick=function(){var sh=S[sel],v={t:t,x:sh.x,y:sh.y,scale:sh.scale,rot:sh.rot,op:sh.op,ease:$('ease').value};if(sh.keys.length){var c=stateAt(sh,t);v.x=sh.x;v.y=sh.y;v.scale=c.scale;v.rot=c.rot;v.op=c.op}sh.keys=sh.keys.filter(function(k){return Math.abs(k.t-t)>=20});sh.keys.push(v);render();save()};
$('rmk').onclick=function(){var sh=S[sel];sh.keys=sh.keys.filter(function(k){return Math.abs(k.t-t)>=20});render();save()};
function preset(n){var sh=S[sel],e=n===1?'bounce':'inout';if(n===1)sh.keys=[{t:0,x:sh.x,y:30,scale:1,rot:0,op:1,ease:'bounce'},{t:1500,x:sh.x,y:220,scale:1,rot:0,op:1,ease:'out'},{t:3000,x:sh.x,y:30,scale:1,rot:0,op:1,ease:'inout'}];
  if(n===2){sh.keys=[];for(var i=0;i<=8;i++){var a=i/8*Math.PI*2;sh.keys.push({t:i*DUR/8,x:240+Math.cos(a)*140,y:130+Math.sin(a)*80,scale:1,rot:i*45,op:1,ease:'linear'})}}
  if(n===3)sh.keys=[{t:0,x:sh.x,y:sh.y,scale:1,rot:0,op:1,ease:'inout'},{t:1500,x:sh.x,y:sh.y,scale:1.8,rot:0,op:.6,ease:'inout'},{t:3000,x:sh.x,y:sh.y,scale:1,rot:0,op:1,ease:'inout'}];render();save()}
$('pre1').onclick=function(){preset(1)};$('pre2').onclick=function(){preset(2)};$('pre3').onclick=function(){preset(3)};
$('css').onclick=function(){aurora.copy(S.map(cssOf).join('\n\n')).then(function(){aurora.toast('CSS copied')}).catch(function(){})};
$('play').onclick=function(){playing=!playing;this.textContent=playing?'Pause':'Play';last=performance.now();if(playing)requestAnimationFrame(loop)};
function loop(n){if(!playing)return;t=(t+(n-last))%DUR;last=n;render();requestAnimationFrame(loop)}
S=[mk(0)];aurora.storage.get('scene').then(function(v){S=normalize(v);fillSel();render()}).catch(function(){fillSel();render()});fillSel();render();
window.__kf={ease:ease,valueAt:valueAt,normalize:normalize,css:cssOf,DUR:DUR,get:function(){return S}};`);

/* ---------------- Games and playgrounds ---------------- */

def('wordle', 'word-guess', 'Word guess', '🟩', 'Guess the five-letter word in six tries. Green is right, yellow is in the wrong place.', ['storage'],
  `<h3>Word guess <span class="muted" id="st"></span></h3><div id="grid" class="wg"></div><p><input id="in" maxlength="5" placeholder="5 letters" style="width:120px;text-transform:uppercase;font-size:18px"> <button class="p" id="go">Guess</button> <button id="new">New word</button></p><p class="muted" id="msg"></p>
<style>.wg{display:grid;gap:6px;margin-bottom:10px}.wr{display:flex;gap:6px}.wc{width:46px;height:46px;border-radius:10px;display:grid;place-items:center;font-size:24px;font-weight:800;background:rgba(255,255,255,.08);text-transform:uppercase}.wc.g{background:#2f9e5b}.wc.y{background:#c79a1e}.wc.x{background:#3a4152}</style>`,
  R`var WORDS='apple brave cloud dream eagle flame grape house input jolly knife lemon magic night ocean piano queen river stone tiger uncle vivid water yacht zebra angel beach candy dance earth fresh ghost heart ivory jelly kayak light money noble olive pearl quiet raven smile train unity voice whale young shine sword plant brain chair table music green black white sugar happy robot pixel laser orbit comet'.split(' '),T,rows,done,wins=0,$=function(i){return document.getElementById(i)};
function score(g,t){g=g.toLowerCase();t=t.toLowerCase();var r=['x','x','x','x','x'],left={},i;for(i=0;i<5;i++){if(g[i]===t[i])r[i]='g';else left[t[i]]=(left[t[i]]||0)+1}for(i=0;i<5;i++){if(r[i]==='g')continue;if(left[g[i]]>0){r[i]='y';left[g[i]]--}}return r}
function draw(){var gr=$('grid');gr.textContent='';for(var i=0;i<6;i++){var row=document.createElement('div');row.className='wr';for(var j=0;j<5;j++){var c=document.createElement('div');c.className='wc';var r=rows[i];if(r){c.textContent=r.w[j];c.className+=' '+r.s[j]}row.appendChild(c)}gr.appendChild(row)}$('st').textContent=wins?'wins: '+wins:''}
function reset(){T=WORDS[Math.floor(Math.random()*WORDS.length)];rows=[];done=false;$('msg').textContent='';$('in').value='';draw()}
function guess(){if(done)return;var w=$('in').value.toLowerCase().trim();if(!/^[a-z]{5}$/.test(w)){$('msg').textContent='Type exactly 5 letters';return}rows.push({w:w,s:score(w,T)});$('in').value='';if(w===T){done=true;wins++;$('msg').textContent='You got it!';aurora.storage.set('wins',wins).catch(function(){})}else if(rows.length>=6){done=true;$('msg').textContent='The word was '+T.toUpperCase()}else $('msg').textContent='';draw()}
$('go').onclick=guess;$('in').onkeydown=function(e){if(e.key==='Enter')guess()};$('new').onclick=reset;aurora.storage.get('wins').then(function(v){if(typeof v==='number'){wins=v;draw()}}).catch(function(){});reset();
window.__word={score:score,count:WORDS.length,all:WORDS};`);

def('tetris', 'block-stacker', 'Block stacker', '🧱', 'Falling blocks. Arrow keys to move and turn, space to drop. Clear lines to score.', ['storage'],
  `<h3>Block stacker <span class="muted" id="sc">score 0</span> <span class="muted" id="hi"></span></h3><canvas id="cv" width="200" height="400" style="border-radius:12px;background:#0a0f1c"></canvas><p><button class="p" id="go">Start</button> <span class="muted">← → move, ↑ turn, ↓ faster, space drop</span></p>`,
  R`var W=10,H=20,P={I:[[1,1,1,1]],O:[[1,1],[1,1]],T:[[0,1,0],[1,1,1]],S:[[0,1,1],[1,1,0]],Z:[[1,1,0],[0,1,1]],J:[[1,0,0],[1,1,1]],L:[[0,0,1],[1,1,1]]},COL={I:'#4cc2ff',O:'#ffe66d',T:'#a98bff',S:'#6be58a',Z:'#ff5c7a',J:'#5c7aff',L:'#ffb347'},K=Object.keys(P),$=function(i){return document.getElementById(i)};
var board,cur,over=true,score=0,iv=null,hi=0;
function empty(){var b=[];for(var y=0;y<H;y++)b.push(new Array(W).fill(''));return b}
function rotate(m){var r=[];for(var x=0;x<m[0].length;x++){r.push([]);for(var y=m.length-1;y>=0;y--)r[x].push(m[y][x])}return r}
function collide(b,m,px,py){for(var y=0;y<m.length;y++)for(var x=0;x<m[y].length;x++){if(!m[y][x])continue;var X=px+x,Y=py+y;if(X<0||X>=W||Y>=H)return true;if(Y>=0&&b[Y][X])return true}return false}
function merge(b,m,px,py,k){m.forEach(function(row,y){row.forEach(function(v,x){if(v&&b[py+y])b[py+y][px+x]=k})});return b}
function clearLines(b){var keep=b.filter(function(r){return r.some(function(c){return !c})}),n=H-keep.length;while(keep.length<H)keep.unshift(new Array(W).fill(''));return{board:keep,cleared:n}}
function spawn(){var k=K[Math.floor(Math.random()*K.length)];cur={k:k,m:P[k].map(function(r){return r.slice()}),x:Math.floor((W-P[k][0].length)/2),y:0};if(collide(board,cur.m,cur.x,cur.y))end()}
function lock(){merge(board,cur.m,cur.x,cur.y,cur.k);var r=clearLines(board);board=r.board;score+=[0,100,300,500,800][r.cleared];spawn()}
function down(){if(over)return;if(!collide(board,cur.m,cur.x,cur.y+1))cur.y++;else lock();draw()}
function end(){over=true;clearInterval(iv);iv=null;$('go').textContent='Again';if(score>hi){hi=score;$('hi').textContent='best '+hi;aurora.storage.set('hi',hi).catch(function(){})}}
function draw(){var g=$('cv').getContext('2d');g.fillStyle='#0a0f1c';g.fillRect(0,0,200,400);function cell(x,y,k){g.fillStyle=COL[k];g.fillRect(x*20+1,y*20+1,18,18)}board.forEach(function(r,y){r.forEach(function(k,x){if(k)cell(x,y,k)})});if(cur&&!over)cur.m.forEach(function(r,y){r.forEach(function(v,x){if(v)cell(cur.x+x,cur.y+y,cur.k)})});$('sc').textContent='score '+score;if(over&&score){g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,0,200,400);g.fillStyle='#fff';g.font='bold 24px sans-serif';g.textAlign='center';g.fillText('Game over',100,200)}}
document.addEventListener('keydown',function(e){if(over)return;if(e.key==='ArrowLeft'&&!collide(board,cur.m,cur.x-1,cur.y))cur.x--;else if(e.key==='ArrowRight'&&!collide(board,cur.m,cur.x+1,cur.y))cur.x++;else if(e.key==='ArrowDown')down();else if(e.key==='ArrowUp'){var r=rotate(cur.m);if(!collide(board,r,cur.x,cur.y))cur.m=r}else if(e.key===' '){while(!collide(board,cur.m,cur.x,cur.y+1))cur.y++;lock()}else return;e.preventDefault();draw()});
$('go').onclick=function(){board=empty();score=0;over=false;spawn();clearInterval(iv);iv=setInterval(down,500);this.textContent='Restart';draw()};
aurora.storage.get('hi').then(function(v){if(typeof v==='number'){hi=v;$('hi').textContent='best '+hi}}).catch(function(){});board=empty();draw();
window.__tet={empty:empty,rotate:rotate,collide:collide,merge:merge,clearLines:clearLines,P:P,W:W,H:H};`);

def('flappy', 'flap-bird', 'Flap', '🐤', 'Click or press space to flap through the gaps. How far can you get?', ['storage'],
  `<h3>Flap <span class="muted" id="sc">0</span> <span class="muted" id="hi"></span></h3><canvas id="cv" width="320" height="420" style="width:100%;max-width:320px;border-radius:14px;background:linear-gradient(#1b2a4a,#3c5a8c)"></canvas><p class="muted">Click the game or press space.</p>`,
  R`var W=320,H=420,GAP=120,$=function(i){return document.getElementById(i)};
var S,run=false,hi=0;
function fresh(rnd){return{y:200,vy:0,pipes:[{x:340,gap:80+Math.floor(rnd()*160)}],score:0,dead:false,passed:0}}
function flap(s){if(!s.dead)s.vy=-6.2;return s}
function step(s,rnd){if(s.dead)return s;s.vy+=0.38;s.y+=s.vy;s.pipes.forEach(function(p){p.x-=2.4});if(s.pipes[0].x<-50){s.pipes.shift()}if(s.pipes[s.pipes.length-1].x<170)s.pipes.push({x:350,gap:80+Math.floor(rnd()*160)});
  s.pipes.forEach(function(p){if(!p.done&&p.x+44<60){p.done=true;s.score++}});
  if(s.y<0||s.y>H-14)s.dead=true;s.pipes.forEach(function(p){if(60+12>p.x&&60-12<p.x+44&&(s.y-12<p.gap||s.y+12>p.gap+GAP))s.dead=true});return s}
function draw(){var g=$('cv').getContext('2d');g.clearRect(0,0,W,H);S.pipes.forEach(function(p){g.fillStyle='#3fbf6b';g.fillRect(p.x,0,44,p.gap);g.fillRect(p.x,p.gap+GAP,44,H)});g.font='26px sans-serif';g.fillText('🐤',46,S.y+9);$('sc').textContent=S.score;if(S.dead){g.fillStyle='rgba(0,0,0,.5)';g.fillRect(0,0,W,H);g.fillStyle='#fff';g.font='bold 26px sans-serif';g.textAlign='center';g.fillText('Click to retry',W/2,H/2)}}
function loop(){requestAnimationFrame(loop);if(!run)return;step(S,Math.random);draw();if(S.dead){run=false;if(S.score>hi){hi=S.score;$('hi').textContent='best '+hi;aurora.storage.set('hi',hi).catch(function(){})}}}
function act(){if(S.dead||!run){S=fresh(Math.random);run=true}flap(S)}
$('cv').onclick=act;document.addEventListener('keydown',function(e){if(e.key===' '){act();e.preventDefault()}});
aurora.storage.get('hi').then(function(v){if(typeof v==='number'){hi=v;$('hi').textContent='best '+hi}}).catch(function(){});S=fresh(Math.random);draw();loop();window.__flap={fresh:fresh,flap:flap,step:step,GAP:GAP};`);

def('bouncy', 'bouncy-balls', 'Bouncy balls', '🏀', 'Click to drop balls and watch them bounce. Shake the box, change gravity, and fling them around.', [],
  `<h3>Bouncy balls</h3><canvas id="cv" width="520" height="320" style="width:100%;max-width:520px;border-radius:14px;background:#0a0f1c;cursor:pointer"></canvas><p><button id="shake">Shake</button> <button id="clr">Clear</button> <label class="muted">Gravity <input type="range" id="gr" min="0" max="20" value="9"></label> <label class="muted">Bounce <input type="range" id="bn" min="30" max="100" value="80"></label></p>`,
  R`var W=520,H=320,B=[],$=function(i){return document.getElementById(i)},COL=['#4cc2ff','#a98bff','#ff5c7a','#ffb347','#6be58a','#ffe66d'];
function step(balls,dt,g,bounce){balls.forEach(function(b){b.vy+=g*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*bounce}if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx)*bounce}if(b.y>H-b.r){b.y=H-b.r;b.vy=-Math.abs(b.vy)*bounce;b.vx*=0.995;if(Math.abs(b.vy)<8)b.vy=0}if(b.y<b.r){b.y=b.r;b.vy=Math.abs(b.vy)*bounce}});return balls}
function make(x,y,rnd){return{x:x,y:y,vx:(rnd()-.5)*240,vy:(rnd()-.5)*120,r:10+Math.floor(rnd()*14),c:COL[Math.floor(rnd()*COL.length)]}}
function draw(){var g=$('cv').getContext('2d');g.clearRect(0,0,W,H);B.forEach(function(b){var gr=g.createRadialGradient(b.x-b.r/3,b.y-b.r/3,2,b.x,b.y,b.r);gr.addColorStop(0,'#fff');gr.addColorStop(.3,b.c);gr.addColorStop(1,'rgba(0,0,0,.5)');g.fillStyle=gr;g.beginPath();g.arc(b.x,b.y,b.r,0,7);g.fill()})}
var last=performance.now();function loop(n){requestAnimationFrame(loop);var dt=Math.min(.05,(n-last)/1000);last=n;step(B,dt,Number($('gr').value)*40,Number($('bn').value)/100);draw()}
$('cv').onclick=function(e){var r=this.getBoundingClientRect();if(B.length<80)B.push(make((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H,Math.random))};
$('shake').onclick=function(){B.forEach(function(b){b.vx+=(Math.random()-.5)*900;b.vy-=300+Math.random()*500})};$('clr').onclick=function(){B=[]};
B.push(make(100,60,Math.random),make(260,40,Math.random));requestAnimationFrame(loop);window.__bounce={step:step,make:make,W:W,H:H};`);

def('solar', 'solar-system', 'Solar system', '🪐', 'The planets orbiting the Sun at the right relative speeds. Speed it up to watch a year fly by.', [],
  `<h3>Solar system <span class="muted" id="d"></span></h3><canvas id="cv" width="520" height="520" style="width:100%;max-width:520px;border-radius:14px;background:#05070f"></canvas><p><label class="muted">Time speed <input type="range" id="sp" min="1" max="100" value="20"></label></p>`,
  R`var PL=[['Mercury',.387,.241,'#b5b5b5',3],['Venus',.723,.615,'#e8c37a',5],['Earth',1,1,'#4cc2ff',5],['Mars',1.524,1.881,'#ff6b4a',4],['Jupiter',2.2,11.86,'#e0b48a',9],['Saturn',2.9,29.4,'#f0d9a0',8]],days=0,$=function(i){return document.getElementById(i)};
function angle(days,years){return (days/365.25/years)*Math.PI*2}
function orbitR(a){return 40+a*70}
function pos(p,days){var a=angle(days,p[2]),r=orbitR(p[1]);return{x:260+Math.cos(a)*r,y:260+Math.sin(a)*r}}
var last=performance.now();function loop(n){requestAnimationFrame(loop);days+=(n-last)/1000*Number($('sp').value);last=n;var g=$('cv').getContext('2d');g.clearRect(0,0,520,520);var sun=g.createRadialGradient(260,260,2,260,260,26);sun.addColorStop(0,'#fff6c2');sun.addColorStop(1,'#ff9d2e');g.fillStyle=sun;g.beginPath();g.arc(260,260,24,0,7);g.fill();PL.forEach(function(p){g.strokeStyle='rgba(255,255,255,.1)';g.beginPath();g.arc(260,260,orbitR(p[1]),0,7);g.stroke();var q=pos(p,days);g.fillStyle=p[3];g.beginPath();g.arc(q.x,q.y,p[4],0,7);g.fill()});$('d').textContent='day '+Math.floor(days)+' (year '+(days/365.25).toFixed(1)+')'}
requestAnimationFrame(loop);window.__solar={angle:angle,pos:pos,planets:PL.length,PL:PL};`);

def('sorting', 'sorting-visualizer', 'Sorting visualizer', '📶', 'Watch bubble, insertion, selection and quick sort put bars in order, step by step.', [],
  `<h3>Sorting visualizer <span class="muted" id="inf"></span></h3><canvas id="cv" width="520" height="260" style="width:100%;max-width:520px;border-radius:14px;background:#0a0f1c"></canvas><p><select id="al"><option value="bubble">Bubble sort</option><option value="insertion">Insertion sort</option><option value="selection">Selection sort</option><option value="quick">Quick sort</option></select> <button id="shuf">Shuffle</button> <button class="p" id="go">Sort</button> <label class="muted">Speed <input type="range" id="sp" min="1" max="60" value="30"></label></p>`,
  R`var N=48,A=[],hi=[],busy=false,$=function(i){return document.getElementById(i)};
function shuffle(n,rnd){var a=[];for(var i=0;i<n;i++)a.push(i+1);for(i=n-1;i>0;i--){var j=Math.floor(rnd()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function steps(name,arr){var a=arr.slice(),s=[];function sw(i,j){var t=a[i];a[i]=a[j];a[j]=t;s.push([i,j])}
  if(name==='bubble'){for(var i=0;i<a.length;i++)for(var j=0;j<a.length-1-i;j++)if(a[j]>a[j+1])sw(j,j+1)}
  else if(name==='insertion'){for(var i2=1;i2<a.length;i2++){var k=i2;while(k>0&&a[k-1]>a[k]){sw(k-1,k);k--}}}
  else if(name==='selection'){for(var i3=0;i3<a.length-1;i3++){var m=i3;for(var j3=i3+1;j3<a.length;j3++)if(a[j3]<a[m])m=j3;if(m!==i3)sw(i3,m)}}
  else{(function q(lo,hi){if(lo>=hi)return;var p=a[hi],i4=lo;for(var j4=lo;j4<hi;j4++)if(a[j4]<p){if(i4!==j4)sw(i4,j4);i4++}if(i4!==hi)sw(i4,hi);q(lo,i4-1);q(i4+1,hi)})(0,a.length-1)}
  return s}
function apply(arr,st){var a=arr.slice();st.forEach(function(x){var t=a[x[0]];a[x[0]]=a[x[1]];a[x[1]]=t});return a}
function draw(){var g=$('cv').getContext('2d');g.clearRect(0,0,520,260);var w=520/A.length;A.forEach(function(v,i){g.fillStyle=hi.indexOf(i)>=0?'#ff5c7a':'#4cc2ff';g.fillRect(i*w+1,260-v/N*250,w-2,v/N*250)})}
function reset(){A=shuffle(N,Math.random);hi=[];busy=false;$('inf').textContent='';draw()}
$('shuf').onclick=function(){if(!busy)reset()};
$('go').onclick=function(){if(busy)return;busy=true;var st=steps($('al').value,A),i=0;$('inf').textContent=st.length+' swaps';(function f(){if(i>=st.length){hi=[];busy=false;draw();return}var n=Math.max(1,Math.floor(Number($('sp').value)/6));for(var k=0;k<n&&i<st.length;k++,i++){var x=st[i];var t=A[x[0]];A[x[0]]=A[x[1]];A[x[1]]=t;hi=[x[0],x[1]]}draw();setTimeout(f,16)})()};
reset();window.__sort={shuffle:shuffle,steps:steps,apply:apply};`);

def('plasma', 'plasma-waves', 'Plasma waves', '🔮', 'A flowing, colourful plasma effect. Pure eye candy that runs smoothly.', [],
  `<h3>Plasma</h3><canvas id="cv" width="160" height="100" style="width:100%;max-width:520px;image-rendering:auto;border-radius:14px"></canvas><p><label class="muted">Colour <input type="range" id="hue" min="0" max="360" value="200"></label> <label class="muted">Speed <input type="range" id="sp" min="1" max="10" value="4"></label></p>`,
  R`var $=function(i){return document.getElementById(i)};
function val(x,y,t){var v=Math.sin(x/16+t)+Math.sin(y/8-t*1.3)+Math.sin((x+y)/16+t*.7)+Math.sin(Math.sqrt(x*x+y*y)/8-t);return (v+4)/8}
function rgb(h,v){h=((h%360)+360)%360;var s=.85,l=.25+v*.5,a=s*Math.min(l,1-l),f=function(n){var k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))))};return[f(0),f(8),f(4)]}
var cv=$('cv'),g=cv.getContext('2d'),img=g.createImageData(160,100),t=0;
function frame(){requestAnimationFrame(frame);t+=Number($('sp').value)*.004;var h=Number($('hue').value),d=img.data;for(var y=0;y<100;y++)for(var x=0;x<160;x++){var v=val(x,y,t),c=rgb(h+v*120,v),i=(y*160+x)*4;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255}g.putImageData(img,0,0)}
frame();window.__plasma={val:val,rgb:rgb};`);

/* ---------------- Handy tools and puzzles ---------------- */

def('bmi', 'bmi-calculator', 'BMI calculator', '⚖️', 'Work out your body mass index in metric or imperial. It is a rough guide only, not medical advice.', [],
  `<h3>BMI</h3><p><select id="u"><option value="m">Metric (kg, cm)</option><option value="i">Imperial (lb, in)</option></select> <input id="w" type="number" placeholder="Weight" style="width:90px"> <input id="h" type="number" placeholder="Height" style="width:90px"></p><p class="big" id="out"></p><p class="muted">A rough guide only. It cannot tell muscle from fat and is not medical advice.</p>`,
  R`var $=function(i){return document.getElementById(i)};
function bmi(w,h,unit){w=Number(w);h=Number(h);if(!(w>0&&h>0))return null;var v=unit==='i'?703*w/(h*h):w/Math.pow(h/100,2);if(!isFinite(v)||v<5||v>150)return null;return Math.round(v*10)/10}
function band(v){return v<18.5?'Under 18.5 (underweight range)':v<25?'18.5 to 24.9 (typical range)':v<30?'25 to 29.9 (overweight range)':'30 or more (obese range)'}
function show(){var v=bmi($('w').value,$('h').value,$('u').value);$('out').textContent=v===null?'':v+'  '+band(v)}
['u','w','h'].forEach(function(i){$(i).oninput=show});window.__bmi={bmi:bmi,band:band};`);

def('tipsplit', 'tip-splitter', 'Tip and bill splitter', '🧾', 'Add a tip and split the bill between friends, with rounding that adds up.', [],
  `<h3>Split the bill</h3><p><input id="b" type="number" step="0.01" placeholder="Bill" style="width:100px"> <input id="t" type="number" value="10" style="width:60px"> % tip <input id="n" type="number" value="2" min="1" style="width:60px"> people</p><p class="big" id="out"></p><p class="muted" id="det"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function split(bill,tip,n){bill=Number(bill);tip=Number(tip);n=Math.floor(Number(n));if(!(bill>0)||!(n>=1)||!(tip>=0)||n>100)return null;var total=Math.round(bill*(1+tip/100)*100)/100,cents=Math.round(total*100),base=Math.floor(cents/n),extra=cents-base*n,shares=[];for(var i=0;i<n;i++)shares.push((base+(i<extra?1:0))/100);return{total:total,tip:Math.round((total-bill)*100)/100,shares:shares}}
function show(){var r=split($('b').value,$('t').value,$('n').value);if(!r){$('out').textContent='';$('det').textContent='';return}$('out').textContent=r.shares[0].toFixed(2)+' each';$('det').textContent='Total '+r.total.toFixed(2)+' (tip '+r.tip.toFixed(2)+')'+(r.shares[0]!==r.shares[r.shares.length-1]?'. A few people pay one cent more so it adds up exactly.':'')}
['b','t','n'].forEach(function(i){$(i).oninput=show});window.__tip={split:split};`);

def('loan', 'loan-calculator', 'Loan calculator', '🏦', 'See the monthly payment, total interest and how a loan is paid off over time.', [],
  `<h3>Loan calculator</h3><p><input id="a" type="number" placeholder="Amount" value="20000" style="width:110px"> <input id="r" type="number" step="0.1" value="6" style="width:70px"> % a year <input id="y" type="number" value="5" style="width:60px"> years</p><p class="big" id="out"></p><p class="muted" id="det"></p><canvas id="cv" width="480" height="140" style="width:100%;max-width:480px;border-radius:10px;background:#0a0f1c"></canvas>`,
  R`var $=function(i){return document.getElementById(i)};
function payment(a,rate,years){a=Number(a);rate=Number(rate);years=Number(years);if(!(a>0)||!(years>0)||!(rate>=0)||years>60||rate>100)return null;var n=Math.round(years*12),m=rate/1200;var pay=m===0?a/n:a*m/(1-Math.pow(1+m,-n));return{pay:Math.round(pay*100)/100,n:n,total:Math.round(pay*n*100)/100,interest:Math.round((pay*n-a)*100)/100}}
function schedule(a,rate,years){var r=payment(a,rate,years);if(!r)return[];var m=Number(rate)/1200,bal=Number(a),out=[];for(var i=1;i<=r.n;i++){var intr=bal*m,pr=r.pay-intr;bal=Math.max(0,bal-pr);out.push({i:i,interest:intr,principal:pr,balance:bal})}return out}
function show(){var r=payment($('a').value,$('r').value,$('y').value),g=$('cv').getContext('2d');g.clearRect(0,0,480,140);if(!r){$('out').textContent='';$('det').textContent='';return}$('out').textContent=r.pay.toFixed(2)+' a month';$('det').textContent='Total paid '+r.total.toFixed(2)+', interest '+r.interest.toFixed(2);var s=schedule($('a').value,$('r').value,$('y').value),w=480/s.length;s.forEach(function(x,i){g.fillStyle='#4cc2ff';g.fillRect(i*w,140-x.balance/Number($('a').value)*130,Math.max(1,w-.5),x.balance/Number($('a').value)*130)})}
['a','r','y'].forEach(function(i){$(i).oninput=show});show();window.__loan={payment:payment,schedule:schedule};`);

def('jsonfmt', 'json-formatter', 'JSON formatter', '🧩', 'Paste JSON to check it, make it pretty or squash it small. Errors are explained.', ['clipboard'],
  `<h3>JSON formatter</h3><textarea id="in" rows="8" style="width:100%;font-family:Consolas,monospace" placeholder='{"name":"Vorynth","ok":true}'></textarea><p><button class="p" id="pre">Prettify</button> <button id="min">Minify</button> <button id="cp">Copy result</button> <span id="st" class="muted"></span></p><pre id="out" style="max-height:260px;overflow:auto;background:rgba(255,255,255,.05);padding:10px;border-radius:10px"></pre>`,
  R`var $=function(i){return document.getElementById(i)};
function parse(t){try{return{ok:true,v:JSON.parse(t)}}catch(e){return{ok:false,err:String(e.message).slice(0,160)}}}
function pretty(t,ind){var r=parse(t);return r.ok?{ok:true,out:JSON.stringify(r.v,null,ind)}:r}
function mini(t){var r=parse(t);return r.ok?{ok:true,out:JSON.stringify(r.v)}:r}
function run(f){var r=f($('in').value);$('st').textContent=r.ok?'Valid JSON':'Not valid: '+r.err;$('out').textContent=r.ok?r.out:''}
$('pre').onclick=function(){run(function(t){return pretty(t,2)})};$('min').onclick=function(){run(mini)};$('cp').onclick=function(){if($('out').textContent)aurora.copy($('out').textContent).then(function(){aurora.toast('Copied')}).catch(function(){})};
window.__json={parse:parse,pretty:pretty,mini:mini};`);

def('epoch', 'timestamp-converter', 'Timestamp converter', '🕐', 'Turn Unix timestamps into dates and dates back into timestamps. Great for developers.', ['clipboard'],
  `<h3>Timestamp converter</h3><p><input id="ts" placeholder="1730000000" style="width:200px;font-family:Consolas,monospace"> <button id="now">Now</button></p><p id="o1" class="big"></p><p><input id="dt" type="datetime-local" style="width:230px"></p><p id="o2" class="big"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function fromTs(v){v=String(v).trim();if(!/^-?\d{1,14}$/.test(v))return null;var n=Number(v),ms=Math.abs(n)>=1e11?n:n*1000,d=new Date(ms);return isNaN(d.getTime())?null:{iso:d.toISOString(),local:d.toLocaleString(),unit:Math.abs(n)>=1e11?'milliseconds':'seconds'}}
function toTs(s){var d=new Date(s);return isNaN(d.getTime())?null:{sec:Math.floor(d.getTime()/1000),ms:d.getTime()}}
$('ts').oninput=function(){var r=fromTs(this.value);$('o1').textContent=r?r.iso+'  (read as '+r.unit+')':''};
$('dt').oninput=function(){var r=toTs(this.value);$('o2').textContent=r?r.sec+' s  /  '+r.ms+' ms':''};
$('now').onclick=function(){$('ts').value=Math.floor(Date.now()/1000);$('ts').oninput()};window.__epoch={fromTs:fromTs,toTs:toTs};`);

def('dice', 'dice-roller', 'Dice roller', '🎲', 'Roll tabletop dice like 2d6+3 or d20, with advantage. Keeps a roll history.', [],
  `<h3>Dice roller</h3><p><input id="e" value="2d6+3" style="width:140px;font-family:Consolas,monospace"> <button class="p" id="roll">Roll</button> <button class="d" data-e="d20">d20</button> <button class="d" data-e="d6">d6</button> <button class="d" data-e="d100">d100</button> <button class="d" data-e="4d6">4d6</button></p><p class="big" id="out"></p><ol id="hist" class="muted"></ol>`,
  R`var $=function(i){return document.getElementById(i)};
function parse(e){var m=/^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(String(e));if(!m)return null;var n=m[1]===''?1:parseInt(m[1],10),sides=parseInt(m[2],10),mod=m[4]?parseInt(m[4],10)*(m[3]==='-'?-1:1):0;if(n<1||n>100||sides<2||sides>1000)return null;return{n:n,sides:sides,mod:mod}}
function roll(spec,rnd){var r=[],t=spec.mod;for(var i=0;i<spec.n;i++){var v=1+Math.floor(rnd()*spec.sides);r.push(v);t+=v}return{rolls:r,total:t}}
function go(e){var sp=parse(e);if(!sp){$('out').textContent='Try something like 2d6+3';return}var r=roll(sp,Math.random);$('out').textContent=r.total+'   ['+r.rolls.join(', ')+(sp.mod?' '+(sp.mod>0?'+':'-')+Math.abs(sp.mod):'')+']';var li=document.createElement('li');li.textContent=e+' = '+r.total;$('hist').insertBefore(li,$('hist').firstChild);while($('hist').children.length>10)$('hist').removeChild($('hist').lastChild)}
$('roll').onclick=function(){go($('e').value)};$('e').onkeydown=function(e){if(e.key==='Enter')go(this.value)};[].forEach.call(document.querySelectorAll('.d'),function(b){b.onclick=function(){$('e').value=b.dataset.e;go(b.dataset.e)}});window.__dice={parse:parse,roll:roll};`);

def('roman', 'roman-numerals', 'Roman numerals', '🏛️', 'Convert numbers to Roman numerals and back, from 1 to 3999.', [],
  `<h3>Roman numerals</h3><p><input id="a" placeholder="Number, e.g. 1994" style="width:170px"> <span class="big" id="ao"></span></p><p><input id="b" placeholder="Roman, e.g. MCMXCIV" style="width:170px;text-transform:uppercase"> <span class="big" id="bo"></span></p>`,
  R`var $=function(i){return document.getElementById(i)},T=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
function toRoman(n){n=Number(n);if(!Number.isInteger(n)||n<1||n>3999)return null;var s='';T.forEach(function(p){while(n>=p[0]){s+=p[1];n-=p[0]}});return s}
function fromRoman(s){s=String(s).trim().toUpperCase();if(!/^[MDCLXVI]+$/.test(s))return null;var v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000},t=0;for(var i=0;i<s.length;i++){var a=v[s[i]],b=v[s[i+1]]||0;t+=a<b?-a:a}return toRoman(t)===s?t:null}
$('a').oninput=function(){$('ao').textContent=toRoman(this.value)||''};$('b').oninput=function(){var v=fromRoman(this.value);$('bo').textContent=v===null?(this.value?'not a valid numeral':''):v};window.__roman={toRoman:toRoman,fromRoman:fromRoman};`);

def('morse', 'morse-code', 'Morse code', '📡', 'Type text to see Morse code and hear it as beeps. Decode dots and dashes too.', [],
  `<h3>Morse code</h3><textarea id="t" rows="2" style="width:100%" placeholder="Hello Vorynth"></textarea><p class="big" id="m" style="word-break:break-all;font-family:Consolas,monospace"></p><p><button class="p" id="play">Play beeps</button> <input id="d" placeholder="… --- …" style="width:200px"> <span id="dd" class="big"></span></p>`,
  R`var M={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.'},R={},$=function(i){return document.getElementById(i)};
Object.keys(M).forEach(function(k){R[M[k]]=k});
function enc(t){return String(t).toUpperCase().split(/\s+/).filter(Boolean).map(function(w){return w.split('').filter(function(c){return M[c]}).map(function(c){return M[c]}).join(' ')}).filter(Boolean).join(' / ')}
function dec(m){return String(m).trim().replace(/[·•]/g,'.').replace(/[—–_]/g,'-').split(/\s*\/\s*|\s{3,}/).map(function(w){return w.split(/\s+/).map(function(c){return R[c]||(c?'?':'')}).join('')}).join(' ')}
$('t').oninput=function(){$('m').textContent=enc(this.value)};$('d').oninput=function(){$('dd').textContent=dec(this.value)};
$('play').onclick=function(){var s=enc($('t').value);if(!s)return;var ctx=new (window.AudioContext||window.webkitAudioContext)(),t=ctx.currentTime+.05,u=.09;s.split('').forEach(function(ch){if(ch==='.'||ch==='-'){var o=ctx.createOscillator(),g=ctx.createGain(),d=ch==='.'?u:u*3;o.frequency.value=650;g.gain.value=.15;o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+d);t+=d+u}else if(ch===' ')t+=u*2;else if(ch==='/')t+=u*4})};
window.__morse={enc:enc,dec:dec};`);

def('lights', 'lights-out', 'Lights out', '💡', 'Click a light to flip it and its neighbours. Turn them all off to win.', ['storage'],
  `<h3>Lights out <span class="muted" id="mv">0 moves</span> <span class="muted" id="bs"></span></h3><div id="g" class="lo"></div><p><button class="p" id="re">New puzzle</button></p>
<style>.lo{display:grid;grid-template-columns:repeat(5,64px);gap:8px}.lo button{width:64px;height:64px;border-radius:14px;border:1px solid rgba(255,255,255,.15);background:#1d2231;transition:.15s}.lo button.on{background:radial-gradient(circle at 40% 35%,#fff6c2,#ffb347);box-shadow:0 0 24px rgba(255,179,71,.6)}</style>`,
  R`var N=5,B,moves=0,best=0,$=function(i){return document.getElementById(i)};
function press(b,i){var r=Math.floor(i/N),c=i%N,o=b.slice();[[0,0],[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var y=r+d[0],x=c+d[1];if(y>=0&&y<N&&x>=0&&x<N)o[y*N+x]=o[y*N+x]?0:1});return o}
function won(b){return b.every(function(v){return !v})}
function puzzle(rnd,k){var b=new Array(N*N).fill(0);for(var i=0;i<(k||8);i++)b=press(b,Math.floor(rnd()*N*N));if(won(b))b=press(b,12);return b}
function draw(){var g=$('g');g.textContent='';B.forEach(function(v,i){var b=document.createElement('button');b.className=v?'on':'';b.onclick=function(){B=press(B,i);moves++;if(won(B)&&(!best||moves<best)){best=moves;$('bs').textContent='best '+best;aurora.storage.set('best',best).catch(function(){})}draw()};g.appendChild(b)});$('mv').textContent=moves+' moves'+(won(B)?' - solved!':'')}
function reset(){B=puzzle(Math.random,8);moves=0;draw()}
$('re').onclick=reset;aurora.storage.get('best').then(function(v){if(typeof v==='number'){best=v;$('bs').textContent='best '+best}}).catch(function(){});reset();window.__lo={press:press,won:won,puzzle:puzzle,N:N};`);

def('aim', 'aim-trainer', 'Aim trainer', '🎯', 'Click the targets as fast as you can for 30 seconds. See your hits and accuracy.', ['storage'],
  `<h3>Aim trainer <span class="muted" id="inf">Click the target to start</span> <span class="muted" id="bs"></span></h3><div id="area" class="aim"></div>
<style>.aim{position:relative;height:300px;border-radius:16px;background:#0a0f1c;border:1px solid rgba(255,255,255,.14);overflow:hidden;cursor:crosshair}.tg{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:radial-gradient(circle,#fff 0 18%,#ff5c7a 20% 45%,#fff 47% 62%,#ff5c7a 64%);cursor:pointer;box-shadow:0 0 18px rgba(255,92,122,.6)}</style>`,
  R`var hits=0,shots=0,left=30,run=false,iv=null,best=0,$=function(i){return document.getElementById(i)};
function acc(h,s){return s?Math.round(h/s*100):0}
function where(rnd,w,h){return{x:30+Math.floor(rnd()*(w-60)),y:30+Math.floor(rnd()*(h-60))}}
function spawn(){var a=$('area');a.querySelectorAll('.tg').forEach(function(t){t.remove()});var p=where(Math.random,a.clientWidth||520,300),t=document.createElement('div');t.className='tg';t.style.left=p.x+'px';t.style.top=p.y+'px';t.onmousedown=function(e){e.stopPropagation();if(!run)begin();hits++;shots++;spawn();info()};a.appendChild(t)}
function info(){$('inf').textContent=run?left+'s  hits '+hits+'  accuracy '+acc(hits,shots)+'%':'Click the target to start'}
function begin(){run=true;hits=0;shots=0;left=30;iv=setInterval(function(){left--;if(left<=0){clearInterval(iv);run=false;$('inf').textContent='Done! '+hits+' hits, '+acc(hits,shots)+'% accuracy';if(hits>best){best=hits;$('bs').textContent='best '+best;aurora.storage.set('best',best).catch(function(){})}$('area').querySelectorAll('.tg').forEach(function(t){t.remove()});setTimeout(spawn,600)}else info()},1000);info()}
$('area').onmousedown=function(){if(run){shots++;info()}};aurora.storage.get('best').then(function(v){if(typeof v==='number'){best=v;$('bs').textContent='best '+best}}).catch(function(){});spawn();window.__aim={acc:acc,where:where};`);

/* ---------------- More tools, puzzles and visuals ---------------- */

def('passgen', 'password-lab', 'Password lab', '🔐', 'Make strong passwords and passphrases, and see how strong any password is. Nothing leaves this page.', ['clipboard'],
  `<h3>Password lab</h3><p><input id="len" type="range" min="8" max="64" value="20"> <span id="lv">20</span> characters <label class="muted"><input type="checkbox" id="sym" checked> symbols</label> <button class="p" id="gen">Make one</button></p><p><code id="pw" style="font-size:18px;word-break:break-all"></code> <button id="cp">Copy</button></p><p class="muted" id="str"></p><hr style="opacity:.15"><p><input id="chk" placeholder="Check a password's strength" style="width:60%"> <span id="cs" class="big"></span></p>`,
  R`var $=function(i){return document.getElementById(i)};
function rnd(n){var a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n}
function make(len,sym){var cs='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'+(sym?'!@#$%^&*-_+=?':''),s='';len=Math.max(8,Math.min(64,len|0));for(var i=0;i<len;i++)s+=cs[rnd(cs.length)];return s}
function entropy(p){var pool=0;if(/[a-z]/.test(p))pool+=26;if(/[A-Z]/.test(p))pool+=26;if(/\d/.test(p))pool+=10;if(/[^a-zA-Z0-9]/.test(p))pool+=32;if(!pool)return 0;var bits=p.length*Math.log2(pool);if(/(.)\1\1/.test(p))bits-=8;if(/^(password|qwerty|123456|letmein|admin|welcome)/i.test(p))bits=Math.min(bits,20);return Math.max(0,Math.round(bits))}
function label(b){return b<28?'Very weak':b<36?'Weak':b<60?'Fair':b<80?'Strong':'Very strong'}
function show(){var p=make($('len').value,$('sym').checked);$('pw').textContent=p;$('lv').textContent=$('len').value;var e=entropy(p);$('str').textContent=label(e)+' ('+e+' bits)'}
$('gen').onclick=show;$('len').oninput=show;$('sym').onchange=show;$('cp').onclick=function(){aurora.copy($('pw').textContent).then(function(){aurora.toast('Copied')}).catch(function(){})};
$('chk').oninput=function(){var e=entropy(this.value);$('cs').textContent=this.value?label(e):''};show();window.__pass={make:make,entropy:entropy,label:label};`);

def('contrast', 'contrast-checker', 'Contrast checker', '🎨', 'Check if text and background colours are easy to read, with the official accessibility score.', [],
  `<h3>Contrast checker</h3><p><input type="color" id="fg" value="#ffffff"> text <input type="color" id="bg" value="#1a2030"> background</p><div id="pv" style="padding:18px;border-radius:14px;font-size:22px;font-weight:700">The quick brown fox</div><p class="big" id="r"></p><p class="muted" id="g"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function lum(h){var n=parseInt(h.slice(1),16),c=[n>>16&255,n>>8&255,n&255].map(function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}
function ratio(a,b){if(!/^#[0-9a-f]{6}$/i.test(a)||!/^#[0-9a-f]{6}$/i.test(b))return null;var x=lum(a),y=lum(b),hi=Math.max(x,y),lo=Math.min(x,y);return Math.round((hi+.05)/(lo+.05)*100)/100}
function grade(r){return r>=7?'AAA (excellent)':r>=4.5?'AA (good for normal text)':r>=3?'AA for large text only':'Fails'}
function show(){var r=ratio($('fg').value,$('bg').value);$('pv').style.color=$('fg').value;$('pv').style.background=$('bg').value;$('r').textContent=r+' : 1';$('g').textContent=grade(r)}
$('fg').oninput=show;$('bg').oninput=show;show();window.__contrast={ratio:ratio,grade:grade};`);

def('sudoku', 'sudoku', 'Sudoku', '🔢', 'A fresh Sudoku every time. Pick easy, medium or hard, check your work and get hints.', ['storage'],
  `<h3>Sudoku <span class="muted" id="inf"></span></h3><div id="g" class="sd"></div><p><select id="lv"><option value="36">Easy</option><option value="46" selected>Medium</option><option value="54">Hard</option></select> <button class="p" id="new">New puzzle</button> <button id="chk">Check</button> <button id="hint">Hint</button></p>
<style>.sd{display:grid;grid-template-columns:repeat(9,38px);gap:0;border:2px solid rgba(255,255,255,.5);width:max-content}.sd input{width:38px;height:38px;box-sizing:border-box;text-align:center;font-size:18px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.04);border-radius:0;padding:0}.sd input.fx{background:rgba(255,255,255,.14);font-weight:800}.sd input.bad{background:rgba(255,92,122,.35)}.sd input:nth-child(3n){border-right:2px solid rgba(255,255,255,.5)}.sd input:nth-child(n+19):nth-child(-n+27),.sd input:nth-child(n+46):nth-child(-n+54){border-bottom:2px solid rgba(255,255,255,.5)}</style>`,
  R`var SOL,PZ,CUR,$=function(i){return document.getElementById(i)};
function shuffle(a,rnd){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(rnd()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function solved(rnd){var base=3,side=9,pat=function(r,c){return (base*(r%base)+Math.floor(r/base)+c)%side},rb=[0,1,2],g=shuffle(rb,rnd),rows=[],cols=[];g.forEach(function(x){shuffle(rb,rnd).forEach(function(y){rows.push(x*base+y)})});g=shuffle(rb,rnd);g.forEach(function(x){shuffle(rb,rnd).forEach(function(y){cols.push(x*base+y)})});var nums=shuffle([1,2,3,4,5,6,7,8,9],rnd),out=[];rows.forEach(function(r){cols.forEach(function(c){out.push(nums[pat(r,c)])})});return out}
function valid(b){for(var i=0;i<9;i++){var r={},c={},x={};for(var j=0;j<9;j++){var a=b[i*9+j],d=b[j*9+i],e=b[(Math.floor(i/3)*3+Math.floor(j/3))*9+(i%3)*3+(j%3)];if(a){if(r[a])return false;r[a]=1}if(d){if(c[d])return false;c[d]=1}if(e){if(x[e])return false;x[e]=1}}}return true}
function puzzle(sol,holes,rnd){var p=sol.slice();shuffle(sol.map(function(_,i){return i}),rnd).slice(0,holes).forEach(function(i){p[i]=0});return p}
function draw(){var g=$('g');g.textContent='';CUR.forEach(function(v,i){var inp=document.createElement('input');inp.maxLength=1;inp.inputMode='numeric';inp.value=v||'';if(PZ[i]){inp.className='fx';inp.readOnly=true}inp.oninput=function(){var n=parseInt(inp.value,10);CUR[i]=n>=1&&n<=9?n:0;inp.value=CUR[i]||'';inp.classList.remove('bad')};g.appendChild(inp)})}
function fresh(){SOL=solved(Math.random);PZ=puzzle(SOL,Number($('lv').value),Math.random);CUR=PZ.slice();$('inf').textContent='';draw()}
$('new').onclick=fresh;$('chk').onclick=function(){var bad=0,ins=$('g').children;CUR.forEach(function(v,i){var wrong=v&&v!==SOL[i];ins[i].classList.toggle('bad',!!wrong);if(wrong)bad++});var done=CUR.every(function(v,i){return v===SOL[i]});$('inf').textContent=done?'Solved! 🎉':bad?bad+' wrong':'So far so good'};
$('hint').onclick=function(){var e=[];CUR.forEach(function(v,i){if(!v)e.push(i)});if(!e.length)return;var i=e[Math.floor(Math.random()*e.length)];CUR[i]=SOL[i];draw()};
fresh();window.__sudoku={solved:solved,valid:valid,puzzle:puzzle};`);

def('connect4', 'connect-four', 'Connect four', '🔴', 'Drop discs and get four in a row before the computer does.', [],
  `<h3>Connect four <span class="muted" id="msg">Your move (red)</span></h3><div id="b" class="c4"></div><p><button class="p" id="re">New game</button></p>
<style>.c4{display:grid;grid-template-columns:repeat(7,48px);gap:6px;background:#1e3a8a;padding:10px;border-radius:16px;width:max-content}.c4 button{width:48px;height:48px;border-radius:50%;border:0;background:#0b1020;cursor:pointer;padding:0}.c4 button.r{background:#ff4d5e}.c4 button.y{background:#ffd23f}</style>`,
  R`var R=6,C=7,B,over,$=function(i){return document.getElementById(i)};
function empty(){var b=[];for(var r=0;r<R;r++)b.push(new Array(C).fill(0));return b}
function drop(b,c,p){if(c<0||c>=C)return -1;for(var r=R-1;r>=0;r--)if(!b[r][c]){b[r][c]=p;return r}return -1}
function winner(b){var D=[[0,1],[1,0],[1,1],[1,-1]];for(var r=0;r<R;r++)for(var c=0;c<C;c++){var p=b[r][c];if(!p)continue;for(var k=0;k<4;k++){var n=1;while(n<4){var y=r+D[k][0]*n,x=c+D[k][1]*n;if(y<0||y>=R||x<0||x>=C||b[y][x]!==p)break;n++}if(n===4)return p}}return b[0].every(Boolean)?3:0}
function ai(b){var p,t,c;for(p=2;p>=1;p--)for(c=0;c<C;c++){t=b.map(function(r){return r.slice()});if(drop(t,c,p)>=0&&winner(t)===p)return c}var order=[3,2,4,1,5,0,6];for(var i=0;i<7;i++){c=order[i];if(b[0][c])continue;t=b.map(function(r){return r.slice()});drop(t,c,2);var bad=false;for(var d=0;d<C;d++){var u=t.map(function(r){return r.slice()});if(drop(u,d,1)>=0&&winner(u)===1)bad=true}if(!bad)return c}for(c=0;c<C;c++)if(!b[0][c])return c;return -1}
function draw(){var g=$('b');g.textContent='';for(var r=0;r<R;r++)for(var c=0;c<C;c++){(function(r,c){var d=document.createElement('button');d.className=B[r][c]===1?'r':B[r][c]===2?'y':'';d.onclick=function(){if(over)return;if(drop(B,c,1)<0)return;if(!fin()){drop(B,ai(B),2);fin()}draw()};g.appendChild(d)})(r,c)}}
function fin(){var w=winner(B);if(!w)return false;over=true;$('msg').textContent=w===1?'You win!':w===2?'Computer wins':'Draw';return true}
function reset(){B=empty();over=false;$('msg').textContent='Your move (red)';draw()}
$('re').onclick=reset;reset();window.__c4={empty:empty,drop:drop,winner:winner,ai:ai};`);

def('ulam', 'prime-spiral', 'Prime spiral', '🌀', 'The Ulam spiral: write numbers in a spiral and light up the primes to reveal hidden diagonal patterns.', [],
  `<h3>Prime spiral <span class="muted" id="inf"></span></h3><canvas id="cv" width="420" height="420" style="width:100%;max-width:420px;border-radius:14px;background:#0a0f1c;image-rendering:pixelated"></canvas><p><label class="muted">Size <input type="range" id="n" min="21" max="141" step="2" value="101"></label></p>`,
  R`var $=function(i){return document.getElementById(i)};
function sieve(n){var s=new Uint8Array(n+1).fill(1);s[0]=s[1]=0;for(var i=2;i*i<=n;i++)if(s[i])for(var j=i*i;j<=n;j+=i)s[j]=0;return s}
function spiral(size){var g=[],x=Math.floor(size/2),y=x,dx=1,dy=0,step=1,k=1,n=size*size;for(var i=0;i<size;i++)g.push(new Array(size).fill(0));var seg=1,left=1,turns=0;while(k<=n){if(x>=0&&x<size&&y>=0&&y<size)g[y][x]=k;k++;x+=dx;y+=dy;if(--left===0){var t=dx;dx=-dy;dy=t;turns++;if(turns%2===0)seg++;left=seg}}return g}
function draw(){var size=Number($('n').value),g=spiral(size),s=sieve(size*size),c=$('cv').getContext('2d'),px=420/size,cnt=0;c.clearRect(0,0,420,420);for(var y=0;y<size;y++)for(var x=0;x<size;x++){if(s[g[y][x]]){c.fillStyle='#4cc2ff';c.fillRect(x*px,y*px,Math.ceil(px),Math.ceil(px));cnt++}}$('inf').textContent=cnt+' primes up to '+size*size}
$('n').oninput=draw;draw();window.__ulam={sieve:sieve,spiral:spiral};`);

def('maze', 'maze-solver', 'Maze maker', '🧭', 'Generate a random maze and watch it solved step by step.', [],
  `<h3>Maze <span class="muted" id="inf"></span></h3><canvas id="cv" width="420" height="420" style="width:100%;max-width:420px;border-radius:14px;background:#0a0f1c"></canvas><p><label class="muted">Size <input type="range" id="n" min="8" max="30" value="16"></label> <button id="new">New maze</button> <button class="p" id="solve">Solve</button></p>`,
  R`var $=function(i){return document.getElementById(i)},M,N,busy=false;
function make(n,rnd){var w=[];for(var i=0;i<n*n;i++)w.push([1,1,1,1]);var seen=new Array(n*n).fill(false),st=[0];seen[0]=true;var D=[[0,-1,0,2],[1,0,1,3],[0,1,2,0],[-1,0,3,1]];while(st.length){var c=st[st.length-1],x=c%n,y=Math.floor(c/n),opts=[];D.forEach(function(d){var nx=x+d[0],ny=y+d[1];if(nx>=0&&ny>=0&&nx<n&&ny<n&&!seen[ny*n+nx])opts.push(d)});if(!opts.length){st.pop();continue}var d=opts[Math.floor(rnd()*opts.length)],nc=(y+d[1])*n+x+d[0];w[c][d[2]]=0;w[nc][d[3]]=0;seen[nc]=true;st.push(nc)}return w}
function solve(w,n){var prev=new Array(n*n).fill(-1),q=[0],seen=new Array(n*n).fill(false),order=[];seen[0]=true;var D=[[0,-1,0],[1,0,1],[0,1,2],[-1,0,3]];while(q.length){var c=q.shift();order.push(c);if(c===n*n-1)break;var x=c%n,y=Math.floor(c/n);D.forEach(function(d){var nc=(y+d[1])*n+x+d[0];if(!w[c][d[2]]&&!seen[nc]&&nc>=0&&nc<n*n){seen[nc]=true;prev[nc]=c;q.push(nc)}})}var path=[],c2=n*n-1;if(!seen[c2])return{path:[],order:order};while(c2!==-1){path.push(c2);c2=prev[c2]}return{path:path.reverse(),order:order}}
function draw(mark,path){var cv=$('cv'),g=cv.getContext('2d'),s=420/N;g.clearRect(0,0,420,420);(mark||[]).forEach(function(c){g.fillStyle='rgba(169,139,255,.35)';g.fillRect((c%N)*s,Math.floor(c/N)*s,s,s)});(path||[]).forEach(function(c){g.fillStyle='#4cc2ff';g.fillRect((c%N)*s+s*.25,Math.floor(c/N)*s+s*.25,s*.5,s*.5)});g.fillStyle='#6be58a';g.fillRect(2,2,s-4,s-4);g.fillStyle='#ff5c7a';g.fillRect((N-1)*s+2,(N-1)*s+2,s-4,s-4);g.strokeStyle='#e8eaf0';g.lineWidth=2;g.beginPath();M.forEach(function(w,i){var x=(i%N)*s,y=Math.floor(i/N)*s;if(w[0]){g.moveTo(x,y);g.lineTo(x+s,y)}if(w[1]){g.moveTo(x+s,y);g.lineTo(x+s,y+s)}if(w[2]){g.moveTo(x,y+s);g.lineTo(x+s,y+s)}if(w[3]){g.moveTo(x,y);g.lineTo(x,y+s)}});g.stroke()}
function fresh(){if(busy)return;N=Number($('n').value);M=make(N,Math.random);$('inf').textContent='';draw()}
$('new').onclick=fresh;$('n').oninput=fresh;
$('solve').onclick=function(){if(busy)return;busy=true;var r=solve(M,N),i=0,seen=[];(function f(){var k=Math.max(1,Math.ceil(r.order.length/60));for(var j=0;j<k&&i<r.order.length;j++,i++)seen.push(r.order[i]);draw(seen);if(i<r.order.length)requestAnimationFrame(f);else{draw(seen,r.path);$('inf').textContent=r.path.length+' steps';busy=false}})()};
fresh();window.__maze={make:make,solve:solve};`);

def('rule30', 'cellular-art', 'Cellular art', '🧶', 'Grow patterns from a single dot using simple rules, like Rule 30 and Rule 90.', [],
  `<h3>Cellular art</h3><canvas id="cv" width="420" height="260" style="width:100%;max-width:420px;border-radius:14px;background:#0a0f1c;image-rendering:pixelated"></canvas><p><label class="muted">Rule <input type="number" id="r" min="0" max="255" value="30" style="width:70px"></label> <button data-r="30">30</button> <button data-r="90">90</button> <button data-r="110">110</button> <button data-r="150">150</button> <button id="rnd">Random start</button></p>`,
  R`var W=210,H=130,$=function(i){return document.getElementById(i)};
function next(row,rule){var n=row.length,o=new Array(n);for(var i=0;i<n;i++){var l=row[(i+n-1)%n],c=row[i],r=row[(i+1)%n];o[i]=(rule>>(l*4+c*2+r))&1}return o}
function run(rule,w,h,rnd){var row=new Array(w).fill(0),out=[];if(rnd)for(var i=0;i<w;i++)row[i]=Math.random()<.5?1:0;else row[Math.floor(w/2)]=1;for(var y=0;y<h;y++){out.push(row);row=next(row,rule)}return out}
function draw(rnd){var rule=Math.max(0,Math.min(255,parseInt($('r').value,10)||0)),g=$('cv').getContext('2d'),rows=run(rule,W,H,rnd);g.clearRect(0,0,420,260);g.fillStyle='#4cc2ff';rows.forEach(function(r,y){r.forEach(function(v,x){if(v)g.fillRect(x*2,y*2,2,2)})})}
$('r').oninput=function(){draw(false)};[].forEach.call(document.querySelectorAll('button[data-r]'),function(b){b.onclick=function(){$('r').value=b.dataset.r;draw(false)}});$('rnd').onclick=function(){draw(true)};
draw(false);window.__ca={next:next,run:run};`);

def('basecalc', 'base-converter', 'Number bases', '🔟', 'Convert between binary, octal, decimal and hexadecimal as you type.', [],
  `<h3>Number bases</h3><p><input id="dec" placeholder="Decimal" style="width:220px"></p><p><input id="bin" placeholder="Binary" style="width:220px;font-family:Consolas,monospace"></p><p><input id="oct" placeholder="Octal" style="width:220px;font-family:Consolas,monospace"></p><p><input id="hex" placeholder="Hex" style="width:220px;font-family:Consolas,monospace"></p>`,
  R`var $=function(i){return document.getElementById(i)},B={dec:10,bin:2,oct:8,hex:16},RE={dec:/^\d+$/,bin:/^[01]+$/,oct:/^[0-7]+$/,hex:/^[0-9a-f]+$/i};
function parse(s,base){s=String(s).trim().replace(/^0[xbo]/i,'');var k=base===10?'dec':base===2?'bin':base===8?'oct':'hex';if(!RE[k].test(s)||s.length>13)return null;var v=parseInt(s,base);return Number.isSafeInteger(v)?v:null}
function conv(v){return v===null?null:{dec:String(v),bin:v.toString(2),oct:v.toString(8),hex:v.toString(16).toUpperCase()}}
Object.keys(B).forEach(function(k){$(k).oninput=function(){var o=conv(parse(this.value,B[k]));Object.keys(B).forEach(function(j){if(j!==k)$(j).value=o?o[j]:''})}});
window.__base={parse:parse,conv:conv};`);

def('bingo', 'bingo-card', 'Bingo card', '🅱️', 'Make a bingo card from your own words. Click squares to mark them. Great for parties and meetings.', ['storage'],
  `<h3>Bingo <span class="muted" id="inf"></span></h3><textarea id="w" rows="4" style="width:100%" placeholder="One word or phrase per line (at least 24)…"></textarea><p><button class="p" id="mk">Make a card</button> <button id="fill">Use sample words</button></p><div id="g" class="bg"></div>
<style>.bg{display:grid;grid-template-columns:repeat(5,86px);gap:6px}.bg button{height:70px;font-size:12px;border-radius:12px;padding:4px;word-break:break-word}.bg button.on{background:linear-gradient(135deg,var(--accent),#a98bff);color:#fff;font-weight:700}</style>`,
  R`var $=function(i){return document.getElementById(i)},SAMPLE='Coffee\nLate\nMuted\nCamera off\nEcho\nSorry, you go\nCan you hear me\nLoud typing\nShare screen\nPet appears\nBad wifi\nCalendar clash\nBuzzword\nFollow up\nQuick sync\nOff topic\nTechnical issue\nAction item\nSnack break\nOvertime\nNew idea\nBig sigh\nGood point\nLet us park that\nRecord this'.split('\n'),cells=[],marks=[];
function shuffle(a,rnd){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(rnd()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function card(words,rnd){var u=[];words.forEach(function(w){w=String(w).trim().slice(0,40);if(w&&u.indexOf(w)<0)u.push(w)});if(u.length<24)return null;var c=shuffle(u,rnd).slice(0,24);c.splice(12,0,'FREE');return c}
function lines(m){var L=[],i,j;for(i=0;i<5;i++){var r=[],c=[];for(j=0;j<5;j++){r.push(i*5+j);c.push(j*5+i)}L.push(r,c)}L.push([0,6,12,18,24],[4,8,12,16,20]);return L.filter(function(l){return l.every(function(x){return m[x]})}).length}
function draw(){var g=$('g');g.textContent='';cells.forEach(function(t,i){var b=document.createElement('button');b.textContent=t;b.className=marks[i]?'on':'';b.onclick=function(){marks[i]=!marks[i];$('inf').textContent=lines(marks)?'BINGO! ('+lines(marks)+' lines)':'';draw()};g.appendChild(b)})}
$('mk').onclick=function(){var c=card($('w').value.split('\n'),Math.random);if(!c){$('inf').textContent='Need at least 24 different words';return}cells=c;marks=cells.map(function(t){return t==='FREE'});$('inf').textContent='';aurora.storage.set('words',$('w').value.slice(0,3000)).catch(function(){});draw()};
$('fill').onclick=function(){$('w').value=SAMPLE.join('\n')};aurora.storage.get('words').then(function(v){if(typeof v==='string')$('w').value=v}).catch(function(){});
window.__bingo={card:card,lines:lines,shuffle:shuffle};`);

/* ---------------- Aesthetics: scenes, clocks and style makers ---------------- */
const SCENE = (w, h, extra) => `<canvas id="cv" width="${w}" height="${h}" style="width:100%;max-width:${w}px;border-radius:16px;background:#05070f;display:block;${extra || ''}"></canvas>`;

def('auroraskies', 'northern-lights', 'Northern lights', '🌌', 'A calm night sky with shimmering aurora curtains and twinkling stars. Pick the colours.', [],
  `<h3>Northern lights</h3>${SCENE(520, 300)}<p><select id="pal"><option value="0">Green</option><option value="1">Violet</option><option value="2">Ice blue</option><option value="3">Rose</option></select> <label class="muted">Speed <input type="range" id="sp" min="1" max="10" value="4"></label></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,PAL=[['#38ef7d','#11998e'],['#c77dff','#5a189a'],['#7dd3fc','#2563eb'],['#ff8fc7','#a21caf']],stars=[],t=0;
function curtain(x,t,k){return H*.38+Math.sin(x*.012+t*.7+k*2)*34+Math.sin(x*.027-t*.5+k)*18+Math.sin(x*.005+t*.2)*26}
function stars0(n,rnd){var s=[];for(var i=0;i<n;i++)s.push({x:rnd()*W,y:rnd()*H*.8,r:rnd()*1.2+.2,p:rnd()*6.28});return s}
stars=stars0(90,Math.random);
function frame(){requestAnimationFrame(frame);t+=Number(document.getElementById('sp').value)*.004;g.fillStyle='#05070f';g.fillRect(0,0,W,H);stars.forEach(function(s){g.globalAlpha=.4+.6*Math.abs(Math.sin(t*3+s.p));g.fillStyle='#fff';g.beginPath();g.arc(s.x,s.y,s.r,0,7);g.fill()});g.globalAlpha=1;var p=PAL[Number(document.getElementById('pal').value)];g.globalCompositeOperation='lighter';for(var k=0;k<3;k++){var gr=g.createLinearGradient(0,H*.1,0,H*.75);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.5,p[k%2]+(k?'66':'aa'));gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.moveTo(0,H);for(var x=0;x<=W;x+=8)g.lineTo(x,curtain(x,t,k)-k*10);g.lineTo(W,H);g.closePath();g.fill()}g.globalCompositeOperation='source-over';g.fillStyle='#0b1220';g.beginPath();g.moveTo(0,H);for(x=0;x<=W;x+=20)g.lineTo(x,H-18-Math.abs(Math.sin(x*.05))*22);g.lineTo(W,H);g.fill()}
frame();window.__aurora={curtain:curtain,stars:stars0};`);

def('lavalamp', 'lava-lamp', 'Lava lamp', '🫧', 'Glowing blobs that drift, merge and split. Relaxing to watch.', [],
  `<h3>Lava lamp</h3>${SCENE(300, 420, 'max-width:300px')}<p><select id="th"><option value="0">Sunset</option><option value="1">Ocean</option><option value="2">Candy</option><option value="3">Forest</option></select></p>`,
  R`var cv=document.getElementById('cv'),W=300,H=420,g=cv.getContext('2d'),TH=[['#ff512f','#f09819'],['#00c6ff','#0072ff'],['#ff6fd8','#a18cd1'],['#56ab2f','#a8e063']],B=[];
function make(n,rnd){var b=[];for(var i=0;i<n;i++)b.push({x:rnd()*W,y:rnd()*H,r:30+rnd()*34,vy:(rnd()-.5)*30,vx:(rnd()-.5)*14});return b}
function step(b,dt){b.forEach(function(o){o.x+=o.vx*dt;o.y+=o.vy*dt;if(o.y<o.r){o.y=o.r;o.vy=Math.abs(o.vy)}if(o.y>H-o.r){o.y=H-o.r;o.vy=-Math.abs(o.vy)}if(o.x<o.r){o.x=o.r;o.vx=Math.abs(o.vx)}if(o.x>W-o.r){o.x=W-o.r;o.vx=-Math.abs(o.vx)}o.vy+=(Math.sin(o.x*.03+o.y*.02)*6)*dt});return b}
B=make(8,Math.random);var last=performance.now();
function frame(n){requestAnimationFrame(frame);var dt=Math.min(.05,(n-last)/1000);last=n;step(B,dt);var th=TH[Number(document.getElementById('th').value)],bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#1a0f2e');bg.addColorStop(1,'#2e0f1a');g.fillStyle=bg;g.fillRect(0,0,W,H);B.forEach(function(o,i){var gr=g.createRadialGradient(o.x,o.y,2,o.x,o.y,o.r);gr.addColorStop(0,th[i%2]);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(o.x,o.y,o.r*1.6,0,7);g.fill()})}
requestAnimationFrame(frame);window.__lava={make:make,step:step,W:W,H:H};`);

def('neonsign', 'neon-sign-maker', 'Neon sign maker', '💡', 'Type a word, pick a glow colour and make a flickering neon sign. Copy the CSS.', ['clipboard'],
  `<h3>Neon sign maker</h3><div id="sign" class="nz"></div><p><input id="t" value="Vorynth" maxlength="24" style="width:200px"> <input type="color" id="c" value="#ff2bd6"> <label class="muted"><input type="checkbox" id="fl" checked> flicker</label> <button id="cp">Copy CSS</button></p>
<style>.nz{background:#0b0712;border-radius:18px;padding:44px 20px;text-align:center;font-size:64px;font-weight:800;font-family:"Segoe Script","Brush Script MT",cursive;word-break:break-word}@keyframes fl{0%,18%,22%,60%,64%,100%{opacity:1}20%,62%{opacity:.45}}</style>`,
  R`var $=function(i){return document.getElementById(i)};
function glow(c){if(!/^#[0-9a-f]{6}$/i.test(c))return null;return '0 0 4px #fff, 0 0 10px '+c+', 0 0 22px '+c+', 0 0 42px '+c+', 0 0 82px '+c}
function css(c,flicker){var s=glow(c);return s?'color: #fff;\ntext-shadow: '+s+';'+(flicker?'\nanimation: flicker 3s infinite;':''):null}
function show(){var s=$('sign');s.textContent=$('t').value||' ';s.style.color='#fff';s.style.textShadow=glow($('c').value);s.style.animation=$('fl').checked?'fl 3s infinite':'none'}
['t','c','fl'].forEach(function(i){$(i).oninput=show});$('cp').onclick=function(){aurora.copy(css($('c').value,$('fl').checked)).then(function(){aurora.toast('CSS copied')}).catch(function(){})};show();window.__neon={glow:glow,css:css};`);

def('glassmaker', 'glass-maker', 'Glass maker', '🪟', 'Design a frosted glass card with blur, tint and border, then copy the CSS.', ['clipboard'],
  `<h3>Glass maker</h3><div id="bgp" class="gl"><div id="card" class="gc">Frosted glass</div></div><p><label class="muted">Blur <input type="range" id="bl" min="0" max="40" value="16"></label> <label class="muted">Tint <input type="range" id="op" min="0" max="60" value="14"></label> <label class="muted">Radius <input type="range" id="rd" min="0" max="40" value="20"></label> <input type="color" id="co" value="#ffffff"> <button id="cp">Copy CSS</button></p><p><code id="out" style="white-space:pre-wrap"></code></p>
<style>.gl{height:190px;border-radius:16px;display:grid;place-items:center;background:radial-gradient(circle at 25% 30%,#ff6fd8,transparent 45%),radial-gradient(circle at 75% 65%,#4cc2ff,transparent 45%),#1a1f38}.gc{padding:26px 40px;font-size:22px;font-weight:700}</style>`,
  R`var $=function(i){return document.getElementById(i)};
function rgba(h,a){var n=parseInt(h.slice(1),16);return 'rgba('+(n>>16&255)+', '+(n>>8&255)+', '+(n&255)+', '+a+')'}
function css(blur,tint,radius,color){blur=Math.max(0,Math.min(60,Math.round(blur)));tint=Math.max(0,Math.min(100,Math.round(tint)));radius=Math.max(0,Math.min(80,Math.round(radius)));if(!/^#[0-9a-f]{6}$/i.test(color))return null;return 'background: '+rgba(color,tint/100)+';\nbackdrop-filter: blur('+blur+'px);\nborder: 1px solid '+rgba(color,.3)+';\nborder-radius: '+radius+'px;\nbox-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);'}
function show(){var c=css($('bl').value,$('op').value,$('rd').value,$('co').value),s=$('card').style;s.background=rgba($('co').value,$('op').value/100);s.backdropFilter='blur('+$('bl').value+'px)';s.border='1px solid '+rgba($('co').value,.3);s.borderRadius=$('rd').value+'px';s.boxShadow='0 8px 32px rgba(0,0,0,.3)';$('out').textContent=c}
['bl','op','rd','co'].forEach(function(i){$(i).oninput=show});$('cp').onclick=function(){aurora.copy($('out').textContent).then(function(){aurora.toast('CSS copied')}).catch(function(){})};show();window.__glass={css:css,rgba:rgba};`);

def('wallpaper', 'wallpaper-maker', 'Wallpaper maker', '🖼️', 'Make soft mesh-gradient wallpapers from a seed word. Same word, same picture. Copy the image link to save it.', ['clipboard'],
  `<h3>Wallpaper maker</h3>${SCENE(520, 292)}<p><input id="seed" value="aurora" style="width:160px"> <button id="rnd">Random</button> <button class="p" id="cp">Copy image link</button></p><p class="muted">Paste the link into a browser address bar, then right-click the picture to save it.</p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),$=function(i){return document.getElementById(i)};
function hash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){var a=hash(String(seed));return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function palette(seed){var r=rng(seed),h=Math.floor(r()*360),o=[];for(var i=0;i<5;i++)o.push('hsl('+((h+i*(30+Math.floor(r()*40)))%360)+','+(60+Math.floor(r()*30))+'%,'+(45+Math.floor(r()*20))+'%)');return o}
function draw(seed){var r=rng(seed+'x'),p=palette(seed);g.fillStyle=p[0];g.fillRect(0,0,520,292);for(var i=0;i<6;i++){var x=r()*520,y=r()*292,rad=150+r()*170,gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,p[(i%4)+1]);gr.addColorStop(1,'rgba(0,0,0,0)');g.globalAlpha=.85;g.fillStyle=gr;g.fillRect(0,0,520,292)}g.globalAlpha=1}
$('seed').oninput=function(){draw(this.value)};$('rnd').onclick=function(){$('seed').value=Math.random().toString(36).slice(2,8);draw($('seed').value)};$('cp').onclick=function(){aurora.copy(cv.toDataURL('image/png')).then(function(){aurora.toast('Image link copied')}).catch(function(){})};draw('aurora');window.__wall={hash:hash,palette:palette,rng:rng};`);

def('dvd', 'bouncing-logo', 'Bouncing logo', '📀', 'The classic bouncing logo screensaver. Will it hit the corner perfectly?', [],
  `<h3>Bouncing logo <span class="muted" id="inf"></span></h3>${SCENE(480, 270, 'max-width:480px')}`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=480,H=270,LW=96,LH=44,S={x:40,y:30,vx:90,vy:70,hue:200,corners:0};
function step(s,dt){s.x+=s.vx*dt;s.y+=s.vy*dt;var hit=false,cx=false,cy=false;if(s.x<=0){s.x=0;s.vx=Math.abs(s.vx);hit=true;cx=true}if(s.x>=W-LW){s.x=W-LW;s.vx=-Math.abs(s.vx);hit=true;cx=true}if(s.y<=0){s.y=0;s.vy=Math.abs(s.vy);hit=true;cy=true}if(s.y>=H-LH){s.y=H-LH;s.vy=-Math.abs(s.vy);hit=true;cy=true}if(hit)s.hue=(s.hue+57)%360;if(cx&&cy)s.corners++;return s}
var last=performance.now();function frame(n){requestAnimationFrame(frame);var dt=Math.min(.05,(n-last)/1000);last=n;step(S,dt);g.fillStyle='#05070f';g.fillRect(0,0,W,H);g.fillStyle='hsl('+S.hue+',85%,60%)';g.beginPath();g.roundRect?g.roundRect(S.x,S.y,LW,LH,12):g.rect(S.x,S.y,LW,LH);g.fill();g.fillStyle='#0b1020';g.font='bold 22px sans-serif';g.textAlign='center';g.fillText('AURORA',S.x+LW/2,S.y+29);document.getElementById('inf').textContent='corner hits: '+S.corners}
requestAnimationFrame(frame);window.__dvd={step:step,W:W,H:H,LW:LW,LH:LH};`);

def('flipclock', 'flip-clock', 'Flip clock', '🕰️', 'A retro flip clock with big cards that flip as the minutes change.', [],
  `<h3>Flip clock</h3><div id="fc" class="fcw"></div><p class="muted" id="d" style="text-align:center"></p>
<style>.fcw{display:flex;gap:10px;justify-content:center;align-items:center}.fcd{width:70px;height:100px;border-radius:12px;background:linear-gradient(#2b2f3a 50%,#222632 50%);display:grid;place-items:center;font-size:68px;font-weight:800;box-shadow:0 8px 20px rgba(0,0,0,.45);position:relative;font-variant-numeric:tabular-nums}.fcd:after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:#0b0d13}.fcd.flip{animation:flp .5s}.fcc{font-size:50px;font-weight:800;opacity:.6}@keyframes flp{0%{transform:rotateX(0)}50%{transform:rotateX(-90deg)}100%{transform:rotateX(0)}}</style>`,
  R`var els=[],prev='';
function digits(d){var p=function(n){return (n<10?'0':'')+n};return (p(d.getHours())+p(d.getMinutes())).split('')}
var box=document.getElementById('fc');for(var i=0;i<5;i++){var e=document.createElement('div');e.className=i===2?'fcc':'fcd';if(i===2)e.textContent=':';box.appendChild(e);els.push(e)}
function tick(){var d=new Date(),ds=digits(d),idx=[0,1,3,4];ds.forEach(function(v,i){var e=els[idx[i]];if(e.textContent!==v){e.textContent=v;e.classList.remove('flip');void e.offsetWidth;e.classList.add('flip')}});document.getElementById('d').textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})}
tick();setInterval(tick,1000);window.__flip={digits:digits};`);

def('nixie', 'nixie-clock', 'Nixie clock', '🔶', 'Warm orange glowing tubes show the time, just like old nixie tube clocks.', [],
  `<h3>Nixie clock</h3><div id="nx" class="nx"></div><p class="muted" style="text-align:center">24-hour time</p>
<style>.nx{display:flex;gap:8px;justify-content:center;align-items:center;background:#120905;padding:30px 10px;border-radius:18px}.nt{width:56px;height:90px;border-radius:28px 28px 12px 12px;background:radial-gradient(circle at 50% 35%,#3a1a0a,#160a04);border:2px solid #4a2a14;display:grid;place-items:center;font-size:56px;font-weight:700;color:#ff9a3c;text-shadow:0 0 8px #ff7a00,0 0 22px #ff5a00,0 0 40px #ff4000;font-family:Georgia,serif;box-shadow:inset 0 0 20px rgba(255,120,0,.15)}.nd{color:#ff9a3c;font-size:36px;text-shadow:0 0 10px #ff6a00}</style>`,
  R`var box=document.getElementById('nx'),els=[];
function split(d){var p=function(n){return (n<10?'0':'')+n};return [p(d.getHours()),p(d.getMinutes()),p(d.getSeconds())].join('').split('')}
for(var i=0;i<8;i++){var e=document.createElement('div');if(i===2||i===5){e.className='nd';e.textContent=':'}else e.className='nt';box.appendChild(e);els.push(e)}
function tick(){var s=split(new Date()),k=0;els.forEach(function(e,i){if(i===2||i===5)return;e.textContent=s[k++]})}
tick();setInterval(tick,500);window.__nixie={split:split};`);

def('galaxy', 'spiral-galaxy', 'Spiral galaxy', '🌀', 'A slowly turning spiral galaxy made of thousands of stars. Drag to tilt.', [],
  `<h3>Spiral galaxy</h3>${SCENE(520, 340, 'cursor:grab')}<p><label class="muted">Arms <input type="range" id="arms" min="2" max="6" value="3"></label> <label class="muted">Spin <input type="range" id="sp" min="0" max="10" value="3"></label></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=340,P=[],tilt=.55,ang=0,drag=false,$=function(i){return document.getElementById(i)};
function build(n,arms,rnd){var o=[];for(var i=0;i<n;i++){var r=Math.pow(rnd(),.6)*150,arm=Math.floor(rnd()*arms),a=arm/arms*Math.PI*2+r*.035+(rnd()-.5)*.6;o.push({r:r,a:a,h:200+r*.6+rnd()*40,s:rnd()*1.4+.3,z:(rnd()-.5)*10*(1-r/160)})}return o}
function project(p,rot,tilt){var a=p.a+rot,x=Math.cos(a)*p.r,y=Math.sin(a)*p.r;return{x:W/2+x,y:H/2+y*tilt-p.z}}
function rebuild(){P=build(2600,Number($('arms').value),Math.random)}
rebuild();$('arms').oninput=rebuild;cv.onmousedown=function(){drag=true};window.addEventListener('mouseup',function(){drag=false});cv.onmousemove=function(e){if(drag)tilt=Math.max(.15,Math.min(1,tilt+e.movementY*.004))};
function frame(){requestAnimationFrame(frame);ang+=Number($('sp').value)*.0006;g.fillStyle='rgba(5,7,15,.35)';g.fillRect(0,0,W,H);P.forEach(function(p){var q=project(p,ang*(1.4-p.r/180),tilt);g.fillStyle='hsl('+p.h+',80%,'+(60+p.s*10)+'%)';g.globalAlpha=.8;g.fillRect(q.x,q.y,p.s,p.s)});g.globalAlpha=1;var c=g.createRadialGradient(W/2,H/2,0,W/2,H/2,34);c.addColorStop(0,'rgba(255,240,200,.9)');c.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=c;g.beginPath();g.arc(W/2,H/2,34,0,7);g.fill()}
frame();window.__galaxy={build:build,project:project};`);

def('fireplace', 'cozy-fireplace', 'Cozy fireplace', '🔥', 'A crackling pixel fire to keep your screen warm. Add a little sound if you like.', [],
  `<h3>Fireplace</h3>${SCENE(320, 240, 'max-width:320px;image-rendering:pixelated')}<p><button id="snd">Sound on</button></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=80,H=60,heat=new Array(W*H).fill(0),img=g.createImageData(W,H);
function palette(v){v=Math.max(0,Math.min(1,v));var r=Math.min(255,v*2.2*255),gr=Math.max(0,Math.min(255,(v-.35)*2.4*255)),b=Math.max(0,Math.min(255,(v-.75)*4*255));return[r,gr,b,v>.04?255:0]}
function step(h,rnd){for(var x=0;x<W;x++)h[(H-1)*W+x]=rnd()<.82?.9+rnd()*.1:.2;for(var y=0;y<H-1;y++)for(var x2=0;x2<W;x2++){var s=h[(y+1)*W+x2]+h[(y+1)*W+Math.max(0,x2-1)]+h[(y+1)*W+Math.min(W-1,x2+1)]+h[Math.min(H-1,y+2)*W+x2];h[y*W+x2]=Math.max(0,s/4-.012-rnd()*.012)}return h}
var tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;var tg=tmp.getContext('2d');cv.width=320;cv.height=240;g.imageSmoothingEnabled=false;
function frame(){requestAnimationFrame(frame);step(heat,Math.random);for(var i=0;i<W*H;i++){var c=palette(heat[i]);img.data[i*4]=c[0];img.data[i*4+1]=c[1];img.data[i*4+2]=c[2];img.data[i*4+3]=c[3]}tg.putImageData(img,0,0);g.fillStyle='#120a05';g.fillRect(0,0,320,240);g.drawImage(tmp,0,0,320,240)}
frame();
var ctx=null,gain=null;document.getElementById('snd').onclick=function(){if(!ctx){ctx=new (window.AudioContext||window.webkitAudioContext)();var b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=b.getChannelData(0),l=0;for(var i=0;i<d.length;i++){l=(l+.03*(Math.random()*2-1))/1.03;d[i]=l*4+(Math.random()<.0015?(Math.random()-.5)*1.2:0)}var s=ctx.createBufferSource();s.buffer=b;s.loop=true;gain=ctx.createGain();gain.gain.value=.25;s.connect(gain);gain.connect(ctx.destination);s.start();this.textContent='Sound off'}else if(gain.gain.value>0){gain.gain.value=0;this.textContent='Sound on'}else{gain.gain.value=.25;this.textContent='Sound off'}};
window.__fire={palette:palette,step:step,W:W,H:H};`);

def('kaleido', 'kaleidoscope', 'Kaleidoscope', '🔮', 'Draw with your mouse and see it mirrored into a beautiful symmetrical pattern.', [],
  `<h3>Kaleidoscope</h3>${SCENE(420, 420, 'max-width:420px;cursor:crosshair;touch-action:none')}<p><label class="muted">Slices <input type="range" id="n" min="3" max="16" value="8"></label> <button id="clr">Clear</button> <label class="muted"><input type="checkbox" id="rb" checked> rainbow</label></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),S=420,down=false,last=null,hue=0,$=function(i){return document.getElementById(i)};
function mirrors(x,y,n){var cx=S/2,dx=x-cx,dy=y-cx,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx),o=[];for(var i=0;i<n;i++){var b=a+i*2*Math.PI/n;o.push([cx+Math.cos(b)*r,cx+Math.sin(b)*r]);var m=-a+i*2*Math.PI/n;o.push([cx+Math.cos(m)*r,cx+Math.sin(m)*r])}return o}
function pos(e){var r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*S,(e.clientY-r.top)/r.height*S]}
function line(a,b){var n=Number($('n').value),A=mirrors(a[0],a[1],n),B=mirrors(b[0],b[1],n);g.lineCap='round';g.lineWidth=2.5;g.strokeStyle=$('rb').checked?'hsl('+(hue=(hue+2)%360)+',90%,62%)':'#4cc2ff';for(var i=0;i<A.length;i++){g.beginPath();g.moveTo(A[i][0],A[i][1]);g.lineTo(B[i][0],B[i][1]);g.stroke()}}
cv.onpointerdown=function(e){down=true;last=pos(e)};cv.onpointermove=function(e){if(!down)return;var p=pos(e);line(last,p);last=p};window.addEventListener('pointerup',function(){down=false});$('clr').onclick=function(){g.clearRect(0,0,S,S)};
window.__kal={mirrors:mirrors};`);

def('waves', 'ocean-waves', 'Ocean waves', '🌊', 'Layered waves rolling under a sunset sky. Slow, calm and pretty.', [],
  `<h3>Ocean waves</h3>${SCENE(520, 300)}<p><select id="t"><option value="0">Sunset</option><option value="1">Day</option><option value="2">Night</option></select></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,t=0,TH=[['#ff7e5f','#feb47b','#2b1a4a','#1d2b64'],['#56ccf2','#bfe9ff','#2f80ed','#1b4fa0'],['#0b1026','#1b2a5a','#0a1a3a','#06102a']];
function wave(x,t,k){return Math.sin(x*.012*(1+k*.3)+t*(1+k*.4))*(10+k*4)+Math.sin(x*.027+t*.6+k)*6}
function frame(){requestAnimationFrame(frame);t+=.02;var th=TH[Number(document.getElementById('t').value)],sky=g.createLinearGradient(0,0,0,H*.6);sky.addColorStop(0,th[0]);sky.addColorStop(1,th[1]);g.fillStyle=sky;g.fillRect(0,0,W,H);g.fillStyle='rgba(255,240,200,.9)';g.beginPath();g.arc(W*.7,H*.5,28,0,7);g.fill();for(var k=0;k<5;k++){var y0=H*.52+k*26,gr=g.createLinearGradient(0,y0-20,0,H);gr.addColorStop(0,th[2]);gr.addColorStop(1,th[3]);g.fillStyle=gr;g.globalAlpha=.55+k*.1;g.beginPath();g.moveTo(0,H);for(var x=0;x<=W;x+=8)g.lineTo(x,y0+wave(x,t,k));g.lineTo(W,H);g.fill()}g.globalAlpha=1}
frame();window.__waves={wave:wave};`);

/* ---------------- Batch 7: more scenes, makers and fun ---------------- */
def('rainwindow', 'rainy-window', 'Rainy window', '🌧️', 'Raindrops sliding down a foggy window at night. Cosy and calm.', [],
  `<h3>Rainy window</h3>${SCENE(520, 300)}<p><label class="muted">Rain <input type="range" id="n" min="5" max="80" value="35"></label></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,D=[];
function spawn(rnd){return{x:rnd()*W,y:rnd()*H*.6,r:1.5+rnd()*3.5,v:0,wait:rnd()*120}}
function step(d,rnd){d.wait--;if(d.wait<=0){d.v=Math.min(4,d.v+.08+rnd()*.1);d.y+=d.v;d.x+=(rnd()-.5)*.4;if(rnd()<.03)d.v=0}return d}
for(var i=0;i<80;i++)D.push(spawn(Math.random));
function frame(){requestAnimationFrame(frame);var n=Number(document.getElementById('n').value);var bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#1b2a49');bg.addColorStop(1,'#3a2a5a');g.fillStyle=bg;g.fillRect(0,0,W,H);for(var k=0;k<14;k++){g.fillStyle='hsla('+(30+k*25)+',90%,65%,.35)';g.beginPath();g.arc((k*83)%W,60+(k*47)%150,18+(k%4)*8,0,7);g.fill()}g.fillStyle='rgba(180,200,230,.18)';g.fillRect(0,0,W,H);for(i=0;i<n;i++){var d=step(D[i],Math.random);if(d.y>H+10)D[i]=spawn(Math.random);g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(d.x,d.y,d.r*.8,d.r*1.2,0,0,7);g.fill();g.fillStyle='rgba(255,255,255,.7)';g.fillRect(d.x-d.r*.3,d.y-d.r*.6,d.r*.4,d.r*.4)}}
frame();window.__rain={spawn:spawn,step:step};`);

def('synthwave', 'synthwave-sunset', 'Synthwave sunset', '🌆', 'A retro 80s neon grid driving toward a striped sun.', [],
  `<h3>Synthwave</h3>${SCENE(520, 300)}<p><label class="muted">Speed <input type="range" id="sp" min="1" max="10" value="4"></label></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,t=0,HZ=150;
function lineY(i,t){var f=((i+t)%1);return HZ+Math.pow(f,2.2)*(H-HZ)}
function frame(){requestAnimationFrame(frame);t+=Number(document.getElementById('sp').value)*.003;var sky=g.createLinearGradient(0,0,0,HZ);sky.addColorStop(0,'#10002b');sky.addColorStop(1,'#ff3c8e');g.fillStyle=sky;g.fillRect(0,0,W,HZ);var sun=g.createLinearGradient(0,60,0,HZ);sun.addColorStop(0,'#ffe66d');sun.addColorStop(1,'#ff2e88');g.fillStyle=sun;g.beginPath();g.arc(W/2,HZ-8,72,Math.PI,0);g.fill();g.fillStyle='#1a0033';for(var s=0;s<6;s++)g.fillRect(W/2-80,HZ-60+s*10,160,s*1.2+1);g.fillStyle='#0b0020';g.fillRect(0,HZ,W,H-HZ);g.strokeStyle='#ff4fd8';g.lineWidth=1.5;g.shadowColor='#ff4fd8';g.shadowBlur=8;for(var i=0;i<12;i++){var y=lineY(i/12,t);g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke()}for(var x=-12;x<=12;x++){g.beginPath();g.moveTo(W/2+x*10,HZ);g.lineTo(W/2+x*90,H);g.stroke()}g.shadowBlur=0}
frame();window.__synth={lineY:lineY};`);

def('snowglobe', 'snow-globe', 'Snow globe', '❄️', 'Shake the globe and watch snow settle on a tiny cabin.', [],
  `<h3>Snow globe</h3>${SCENE(360, 360, 'max-width:360px')}<p><button id="sh">Shake it</button></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),S=360,F=[];
function make(n,rnd){var a=[];for(var i=0;i<n;i++)a.push({x:rnd()*S,y:rnd()*S*.8,r:1+rnd()*2.2,v:.3+rnd()*.6,p:rnd()*6.28});return a}
function inGlobe(x,y){return Math.hypot(x-S/2,y-S/2)<150}
function step(a,t,rnd){a.forEach(function(f){f.y+=f.v;f.x+=Math.sin(t*2+f.p)*.5;if(f.y>S*.86||!inGlobe(f.x,f.y)){f.y=S*.86;f.v=0;f.settled=true}});return a}
F=make(120,Math.random);var t=0;
document.getElementById('sh').onclick=function(){F.forEach(function(f){var a=Math.random()*6.28,r=Math.random()*130;f.x=S/2+Math.cos(a)*r;f.y=S/2+Math.sin(a)*r*.7-30;f.v=.3+Math.random()*.6;f.settled=false})};
function frame(){requestAnimationFrame(frame);t+=.02;g.clearRect(0,0,S,S);var bg=g.createRadialGradient(S/2,S/2,10,S/2,S/2,150);bg.addColorStop(0,'#2a4a8a');bg.addColorStop(1,'#101c3a');g.fillStyle=bg;g.beginPath();g.arc(S/2,S/2,150,0,7);g.fill();g.save();g.beginPath();g.arc(S/2,S/2,150,0,7);g.clip();g.fillStyle='#e8f1ff';g.beginPath();g.ellipse(S/2,S*.82,170,50,0,0,7);g.fill();g.fillStyle='#7a4a2a';g.fillRect(S/2-30,S*.62,60,42);g.fillStyle='#b23a3a';g.beginPath();g.moveTo(S/2-38,S*.62);g.lineTo(S/2,S*.5);g.lineTo(S/2+38,S*.62);g.fill();g.fillStyle='#ffd54f';g.fillRect(S/2-8,S*.69,16,16);F.forEach(function(f){g.fillStyle='#fff';g.beginPath();g.arc(f.x,f.y,f.r,0,7);g.fill()});step(F,t,Math.random);g.restore();g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=3;g.beginPath();g.arc(S/2,S/2,150,0,7);g.stroke();g.fillStyle='#5a3a22';g.fillRect(S/2-90,S-52,180,34)}
frame();window.__globe={make:make,inGlobe:inGlobe,step:step};`);

def('pixelart', 'pixel-art-studio', 'Pixel art studio', '👾', 'Draw 16x16 pixel art with a palette. Copy the picture as an image link.', ['clipboard'],
  `<h3>Pixel art studio</h3><canvas id="cv" width="320" height="320" style="width:320px;border-radius:10px;image-rendering:pixelated;cursor:crosshair;touch-action:none;background:#fff"></canvas><p id="pal"></p><p><button id="er">Eraser</button> <button id="cl">Clear</button> <button class="p" id="cp">Copy image link</button></p>`,
  R`var N=16,PX=20,cv=document.getElementById('cv'),g=cv.getContext('2d'),COL=['#111111','#ffffff','#e63946','#f4a261','#ffd166','#06d6a0','#118ab2','#7b2cbf','#ff6fd8','#8d5524'],cur=COL[0],erase=false,grid=[],down=false;
function empty(){var a=[];for(var i=0;i<N*N;i++)a.push(null);return a}
function setp(a,x,y,c){if(x<0||y<0||x>=N||y>=N)return a;a[y*N+x]=c;return a}
function count(a){return a.filter(function(c){return c}).length}
grid=empty();
function draw(){g.fillStyle='#fff';g.fillRect(0,0,320,320);for(var y=0;y<N;y++)for(var x=0;x<N;x++){var c=grid[y*N+x];if(c){g.fillStyle=c;g.fillRect(x*PX,y*PX,PX,PX)}else if((x+y)%2){g.fillStyle='#f0f0f0';g.fillRect(x*PX,y*PX,PX,PX)}}}
function at(e){var r=cv.getBoundingClientRect();paint(Math.floor((e.clientX-r.left)/r.width*N),Math.floor((e.clientY-r.top)/r.height*N))}
function paint(x,y){setp(grid,x,y,erase?null:cur);draw()}
cv.onpointerdown=function(e){down=true;at(e)};cv.onpointermove=function(e){if(down)at(e)};window.addEventListener('pointerup',function(){down=false});
COL.forEach(function(c){var b=document.createElement('button');b.style.cssText='width:26px;height:26px;border-radius:6px;margin:2px;border:2px solid #888;background:'+c;b.onclick=function(){cur=c;erase=false};document.getElementById('pal').appendChild(b)});
document.getElementById('er').onclick=function(){erase=!erase;this.textContent=erase?'Pen':'Eraser'};document.getElementById('cl').onclick=function(){grid=empty();draw()};document.getElementById('cp').onclick=function(){aurora.copy(cv.toDataURL('image/png')).then(function(){aurora.toast('Image link copied')}).catch(function(){})};draw();window.__pix={empty:empty,setp:setp,count:count,N:N};`);

def('palettegen', 'palette-generator', 'Palette generator', '🎨', 'Press space for fresh matching colour palettes. Click a colour to copy it.', ['clipboard'],
  `<h3>Palette generator</h3><div id="sw" style="display:flex;border-radius:14px;overflow:hidden;height:170px"></div><p><select id="mode"><option value="analogous">Analogous</option><option value="complementary">Complementary</option><option value="triad">Triad</option><option value="mono">Monochrome</option></select> <button class="p" id="go">New palette</button> <span class="muted">or press Space</span></p>`,
  R`var $=function(i){return document.getElementById(i)};
function hsl2hex(h,s,l){h=((h%360)+360)%360;s/=100;l/=100;var a=s*Math.min(l,1-l),f=function(n){var k=(n+h/30)%12,c=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(255*c).toString(16).padStart(2,'0')};return '#'+f(0)+f(8)+f(4)}
function make(mode,rnd){var h=Math.floor(rnd()*360),s=55+Math.floor(rnd()*30),o=[],i;if(mode==='analogous')for(i=0;i<5;i++)o.push(hsl2hex(h+i*28,s,45+i*6));else if(mode==='complementary'){o=[hsl2hex(h,s,35),hsl2hex(h,s,55),hsl2hex(h,15,90),hsl2hex(h+180,s,55),hsl2hex(h+180,s,35)]}else if(mode==='triad'){for(i=0;i<5;i++)o.push(hsl2hex(h+(i%3)*120,s,40+i*7))}else{for(i=0;i<5;i++)o.push(hsl2hex(h,s,20+i*15))}return o}
function show(){var p=make($('mode').value,Math.random);$('sw').innerHTML='';p.forEach(function(c){var d=document.createElement('div');d.style.cssText='flex:1;display:flex;align-items:flex-end;justify-content:center;padding:10px;cursor:pointer;font:600 13px monospace;color:#fff;text-shadow:0 1px 3px #000;background:'+c;d.textContent=c.toUpperCase();d.onclick=function(){aurora.copy(c).then(function(){aurora.toast(c+' copied')}).catch(function(){})};$('sw').appendChild(d)})}
$('go').onclick=show;$('mode').onchange=show;document.addEventListener('keydown',function(e){if(e.code==='Space'){e.preventDefault();show()}});show();window.__pal={hsl2hex:hsl2hex,make:make};`);

def('fancytext', 'fancy-text', 'Fancy text', '✨', 'Turn plain text into bold, script, bubble and other stylish letters. Click to copy.', ['clipboard'],
  `<h3>Fancy text</h3><p><input id="t" value="Vorynth Settings" style="width:100%"></p><div id="out"></div>`,
  R`var $=function(i){return document.getElementById(i)};
function mk(up,lo,dg){return function(s){var r='';Array.from(s).forEach(function(c){var k=c.charCodeAt(0);if(k>=65&&k<=90)r+=String.fromCodePoint(up+k-65);else if(k>=97&&k<=122)r+=String.fromCodePoint(lo+k-97);else if(dg&&k>=48&&k<=57)r+=String.fromCodePoint(dg+k-48);else r+=c});return r}}
var ST=[['Bold',mk(0x1D400,0x1D41A,0x1D7CE)],['Italic',mk(0x1D468,0x1D482,0)],['Script',mk(0x1D4D0,0x1D4EA,0)],['Gothic',mk(0x1D56C,0x1D586,0)],['Double',mk(0x1D538,0x1D552,0x1D7D8)],['Mono',mk(0x1D670,0x1D68A,0x1D7F6)],['Bubble',mk(0x24B6,0x24D0,0)],['Square',mk(0x1F130,0x1F130,0)],['Wide',function(s){return Array.from(s).map(function(c){var k=c.charCodeAt(0);return k>32&&k<127?String.fromCharCode(k+0xFEE0):c===' '?'　':c}).join('')}],['Upside down',function(s){var m={a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z'};return Array.from(s.toLowerCase()).reverse().map(function(c){return m[c]||c}).join('')}]];
function all(s){return ST.map(function(x){return[x[0],x[1](s)]})}
function show(){$('out').innerHTML='';all($('t').value).forEach(function(p){var d=document.createElement('div');d.className='card';d.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:10px 14px;margin:6px 0;cursor:pointer';d.innerHTML='<span class="muted"></span><b style="font-size:18px"></b>';d.children[0].textContent=p[0];d.children[1].textContent=p[1];d.onclick=function(){aurora.copy(p[1]).then(function(){aurora.toast('Copied')}).catch(function(){})};$('out').appendChild(d)})}
$('t').oninput=show;show();window.__fancy={all:all};`);

def('cpstest', 'click-speed', 'Click speed test', '🖱️', 'How many clicks per second can you do in 10 seconds? Beat your best.', ['storage'],
  `<h3>Click speed test</h3><div id="pad" style="height:170px;border-radius:16px;display:grid;place-items:center;font-size:28px;font-weight:800;cursor:pointer;user-select:none;background:linear-gradient(135deg,#4cc2ff,#7b61ff);color:#fff">Click to start</div><p id="res" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)},clicks=0,start=0,run=false,best=0,DUR=10;
function cps(n,s){return s>0?Math.round(n/s*100)/100:0}
function rank(c){return c>=10?'Lightning':c>=7?'Fast':c>=5?'Quick':'Warming up'}
aurora.storage.get('best').then(function(v){best=Number(v)||0;if(best)$('res').textContent='Best: '+best+' CPS'}).catch(function(){});
$('pad').onclick=function(){if(!run){run=true;clicks=0;start=performance.now();$('pad').textContent='0';setTimeout(function(){run=false;var c=cps(clicks,DUR);$('pad').textContent='Done: '+c+' CPS';var msg=rank(c)+' ('+clicks+' clicks)';if(c>best){best=c;msg+=' - new best!';aurora.storage.set('best',String(best)).catch(function(){})}$('res').textContent=msg},DUR*1000)}clicks++;if(run)$('pad').textContent=String(clicks)};
window.__cps={cps:cps,rank:rank};`);

def('bubblepop', 'bubble-pop', 'Bubble pop', '🫧', 'Pop floating bubbles before they escape. Satisfying and simple.', [],
  `<h3>Bubble pop <span class="muted" id="sc"></span></h3>${SCENE(480, 320, 'max-width:480px;cursor:pointer')}`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=480,H=320,B=[],score=0,esc=0;
function bub(rnd){return{x:30+rnd()*(W-60),y:H+20,r:14+rnd()*22,v:.5+rnd()*1.4,h:Math.floor(rnd()*360)}}
function hit(b,x,y){return Math.hypot(b.x-x,b.y-y)<=b.r}
function step(a,rnd){a.forEach(function(b){b.y-=b.v;b.x+=Math.sin(b.y*.04)*.4});if(rnd()<.04&&a.length<14)a.push(bub(rnd));return a}
cv.onclick=function(e){var r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;for(var i=B.length-1;i>=0;i--)if(hit(B[i],x,y)){B.splice(i,1);score++;break}};
function frame(){requestAnimationFrame(frame);step(B,Math.random);B=B.filter(function(b){if(b.y<-b.r){esc++;return false}return true});g.fillStyle='#07182b';g.fillRect(0,0,W,H);B.forEach(function(b){var gr=g.createRadialGradient(b.x-b.r*.3,b.y-b.r*.3,2,b.x,b.y,b.r);gr.addColorStop(0,'rgba(255,255,255,.85)');gr.addColorStop(.4,'hsla('+b.h+',90%,65%,.35)');gr.addColorStop(1,'hsla('+b.h+',90%,60%,.6)');g.fillStyle=gr;g.beginPath();g.arc(b.x,b.y,b.r,0,7);g.fill()});document.getElementById('sc').textContent='popped '+score+' · escaped '+esc}
frame();window.__bub={bub:bub,hit:hit,step:step};`);

def('pendulum', 'pendulum-wave', 'Pendulum wave', '🎐', 'A row of pendulums drifting in and out of sync, making hypnotic wave patterns.', [],
  `<h3>Pendulum wave</h3>${SCENE(520, 320)}<p><label class="muted">Count <input type="range" id="n" min="6" max="24" value="15"></label></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=320,t0=performance.now();
function angle(i,t,n){var f=(50+i)/60;return Math.sin(2*Math.PI*f*t/ (1+0))*.6}
function frame(){requestAnimationFrame(frame);var t=(performance.now()-t0)/1000,n=Number(document.getElementById('n').value);g.fillStyle='#0b1020';g.fillRect(0,0,W,H);g.fillStyle='#3a4468';g.fillRect(20,20,W-40,6);for(var i=0;i<n;i++){var x=40+i*(W-80)/(n-1),a=angle(i,t,n),L=200+i*3,bx=x+Math.sin(a)*L*.3,by=26+Math.cos(a)*L*.7+30;g.strokeStyle='rgba(255,255,255,.4)';g.beginPath();g.moveTo(x,26);g.lineTo(bx,by);g.stroke();g.fillStyle='hsl('+(i/n*300)+',85%,62%)';g.beginPath();g.arc(bx,by,10,0,7);g.fill()}}
frame();window.__pend={angle:angle};`);

def('bootscreen', 'retro-boot', 'Retro boot screen', '🖥️', 'A fake old-school computer boot sequence. Type your own lines and watch them print.', [],
  `<h3>Retro boot screen</h3><pre id="scr" style="background:#031a06;color:#4cff6a;padding:16px;border-radius:12px;height:240px;overflow:auto;font:13px/1.5 monospace;text-shadow:0 0 6px #1aff3a"></pre><p><button class="p" id="go">Boot</button> <input id="ln" placeholder="Add your own line" style="width:200px"></p>`,
  R`var $=function(i){return document.getElementById(i)},LINES=['AURORA BIOS v1.19','Memory test: 16384 KB OK','Detecting drives... done','Loading kernel.......... OK','Starting services:','  [ OK ] display','  [ OK ] network','  [ OK ] sound','Mounting /home... OK','Welcome, user.'],busy=false;
function build(extra){var a=LINES.slice();if(extra&&extra.trim())a.splice(a.length-1,0,'> '+extra.trim().slice(0,80));return a}
function boot(){if(busy)return;busy=true;$('scr').textContent='';var a=build($('ln').value),i=0;(function nx(){if(i>=a.length){busy=false;return}$('scr').textContent+=a[i++]+'\n';$('scr').scrollTop=1e6;setTimeout(nx,120+Math.random()*260)})()}
$('go').onclick=boot;boot();window.__boot={build:build};`);

def('ripples', 'water-ripples', 'Water ripples', '💧', 'Click or move over the pond to make ripples spread and fade.', [],
  `<h3>Water ripples</h3>${SCENE(480, 320, 'max-width:480px;cursor:crosshair')}`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=480,H=320,R=[],lastT=0;
function add(x,y){R.push({x:x,y:y,r:2,a:1})}
function step(a){a.forEach(function(o){o.r+=1.6;o.a-=.012});return a.filter(function(o){return o.a>0})}
function pos(e){var r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H]}
cv.onclick=function(e){var p=pos(e);add(p[0],p[1])};cv.onmousemove=function(e){var n=performance.now();if(n-lastT>140){lastT=n;var p=pos(e);add(p[0],p[1])}};
setInterval(function(){add(Math.random()*W,Math.random()*H)},1400);
function frame(){requestAnimationFrame(frame);R=step(R);var bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#0e4d6b');bg.addColorStop(1,'#06293d');g.fillStyle=bg;g.fillRect(0,0,W,H);R.forEach(function(o){for(var k=0;k<3;k++){g.strokeStyle='rgba(190,235,255,'+Math.max(0,o.a-k*.2)*.7+')';g.lineWidth=2-k*.5;g.beginPath();g.arc(o.x,o.y,Math.max(1,o.r-k*8),0,7);g.stroke()}})}
frame();window.__rip={add:add,step:step};`);

def('vaporclock', 'vapor-clock', 'Vaporwave clock', '🌴', 'A dreamy pink-and-teal clock with a big time and floating shapes.', [],
  `<h3>Vaporwave clock</h3><div id="vw" class="vw"><div id="tm"></div><div id="dt"></div><i class="s1">▲</i><i class="s2">●</i><i class="s3">■</i></div>
<style>.vw{position:relative;height:230px;border-radius:18px;overflow:hidden;display:grid;place-content:center;text-align:center;background:linear-gradient(160deg,#ff71ce,#b967ff 45%,#01cdfe);color:#fff}#tm{font-size:64px;font-weight:800;letter-spacing:4px;text-shadow:3px 3px 0 #05ffa1,6px 6px 0 #ff71ce}#dt{margin-top:6px;letter-spacing:6px;text-transform:uppercase;font-size:13px}.vw i{position:absolute;font-style:normal;opacity:.5;animation:fl 6s ease-in-out infinite}.s1{left:8%;top:14%;font-size:34px;color:#05ffa1}.s2{right:10%;top:20%;font-size:30px;color:#fffb96;animation-delay:-2s}.s3{left:16%;bottom:12%;font-size:28px;color:#01cdfe;animation-delay:-4s}@keyframes fl{50%{transform:translateY(-14px) rotate(20deg)}}</style>`,
  R`function fmt(d){var p=function(n){return (n<10?'0':'')+n},h=d.getHours()%12||12;return h+':'+p(d.getMinutes())+':'+p(d.getSeconds())+(d.getHours()<12?' AM':' PM')}
function tick(){var d=new Date();document.getElementById('tm').textContent=fmt(d);document.getElementById('dt').textContent=d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}
tick();setInterval(tick,1000);window.__vapor={fmt:fmt};`);

lib.refresh();
module.exports = {};
