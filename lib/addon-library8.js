/* Eighth batch: network, developer, planning and everyday tools. Pure logic is exposed on window.__x for tests. */
const { def } = require('./addon-library'); const R = String.raw;

def('x8_bandwidth', 'download-time-calculator', 'Download time calculator', '📶', 'How long will a download take? Convert Mbps to MB/s and estimate the wait for any file size.', [],
  `<h3>Download time calculator</h3><p>File size <input id="s" type="number" value="4" min="0" step="any" style="width:90px"> <select id="u"><option value="1">MB</option><option value="1024" selected>GB</option><option value="1048576">TB</option></select></p><p>Speed <input id="v" type="number" value="100" min="0" step="any" style="width:90px"> Mbps <span class="muted" id="mb"></span></p><p class="big" id="out"></p><p class="muted">Real speeds are usually 5-15% lower than the plan because of protocol overhead. 8 bits = 1 byte; 1 GB = 1,024 MB here.</p>`,
  R`var $=function(i){return document.getElementById(i)};
function seconds(mb,mbps){return mbps>0?mb*8/mbps*1.0:Infinity}
function toMBps(mbps){return mbps/8}
function fmt(s){if(!isFinite(s))return'never (speed is 0)';if(s<1)return'under a second';var h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=Math.round(s%60);var p=[];if(h)p.push(h+' h');if(m)p.push(m+' min');if(x||!p.length)p.push(x+' s');return p.join(' ')}
function upd(){var mb=Math.max(0,Number($('s').value)||0)*Number($('u').value),v=Math.max(0,Number($('v').value)||0);$('mb').textContent='= '+toMBps(v).toFixed(2)+' MB/s';$('out').textContent=fmt(seconds(mb,v))}
['s','u','v'].forEach(function(i){$(i).oninput=upd;$(i).onchange=upd});upd();window.__bw={seconds:seconds,toMBps:toMBps,fmt:fmt};`);

def('x8_cron', 'cron-explainer', 'Cron explainer', '⏰', 'Paste a cron schedule and see it in plain words, plus the next five times it will run.', [],
  `<h3>Cron explainer</h3><p><input id="c" value="*/15 9-17 * * 1-5" style="width:60%" placeholder="minute hour day month weekday"></p><p id="w" class="big"></p><div id="n"></div><p class="muted">Five fields: minute (0-59), hour (0-23), day of month (1-31), month (1-12), weekday (0-6, Sunday = 0). Supports * , - and /. Times are your local time.</p>`,
  R`var $=function(i){return document.getElementById(i)};
var RANGE=[[0,59],[0,23],[1,31],[1,12],[0,6]],NAMES=['minute','hour','day of month','month','weekday'];
function field(s,lo,hi){var out={};s.split(',').forEach(function(p){var m=/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(p);if(!m)throw new Error('Cannot read "'+p+'"');var step=m[2]?Number(m[2]):1;if(step<1)throw new Error('Step must be 1 or more');var a,b;if(m[1]==='*'){a=lo;b=hi}else if(m[1].indexOf('-')>-1){var r=m[1].split('-');a=Number(r[0]);b=Number(r[1])}else{a=Number(m[1]);b=m[2]?hi:a}
if(a<lo||b>hi||a>b)throw new Error('"'+p+'" is outside '+lo+'-'+hi);for(var v=a;v<=b;v+=step)out[v]=1});return out}
function parse(expr){var f=String(expr).trim().split(/\s+/);if(f.length!==5)throw new Error('A cron schedule has exactly 5 fields');return f.map(function(x,i){return{raw:x,set:field(x,RANGE[i][0],RANGE[i][1])}})}
function matches(c,d){var dom=c[2].raw!=='*',dow=c[4].raw!=='*';var dm=c[2].set[d.getDate()],wm=c[4].set[d.getDay()];var dayOk=dom&&dow?(dm||wm):(dom?dm:dow?wm:true);return c[0].set[d.getMinutes()]&&c[1].set[d.getHours()]&&c[3].set[d.getMonth()+1]&&dayOk}
function next(expr,from,count){var c=parse(expr),d=new Date(from.getTime());d.setSeconds(0,0);d.setMinutes(d.getMinutes()+1);var out=[],n=0;while(out.length<count&&n<600000){if(matches(c,d))out.push(new Date(d.getTime()));d.setMinutes(d.getMinutes()+1);n++}return out}
function words(expr){var c=parse(expr),p=[];c.forEach(function(f,i){if(f.raw==='*')return;p.push(NAMES[i]+' '+f.raw)});return p.length?'Runs when '+p.join(', '):'Runs every minute'}
function upd(){var w=$('w'),n=$('n');n.textContent='';try{w.textContent=words($('c').value);next($('c').value,new Date(),5).forEach(function(d){var e=document.createElement('div');e.textContent=d.toLocaleString();n.appendChild(e)});if(!n.firstChild)n.textContent='It does not run in the next year (check the day and month).'}catch(e){w.textContent=e.message}}
$('c').oninput=upd;upd();window.__cron={parse:parse,next:next,words:words};`);

