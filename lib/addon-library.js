/* A library of small add-ons you can install with one click (Add-ons page). Each one runs in the locked box and can only use the permissions listed. */
const { pack, page } = require('./addons');
const L = {}; // key -> { id, name, icon, description, permissions, body, script }
const def = (key, id, name, icon, description, permissions, body, script) => { L[key] = { id, name, icon, description, permissions, body, script }; };
const R = String.raw;

def('stopwatch', 'stopwatch-timer', 'Stopwatch and timer', '⏱️', 'Stopwatch with laps and a countdown timer that notifies you.', ['notify'],
  `<h3>Stopwatch</h3><div class="big" id="t">00:00.0</div><p><button class="p" id="s">Start</button> <button id="l">Lap</button> <button id="r">Reset</button></p><ol id="laps"></ol><hr><p>Countdown <input id="m" type="number" value="5" min="1" max="999" style="width:70px"> minutes <button id="cs">Start countdown</button> <b id="cd"></b></p>`,
  R`var $=function(i){return document.getElementById(i)},run=false,t0=0,acc=0,iv;
function fmt(ms){var s=Math.floor(ms/1000),m=Math.floor(s/60);s=s%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+'.'+Math.floor(ms%1000/100)}
function now(){return acc+(run?Date.now()-t0:0)}
function tick(){$('t').textContent=fmt(now())}
$('s').onclick=function(){if(run){acc=now();run=false;$('s').textContent='Start'}else{t0=Date.now();run=true;$('s').textContent='Stop'}tick()};
$('l').onclick=function(){var li=document.createElement('li');li.textContent=fmt(now());$('laps').appendChild(li)};
$('r').onclick=function(){run=false;acc=0;$('s').textContent='Start';$('laps').textContent='';tick()};
iv=setInterval(tick,100);
var cdIv=null,end=0;$('cs').onclick=function(){clearInterval(cdIv);var m=Math.max(1,Math.min(999,Number($('m').value)||1));end=Date.now()+m*60000;cdIv=setInterval(function(){var left=end-Date.now();if(left<=0){clearInterval(cdIv);$('cd').textContent='Time is up!';aurora.notify('Your countdown is finished').catch(function(){})}else $('cd').textContent=fmt(left).replace(/\.\d$/,'')},250)};
window.__sw={fmt:fmt};`);

def('pomodoro', 'pomodoro-focus', 'Pomodoro focus timer', '🍅', 'Work in focused sprints with breaks, and count your finished sprints.', ['notify', 'storage'],
  `<h3>Pomodoro</h3><p id="mode" class="muted">Focus</p><div class="big" id="t">25:00</div><p><button class="p" id="go">Start</button> <button id="skip">Skip</button> <button id="rst">Reset</button></p><p>Finished sprints today: <b id="n">0</b></p>`,
  R`var $=function(i){return document.getElementById(i)},LEN={focus:25,break:5,long:15},mode='focus',left=25*60,iv=null,done=0,day=new Date().toISOString().slice(0,10);
function next(m,count){if(m!=='focus')return'focus';return count%4===0?'long':'break'}
function show(){var s=left%60;$('t').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(s).padStart(2,'0');$('mode').textContent={focus:'Focus',break:'Short break',long:'Long break'}[mode];$('n').textContent=done}
function finish(){clearInterval(iv);iv=null;$('go').textContent='Start';if(mode==='focus'){done++;aurora.storage.set('p-'+day,done).catch(function(){})}aurora.notify(mode==='focus'?'Sprint finished. Time for a break.':'Break over. Back to focus.').catch(function(){});mode=next(mode,done);left=LEN[mode]*60;show()}
$('go').onclick=function(){if(iv){clearInterval(iv);iv=null;$('go').textContent='Start'}else{$('go').textContent='Pause';iv=setInterval(function(){left--;show();if(left<=0)finish()},1000)}};
$('skip').onclick=function(){if(mode==='focus'){mode=next(mode,done+1)}else mode='focus';left=LEN[mode]*60;show()};
$('rst').onclick=function(){clearInterval(iv);iv=null;$('go').textContent='Start';mode='focus';left=LEN.focus*60;show()};
aurora.storage.get('p-'+day).then(function(v){done=Number(v)||0;show()}).catch(function(){show()});show();window.__pomo={next:next};`);

def('converter', 'unit-converter', 'Unit converter', '📏', 'Length, weight, volume, speed, area, time, data and temperature.', [],
  `<h3>Unit converter</h3><p><select id="cat"></select></p><p><input id="v" type="number" value="1" style="width:120px"> <select id="a"></select> = <b id="out"></b> <select id="b"></select></p>`,
  R`var $=function(i){return document.getElementById(i)};
var U={Length:{mm:.001,cm:.01,m:1,km:1000,inch:.0254,foot:.3048,yard:.9144,mile:1609.344},Weight:{mg:.001,g:1,kg:1000,ounce:28.349523125,pound:453.59237},Volume:{ml:.001,litre:1,cup:.2365882365,'fl oz':.0295735295625,'gallon (US)':3.785411784},Speed:{'m/s':1,'km/h':1/3.6,mph:.44704,knot:.5144444444},Area:{'cm²':1e-4,'m²':1,'km²':1e6,hectare:1e4,'ft²':.09290304,acre:4046.8564224},Time:{second:1,minute:60,hour:3600,day:86400,week:604800},Data:{byte:1,KB:1e3,MB:1e6,GB:1e9,TB:1e12,KiB:1024,MiB:1048576,GiB:1073741824},Temperature:{C:0,F:0,K:0}};
function convert(cat,val,from,to){if(cat==='Temperature'){var c=from==='C'?val:from==='F'?(val-32)*5/9:val-273.15;return to==='C'?c:to==='F'?c*9/5+32:c+273.15}var t=U[cat];return val*t[from]/t[to]}
function fill(sel,keys,pick){sel.textContent='';keys.forEach(function(k,i){var o=document.createElement('option');o.value=o.textContent=k;if(i===pick)o.selected=true;sel.appendChild(o)})}
function recalc(){var r=convert($('cat').value,Number($('v').value),$('a').value,$('b').value);$('out').textContent=isFinite(r)?String(Math.round(r*1e8)/1e8):'-'}
fill($('cat'),Object.keys(U),0);function units(){var k=Object.keys(U[$('cat').value]);fill($('a'),k,0);fill($('b'),k,Math.min(2,k.length-1));recalc()}
$('cat').onchange=units;['v','a','b'].forEach(function(i){$(i).oninput=recalc;$(i).onchange=recalc});units();window.__uc={convert:convert};`);

