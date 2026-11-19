/* Ninth batch: planning, decisions and everyday maths. Pure logic is exposed on window.__x for tests. */
const { def } = require('./addon-library'); const R = String.raw;

def('x9_countdown', 'days-until-counter', 'Days until', '📅', 'Count the days, weeks and hours until a date that matters, and see how far along you are.', ['storage'],
  `<h3>Days until</h3><p>Event <input id="n" value="My trip" style="width:150px"> Date <input id="d" type="date"> <button class="p" id="s">Save</button></p><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)},ev=[];
function calc(dateStr,now){var t=Date.parse(dateStr+'T00:00:00');if(isNaN(t))return null;var ms=t-now.getTime(),days=Math.ceil(ms/86400000);return{days:days,weeks:Math.floor(Math.abs(days)/7),rem:Math.abs(days)%7,past:ms<0&&days<=0&&now.toDateString()!==new Date(t).toDateString(),today:now.toDateString()===new Date(t).toDateString()}}
function label(r){if(!r)return'Pick a date';if(r.today)return'Today!';var a=Math.abs(r.days);return(r.past?a+' day'+(a===1?'':'s')+' ago':a+' day'+(a===1?'':'s')+' to go')+(a>=7?' ('+r.weeks+' week'+(r.weeks===1?'':'s')+(r.rem?' '+r.rem+' d':'')+')':'')}
function draw(){var o=$('o');o.textContent='';ev.slice().sort(function(a,b){return a.d<b.d?-1:1}).forEach(function(e,i){var r=calc(e.d,new Date()),row=document.createElement('div');row.style.cssText='display:flex;gap:10px;margin:6px 0;align-items:center';var t=document.createElement('b');t.textContent=e.n;var l=document.createElement('span');l.textContent=label(r);var x=document.createElement('button');x.textContent='Remove';x.onclick=function(){ev=ev.filter(function(y){return y!==e});save();draw()};row.appendChild(t);row.appendChild(l);row.appendChild(x);o.appendChild(row)})}
function save(){aurora.storage.set('ev',ev).catch(function(){})}
$('s').onclick=function(){var n=$('n').value.trim().slice(0,40),d=$('d').value;if(!n||!d||ev.length>=30)return;ev.push({n:n,d:d});save();draw()};
aurora.storage.get('ev').then(function(v){if(Array.isArray(v))ev=v.filter(function(e){return e&&typeof e.n==='string'&&typeof e.d==='string'}).slice(0,30);draw()}).catch(draw);draw();window.__cd={calc:calc,label:label};`);