def('x8_tipsplit', 'tip-and-split-calculator', 'Tip and split calculator', '🍽️', 'Add a tip to the bill and split it between friends, with an option to round up.', [],
  `<h3>Tip and split</h3><p>Bill <input id="b" type="number" value="84.50" min="0" step="0.01" style="width:100px"> Tip <input id="t" type="number" value="10" min="0" step="1" style="width:60px">% People <input id="p" type="number" value="4" min="1" max="50" style="width:60px"></p><p><label><input type="checkbox" id="r"> Round each share up to a whole number</label></p><p class="big" id="o"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function split(bill,tipPct,people,roundUp){people=Math.max(1,Math.floor(people)||1);var tip=bill*tipPct/100,total=bill+tip,each=total/people;if(roundUp)each=Math.ceil(each-1e-9);return{tip:tip,total:roundUp?each*people:total,each:each,people:people}}
function m(v){return v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function upd(){var r=split(Math.max(0,Number($('b').value)||0),Math.max(0,Number($('t').value)||0),Number($('p').value),$('r').checked);$('o').textContent='Each pays '+m(r.each)+'  ·  tip '+m(r.tip)+'  ·  total '+m(r.total)}
['b','t','p','r'].forEach(function(i){$(i).oninput=upd;$(i).onchange=upd});upd();window.__tip={split:split};`);

def('x8_case', 'text-case-converter', 'Text case converter', '🔠', 'Turn text into camelCase, snake_case, kebab-case, Title Case, UPPER and more.', ['clipboard'],
  `<h3>Text case converter</h3><textarea id="i" rows="3" placeholder="Type or paste text">hello world from Aurora</textarea><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)};
function words(s){return String(s).replace(/([a-z\d])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean)}
var cap=function(w){return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()};
var C=[['camelCase',function(w){return w.map(function(x,i){return i?cap(x):x.toLowerCase()}).join('')}],['PascalCase',function(w){return w.map(cap).join('')}],['snake_case',function(w){return w.map(function(x){return x.toLowerCase()}).join('_')}],['CONSTANT_CASE',function(w){return w.map(function(x){return x.toUpperCase()}).join('_')}],['kebab-case',function(w){return w.map(function(x){return x.toLowerCase()}).join('-')}],['Title Case',function(w){return w.map(cap).join(' ')}],['Sentence case',function(w){var s=w.map(function(x){return x.toLowerCase()}).join(' ');return s.charAt(0).toUpperCase()+s.slice(1)}],['UPPER CASE',function(w){return w.join(' ').toUpperCase()}],['lower case',function(w){return w.join(' ').toLowerCase()}]];
function convert(text,name){var c=C.filter(function(x){return x[0]===name})[0];if(!c)throw new Error('Unknown style');return c[1](words(text))}
function upd(){var o=$('o');o.textContent='';var t=$('i').value;C.forEach(function(c){var r=document.createElement('div');r.style.cssText='display:flex;gap:8px;margin:4px 0;align-items:center';var l=document.createElement('span');l.className='muted';l.style.width='120px';l.textContent=c[0];var v=document.createElement('code');v.style.flex='1';v.textContent=c[1](words(t));var b=document.createElement('button');b.textContent='Copy';b.onclick=function(){aurora.copy(v.textContent).then(function(){aurora.toast('Copied')},function(){})};r.appendChild(l);r.appendChild(v);r.appendChild(b);o.appendChild(r)})}
$('i').oninput=upd;upd();window.__case={convert:convert,words:words};`);

