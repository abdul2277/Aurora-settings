/* Third batch: visual and playful add-ons (clocks, animations, music, arcade). */
const lib = require('./addon-library'); const { def } = lib; const R = String.raw;
const CV = (w, h, extra) => `<canvas id="cv" width="${w}" height="${h}" style="width:100%;max-width:${w}px;border-radius:14px;background:#0a0f1c;${extra || ''}"></canvas>`;

def('analogclock', 'analog-clock', 'Analog clock', '🕰️', 'A smooth, beautiful analog clock with the date.', [],
  `<h3>Clock</h3>${CV(300, 300, 'display:block;margin:auto')}<p class="muted" id="d" style="text-align:center"></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d');
function angles(d){var s=d.getSeconds()+d.getMilliseconds()/1000,m=d.getMinutes()+s/60,h=d.getHours()%12+m/60;return{s:s/60*2*Math.PI,m:m/60*2*Math.PI,h:h/12*2*Math.PI}}
function hand(a,len,w,col){g.save();g.translate(150,150);g.rotate(a);g.strokeStyle=col;g.lineWidth=w;g.lineCap='round';g.beginPath();g.moveTo(0,len*0.12);g.lineTo(0,-len);g.stroke();g.restore()}
function draw(){var d=new Date(),a=angles(d),acc=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#4cc2ff';g.clearRect(0,0,300,300);g.strokeStyle=acc;g.lineWidth=3;g.beginPath();g.arc(150,150,138,0,7);g.stroke();for(var i=0;i<60;i++){var t=i/60*2*Math.PI,l=i%5?6:14;g.strokeStyle=i%5?'rgba(255,255,255,.3)':'#fff';g.lineWidth=i%5?1:3;g.beginPath();g.moveTo(150+Math.sin(t)*(130-l),150-Math.cos(t)*(130-l));g.lineTo(150+Math.sin(t)*130,150-Math.cos(t)*130);g.stroke()}hand(a.h,70,6,'#fff');hand(a.m,105,4,'#fff');hand(a.s,118,2,'#ff5c8a');g.fillStyle=acc;g.beginPath();g.arc(150,150,6,0,7);g.fill();document.getElementById('d').textContent=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});requestAnimationFrame(draw)}
draw();window.__clock={angles:angles};`);

def('matrix', 'matrix-rain', 'Matrix rain', '🟩', 'Falling green characters. Pure eye candy.', [],
  `<h3>Matrix rain</h3>${CV(520, 300)}<p><input type="range" id="sp" min="1" max="6" value="3"> <span class="muted">speed</span></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,S=16,cols=Math.floor(W/S),drops=[],chars='ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789ABCDEF'.split('');
function init(n){var d=[];for(var i=0;i<n;i++)d.push(Math.floor(Math.random()*-20));return d}
function advance(drops,rows,rnd){return drops.map(function(y){return y*S>H&&rnd()>0.975?0:y+1})}
drops=init(cols);g.fillStyle='#000';g.fillRect(0,0,W,H);var last=0;
function frame(t){requestAnimationFrame(frame);var gap=220-document.getElementById('sp').value*30;if(t-last<gap)return;last=t;g.fillStyle='rgba(0,0,0,.12)';g.fillRect(0,0,W,H);g.font=S+'px monospace';drops.forEach(function(y,i){if(y>=0){g.fillStyle=y%7===0?'#d8ffd8':'#1fe04a';g.fillText(chars[Math.floor(Math.random()*chars.length)],i*S,y*S)}});drops=advance(drops,H/S,Math.random)}
requestAnimationFrame(frame);window.__mx={init:init,advance:advance};`);