def('x9_meeting', 'meeting-time-planner', 'Meeting time planner', '🌍', 'Find a time that works in several time zones at once, with working hours highlighted.', [],
  `<h3>Meeting time planner</h3><p>Zones (one per line) <textarea id="z" rows="4" style="width:100%">Asia/Riyadh\nEurope/London\nAmerica/New_York</textarea></p><p>Date <input id="d" type="date"> Work hours <input id="a" type="number" value="9" min="0" max="23" style="width:55px">-<input id="b" type="number" value="17" min="1" max="24" style="width:55px"></p><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)};
function hourIn(zone,utcMs){var f=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'});return Number(f.format(new Date(utcMs)))}
function validZone(z){try{new Intl.DateTimeFormat('en-GB',{timeZone:z});return true}catch(e){return false}}
function overlap(zones,dayUtcMs,from,to){var out=[];for(var h=0;h<24;h++){var t=dayUtcMs+h*3600000,ok=zones.every(function(z){var x=hourIn(z,t);return x>=from&&x<to});out.push({utcHour:h,ok:ok,local:zones.map(function(z){return hourIn(z,t)})})}return out}
function upd(){var zs=$('z').value.split('\n').map(function(s){return s.trim()}).filter(Boolean).slice(0,8),o=$('o');o.textContent='';var bad=zs.filter(function(z){return!validZone(z)});if(bad.length){o.textContent='Unknown time zone: '+bad.join(', ');return}if(!zs.length)return;
var d=$('d').value||new Date().toISOString().slice(0,10),base=Date.parse(d+'T00:00:00Z');var r=overlap(zs,base,Number($('a').value)||9,Number($('b').value)||17),good=r.filter(function(x){return x.ok});
var s=document.createElement('p');s.className='big';s.textContent=good.length?good.length+' hour'+(good.length===1?'':'s')+' work for everyone':'No hour suits everyone: try wider working hours';o.appendChild(s);
var t=document.createElement('table');t.style.cssText='width:100%;border-collapse:collapse;font-size:12px';var h=document.createElement('tr');['UTC'].concat(zs).forEach(function(z){var th=document.createElement('th');th.textContent=z;th.style.textAlign='left';h.appendChild(th)});t.appendChild(h);
r.forEach(function(x){var tr=document.createElement('tr');if(x.ok)tr.style.background='rgba(60,200,100,.2)';[x.utcHour+':00'].concat(x.local.map(function(l){return l+':00'})).forEach(function(v){var td=document.createElement('td');td.textContent=v;td.style.padding='2px 6px';tr.appendChild(td)});t.appendChild(tr)});o.appendChild(t)}
['z','d','a','b'].forEach(function(i){$(i).oninput=upd});upd();window.__mt={hourIn:hourIn,overlap:overlap,validZone:validZone};`);

def('x9_teams', 'random-team-splitter', 'Team splitter', '👥', 'Split a list of names into fair random teams of nearly equal size.', [],
  `<h3>Team splitter</h3><textarea id="n" rows="6" style="width:100%">Ali\nSara\nOmar\nLayla\nYusuf\nNoor\nKhalid</textarea><p>Teams <input id="t" type="number" value="2" min="2" max="12" style="width:60px"> <button class="p" id="go">Shuffle</button></p><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)};
function rnd(n){var m=Math.floor(4294967296/n)*n,x;do{x=crypto.getRandomValues(new Uint32Array(1))[0]}while(x>=m);return x%n}
function teams(names,count,rf){rf=rf||rnd;var a=names.slice();for(var i=a.length-1;i>0;i--){var j=rf(i+1),t=a[i];a[i]=a[j];a[j]=t}var out=[];for(var k=0;k<count;k++)out.push([]);a.forEach(function(x,i){out[i%count].push(x)});return out}
function names(){var seen={},out=[];$('n').value.split('\n').forEach(function(s){s=s.trim().slice(0,40);if(s&&!seen[s.toLowerCase()]){seen[s.toLowerCase()]=1;out.push(s)}});return out.slice(0,200)}
$('go').onclick=function(){var o=$('o');o.textContent='';var nm=names(),c=Math.max(2,Math.min(12,Number($('t').value)||2));if(nm.length<c){o.textContent='Add at least '+c+' different names';return}
teams(nm,c).forEach(function(tm,i){var d=document.createElement('div');d.style.cssText='margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(128,128,128,.15)';var b=document.createElement('b');b.textContent='Team '+(i+1)+' ('+tm.length+')';var l=document.createElement('div');l.textContent=tm.join(', ');d.appendChild(b);d.appendChild(l);o.appendChild(d)})};window.__teams={teams:teams};`);