def('markdown', 'markdown-notes', 'Markdown notes', '📝', 'Write notes with live preview. Saved automatically.', ['storage'],
  `<h3>Markdown notes</h3><div style="display:flex;gap:10px;flex-wrap:wrap"><textarea id="src" rows="14" style="flex:1;min-width:240px" placeholder="# Title&#10;Some **bold** and *italic* text&#10;- a list"></textarea><div id="out" style="flex:1;min-width:240px"></div></div>`,
  R`var $=function(i){return document.getElementById(i)};
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function inline(s){return s.replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)')}
function render(md){var out=[],list=false;esc(md).split('\n').forEach(function(l){var m=/^(#{1,4})\s+(.*)$/.exec(l);if(/^\s*[-*]\s+/.test(l)){if(!list){out.push('<ul>');list=true}out.push('<li>'+inline(l.replace(/^\s*[-*]\s+/,''))+'</li>');return}if(list){out.push('</ul>');list=false}if(m)out.push('<h'+(m[1].length+2)+'>'+inline(m[2])+'</h'+(m[1].length+2)+'>');else if(l.trim())out.push('<p>'+inline(l)+'</p>')});if(list)out.push('</ul>');return out.join('')}
var tm;function upd(){$('out').innerHTML=render($('src').value);clearTimeout(tm);tm=setTimeout(function(){aurora.storage.set('note',$('src').value).catch(function(){})},500)}
$('src').oninput=upd;aurora.storage.get('note').then(function(v){if(typeof v==='string')$('src').value=v;upd()}).catch(upd);window.__md={render:render};`);

def('todo', 'todo-list', 'To-do list', '✅', 'A simple task list that remembers what you add.', ['storage'],
  `<h3>To-do</h3><p><input id="in" placeholder="What needs doing?" style="width:60%"> <button class="p" id="add">Add</button> <button id="clr">Clear done</button></p><ul id="list" style="list-style:none;padding:0"></ul><p id="cnt" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)},items=[];
function save(){aurora.storage.set('items',items).catch(function(){})}
function draw(){var l=$('list');l.textContent='';items.forEach(function(it,i){var li=document.createElement('li');li.style.margin='6px 0';var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!it.d;cb.onchange=function(){it.d=cb.checked;save();draw()};var sp=document.createElement('span');sp.textContent=' '+it.t;if(it.d)sp.style.textDecoration='line-through';var x=document.createElement('button');x.textContent='✕';x.style.marginLeft='8px';x.onclick=function(){items.splice(i,1);save();draw()};li.append(cb,sp,x);l.appendChild(li)});$('cnt').textContent=items.filter(function(i){return !i.d}).length+' left, '+items.length+' in total'}
function add(){var t=$('in').value.trim().slice(0,200);if(!t||items.length>=500)return;items.push({t:t,d:false});$('in').value='';save();draw()}
$('add').onclick=add;$('in').onkeydown=function(e){if(e.key==='Enter')add()};$('clr').onclick=function(){items=items.filter(function(i){return !i.d});save();draw()};
aurora.storage.get('items').then(function(v){if(Array.isArray(v))items=v.filter(function(x){return x&&typeof x.t==='string'}).slice(0,500);draw()}).catch(draw);draw();window.__todo={get:function(){return items}};`);

def('habits', 'habit-streaks', 'Habit streaks', '🔥', 'Tick off daily habits and watch your streaks grow.', ['storage'],
  `<h3>Habits</h3><p><input id="in" placeholder="New habit" style="width:55%"> <button class="p" id="add">Add</button></p><div id="list"></div>`,
  R`var $=function(i){return document.getElementById(i)},H=[];
function dstr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function streak(days,today){var set={};days.forEach(function(d){set[d]=1});var d=new Date(today+'T12:00:00'),n=0;if(!set[dstr(d)])d.setDate(d.getDate()-1);while(set[dstr(d)]){n++;d.setDate(d.getDate()-1)}return n}
function save(){aurora.storage.set('habits',H).catch(function(){})}
function draw(){var L=$('list');L.textContent='';var today=dstr(new Date());H.forEach(function(h,i){var r=document.createElement('p');var done=h.days.indexOf(today)>=0;var b=document.createElement('button');b.textContent=done?'Done today ✓':'Done today';b.className=done?'':'p';b.onclick=function(){if(!done){h.days.push(today);h.days=h.days.slice(-400);save();draw()}};var x=document.createElement('button');x.textContent='✕';x.onclick=function(){H.splice(i,1);save();draw()};r.append(document.createTextNode(h.name+'  🔥 '+streak(h.days,today)+' day streak  '),b,document.createTextNode(' '),x);L.appendChild(r)})}
$('add').onclick=function(){var n=$('in').value.trim().slice(0,60);if(!n||H.length>=30)return;H.push({name:n,days:[]});$('in').value='';save();draw()};
aurora.storage.get('habits').then(function(v){if(Array.isArray(v))H=v.filter(function(h){return h&&typeof h.name==='string'&&Array.isArray(h.days)}).slice(0,30);draw()}).catch(draw);draw();window.__habit={streak:streak,get:function(){return H}};`);

def('breathing', 'breathing-guide', 'Breathing guide', '🌬️', 'A calm animated guide for box breathing, 4-7-8 and more.', [],
  `<h3>Breathing guide</h3><p><select id="pat"><option value="4,4,4,4">Box breathing 4-4-4-4</option><option value="4,7,8,0">Relax 4-7-8</option><option value="5,0,5,0">Even 5-5</option></select> <button class="p" id="go">Start</button></p><div style="display:grid;place-items:center;height:240px"><div id="c" style="width:80px;height:80px;border-radius:50%;background:var(--accent);opacity:.8;transition:all 1s linear"></div></div><p class="big" id="say" style="text-align:center">Ready</p>`,
  R`var $=function(i){return document.getElementById(i)},iv=null,names=['Breathe in','Hold','Breathe out','Hold'];
function phases(v){return v.split(',').map(Number)}
$('go').onclick=function(){if(iv){clearInterval(iv);iv=null;$('go').textContent='Start';$('say').textContent='Ready';$('c').style.width=$('c').style.height='80px';return}$('go').textContent='Stop';var p=phases($('pat').value),i=0,left=0;function step(){while(p[i]===0){i=(i+1)%4}left=p[i];$('say').textContent=names[i]+' '+left;var c=$('c');c.style.transition='all '+left+'s linear';var big=i===0||i===1;c.style.width=c.style.height=(big?200:80)+'px'}step();iv=setInterval(function(){left--;if(left<=0){i=(i+1)%4;step()}else $('say').textContent=names[i]+' '+left},1000)};
window.__breath={phases:phases};`);