def('starfield', 'starfield', 'Starfield', '🌌', 'Fly through space. Move the slider to change speed.', [],
  `<h3>Starfield</h3>${CV(520, 300)}<p><input type="range" id="sp" min="1" max="20" value="6"> <span class="muted">warp</span></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,stars=[];
function make(n,rnd){var s=[];for(var i=0;i<n;i++)s.push({x:(rnd()-.5)*W,y:(rnd()-.5)*H,z:rnd()*W});return s}
function step(s,speed,rnd){s.forEach(function(p){p.z-=speed;if(p.z<=1){p.x=(rnd()-.5)*W;p.y=(rnd()-.5)*H;p.z=W}});return s}
function project(p){var k=128/p.z;return{x:p.x*k+W/2,y:p.y*k+H/2,r:Math.max(.3,(1-p.z/W)*2.6)}}
stars=make(220,Math.random);
function draw(){requestAnimationFrame(draw);step(stars,Number(document.getElementById('sp').value),Math.random);g.fillStyle='rgba(5,8,20,.35)';g.fillRect(0,0,W,H);stars.forEach(function(p){var q=project(p);if(q.x<0||q.y<0||q.x>W||q.y>H)return;g.fillStyle='rgba(255,255,255,'+(1-p.z/W)+')';g.beginPath();g.arc(q.x,q.y,q.r,0,7);g.fill()})}
draw();window.__star={make:make,step:step,project:project};`);

def('life', 'game-of-life', 'Game of Life', '🧬', 'Conway\'s cellular automaton. Click cells to draw, then press Play.', [],
  `<h3>Game of Life <span class="muted" id="gen">generation 0</span></h3>${CV(480, 300, 'cursor:pointer')}<p><button class="p" id="go">Play</button> <button id="step">Step</button> <button id="rnd">Random</button> <button id="clr">Clear</button></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),C=24,Rw=15,S=20,grid,gen=0,iv=null;
function emptyGrid(){return Array.from({length:Rw},function(){return new Array(C).fill(0)})}
function next(a){var b=emptyGrid();for(var y=0;y<Rw;y++)for(var x=0;x<C;x++){var n=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;var yy=(y+dy+Rw)%Rw,xx=(x+dx+C)%C;n+=a[yy][xx]}b[y][x]=a[y][x]?(n===2||n===3?1:0):(n===3?1:0)}return b}
function draw(){g.clearRect(0,0,480,300);var acc=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#4cc2ff';for(var y=0;y<Rw;y++)for(var x=0;x<C;x++){g.fillStyle=grid[y][x]?acc:'rgba(255,255,255,.05)';g.fillRect(x*S+1,y*S+1,S-2,S-2)}document.getElementById('gen').textContent='generation '+gen}
function tick(){grid=next(grid);gen++;draw()}
cv.onclick=function(e){var r=cv.getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/r.width*C),y=Math.floor((e.clientY-r.top)/r.height*Rw);if(grid[y]&&x>=0&&x<C){grid[y][x]=grid[y][x]?0:1;draw()}};
document.getElementById('go').onclick=function(){if(iv){clearInterval(iv);iv=null;this.textContent='Play'}else{iv=setInterval(tick,150);this.textContent='Pause'}};document.getElementById('step').onclick=tick;document.getElementById('clr').onclick=function(){grid=emptyGrid();gen=0;draw()};document.getElementById('rnd').onclick=function(){grid=grid.map(function(r){return r.map(function(){return Math.random()<.3?1:0})});gen=0;draw()};
grid=emptyGrid();[[1,2],[2,3],[3,1],[3,2],[3,3]].forEach(function(p){grid[p[0]][p[1]]=1});draw();window.__life={next:next,empty:emptyGrid};`);

def('fireworks', 'fireworks', 'Fireworks', '🎆', 'Click anywhere to launch fireworks.', [],
  `<h3>Fireworks</h3>${CV(520, 320, 'cursor:crosshair')}<p class="muted">Click the sky.</p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=320,P=[];
function burst(x,y,n,rnd){var hue=Math.floor(rnd()*360),o=[];for(var i=0;i<n;i++){var a=rnd()*2*Math.PI,v=1+rnd()*3.5;o.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,hue:hue+rnd()*40})}return o}
function update(ps){return ps.map(function(p){return{x:p.x+p.vx,y:p.y+p.vy,vx:p.vx*0.985,vy:p.vy*0.985+0.04,life:p.life-0.012,hue:p.hue}}).filter(function(p){return p.life>0})}
cv.onclick=function(e){var r=cv.getBoundingClientRect();P=P.concat(burst((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H,70,Math.random))};
function frame(){requestAnimationFrame(frame);g.fillStyle='rgba(10,15,28,.25)';g.fillRect(0,0,W,H);P=update(P);P.forEach(function(p){g.fillStyle='hsla('+p.hue+',90%,60%,'+p.life+')';g.beginPath();g.arc(p.x,p.y,2,0,7);g.fill()});if(Math.random()<0.012)P=P.concat(burst(60+Math.random()*(W-120),40+Math.random()*120,50,Math.random))}
frame();window.__fw={burst:burst,update:update};`);