def('x9_dice', 'dice-and-coin', 'Dice and coin', '🎲', 'Roll any dice (like 2d6+3) or flip a coin. Fair random numbers.', [],
  `<h3>Dice and coin</h3><p><input id="e" value="2d6+3" style="width:120px"> <button class="p" id="r">Roll</button> <button id="f">Flip a coin</button></p><p id="o" class="big"></p><p id="d" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function rnd(n){var m=Math.floor(4294967296/n)*n,x;do{x=crypto.getRandomValues(new Uint32Array(1))[0]}while(x>=m);return x%n}
function parse(s){var m=/^\s*(\d{1,3})?d(\d{1,4})\s*(?:([+-])\s*(\d{1,6}))?\s*$/i.exec(s);if(!m)throw new Error('Try something like d20, 3d6 or 2d8+4');var c=Number(m[1]||1),f=Number(m[2]);if(c<1||c>100||f<2)throw new Error('Use 1-100 dice with 2 or more sides');return{count:c,faces:f,mod:m[3]?(m[3]==='-'?-1:1)*Number(m[4]):0}}
function roll(spec,rf){rf=rf||rnd;var p=parse(spec),d=[];for(var i=0;i<p.count;i++)d.push(1+rf(p.faces));var sum=d.reduce(function(a,b){return a+b},0);return{dice:d,total:sum+p.mod,mod:p.mod}}
$('r').onclick=function(){try{var r=roll($('e').value);$('o').textContent=r.total;$('d').textContent='['+r.dice.join(', ')+']'+(r.mod?' '+(r.mod>0?'+':'')+r.mod:'')}catch(e){$('o').textContent='';$('d').textContent=e.message}};
$('f').onclick=function(){$('o').textContent=rnd(2)?'Heads':'Tails';$('d').textContent=''};window.__dice={parse:parse,roll:roll};`);

def('x9_bmi', 'body-mass-index', 'BMI calculator', '⚖️', 'Work out your body mass index in metric or imperial units. A screening number, not a diagnosis.', [],
  `<h3>BMI calculator</h3><p><select id="u"><option value="m">Metric (kg, cm)</option><option value="i">Imperial (lb, in)</option></select> Weight <input id="w" type="number" value="70" min="1" step="any" style="width:80px"> Height <input id="h" type="number" value="170" min="1" step="any" style="width:80px"></p><p class="big" id="o"></p><p class="muted">BMI ignores muscle, age and body shape, so it is only a rough screening number. Talk to a health professional for real advice.</p>`,
  R`var $=function(i){return document.getElementById(i)};
function bmi(w,h,imperial){if(!(w>0&&h>0))return null;return imperial?703*w/(h*h):w/Math.pow(h/100,2)}
function band(b){return b<18.5?'Under 18.5 (underweight range)':b<25?'18.5-24.9 (typical range)':b<30?'25-29.9 (overweight range)':'30 or more (obesity range)'}
function upd(){var b=bmi(Number($('w').value),Number($('h').value),$('u').value==='i');$('o').textContent=b===null?'-':b.toFixed(1)+'  ·  '+band(b)}
['u','w','h'].forEach(function(i){$(i).oninput=upd;$(i).onchange=upd});upd();window.__bmi={bmi:bmi,band:band};`);

def('x9_fuel', 'trip-cost-calculator', 'Trip cost calculator', '⛽', 'Estimate the fuel cost of a trip and split it between passengers.', [],
  `<h3>Trip cost</h3><p>Distance <input id="d" type="number" value="300" min="0" step="any" style="width:80px"> km Fuel use <input id="l" type="number" value="7.5" min="0" step="any" style="width:70px"> L/100 km Price <input id="p" type="number" value="2.33" min="0" step="any" style="width:70px"> per litre People <input id="n" type="number" value="3" min="1" max="20" style="width:55px"></p><p class="big" id="o"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function trip(km,per100,price,people){people=Math.max(1,Math.floor(people)||1);var litres=km*per100/100,cost=litres*price;return{litres:litres,cost:cost,each:cost/people}}
function m(v){return v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function upd(){var t=trip(Number($('d').value)||0,Number($('l').value)||0,Number($('p').value)||0,Number($('n').value));$('o').textContent=m(t.litres)+' L  ·  total '+m(t.cost)+'  ·  each '+m(t.each)}
['d','l','p','n'].forEach(function(i){$(i).oninput=upd});upd();window.__trip={trip:trip};`);