def('typing', 'typing-test', 'Typing speed test', '⌨️', 'Measure your words per minute and accuracy.', [],
  `<h3>Typing test</h3><p id="target" style="font-size:18px"></p><textarea id="in" rows="3" style="width:100%" placeholder="Start typing here"></textarea><p><button id="new">New text</button> <b id="res"></b></p>`,
  R`var $=function(i){return document.getElementById(i)},S=['The quick brown fox jumps over the lazy dog near the river bank.','Small steps every day add up to big results over time.','Good software is simple to use and hard to break.','A calm mind makes clear decisions even when things are busy.'],tg='',t0=0;
function score(target,typed,secs){var ok=0;for(var i=0;i<typed.length;i++)if(typed[i]===target[i])ok++;return{wpm:secs>0?Math.round(typed.length/5/(secs/60)):0,acc:typed.length?Math.round(ok/typed.length*100):0}}
function pick(){tg=S[Math.floor(Math.random()*S.length)];$('target').textContent=tg;$('in').value='';$('res').textContent='';t0=0}
$('in').oninput=function(){if(!t0)t0=Date.now();var s=score(tg,$('in').value,(Date.now()-t0)/1000);$('res').textContent=s.wpm+' WPM, '+s.acc+'% accurate'};$('new').onclick=pick;pick();window.__type={score:score};`);

def('snake', 'snake-game', 'Snake', '🐍', 'The classic snake game. Use the arrow keys.', [],
  `<h3>Snake <span class="muted" id="sc">score 0</span></h3><canvas id="cv" width="300" height="300" style="border:1px solid #888;border-radius:8px"></canvas><p><button class="p" id="go">Start</button> <span class="muted">Arrow keys to steer</span></p>`,
  R`var $=function(i){return document.getElementById(i)},N=15,C=20,st,iv;
function fresh(){return{snake:[[7,7],[6,7],[5,7]],dir:[1,0],food:[11,7],score:0,over:false}}
function step(s,dir,rnd){if(dir&&(dir[0]+s.dir[0]!==0||dir[1]+s.dir[1]!==0))s.dir=dir;var h=[s.snake[0][0]+s.dir[0],s.snake[0][1]+s.dir[1]];if(h[0]<0||h[1]<0||h[0]>=N||h[1]>=N||s.snake.some(function(p){return p[0]===h[0]&&p[1]===h[1]})){s.over=true;return s}s.snake.unshift(h);if(h[0]===s.food[0]&&h[1]===s.food[1]){s.score++;var f;do{f=[Math.floor((rnd?rnd():Math.random())*N),Math.floor((rnd?rnd():Math.random())*N)]}while(s.snake.some(function(p){return p[0]===f[0]&&p[1]===f[1]}));s.food=f}else s.snake.pop();return s}
function draw(){var g=$('cv').getContext('2d');g.clearRect(0,0,300,300);g.fillStyle='#e55';g.fillRect(st.food[0]*C,st.food[1]*C,C-2,C-2);g.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#4cc2ff';st.snake.forEach(function(p){g.fillRect(p[0]*C,p[1]*C,C-2,C-2)});$('sc').textContent='score '+st.score+(st.over?' - game over':'')}
var nd=null;document.addEventListener('keydown',function(e){var m={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(m){nd=m;e.preventDefault()}});
$('go').onclick=function(){clearInterval(iv);st=fresh();nd=null;draw();iv=setInterval(function(){step(st,nd);nd=null;draw();if(st.over)clearInterval(iv)},140)};st=fresh();draw();window.__snake={step:step,fresh:fresh};`);

def('g2048', 'game-2048', '2048', '🔢', 'Slide and merge tiles to reach 2048. Arrow keys.', [],
  `<h3>2048 <span class="muted" id="sc"></span></h3><div id="b" style="display:grid;grid-template-columns:repeat(4,64px);gap:6px"></div><p><button class="p" id="new">New game</button></p>`,
  R`var $=function(i){return document.getElementById(i)},B,score=0;
function slide(row){var a=row.filter(Boolean),gain=0;for(var i=0;i<a.length-1;i++)if(a[i]===a[i+1]){a[i]*=2;gain+=a[i];a.splice(i+1,1)}while(a.length<4)a.push(0);return{row:a,gain:gain}}
function move(b,dir){var g=0,out=b.map(function(r){return r.slice()}),i,j;function line(get,set){var r=[0,1,2,3].map(get),s=slide(r);g+=s.gain;s.row.forEach(function(v,k){set(k,v)})}
for(i=0;i<4;i++){if(dir==='left')line(function(k){return out[i][k]},function(k,v){out[i][k]=v});if(dir==='right')line(function(k){return out[i][3-k]},function(k,v){out[i][3-k]=v});if(dir==='up')line(function(k){return out[k][i]},function(k,v){out[k][i]=v});if(dir==='down')line(function(k){return out[3-k][i]},function(k,v){out[3-k][i]=v})}
var moved=JSON.stringify(out)!==JSON.stringify(b);return{board:out,gain:g,moved:moved}}
function spawn(b){var e=[];b.forEach(function(r,i){r.forEach(function(v,j){if(!v)e.push([i,j])})});if(!e.length)return;var c=e[Math.floor(Math.random()*e.length)];b[c[0]][c[1]]=Math.random()<0.9?2:4}
function draw(){var d=$('b');d.textContent='';B.forEach(function(r){r.forEach(function(v){var c=document.createElement('div');c.style.cssText='height:64px;display:grid;place-items:center;border-radius:8px;font-weight:700;background:'+(v?'hsl('+(200+Math.log2(v)*20)+' 60% 45%)':'rgba(128,128,128,.25)')+';color:#fff';c.textContent=v||'';d.appendChild(c)})});$('sc').textContent='score '+score}
function fresh(){B=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];score=0;spawn(B);spawn(B);draw()}
document.addEventListener('keydown',function(e){var d={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[e.key];if(!d)return;e.preventDefault();var r=move(B,d);if(r.moved){B=r.board;score+=r.gain;spawn(B);draw()}});$('new').onclick=fresh;fresh();window.__g2048={move:move,slide:slide};`);