def('spirograph', 'spirograph', 'Spirograph', '🌀', 'Draw beautiful curves by changing the gears.', [],
  `<h3>Spirograph</h3>${CV(360, 360, 'display:block;margin:auto')}<p>Big gear <input type="range" id="R" min="40" max="160" value="110"> Small gear <input type="range" id="r" min="5" max="100" value="37"> Pen <input type="range" id="d" min="5" max="120" value="60"></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d');
function gcd(a,b){return b?gcd(b,a%b):a}
function points(R,r,d,steps){var k=r/gcd(Math.round(R),Math.round(r)),turns=Math.max(1,Math.round(r)/gcd(Math.round(R),Math.round(r))),out=[],T=turns*2*Math.PI;for(var i=0;i<=steps;i++){var t=i/steps*T;out.push([(R-r)*Math.cos(t)+d*Math.cos((R-r)/r*t),(R-r)*Math.sin(t)-d*Math.sin((R-r)/r*t)])}return out}
function draw(){var R=+document.getElementById('R').value,r=+document.getElementById('r').value,d=+document.getElementById('d').value,pts=points(R,r,d,3000),mx=pts.reduce(function(m,p){return Math.max(m,Math.abs(p[0]),Math.abs(p[1]))},1),s=165/mx;g.clearRect(0,0,360,360);var gr=g.createLinearGradient(0,0,360,360);gr.addColorStop(0,'#4cc2ff');gr.addColorStop(1,'#c77dff');g.strokeStyle=gr;g.lineWidth=1.4;g.beginPath();pts.forEach(function(p,i){var x=180+p[0]*s,y=180+p[1]*s;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()}
['R','r','d'].forEach(function(i){document.getElementById(i).oninput=draw});draw();window.__spiro={points:points,gcd:gcd};`);

def('mandelbrot', 'mandelbrot', 'Mandelbrot explorer', '🔭', 'Explore the Mandelbrot set. Click to zoom in, right-click to zoom out.', [],
  `<h3>Mandelbrot <span class="muted" id="info"></span></h3>${CV(420, 280, 'cursor:zoom-in')}<p><button id="reset">Reset view</button></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=420,H=280,view={cx:-0.6,cy:0,w:3.4};
function iter(cr,ci,max){var x=0,y=0,i=0;while(x*x+y*y<=4&&i<max){var t=x*x-y*y+cr;y=2*x*y+ci;x=t;i++}return i}
function draw(){var img=g.createImageData(W,H),max=Math.min(400,80+Math.round(Math.log2(3.4/view.w)*40)),h=view.w*H/W;for(var py=0;py<H;py++)for(var px=0;px<W;px++){var n=iter(view.cx+(px/W-.5)*view.w,view.cy+(py/H-.5)*h,max),o=(py*W+px)*4;if(n>=max){img.data[o]=img.data[o+1]=img.data[o+2]=8}else{var t=n/max;img.data[o]=Math.floor(255*Math.pow(t,.4)*0.6+30);img.data[o+1]=Math.floor(255*Math.pow(t,.7));img.data[o+2]=Math.floor(120+135*Math.sqrt(t))}img.data[o+3]=255}g.putImageData(img,0,0);document.getElementById('info').textContent='zoom x'+(3.4/view.w).toFixed(1)}
function zoomAt(v,px,py,f){var h=v.w*H/W;return{cx:v.cx+(px/W-.5)*v.w,cy:v.cy+(py/H-.5)*h,w:v.w*f}}
function pos(e){var r=cv.getBoundingClientRect();return[(e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H]}
cv.onclick=function(e){var p=pos(e);view=zoomAt(view,p[0],p[1],0.4);draw()};cv.oncontextmenu=function(e){e.preventDefault();var p=pos(e);view=zoomAt(view,p[0],p[1],2.5);draw()};document.getElementById('reset').onclick=function(){view={cx:-0.6,cy:0,w:3.4};draw()};draw();window.__mb={iter:iter,zoomAt:zoomAt};`);

