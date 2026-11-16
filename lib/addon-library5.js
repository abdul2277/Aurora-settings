/* Fifth batch: games, tools and eye candy. Everything runs inside the add-on sandbox. */
const lib = require('./addon-library'); const { def } = lib; const R = String.raw;

def('snake', 'snake-game', 'Snake', '🐍', 'The classic. Arrow keys or WASD. Your best score is remembered.', ['storage'],
  `<h3>Snake</h3><p>Score <b id="sc">0</b> &nbsp; Best <b id="bs">0</b></p><canvas id="c" width="320" height="320" style="background:#0b1020;border-radius:12px;display:block;margin:auto"></canvas><p class="muted" style="text-align:center">Arrow keys or WASD. Press Space to restart.</p>`,
  R`var $=function(i){return document.getElementById(i)},cv=$('c'),x=cv.getContext('2d'),N=16,S=20,sn,dir,nx,food,score,best=0,iv,dead;
function rf(){food={x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)};for(var i=0;i<sn.length;i++)if(sn[i].x===food.x&&sn[i].y===food.y)return rf()}
function reset(){sn=[{x:8,y:8},{x:7,y:8},{x:6,y:8}];dir={x:1,y:0};nx=dir;score=0;dead=false;$('sc').textContent=0;rf();clearInterval(iv);iv=setInterval(step,110)}
function step(){if(dead)return;dir=nx;var h={x:sn[0].x+dir.x,y:sn[0].y+dir.y};
 if(h.x<0||h.y<0||h.x>=N||h.y>=N)return die();for(var i=0;i<sn.length;i++)if(sn[i].x===h.x&&sn[i].y===h.y)return die();
 sn.unshift(h);if(h.x===food.x&&h.y===food.y){score++;$('sc').textContent=score;rf()}else sn.pop();draw()}
function die(){dead=true;if(score>best){best=score;$('bs').textContent=best;aurora.storage.set('best',best).catch(function(){})}x.fillStyle='rgba(0,0,0,.6)';x.fillRect(0,0,320,320);x.fillStyle='#fff';x.font='22px sans-serif';x.textAlign='center';x.fillText('Game over. Space = again',160,165)}
function draw(){x.fillStyle='#0b1020';x.fillRect(0,0,320,320);x.fillStyle='#ff5d8f';x.fillRect(food.x*S+2,food.y*S+2,S-4,S-4);for(var i=0;i<sn.length;i++){x.fillStyle=i?'#38d9a9':'#a5f3d6';x.fillRect(sn[i].x*S+1,sn[i].y*S+1,S-2,S-2)}}
document.addEventListener('keydown',function(e){var k=e.key,m={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]}[k];
 if(m){if(m[0]!==-dir.x||m[1]!==-dir.y)nx={x:m[0],y:m[1]};e.preventDefault()}else if(k===' '){reset();e.preventDefault()}});
aurora.storage.get('best').then(function(v){best=Number(v)||0;$('bs').textContent=best}).catch(function(){});reset();draw();`);

def('reaction', 'reaction-test', 'Reaction time test', '⚡', 'Click as soon as the box turns green. Measures your reaction in milliseconds.', ['storage'],
  `<h3>Reaction time</h3><div id="box" style="height:180px;border-radius:16px;background:#3b3f5c;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;user-select:none">Click to start</div><p>Last: <b id="last">-</b> ms &nbsp; Best: <b id="best">-</b> ms &nbsp; Average: <b id="avg">-</b> ms</p>`,
  R`var $=function(i){return document.getElementById(i)},b=$('box'),st='idle',t0=0,to=null,all=[],best=0;
function set(c,t){b.style.background=c;b.textContent=t}
b.onclick=function(){
 if(st==='idle'){st='wait';set('#8a3b3b','Wait for green...');to=setTimeout(function(){st='go';t0=performance.now();set('#2f9e5b','CLICK NOW!')},1000+Math.random()*3000)}
 else if(st==='wait'){clearTimeout(to);st='idle';set('#b8862b','Too early! Click to try again')}
 else if(st==='go'){var ms=Math.round(performance.now()-t0);all.push(ms);st='idle';set('#3b3f5c',ms+' ms. Click to try again');$('last').textContent=ms;
  if(!best||ms<best){best=ms;$('best').textContent=ms;aurora.storage.set('best',ms).catch(function(){})}
  $('avg').textContent=Math.round(all.reduce(function(a,c){return a+c},0)/all.length)}};
aurora.storage.get('best').then(function(v){if(v){best=Number(v);$('best').textContent=best}}).catch(function(){});`);