def('memory', 'memory-match', 'Memory match', '🃏', 'Flip cards and find all the pairs in as few moves as you can.', [],
  `<h3>Memory match <span class="muted" id="mv">0 moves</span></h3><div id="g" style="display:grid;grid-template-columns:repeat(4,64px);gap:8px"></div><p><button class="p" id="new">New game</button></p><p id="win" class="big"></p>`,
  R`var $=function(i){return document.getElementById(i)},E=['🍎','🚀','🎧','🌙','🐙','⚡','🎲','🌵'],cards,open=[],moves=0,found=0,lock=false;
function shuffle(a){a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function fresh(){cards=shuffle(E.concat(E));open=[];moves=0;found=0;lock=false;$('win').textContent='';draw()}
function draw(){var g=$('g');g.textContent='';cards.forEach(function(v,i){var b=document.createElement('button');var shown=open.indexOf(i)>=0||(cards[i]&&cards[i].m);b.style.cssText='height:64px;font-size:26px';b.textContent=shown?v.v||v:'?';b.dataset.i=i;b.onclick=function(){flip(i)};g.appendChild(b)});$('mv').textContent=moves+' moves'}
function flip(i){if(lock||open.indexOf(i)>=0||typeof cards[i]==='object')return;open.push(i);if(open.length===2){moves++;var a=open[0],b=open[1];if(cards[a]===cards[b]){cards[a]={v:cards[a],m:1};cards[b]={v:cards[b],m:1};open=[];found++;if(found===E.length)$('win').textContent='You won in '+moves+' moves!'}else{lock=true;draw();setTimeout(function(){open=[];lock=false;draw()},700);return}}draw()}
$('new').onclick=fresh;fresh();window.__mem={shuffle:shuffle};`);

def('picker', 'decision-maker', 'Decision maker', '🎲', 'Flip a coin, roll dice, or pick a random item from your list.', [],
  `<h3>Decision maker</h3><p><button id="coin" class="p">Flip a coin</button> <button id="d6">Roll d6</button> <button id="d20">Roll d20</button></p><p class="big" id="res">?</p><p>Pick from a list (one per line):</p><textarea id="list" rows="5" style="width:100%" placeholder="pizza&#10;sushi&#10;burgers"></textarea><p><button id="pick">Pick one</button></p>`,
  R`var $=function(i){return document.getElementById(i)};
function rnd(n){var m=Math.floor(4294967296/n)*n,x;do{x=crypto.getRandomValues(new Uint32Array(1))[0]}while(x>=m);return x%n}
$('coin').onclick=function(){$('res').textContent=rnd(2)?'Heads':'Tails'};$('d6').onclick=function(){$('res').textContent=rnd(6)+1};$('d20').onclick=function(){$('res').textContent=rnd(20)+1};
$('pick').onclick=function(){var l=$('list').value.split('\n').map(function(s){return s.trim()}).filter(Boolean);$('res').textContent=l.length?l[rnd(l.length)]:'Add some items first'};window.__pick={rnd:rnd};`);

def('worldclock', 'world-clock', 'World clock', '🌍', 'Live time in cities around the world, and a meeting planner.', [],
  `<h3>World clock</h3><div id="list"></div><hr><p>Meeting at <input id="t" type="time" value="09:00"> in <select id="z"></select></p><div id="plan"></div>`,
  R`var $=function(i){return document.getElementById(i)},C=[['Riyadh','Asia/Riyadh'],['Dubai','Asia/Dubai'],['Cairo','Africa/Cairo'],['Istanbul','Europe/Istanbul'],['London','Europe/London'],['New York','America/New_York'],['Los Angeles','America/Los_Angeles'],['Delhi','Asia/Kolkata'],['Tokyo','Asia/Tokyo'],['Sydney','Australia/Sydney']];
function fmt(d,z){return new Intl.DateTimeFormat('en-GB',{timeZone:z,hour:'2-digit',minute:'2-digit',weekday:'short'}).format(d)}
function offsetMin(z,d){var p=new Intl.DateTimeFormat('en-US',{timeZone:z,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(d),o={};p.forEach(function(x){o[x.type]=x.value});return(Date.UTC(o.year,o.month-1,o.day,o.hour,o.minute,o.second)-Math.floor(d.getTime()/1000)*1000)/60000}
function at(z,hhmm){var n=new Date(),p=hhmm.split(':'),base=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate(),Number(p[0]),Number(p[1]));return new Date(base-offsetMin(z,new Date(base))*60000)}
function draw(){var n=new Date();$('list').innerHTML=C.map(function(c){return '<p><b>'+c[0]+'</b> &nbsp; '+fmt(n,c[1])+'</p>'}).join('');var d=at($('z').value,$('t').value);$('plan').innerHTML=C.map(function(c){return '<p>'+c[0]+': <b>'+fmt(d,c[1])+'</b></p>'}).join('')}
C.forEach(function(c){var o=document.createElement('option');o.value=c[1];o.textContent=c[0];$('z').appendChild(o)});$('t').oninput=$('z').onchange=draw;draw();setInterval(draw,15000);window.__wc={at:at,fmt:fmt,offsetMin:offsetMin};`);