def('piano', 'piano', 'Piano', '🎹', 'Play a piano with your mouse or computer keyboard (A S D F G H J).', [],
  `<h3>Piano</h3><div id="kb" style="display:flex;position:relative;height:150px;user-select:none"></div><p class="muted">Keys A S D F G H J K play the white keys, W E T Y U play the black keys.</p>`,
  R`var ctx=null,K=[['C',0,'a'],['C#',1,'w'],['D',2,'s'],['D#',3,'e'],['E',4,'d'],['F',5,'f'],['F#',6,'t'],['G',7,'g'],['G#',8,'y'],['A',9,'h'],['A#',10,'u'],['B',11,'j'],['C',12,'k']];
function freq(semi){return 261.6256*Math.pow(2,semi/12)}
function play(semi){try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();var o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.value=freq(semi);g.gain.setValueAtTime(.0001,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.4,ctx.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.2);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+1.25)}catch(e){}}
var kb=document.getElementById('kb'),byKey={};
K.forEach(function(k){var black=k[0].indexOf('#')>0,d=document.createElement('div');d.dataset.note=k[0];d.dataset.semi=k[1];d.dataset.key=k[2];d.textContent=k[2].toUpperCase();d.style.cssText=black?'position:absolute;width:30px;height:90px;background:#111;color:#aaa;border-radius:0 0 6px 6px;z-index:2;text-align:center;padding-top:60px;font-size:11px;cursor:pointer;left:'+([1,3,6,8,10].indexOf(k[1])*0+0)+'px':'flex:1;background:#f4f4f4;color:#555;border:1px solid #999;border-radius:0 0 8px 8px;text-align:center;padding-top:110px;cursor:pointer;min-width:40px';d.onmousedown=function(){d.style.filter='brightness(.8)';play(k[1])};d.onmouseup=d.onmouseleave=function(){d.style.filter=''};byKey[k[2]]=d;kb.appendChild(d)});
var blacks=[].slice.call(kb.querySelectorAll('[data-note*="#"]')),whites=[].slice.call(kb.querySelectorAll('div:not([data-note*="#"])'));blacks.forEach(function(b){var idx=whites.findIndex(function(w){return Number(w.dataset.semi)===Number(b.dataset.semi)-1});var w=whites[idx];b.style.left=(w.offsetLeft+w.offsetWidth-15)+'px'});
document.addEventListener('keydown',function(e){var d=byKey[e.key.toLowerCase()];if(d&&!e.repeat){d.onmousedown()}});document.addEventListener('keyup',function(e){var d=byKey[e.key.toLowerCase()];if(d)d.onmouseup()});window.__piano={freq:freq,K:K};`);