def('x9_mdtable', 'markdown-table-maker', 'Markdown table maker', '🧮', 'Turn copied spreadsheet cells or CSV into a neat Markdown table.', ['clipboard'],
  `<h3>Markdown table maker</h3><textarea id="i" rows="5" placeholder="Paste cells from a spreadsheet, or CSV">Name,Qty,Price\nTea,2,3.50\nCoffee,1,4.00</textarea><p><button class="p" id="c">Copy table</button></p><pre id="o"></pre>`,
  R`var $=function(i){return document.getElementById(i)};
function split(line,sep){var out=[],cur='',q=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(ch===sep&&!q){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out}
function table(text){var lines=String(text).replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length});if(!lines.length)return'';var sep=lines[0].indexOf('\t')>-1?'\t':lines[0].indexOf(';')>-1&&lines[0].indexOf(',')<0?';':',';
var rows=lines.slice(0,200).map(function(l){return split(l,sep).map(function(c){return c.trim().replace(/\|/g,'\\|')})}),n=Math.max.apply(null,rows.map(function(r){return r.length}));rows=rows.map(function(r){while(r.length<n)r.push('');return r});
var w=[];for(var c=0;c<n;c++)w.push(Math.max(3,Math.max.apply(null,rows.map(function(r){return r[c].length}))));var fmt=function(r){return'| '+r.map(function(x,i){return x+' '.repeat(w[i]-x.length)}).join(' | ')+' |'};
return[fmt(rows[0]),'| '+w.map(function(x){return'-'.repeat(x)}).join(' | ')+' |'].concat(rows.slice(1).map(fmt)).join('\n')}
function upd(){$('o').textContent=table($('i').value)}$('i').oninput=upd;$('c').onclick=function(){aurora.copy($('o').textContent).then(function(){aurora.toast('Copied')},function(){})};upd();window.__md2={table:table,split:split};`);

def('x9_words', 'number-to-words', 'Number to words', '🔡', 'Write any number in English words, handy for cheques and forms.', ['clipboard'],
  `<h3>Number to words</h3><p><input id="n" value="1234567.89" style="width:200px"> <button id="c">Copy</button></p><p class="big" id="o"></p>`,
  R`var $=function(i){return document.getElementById(i)};
var ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'],TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'],SC=['','thousand','million','billion','trillion'];
function below1000(n){var s=[];if(n>=100){s.push(ONES[Math.floor(n/100)]+' hundred');n%=100}if(n>=20){s.push(TENS[Math.floor(n/10)]+(n%10?'-'+ONES[n%10]:''))}else if(n>0||!s.length)s.push(ONES[n]);return s.join(' and ')}
function words(str){var m=/^\s*(-)?(\d{1,15})(?:\.(\d{1,2}))?\s*$/.exec(String(str).replace(/,/g,''));if(!m)throw new Error('Type a number up to 15 digits');var n=m[2].replace(/^0+(?=\d)/,''),parts=[],last=0,i;
if(/^0+$/.test(n))parts.push('zero');else{var groups=[];while(n.length){groups.push(Number(n.slice(-3)));n=n.slice(0,-3)}for(i=groups.length-1;i>=0;i--)if(groups[i]){parts.push(below1000(groups[i])+(SC[i]?' '+SC[i]:''));last=groups[i]}}
var out=parts.length>1?parts.slice(0,-1).join(', ')+(last<100?' and ':', ')+parts[parts.length-1]:parts[0];out=(m[1]?'minus ':'')+out;if(m[3])out+=' point '+m[3].split('').map(function(d){return ONES[Number(d)]}).join(' ');return out}
function upd(){try{$('o').textContent=words($('n').value)}catch(e){$('o').textContent=e.message}}$('n').oninput=upd;$('c').onclick=function(){aurora.copy($('o').textContent).then(function(){aurora.toast('Copied')},function(){})};upd();window.__w={words:words};`);