def('money', 'money-calculators', 'Money calculators', '💰', 'Loan payments, tip splitting, discounts and VAT.', [],
  `<h3>Loan payment</h3><p>Amount <input id="p" type="number" value="100000" style="width:110px"> Rate % <input id="r" type="number" value="5" step="0.1" style="width:70px"> Years <input id="y" type="number" value="10" style="width:60px"></p><p>Monthly payment <b id="m"></b> &nbsp; Total interest <b id="ti"></b></p><hr><h3>Tip and split</h3><p>Bill <input id="b" type="number" value="120" style="width:90px"> Tip % <input id="tp" type="number" value="10" style="width:60px"> People <input id="n" type="number" value="4" style="width:60px"></p><p>Each pays <b id="each"></b></p><hr><h3>Discount and VAT</h3><p>Price <input id="pr" type="number" value="200" style="width:90px"> Discount % <input id="dc" type="number" value="15" style="width:60px"> VAT % <input id="vt" type="number" value="15" style="width:60px"></p><p>Final price <b id="fin"></b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function loan(P,rate,years){var n=Math.round(years*12),i=rate/100/12;if(n<=0||P<0)return{pay:0,interest:0};var pay=i===0?P/n:P*i/(1-Math.pow(1+i,-n));return{pay:pay,interest:pay*n-P}}
function split(bill,tip,n){n=Math.max(1,Math.floor(n));return bill*(1+tip/100)/n}
function price(p,d,v){return p*(1-d/100)*(1+v/100)}
function f(x){return isFinite(x)?x.toLocaleString('en',{maximumFractionDigits:2,minimumFractionDigits:2}):'-'}
function calc(){var l=loan(+$('p').value,+$('r').value,+$('y').value);$('m').textContent=f(l.pay);$('ti').textContent=f(l.interest);$('each').textContent=f(split(+$('b').value,+$('tp').value,+$('n').value));$('fin').textContent=f(price(+$('pr').value,+$('dc').value,+$('vt').value))}
document.querySelectorAll('input').forEach(function(i){i.oninput=calc});calc();window.__money={loan:loan,split:split,price:price};`);

def('dates', 'date-calculator', 'Date calculator', '📅', 'Days between dates, add days, find the weekday, work out an age.', [],
  `<h3>Between two dates</h3><p><input id="a" type="date"> to <input id="b" type="date"> = <b id="diff"></b></p><h3>Add days</h3><p><input id="c" type="date"> + <input id="n" type="number" value="30" style="width:80px"> days = <b id="sum"></b></p><h3>Age</h3><p>Born <input id="d" type="date"> is <b id="age"></b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function pd(s){var p=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return p?Date.UTC(+p[1],+p[2]-1,+p[3]):null}
function days(a,b){return Math.round((pd(b)-pd(a))/86400000)}
function addDays(s,n){var t=new Date(pd(s)+n*86400000);return t.toISOString().slice(0,10)}
function wd(s){return['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(pd(s)).getUTCDay()]}
function age(birth,today){var b=new Date(pd(birth)),t=new Date(pd(today)),y=t.getUTCFullYear()-b.getUTCFullYear();if(t.getUTCMonth()<b.getUTCMonth()||(t.getUTCMonth()===b.getUTCMonth()&&t.getUTCDate()<b.getUTCDate()))y--;var m=0;function plus(yy,mm){var ty=b.getUTCFullYear()+yy+Math.floor((b.getUTCMonth()+mm)/12),tm=(b.getUTCMonth()+mm)%12,last=new Date(Date.UTC(ty,tm+1,0)).getUTCDate();return Date.UTC(ty,tm,Math.min(b.getUTCDate(),last))}while(plus(y,m+1)<=t.getTime())m++;return y+' years, '+m+' months, '+Math.round((t.getTime()-plus(y,m))/86400000)+' days'}
function calc(){$('diff').textContent=pd($('a').value)!==null&&pd($('b').value)!==null?days($('a').value,$('b').value)+' days':'-';$('sum').textContent=pd($('c').value)!==null?addDays($('c').value,+$('n').value)+' ('+wd(addDays($('c').value,+$('n').value))+')':'-';$('age').textContent=pd($('d').value)!==null?age($('d').value,new Date().toISOString().slice(0,10)):'-'}
document.querySelectorAll('input').forEach(function(i){i.oninput=calc});var t=new Date().toISOString().slice(0,10);$('a').value=$('b').value=$('c').value=t;calc();window.__date={days:days,addDays:addDays,wd:wd,age:age};`);

def('regex', 'regex-tester', 'Regex tester', '🧪', 'Test regular expressions with live highlighting of matches.', [],
  `<h3>Regex tester</h3><p>/<input id="re" style="width:55%" value="(\\w+)@(\\w+)\\.com">/<input id="fl" style="width:50px" value="g"></p><textarea id="tx" rows="5" style="width:100%">ann@example.com, bob@test.com</textarea><p id="info" class="muted"></p><div id="hl" style="white-space:pre-wrap;font-family:monospace"></div><ol id="m"></ol>`,
  R`var $=function(i){return document.getElementById(i)};
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function matches(src,flags,text){var re=new RegExp(src,flags.indexOf('g')<0?flags+'g':flags),out=[],m;if(text.length>20000)throw new Error('Text is too long (limit 20000 characters)');while((m=re.exec(text))&&out.length<200){out.push({i:m.index,s:m[0],g:m.slice(1)});if(m[0]==='')re.lastIndex++}return out}
function hl(text,ms){var o='',p=0;ms.forEach(function(m){o+=esc(text.slice(p,m.i))+'<mark>'+esc(m.s)+'</mark>';p=m.i+m.s.length});return o+esc(text.slice(p))}
function run(){try{var t=$('tx').value,ms=matches($('re').value,$('fl').value,t);$('info').textContent=ms.length+' match'+(ms.length===1?'':'es');$('hl').innerHTML=hl(t,ms);$('m').innerHTML=ms.slice(0,50).map(function(m){return '<li>'+esc(m.s)+(m.g.length?' - groups: '+esc(m.g.join(' | ')):'')+'</li>'}).join('')}catch(e){$('info').textContent='Error: '+e.message;$('hl').textContent='';$('m').textContent=''}}
['re','fl','tx'].forEach(function(i){$(i).oninput=run});run();window.__re={matches:matches,hl:hl};`);