def('drumpad', 'drum-pad', 'Drum pad', '🥁', 'Tap pads (or keys 1-8) to make drum sounds.', [],
  `<h3>Drum pad</h3><div id="pads" style="display:grid;grid-template-columns:repeat(4,90px);gap:10px"></div><p class="muted">Keys 1 to 8</p>`,
  R`var ctx=null,PADS=[['Kick',{t:'kick'}],['Snare',{t:'noise',f:1800,d:.15}],['Hat',{t:'noise',f:7000,d:.05}],['Open hat',{t:'noise',f:6000,d:.3}],['Tom',{t:'tone',f:140,d:.25}],['Clap',{t:'noise',f:1200,d:.1}],['Bell',{t:'tone',f:880,d:.5}],['Zap',{t:'sweep'}]];
function spec(i){return PADS[i]?PADS[i][1]:null}
function hit(i){var s=spec(i);if(!s)return;try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();var t=ctx.currentTime,g=ctx.createGain();g.connect(ctx.destination);if(s.t==='kick'||s.t==='sweep'||s.t==='tone'){var o=ctx.createOscillator();o.connect(g);o.type=s.t==='tone'?'sine':'sine';var f0=s.t==='kick'?150:s.t==='sweep'?1200:s.f,f1=s.t==='kick'?40:s.t==='sweep'?100:s.f,d=s.t==='tone'?s.d:.3;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+d);g.gain.setValueAtTime(.8,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.start(t);o.stop(t+d)}else{var b=ctx.createBuffer(1,ctx.sampleRate*s.d,ctx.sampleRate),a=b.getChannelData(0);for(var k=0;k<a.length;k++)a[k]=Math.random()*2-1;var n=ctx.createBufferSource();n.buffer=b;var fl=ctx.createBiquadFilter();fl.type='highpass';fl.frequency.value=s.f;n.connect(fl);fl.connect(g);g.gain.setValueAtTime(.7,t);g.gain.exponentialRampToValueAtTime(.001,t+s.d);n.start(t)}}catch(e){}}
var pads=document.getElementById('pads');PADS.forEach(function(p,i){var b=document.createElement('button');b.textContent=(i+1)+'  '+p[0];b.style.cssText='height:90px';b.onmousedown=function(){b.classList.add('p');hit(i);setTimeout(function(){b.classList.remove('p')},120)};b.dataset.pad=i;pads.appendChild(b)});
document.addEventListener('keydown',function(e){var i=Number(e.key)-1;if(i>=0&&i<8&&!e.repeat)document.querySelector('[data-pad="'+i+'"]').onmousedown()});window.__drum={spec:spec,count:PADS.length};`);

def('metronome', 'metronome', 'Metronome', '🎼', 'Keep time with a steady click and a flashing beat.', [],
  `<h3>Metronome</h3><div class="big" id="bpm">100</div><p><input type="range" id="r" min="30" max="240" value="100"> <button class="p" id="go">Start</button> Beats per bar <select id="bar"><option>2</option><option>3</option><option selected>4</option><option>6</option></select></p><div id="dots" style="display:flex;gap:10px"></div>`,
  R`var $=function(i){return document.getElementById(i)},ctx=null,iv=null,beat=0;
function interval(bpm){return 60000/Math.max(30,Math.min(240,bpm))}
function accent(beat,bar){return beat%bar===0}
function click(acc){try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();var o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=acc?1500:900;g.gain.setValueAtTime(.4,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.06);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.07)}catch(e){}}
function dots(){var b=Number($('bar').value),d=$('dots');d.textContent='';for(var i=0;i<b;i++){var x=document.createElement('div');x.style.cssText='width:22px;height:22px;border-radius:50%;background:rgba(128,128,128,.35)';x.dataset.i=i;d.appendChild(x)}}
function tick(){var b=Number($('bar').value),i=beat%b;click(accent(beat,b));[].forEach.call($('dots').children,function(x,k){x.style.background=k===i?(i===0?'#ff5c8a':'var(--accent)'):'rgba(128,128,128,.35)'});beat++}
$('r').oninput=function(){$('bpm').textContent=$('r').value;if(iv){clearInterval(iv);iv=setInterval(tick,interval(+$('r').value))}};$('bar').onchange=function(){beat=0;dots()};
$('go').onclick=function(){if(iv){clearInterval(iv);iv=null;$('go').textContent='Start'}else{beat=0;tick();iv=setInterval(tick,interval(+$('r').value));$('go').textContent='Stop'}};dots();window.__metro={interval:interval,accent:accent};`);