def('typing', 'typing-speed', 'Typing speed test', '⌨️', 'Type the sentence and see your words per minute and accuracy.', [],
  `<h3>Typing speed</h3><p id="txt" style="font-size:20px;line-height:1.6;background:rgba(255,255,255,.06);padding:14px;border-radius:12px"></p><textarea id="in" rows="3" style="width:100%;box-sizing:border-box" placeholder="Start typing here..."></textarea><p>Speed <b id="wpm">0</b> WPM &nbsp; Accuracy <b id="acc">100</b>% &nbsp; <button id="new">New sentence</button></p>`,
  R`var $=function(i){return document.getElementById(i)},S=['The quick brown fox jumps over the lazy dog while the sun sets slowly behind the hills.','A calm mind and a clean desktop make hard work feel a little bit lighter every day.','Good software is quiet: it does its job well and stays out of the way of the person using it.','Practice a little every day and you will be surprised how far you can go in a single month.'],cur='',t0=0;
function pick(){cur=S[Math.floor(Math.random()*S.length)];$('txt').textContent=cur;$('in').value='';t0=0;$('wpm').textContent=0;$('acc').textContent=100;$('in').focus()}
$('new').onclick=pick;
$('in').oninput=function(){var v=$('in').value;if(!t0&&v)t0=Date.now();var ok=0;for(var i=0;i<v.length;i++)if(v[i]===cur[i])ok++;
 var mins=Math.max((Date.now()-t0)/60000,1/600);$('wpm').textContent=Math.round(ok/5/mins);$('acc').textContent=v.length?Math.round(ok*100/v.length):100;
 if(v.length>=cur.length)$('in').blur()};pick();`);

def('breathe', 'breathing-guide', 'Breathing guide', '🫁', 'A calm 4-7-8 breathing circle to relax. Great between work sessions.', [],
  `<h3>Breathe</h3><div style="height:240px;display:flex;align-items:center;justify-content:center"><div id="o" style="width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,#7dd3fc,#6366f1);transition:all 4s ease-in-out;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px">Ready</div></div><p style="text-align:center"><button class="p" id="go">Start</button></p>`,
  R`var $=function(i){return document.getElementById(i)},o=$('o'),on=false,to;
function ph(n){if(!on)return;var P=[['Breathe in',4,200],['Hold',7,200],['Breathe out',8,80]][n%3];o.textContent=P[0];o.style.transition='all '+P[1]+'s ease-in-out';if(n%3===0||n%3===1){o.style.width=o.style.height='200px'}else{o.style.width=o.style.height='80px'}
 if(n%3===1)o.style.transition='none';to=setTimeout(function(){ph(n+1)},P[1]*1000)}
$('go').onclick=function(){on=!on;$('go').textContent=on?'Stop':'Start';clearTimeout(to);if(on)ph(0);else{o.textContent='Ready';o.style.width=o.style.height='80px'}};`);

def('palette', 'palette-maker', 'Colour palette maker', '🎨', 'Generate nice colour palettes. Click a colour to copy its hex code.', ['clipboard'],
  `<h3>Palettes</h3><div id="p" style="display:flex;height:120px;border-radius:14px;overflow:hidden"></div><p><button class="p" id="g">New palette</button> <span class="muted" id="m">Click a colour to copy</span></p>`,
  R`var $=function(i){return document.getElementById(i)};
function h2(h,s,l){s/=100;l/=100;var a=s*Math.min(l,1-l),f=function(n){var k=(n+h/30)%12,c=l-a*Math.max(Math.min(k-3,9-k,1),-1);return Math.round(255*c).toString(16).padStart(2,'0')};return '#'+f(0)+f(8)+f(4)}
function gen(){var base=Math.floor(Math.random()*360),p=$('p');p.textContent='';for(var i=0;i<5;i++){var c=h2((base+i*(20+Math.floor(Math.random()*20)))%360,55+Math.random()*30,35+i*9);var d=document.createElement('div');d.style.cssText='flex:1;background:'+c+';display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;font-size:12px;color:#fff;cursor:pointer;text-shadow:0 1px 3px #0008';d.textContent=c;d.onclick=(function(cc){return function(){aurora.clipboard.write(cc).then(function(){$('m').textContent='Copied '+cc}).catch(function(){$('m').textContent='Could not copy'})}})(c);p.appendChild(d)}}
$('g').onclick=gen;gen();`);