def('diff', 'text-diff', 'Text compare', '🔀', 'Paste two texts and see which lines were added or removed.', [],
  `<h3>Text compare</h3><div style="display:flex;gap:10px;flex-wrap:wrap"><textarea id="a" rows="8" style="flex:1;min-width:220px" placeholder="Original"></textarea><textarea id="b" rows="8" style="flex:1;min-width:220px" placeholder="New"></textarea></div><p><button class="p" id="go">Compare</button> <span id="sum" class="muted"></span></p><pre id="out" style="white-space:pre-wrap"></pre>`,
  R`var $=function(i){return document.getElementById(i)};
function diff(a,b){var x=a.split('\n'),y=b.split('\n'),n=x.length,m=y.length,L=[],i,j;for(i=0;i<=n;i++){L.push(new Array(m+1).fill(0))}for(i=n-1;i>=0;i--)for(j=m-1;j>=0;j--)L[i][j]=x[i]===y[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);var out=[];i=0;j=0;while(i<n&&j<m){if(x[i]===y[j]){out.push([' ',x[i]]);i++;j++}else if(L[i+1][j]>=L[i][j+1]){out.push(['-',x[i]]);i++}else{out.push(['+',y[j]]);j++}}while(i<n)out.push(['-',x[i++]]);while(j<m)out.push(['+',y[j++]]);return out}
$('go').onclick=function(){var a=$('a').value,b=$('b').value;if(a.length+b.length>60000){$('sum').textContent='Too long (limit 60000 characters)';return}var d=diff(a,b),o=$('out');o.textContent='';var add=0,del=0;d.forEach(function(l){var s=document.createElement('div');s.textContent=l[0]+' '+l[1];if(l[0]==='+'){s.style.background='rgba(60,200,120,.25)';add++}if(l[0]==='-'){s.style.background='rgba(240,80,90,.25)';del++}o.appendChild(s)});$('sum').textContent=add+' added, '+del+' removed'};window.__diff={diff:diff};`);

def('textstats', 'text-stats', 'Text statistics and case', '🔡', 'Count words and characters, change case, sort and clean lines.', ['clipboard'],
  `<h3>Text statistics</h3><textarea id="in" rows="7" style="width:100%" placeholder="Paste text"></textarea><p id="st" class="muted"></p><p id="row"></p><textarea id="out" rows="5" style="width:100%" readonly></textarea><p><button id="copy">Copy result</button></p>`,
  R`var $=function(i){return document.getElementById(i)};
function stats(t){var w=t.trim()?t.trim().split(/\s+/).length:0;return{chars:t.length,words:w,lines:t?t.split('\n').length:0,sentences:(t.match(/[.!?]+(\s|$)/g)||[]).length,minutes:Math.max(0.1,Math.round(w/200*10)/10)}}
function words(t){return t.replace(/([a-z])([A-Z])/g,'$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(x){return x.toLowerCase()})}
var ops=[['UPPER',function(t){return t.toUpperCase()}],['lower',function(t){return t.toLowerCase()}],['Title Case',function(t){return t.toLowerCase().replace(/(^|\s)(\S)/g,function(m,a,b){return a+b.toUpperCase()})}],['camelCase',function(t){var w=words(t);return w.map(function(x,i){return i?x[0].toUpperCase()+x.slice(1):x}).join('')}],['snake_case',function(t){return words(t).join('_')}],['kebab-case',function(t){return words(t).join('-')}],['Sort lines',function(t){return t.split('\n').sort(function(a,b){return a.localeCompare(b)}).join('\n')}],['Unique lines',function(t){var s={};return t.split('\n').filter(function(l){return s[l]?false:(s[l]=1)}).join('\n')}],['Reverse lines',function(t){return t.split('\n').reverse().join('\n')}],['Trim spaces',function(t){return t.split('\n').map(function(l){return l.trim()}).join('\n').replace(/\n{3,}/g,'\n\n')}]];
ops.forEach(function(o){var b=document.createElement('button');b.textContent=o[0];b.onclick=function(){$('out').value=o[1]($('in').value)};$('row').appendChild(b);$('row').appendChild(document.createTextNode(' '))});
$('in').oninput=function(){var s=stats($('in').value);$('st').textContent=s.words+' words, '+s.chars+' characters, '+s.lines+' lines, '+s.sentences+' sentences, about '+s.minutes+' min to read'};$('copy').onclick=function(){aurora.copy($('out').value).then(function(){aurora.toast('Copied')},function(){})};window.__ts={stats:stats,ops:ops,words:words};`);

def('codes', 'code-converters', 'Code converters', '🔣', 'Morse code, binary, hex, decimal and Roman numerals.', [],
  `<h3>Code converters</h3><p><input id="in" style="width:70%" placeholder="Type text or a number"></p><p id="row"></p><textarea id="out" rows="5" style="width:100%" readonly></textarea>`,
  R`var $=function(i){return document.getElementById(i)};
var M={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.'},RM={};Object.keys(M).forEach(function(k){RM[M[k]]=k});
function toMorse(t){return t.toUpperCase().split('').map(function(c){return c===' '?'/':M[c]||''}).filter(Boolean).join(' ')}
function fromMorse(t){return t.trim().split(/\s+/).map(function(c){return c==='/'?' ':RM[c]||'?'}).join('')}
function toRoman(n){n=Math.floor(n);if(!(n>=1&&n<=3999))throw new Error('Roman numerals go from 1 to 3999');var T=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']],o='';T.forEach(function(p){while(n>=p[0]){o+=p[1];n-=p[0]}});return o}
function fromRoman(s){var v={I:1,V:5,X:10,L:50,C:100,D:500,M:1000},t=0,u=s.toUpperCase();for(var i=0;i<u.length;i++){if(!v[u[i]])throw new Error('Not a Roman numeral');var a=v[u[i]],b=v[u[i+1]]||0;t+=a<b?-a:a}if(toRoman(t)!==u)throw new Error('Not a valid Roman numeral');return t}
function toBin(t){return Array.prototype.map.call(new TextEncoder().encode(t),function(b){return b.toString(2).padStart(8,'0')}).join(' ')}
function fromBin(t){var b=t.trim().split(/\s+/).map(function(x){if(!/^[01]{1,8}$/.test(x))throw new Error('Use groups of 0 and 1');return parseInt(x,2)});return new TextDecoder().decode(Uint8Array.from(b))}
function toHex(t){return Array.prototype.map.call(new TextEncoder().encode(t),function(b){return b.toString(16).padStart(2,'0')}).join(' ')}
function bases(n){var v=parseInt(n,/^0x/i.test(n)?16:10);if(isNaN(v))throw new Error('Type a number');return'decimal '+v+'\nbinary  '+v.toString(2)+'\nhex      '+v.toString(16)+'\noctal    '+v.toString(8)}
var ops=[['Text to Morse',toMorse],['Morse to text',fromMorse],['Number to Roman',toRoman],['Roman to number',fromRoman],['Text to binary',toBin],['Binary to text',fromBin],['Text to hex',toHex],['Number bases',bases]];
ops.forEach(function(o){var b=document.createElement('button');b.textContent=o[0];b.onclick=function(){try{$('out').value=String(o[1]($('in').value))}catch(e){$('out').value='Error: '+e.message}};$('row').appendChild(b);$('row').appendChild(document.createTextNode(' '))});window.__cc={toMorse:toMorse,fromMorse:fromMorse,toRoman:toRoman,fromRoman:fromRoman,toBin:toBin,fromBin:fromBin,toHex:toHex,bases:bases};`);