def('x8_sleep', 'sleep-cycle-calculator', 'Sleep cycle calculator', '😴', 'Find bedtimes or wake-up times that fit whole 90-minute sleep cycles.', [],
  `<h3>Sleep cycle calculator</h3><p>I want to wake up at <input id="w" type="time" value="07:00"> <button class="p" id="a">Show bedtimes</button></p><p>I am going to bed at <input id="b" type="time" value="23:00"> <button id="c">Show wake times</button></p><div id="o"></div><p class="muted">A cycle is about 90 minutes and most people need 5-6 cycles (7.5-9 hours). Allow about 15 minutes to fall asleep. This is a rough guide, not medical advice.</p>`,
  R`var $=function(i){return document.getElementById(i)},FALL=15,CYC=90;
function pad(n){return(n<10?'0':'')+n}
function toMin(t){var m=/^(\d{1,2}):(\d{2})$/.exec(t);if(!m)throw new Error('Pick a time');return Number(m[1])*60+Number(m[2])}
function fmt(min){min=((min%1440)+1440)%1440;return pad(Math.floor(min/60))+':'+pad(min%60)}
function bedtimes(wake){var w=toMin(wake),out=[];for(var n=6;n>=3;n--)out.push({cycles:n,time:fmt(w-n*CYC-FALL),hours:n*CYC/60});return out}
function waketimes(bed){var b=toMin(bed),out=[];for(var n=3;n<=6;n++)out.push({cycles:n,time:fmt(b+FALL+n*CYC),hours:n*CYC/60});return out}
function show(list){var o=$('o');o.textContent='';list.forEach(function(x){var d=document.createElement('div');d.style.margin='4px 0';d.textContent=x.time+'  ('+x.cycles+' cycles, '+x.hours+' h of sleep)'+(x.cycles>=5?'  ✓ recommended':'');o.appendChild(d)})}
$('a').onclick=function(){try{show(bedtimes($('w').value))}catch(e){$('o').textContent=e.message}};$('c').onclick=function(){try{show(waketimes($('b').value))}catch(e){$('o').textContent=e.message}};window.__sleep={bedtimes:bedtimes,waketimes:waketimes,fmt:fmt};`);

def('x8_aspect', 'aspect-ratio-calculator', 'Aspect ratio calculator', '🖼️', 'Find the aspect ratio of a size, or resize to a new width or height without stretching.', [],
  `<h3>Aspect ratio calculator</h3><p>Size <input id="w" type="number" value="1920" min="1" style="width:90px"> × <input id="h" type="number" value="1080" min="1" style="width:90px"> → ratio <b id="r"></b></p><p>New width <input id="nw" type="number" value="1280" min="1" style="width:90px"> gives height <b id="oh"></b></p><p>New height <input id="nh" type="number" value="720" min="1" style="width:90px"> gives width <b id="ow"></b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function gcd(a,b){return b?gcd(b,a%b):a}
function ratio(w,h){w=Math.round(w);h=Math.round(h);if(!(w>0&&h>0))return null;var g=gcd(w,h);return(w/g)+':'+(h/g)}
function heightFor(w,h,nw){return w>0?Math.round(h*nw/w):0}
function widthFor(w,h,nh){return h>0?Math.round(w*nh/h):0}
function upd(){var n=function(i){return Number($(i).value)||0};$('r').textContent=ratio(n('w'),n('h'))||'-';$('oh').textContent=heightFor(n('w'),n('h'),n('nw'));$('ow').textContent=widthFor(n('w'),n('h'),n('nh'))}
['w','h','nw','nh'].forEach(function(i){$(i).oninput=upd});upd();window.__ar={ratio:ratio,heightFor:heightFor,widthFor:widthFor,gcd:gcd};`);