def('pong', 'pong', 'Pong', '🏓', 'Beat the computer paddle. Move the mouse or use the arrow keys.', [],
  `<h3>Pong <span class="muted" id="sc">0 - 0</span></h3>${CV(480, 300, 'cursor:none')}<p><button class="p" id="go">Start</button></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=480,H=300,PH=60,st,run=false,mouseY=null,keyDir=0;
function fresh(){return{by:150,bx:240,vx:4,vy:2.4,py:120,cy:120,ps:0,cs:0}}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
function step(s,py){s.py=clamp(py,0,H-PH);var target=s.by-PH/2;s.cy+=clamp(target-s.cy,-3.2,3.2);s.cy=clamp(s.cy,0,H-PH);s.bx+=s.vx;s.by+=s.vy;if(s.by<4||s.by>H-4){s.vy=-s.vy;s.by=clamp(s.by,4,H-4)}
if(s.vx<0&&s.bx<18&&s.by>=s.py&&s.by<=s.py+PH){s.vx=Math.min(8,-s.vx*1.06);s.vy+=((s.by-(s.py+PH/2))/PH)*3;s.bx=18}
else if(s.vx>0&&s.bx>W-18&&s.by>=s.cy&&s.by<=s.cy+PH){s.vx=-Math.min(8,s.vx*1.06);s.vy+=((s.by-(s.cy+PH/2))/PH)*2;s.bx=W-18}
if(s.bx<0){s.cs++;s.bx=240;s.by=150;s.vx=4;s.vy=2.4}else if(s.bx>W){s.ps++;s.bx=240;s.by=150;s.vx=-4;s.vy=-2.4}return s}
function draw(){g.clearRect(0,0,W,H);g.fillStyle='rgba(255,255,255,.15)';for(var y=0;y<H;y+=20)g.fillRect(W/2-1,y,2,10);g.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#4cc2ff';g.fillRect(8,st.py,8,PH);g.fillRect(W-16,st.cy,8,PH);g.fillStyle='#fff';g.beginPath();g.arc(st.bx,st.by,6,0,7);g.fill();document.getElementById('sc').textContent=st.ps+' - '+st.cs}
function loop(){if(run){var py=mouseY!==null?mouseY-PH/2:st.py+keyDir*6;step(st,py);draw()}requestAnimationFrame(loop)}
cv.onmousemove=function(e){var r=cv.getBoundingClientRect();mouseY=(e.clientY-r.top)/r.height*H};document.addEventListener('keydown',function(e){if(e.key==='ArrowUp'){keyDir=-1;mouseY=null;e.preventDefault()}if(e.key==='ArrowDown'){keyDir=1;mouseY=null;e.preventDefault()}});document.addEventListener('keyup',function(){keyDir=0});
document.getElementById('go').onclick=function(){st=fresh();run=true;this.textContent='Restart'};st=fresh();draw();loop();window.__pong={step:step,fresh:fresh};`);

def('particles', 'particle-playground', 'Particle playground', '✨', 'Move your mouse to paint with glowing particles.', [],
  `<h3>Particles</h3>${CV(520, 300, 'cursor:none')}<p><select id="mode"><option value="rainbow">Rainbow</option><option value="fire">Fire</option><option value="ice">Ice</option></select></p>`,
  R`var cv=document.getElementById('cv'),g=cv.getContext('2d'),W=520,H=300,P=[],mx=-50,my=-50,hue=0;
function spawn(x,y,mode,rnd,hue){var o=[];for(var i=0;i<4;i++){var a=rnd()*2*Math.PI,v=rnd()*1.6;o.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-(mode==='fire'?1.2:0),life:1,h:mode==='fire'?10+rnd()*40:mode==='ice'?190+rnd()*40:hue})}return o}
function update(ps){return ps.map(function(p){return{x:p.x+p.vx,y:p.y+p.vy,vx:p.vx*.98,vy:p.vy*.98+0.01,life:p.life-0.018,h:p.h}}).filter(function(p){return p.life>0}).slice(-900)}
cv.onmousemove=function(e){var r=cv.getBoundingClientRect();mx=(e.clientX-r.left)/r.width*W;my=(e.clientY-r.top)/r.height*H;P=P.concat(spawn(mx,my,document.getElementById('mode').value,Math.random,hue));hue=(hue+4)%360};
function frame(){requestAnimationFrame(frame);g.fillStyle='rgba(10,15,28,.2)';g.fillRect(0,0,W,H);g.globalCompositeOperation='lighter';P=update(P);P.forEach(function(p){g.fillStyle='hsla('+p.h+',90%,60%,'+p.life*.8+')';g.beginPath();g.arc(p.x,p.y,3+p.life*3,0,7);g.fill()});g.globalCompositeOperation='source-over'}
frame();window.__part={spawn:spawn,update:update};`);

lib.refresh();
module.exports = {};