def('lorem', 'placeholder-text', 'Placeholder text', '📄', 'Generate filler paragraphs, sentences or words for designs.', ['clipboard'],
  `<h3>Placeholder text</h3><p><select id="k"><option value="p">Paragraphs</option><option value="s">Sentences</option><option value="w">Words</option></select> <input id="n" type="number" value="3" min="1" max="50" style="width:70px"> <button class="p" id="go">Generate</button> <button id="copy">Copy</button></p><textarea id="out" rows="10" style="width:100%" readonly></textarea>`,
  R`var $=function(i){return document.getElementById(i)},W='lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur'.split(' ');
function rnd(n){return crypto.getRandomValues(new Uint32Array(1))[0]%n}
function words(n){var o=[];for(var i=0;i<n;i++)o.push(W[rnd(W.length)]);return o}
function sentence(){var w=words(6+rnd(8));w[0]=w[0][0].toUpperCase()+w[0].slice(1);return w.join(' ')+'.'}
function gen(kind,n){n=Math.max(1,Math.min(50,n|0));if(kind==='w')return words(n).join(' ');var s=[];for(var i=0;i<n*(kind==='p'?1:1);i++){s.push(kind==='s'?sentence():Array.from({length:3+rnd(3)},sentence).join(' '))}return s.join(kind==='p'?'\n\n':' ')}
$('go').onclick=function(){$('out').value=gen($('k').value,Number($('n').value))};$('copy').onclick=function(){aurora.copy($('out').value).then(function(){aurora.toast('Copied')},function(){})};$('go').onclick();window.__lorem={gen:gen};`);

def('calc', 'scratch-calculator', 'Scratch calculator', '🧮', 'Type a sum and see the answer. Keeps a history. Supports sqrt, sin, pi and more.', ['storage'],
  `<h3>Calculator</h3><p><input id="in" style="width:70%" placeholder="(12 + 8) * 3 / 4" autofocus> <button class="p" id="go">=</button></p><p class="big" id="res"></p><ol id="hist"></ol>`,
  R`var $=function(i){return document.getElementById(i)},hist=[];
function tokenize(s){var t=[],re=/\s*(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|[A-Za-z_]+|[-+*\/^%(),])/y,m;re.lastIndex=0;s=s.trim();var pos=0;while(pos<s.length){re.lastIndex=pos;m=re.exec(s);if(!m)throw new Error('Unexpected "'+s[pos]+'"');t.push(m[1]);pos=re.lastIndex;while(s[pos]===' ')pos++}return t}
var F={sqrt:Math.sqrt,sin:Math.sin,cos:Math.cos,tan:Math.tan,log:Math.log10,ln:Math.log,abs:Math.abs,round:Math.round,floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max},K={pi:Math.PI,e:Math.E};
function evaluate(src){var t=tokenize(src),p=0;function peek(){return t[p]}function next(){return t[p++]}
function expr(){var v=term();while(peek()==='+'||peek()==='-'){var o=next(),r=term();v=o==='+'?v+r:v-r}return v}
function term(){var v=unary();while(peek()==='*'||peek()==='/'||peek()==='%'){var o=next(),r=unary();if(o==='*')v*=r;else if(o==='/'){if(r===0)throw new Error('Cannot divide by zero');v/=r}else v%=r}return v}
function unary(){if(peek()==='-'){next();return-unary()}if(peek()==='+'){next();return unary()}return power()}
function power(){var b=atom();if(peek()==='^'){next();return Math.pow(b,unary())}return b}
function atom(){var x=next();if(x===undefined)throw new Error('The sum ends too early');if(x==='('){var v=expr();if(next()!==')')throw new Error('Missing )');return v}if(/^[\d.]/.test(x))return parseFloat(x);if(/^[A-Za-z_]/.test(x)){var k=x.toLowerCase();if(peek()==='('){next();var a=[];if(peek()!==')'){a.push(expr());while(peek()===','){next();a.push(expr())}}if(next()!==')')throw new Error('Missing )');if(!F[k])throw new Error('Unknown function '+x);return F[k].apply(null,a)}if(k in K)return K[k];throw new Error('Unknown name '+x)}throw new Error('Unexpected "'+x+'"')}
var v=expr();if(p<t.length)throw new Error('Unexpected "'+t[p]+'"');if(!isFinite(v))throw new Error('Not a number');return v}
function go(){var s=$('in').value;if(!s.trim())return;try{var v=Math.round(evaluate(s)*1e10)/1e10;$('res').textContent=String(v);hist.unshift(s+' = '+v);hist=hist.slice(0,20);aurora.storage.set('hist',hist).catch(function(){});draw()}catch(e){$('res').textContent='Error: '+e.message}}
function draw(){$('hist').textContent='';hist.forEach(function(h){var li=document.createElement('li');li.textContent=h;$('hist').appendChild(li)})}
$('go').onclick=go;$('in').onkeydown=function(e){if(e.key==='Enter')go()};aurora.storage.get('hist').then(function(v){if(Array.isArray(v)){hist=v.filter(function(x){return typeof x==='string'}).slice(0,20);draw()}}).catch(function(){});window.__calc={evaluate:evaluate};`);

def('snippets', 'text-snippets', 'Text snippets', '📋', 'Save text you paste often and copy it back with one click.', ['storage', 'clipboard'],
  `<h3>Snippets</h3><p><input id="nm" placeholder="Name" style="width:30%"> <input id="tx" placeholder="Text to save" style="width:45%"> <button class="p" id="add">Save</button></p><div id="list"></div>`,
  R`var $=function(i){return document.getElementById(i)},S=[];
function save(){aurora.storage.set('snips',S).catch(function(){})}
function draw(){var l=$('list');l.textContent='';S.forEach(function(s,i){var p=document.createElement('p');var b=document.createElement('button');b.textContent='Copy';b.className='p';b.onclick=function(){aurora.copy(s.t).then(function(){aurora.toast('Copied '+s.n)},function(){})};var x=document.createElement('button');x.textContent='✕';x.onclick=function(){S.splice(i,1);save();draw()};p.append(b,document.createTextNode(' '),x,document.createTextNode('  '+s.n+': '+s.t.slice(0,80)));l.appendChild(p)})}
$('add').onclick=function(){var n=$('nm').value.trim().slice(0,40),t=$('tx').value.slice(0,2000);if(!n||!t||S.length>=60)return;S.push({n:n,t:t});$('nm').value=$('tx').value='';save();draw()};
aurora.storage.get('snips').then(function(v){if(Array.isArray(v))S=v.filter(function(s){return s&&typeof s.n==='string'&&typeof s.t==='string'}).slice(0,60);draw()}).catch(draw);window.__snip={get:function(){return S}};`);