def('passmaker2', 'password-maker', 'Password maker', '🔐', 'Make strong random passwords and copy them. Nothing is saved or sent anywhere.', ['clipboard'],
  `<h3>Password maker</h3><p><input id="o" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:18px" readonly></p><p>Length <input id="n" type="range" min="8" max="64" value="20"> <b id="nv">20</b></p><p><label><input type="checkbox" id="sy" checked> symbols</label> <label><input type="checkbox" id="nu" checked> numbers</label></p><p><button class="p" id="g">New</button> <button id="cp">Copy</button> <span class="muted" id="m"></span></p>`,
  R`var $=function(i){return document.getElementById(i)};
function gen(){var set='abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';if($('nu').checked)set+='23456789';if($('sy').checked)set+='!@#$%^&*-_=+?';var n=Number($('n').value),a=new Uint32Array(n);crypto.getRandomValues(a);var s='';for(var i=0;i<n;i++)s+=set[a[i]%set.length];$('o').value=s;$('nv').textContent=n}
$('g').onclick=gen;$('n').oninput=gen;$('sy').onchange=gen;$('nu').onchange=gen;
$('cp').onclick=function(){aurora.clipboard.write($('o').value).then(function(){$('m').textContent='Copied'}).catch(function(){$('m').textContent='Could not copy'})};gen();`);

def('wheel', 'decision-wheel', 'Decision wheel', '🎡', 'Cannot decide? Type your options and spin the wheel.', [],
  `<h3>Decision wheel</h3><textarea id="opt" rows="4" style="width:100%;box-sizing:border-box">Pizza\nBurger\nSushi\nShawarma</textarea><p><button class="p" id="sp">Spin</button> <b id="res" style="font-size:22px"></b></p><canvas id="c" width="300" height="300" style="display:block;margin:auto"></canvas>`,
  R`var $=function(i){return document.getElementById(i)},cv=$('c'),x=cv.getContext('2d'),ang=0,sp=false,C=['#f97316','#22c55e','#3b82f6','#e11d48','#a855f7','#eab308','#14b8a6','#ec4899'];
function items(){return $('opt').value.split('\n').map(function(s){return s.trim()}).filter(Boolean).slice(0,16)}
function draw(){var it=items(),n=Math.max(it.length,1),r=140;x.clearRect(0,0,300,300);for(var i=0;i<n;i++){var a0=ang+i*2*Math.PI/n,a1=a0+2*Math.PI/n;x.beginPath();x.moveTo(150,150);x.arc(150,150,r,a0,a1);x.fillStyle=C[i%C.length];x.fill();x.save();x.translate(150,150);x.rotate((a0+a1)/2);x.fillStyle='#fff';x.font='14px sans-serif';x.textAlign='right';x.fillText((it[i]||'').slice(0,14),r-10,5);x.restore()}x.fillStyle='#fff';x.beginPath();x.moveTo(150,2);x.lineTo(140,-6);x.lineTo(160,-6);x.fill()}
$('opt').oninput=draw;
$('sp').onclick=function(){if(sp)return;var it=items();if(it.length<2){$('res').textContent='Add 2+ options';return}sp=true;var v=0.4+Math.random()*0.3,iv=setInterval(function(){ang+=v;v*=0.985;draw();if(v<0.002){clearInterval(iv);sp=false;var n=it.length,t=((-Math.PI/2-ang)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);$('res').textContent='→ '+it[Math.floor(t/(2*Math.PI/n))%n]}},16)};draw();`);

def('baseconv2', 'text-base-converter', 'Number and text converter', '🔢', 'Convert between decimal, binary, hex, and Base64 text instantly.', ['clipboard'],
  `<h3>Converter</h3><p>Number <input id="d" type="text" placeholder="255" style="width:100%;box-sizing:border-box"></p><p>Binary <input id="b" style="width:100%;box-sizing:border-box;font-family:monospace"></p><p>Hex <input id="h" style="width:100%;box-sizing:border-box;font-family:monospace"></p><hr><p>Text <input id="t" placeholder="Hello" style="width:100%;box-sizing:border-box"></p><p>Base64 <input id="b64" style="width:100%;box-sizing:border-box;font-family:monospace"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function fromN(n,skip){if(!isFinite(n)||n<0||n>Number.MAX_SAFE_INTEGER){return}if(skip!=='d')$('d').value=String(n);if(skip!=='b')$('b').value=n.toString(2);if(skip!=='h')$('h').value=n.toString(16).toUpperCase()}
$('d').oninput=function(){fromN(parseInt($('d').value,10),'d')};$('b').oninput=function(){fromN(parseInt($('b').value,2),'b')};$('h').oninput=function(){fromN(parseInt($('h').value,16),'h')};
function enc(s){try{return btoa(unescape(encodeURIComponent(s)))}catch(e){return ''}}function dec(s){try{return decodeURIComponent(escape(atob(s)))}catch(e){return ''}}
$('t').oninput=function(){$('b64').value=enc($('t').value)};$('b64').oninput=function(){$('t').value=dec($('b64').value)};window.__conv={enc:enc,dec:dec};`);