def('countdown', 'event-countdown', 'Event countdown', '🎯', 'Count the days to birthdays, trips and deadlines.', ['storage'],
  `<h3>Countdowns</h3><p><input id="nm" placeholder="Event" style="width:35%"> <input id="d" type="date"> <button class="p" id="add">Add</button></p><div id="list"></div>`,
  R`var $=function(i){return document.getElementById(i)},E=[];
function pd(s){var p=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return p?Date.UTC(+p[1],+p[2]-1,+p[3]):null}
function left(date,today){return Math.round((pd(date)-pd(today))/86400000)}
function save(){aurora.storage.set('events',E).catch(function(){})}
function draw(){var l=$('list');l.textContent='';var t=new Date().toISOString().slice(0,10);E.slice().sort(function(a,b){return pd(a.d)-pd(b.d)}).forEach(function(e){var n=left(e.d,t),p=document.createElement('p');var x=document.createElement('button');x.textContent='✕';x.onclick=function(){E.splice(E.indexOf(e),1);save();draw()};p.append(document.createTextNode((n>0?n+' days until ':n===0?'Today: ':Math.abs(n)+' days since ')+e.n+' ('+e.d+')  '),x);l.appendChild(p)})}
$('add').onclick=function(){var n=$('nm').value.trim().slice(0,60),d=$('d').value;if(!n||pd(d)===null||E.length>=50)return;E.push({n:n,d:d});$('nm').value='';save();draw()};
aurora.storage.get('events').then(function(v){if(Array.isArray(v))E=v.filter(function(e){return e&&typeof e.n==='string'&&pd(e.d)!==null}).slice(0,50);draw()}).catch(draw);window.__cd={left:left};`);

def('noise', 'focus-noise', 'Focus noise', '🎧', 'White, pink or brown noise to help you concentrate.', [],
  `<h3>Focus noise</h3><p><select id="k"><option value="white">White</option><option value="pink">Pink</option><option value="brown">Brown</option></select> Volume <input id="v" type="range" min="0" max="100" value="30"> <button class="p" id="go">Play</button></p><p class="muted" id="st">Stopped</p>`,
  R`var $=function(i){return document.getElementById(i)},ctx=null,src=null,gain=null;
function fill(kind,data){var last=0,b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;for(var i=0;i<data.length;i++){var w=Math.random()*2-1;if(kind==='white')data[i]=w;else if(kind==='brown'){last=(last+0.02*w)/1.02;data[i]=last*3.5}else{b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.969*b2+w*0.153852;b3=0.8665*b3+w*0.3104856;b4=0.55*b4+w*0.5329522;b5=-0.7616*b5-w*0.016898;data[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;b6=w*0.115926}}}
$('go').onclick=function(){if(src){src.stop();src=null;$('go').textContent='Play';$('st').textContent='Stopped';return}try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();var buf=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate);fill($('k').value,buf.getChannelData(0));src=ctx.createBufferSource();src.buffer=buf;src.loop=true;gain=ctx.createGain();gain.gain.value=$('v').value/100*0.5;src.connect(gain);gain.connect(ctx.destination);src.start();$('go').textContent='Stop';$('st').textContent='Playing '+$('k').value+' noise'}catch(e){$('st').textContent='Sound is not available here'}};
$('v').oninput=function(){if(gain)gain.gain.value=$('v').value/100*0.5};window.__noise={fill:fill};`);

def('tictactoe', 'tic-tac-toe', 'Tic-tac-toe', '❌', 'Play against the computer. It never loses, can you draw?', [],
  `<h3>Tic-tac-toe <span class="muted" id="st">Your move (X)</span></h3><div id="b" style="display:grid;grid-template-columns:repeat(3,70px);gap:6px"></div><p><button class="p" id="new">New game</button></p>`,
  R`var $=function(i){return document.getElementById(i)},B,over;var LN=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function winner(b){for(var i=0;i<8;i++){var l=LN[i];if(b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[0]]===b[l[2]])return b[l[0]]}return b.every(Boolean)?'draw':null}
function minimax(b,p){var w=winner(b);if(w==='O')return{s:1};if(w==='X')return{s:-1};if(w==='draw')return{s:0};var best=null;for(var i=0;i<9;i++)if(!b[i]){b[i]=p;var r=minimax(b,p==='O'?'X':'O');b[i]='';if(best===null||(p==='O'?r.s>best.s:r.s<best.s))best={s:r.s,m:i}}return best}
function best(b){return minimax(b.slice(),'O').m}
function draw(){var d=$('b');d.textContent='';B.forEach(function(v,i){var c=document.createElement('button');c.style.cssText='height:70px;font-size:30px';c.textContent=v;c.onclick=function(){if(over||B[i])return;B[i]='X';var w=winner(B);if(!w){B[best(B)]='O';w=winner(B)}if(w){over=true;$('st').textContent=w==='draw'?'Draw':w==='X'?'You win!':'Computer wins'}draw()};d.appendChild(c)})}
function fresh(){B=Array(9).fill('');over=false;$('st').textContent='Your move (X)';draw()}$('new').onclick=fresh;fresh();window.__ttt={winner:winner,best:best};`);

const LIBRARY = {}; const INFO = [];
const refresh = () => { for (const [key, a] of Object.entries(L)) { if (LIBRARY[key]) continue; LIBRARY[key] = () => pack({ id: a.id, name: a.name, version: '1.0.0', icon: a.icon, description: a.description, author: 'Aurora', permissions: a.permissions }, page(a.body, a.script)); INFO.push({ key, id: a.id, name: a.name, icon: a.icon, description: a.description, permissions: a.permissions }); } };
refresh();
module.exports = { LIBRARY, INFO, L, def, refresh };