def('lava', 'lava-lamp', 'Lava lamp', '🫧', 'Soft glowing blobs that drift around. Pure relaxation.', [],
  `<canvas id="c" width="420" height="300" style="width:100%;border-radius:14px;background:#12071f"></canvas>`,
  R`var cv=document.getElementById('c'),x=cv.getContext('2d'),B=[];for(var i=0;i<7;i++)B.push({x:Math.random()*420,y:Math.random()*300,vx:(Math.random()-.5)*1.2,vy:(Math.random()-.5)*1.2,r:40+Math.random()*40,h:Math.floor(Math.random()*360)});
function f(){x.fillStyle='rgba(18,7,31,.18)';x.fillRect(0,0,420,300);x.globalCompositeOperation='lighter';for(var i=0;i<B.length;i++){var b=B[i];b.x+=b.vx;b.y+=b.vy;if(b.x<0||b.x>420)b.vx*=-1;if(b.y<0||b.y>300)b.vy*=-1;b.h=(b.h+.3)%360;var g=x.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);g.addColorStop(0,'hsla('+b.h+',90%,60%,.55)');g.addColorStop(1,'hsla('+b.h+',90%,60%,0)');x.fillStyle=g;x.beginPath();x.arc(b.x,b.y,b.r,0,7);x.fill()}x.globalCompositeOperation='source-over';requestAnimationFrame(f)}f();`);

def('gradmaker2', 'gradient-maker', 'Gradient maker', '🌈', 'Pick two colours and an angle, then copy the CSS gradient.', ['clipboard'],
  `<h3>Gradient</h3><div id="pv" style="height:140px;border-radius:14px"></div><p><input type="color" id="a" value="#7c3aed"> <input type="color" id="b" value="#06b6d4"> Angle <input type="range" id="r" min="0" max="360" value="135"> <b id="rv">135</b>°</p><p><code id="css"></code></p><p><button class="p" id="cp">Copy CSS</button> <span class="muted" id="m"></span></p>`,
  R`var $=function(i){return document.getElementById(i)};
function up(){var c='linear-gradient('+$('r').value+'deg, '+$('a').value+', '+$('b').value+')';$('pv').style.background=c;$('css').textContent='background: '+c+';';$('rv').textContent=$('r').value}
['a','b','r'].forEach(function(k){$(k).oninput=up});$('cp').onclick=function(){aurora.clipboard.write($('css').textContent).then(function(){$('m').textContent='Copied'}).catch(function(){$('m').textContent='Could not copy'})};up();`);

def('daysleft', 'days-countdown', 'Days countdown', '📅', 'Count the days until a date you care about, like a trip or an exam. Remembers it.', ['storage'],
  `<h3>Countdown</h3><p><input id="n" placeholder="Name (e.g. Trip)" style="width:60%"> <input id="d" type="date"> <button class="p" id="s">Save</button></p><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)},L=[];
function show(){var o=$('o');o.textContent='';L.forEach(function(e,i){var days=Math.ceil((new Date(e.d+'T00:00:00')-new Date())/864e5),p=document.createElement('p');p.style.fontSize='20px';p.textContent=e.n+': '+(days>0?days+' days left':days===0?'today!':Math.abs(days)+' days ago')+' ';var b=document.createElement('button');b.textContent='Remove';b.onclick=function(){L.splice(i,1);save();show()};p.appendChild(b);o.appendChild(p)})}
function save(){aurora.storage.set('list',L).catch(function(){})}
$('s').onclick=function(){if(!$('n').value||!$('d').value)return;L.push({n:$('n').value.slice(0,40),d:$('d').value});$('n').value='';save();show()};
aurora.storage.get('list').then(function(v){if(Array.isArray(v))L=v;show()}).catch(function(){show()});`);
