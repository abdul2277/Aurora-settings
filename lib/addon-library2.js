/* More add-ons for the one-click library (second batch). */
const lib = require('./addon-library'); const { def } = lib; const R = String.raw;

def('drawpad', 'drawing-pad', 'Drawing pad', '🎨', 'Sketch with colours and brush sizes. Undo and clear.', [],
  `<h3>Drawing pad</h3><p><input type="color" id="c" value="#4cc2ff"> Size <input id="s" type="range" min="1" max="40" value="6"> <button id="undo">Undo</button> <button id="clr">Clear</button> <button id="er">Eraser</button></p><canvas id="cv" width="560" height="320" style="width:100%;max-width:560px;background:#fff;border-radius:8px;touch-action:none"></canvas>`,
  R`var $=function(i){return document.getElementById(i)},cv=$('cv'),g=cv.getContext('2d'),strokes=[],cur=null,eraser=false;
function redraw(){g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);strokes.forEach(function(s){g.strokeStyle=s.c;g.lineWidth=s.w;g.lineCap=g.lineJoin='round';g.beginPath();s.p.forEach(function(p,i){i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])});if(s.p.length===1)g.lineTo(s.p[0][0]+0.1,s.p[0][1]);g.stroke()})}
function pos(e){var r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]}
cv.onpointerdown=function(e){cur={c:eraser?'#ffffff':$('c').value,w:Number($('s').value),p:[pos(e)]};strokes.push(cur);cv.setPointerCapture(e.pointerId);redraw()};
cv.onpointermove=function(e){if(!cur)return;cur.p.push(pos(e));if(cur.p.length>5000)cur=null;redraw()};cv.onpointerup=function(){cur=null};
$('undo').onclick=function(){strokes.pop();redraw()};$('clr').onclick=function(){strokes=[];redraw()};$('er').onclick=function(){eraser=!eraser;$('er').textContent=eraser?'Brush':'Eraser'};redraw();window.__draw={count:function(){return strokes.length}};`);

def('flashcards', 'flashcards', 'Flashcards', '🗂️', 'Make question and answer cards, then quiz yourself.', ['storage'],
  `<h3>Flashcards</h3><p><input id="q" placeholder="Question" style="width:35%"> <input id="a" placeholder="Answer" style="width:35%"> <button class="p" id="add">Add</button></p><div id="card" style="border:1px solid #888;border-radius:12px;padding:30px;text-align:center;font-size:20px;min-height:80px;cursor:pointer"></div><p><button id="prev">Back</button> <button id="next">Next</button> <button id="shuf">Shuffle</button> <button id="del">Delete card</button> <span id="pos" class="muted"></span></p>`,
  R`var $=function(i){return document.getElementById(i)},cards=[],i=0,flipped=false;
function save(){aurora.storage.set('cards',cards).catch(function(){})}
function show(){var c=cards[i];$('card').textContent=c?(flipped?c.a:c.q):'Add your first card above';$('pos').textContent=cards.length?(i+1)+' of '+cards.length+(c?(flipped?' (answer)':' (question)'):''):''}
function nextIdx(n,len,d){return len?(n+d+len)%len:0}
$('card').onclick=function(){if(cards.length){flipped=!flipped;show()}};$('next').onclick=function(){i=nextIdx(i,cards.length,1);flipped=false;show()};$('prev').onclick=function(){i=nextIdx(i,cards.length,-1);flipped=false;show()};
$('shuf').onclick=function(){for(var k=cards.length-1;k>0;k--){var j=Math.floor(Math.random()*(k+1)),t=cards[k];cards[k]=cards[j];cards[j]=t}i=0;flipped=false;save();show()};
$('del').onclick=function(){if(cards.length){cards.splice(i,1);i=Math.min(i,Math.max(0,cards.length-1));flipped=false;save();show()}};
$('add').onclick=function(){var q=$('q').value.trim().slice(0,200),a=$('a').value.trim().slice(0,200);if(!q||!a||cards.length>=500)return;cards.push({q:q,a:a});$('q').value=$('a').value='';i=cards.length-1;flipped=false;save();show()};
aurora.storage.get('cards').then(function(v){if(Array.isArray(v))cards=v.filter(function(c){return c&&typeof c.q==='string'&&typeof c.a==='string'}).slice(0,500);show()}).catch(show);show();window.__fc={nextIdx:nextIdx,get:function(){return cards}};`);

def('expenses', 'expense-tracker', 'Expense tracker', '🧾', 'Log what you spend and see totals by category.', ['storage'],
  `<h3>Expenses</h3><p><input id="amt" type="number" step="0.01" placeholder="Amount" style="width:90px"> <select id="cat"><option>Food</option><option>Transport</option><option>Bills</option><option>Shopping</option><option>Fun</option><option>Other</option></select> <input id="note" placeholder="Note" style="width:30%"> <button class="p" id="add">Add</button></p><div id="sum"></div><ol id="list"></ol>`,
  R`var $=function(i){return document.getElementById(i)},E=[];
function totals(list){var t={},all=0;list.forEach(function(e){t[e.cat]=Math.round(((t[e.cat]||0)+e.amt)*100)/100;all+=e.amt});return{byCat:t,total:Math.round(all*100)/100}}
function save(){aurora.storage.set('exp',E).catch(function(){})}
function draw(){var t=totals(E);$('sum').innerHTML='<p>Total <b>'+t.total.toFixed(2)+'</b></p>'+Object.keys(t.byCat).map(function(k){return '<p>'+k+': '+t.byCat[k].toFixed(2)+'</p>'}).join('');var l=$('list');l.textContent='';E.slice().reverse().slice(0,50).forEach(function(e){var li=document.createElement('li');li.textContent=e.date+'  '+e.amt.toFixed(2)+'  '+e.cat+(e.note?' - '+e.note:'');var x=document.createElement('button');x.textContent='✕';x.style.marginLeft='8px';x.onclick=function(){E.splice(E.indexOf(e),1);save();draw()};li.appendChild(x);l.appendChild(li)})}
$('add').onclick=function(){var a=Math.round(Number($('amt').value)*100)/100;if(!(a>0)||a>1e9||E.length>=2000)return;E.push({amt:a,cat:$('cat').value,note:$('note').value.trim().slice(0,60),date:new Date().toISOString().slice(0,10)});$('amt').value=$('note').value='';save();draw()};
aurora.storage.get('exp').then(function(v){if(Array.isArray(v))E=v.filter(function(e){return e&&typeof e.amt==='number'&&typeof e.cat==='string'}).slice(0,2000);draw()}).catch(draw);draw();window.__exp={totals:totals,get:function(){return E}};`);

def('water', 'water-tracker', 'Water tracker', '💧', 'Count your glasses of water and get a reminder to drink.', ['storage', 'notify'],
  `<h3>Water</h3><div class="big" id="n">0 / 8</div><p><button class="p" id="add">+1 glass</button> <button id="sub">-1</button> Goal <input id="goal" type="number" value="8" min="1" max="30" style="width:60px"></p><p><label><input type="checkbox" id="rem"> Remind me every <input id="mins" type="number" value="60" min="15" max="240" style="width:60px"> minutes while this page is open</label></p>`,
  R`var $=function(i){return document.getElementById(i)},n=0,day=new Date().toISOString().slice(0,10),iv=null;
function clampGoal(v){v=Math.round(Number(v));return v>=1&&v<=30?v:8}
function show(){$('n').textContent=n+' / '+clampGoal($('goal').value)+(n>=clampGoal($('goal').value)?'  🎉':'')}
function save(){aurora.storage.set('w-'+day,n).catch(function(){})}
$('add').onclick=function(){n=Math.min(99,n+1);save();show()};$('sub').onclick=function(){n=Math.max(0,n-1);save();show()};$('goal').oninput=show;
$('rem').onchange=function(){clearInterval(iv);iv=null;if($('rem').checked){var m=Math.max(15,Math.min(240,Number($('mins').value)||60));iv=setInterval(function(){aurora.notify('Time for a glass of water').catch(function(){})},m*60000)}};
aurora.storage.get('w-'+day).then(function(v){n=Number(v)||0;show()}).catch(show);show();window.__water={clampGoal:clampGoal};`);

def('journal', 'daily-journal', 'Daily journal', '📔', 'Write a few lines every day. Browse earlier days.', ['storage'],
  `<h3>Journal</h3><p><input type="date" id="d"> <button id="prev">Previous day</button> <button id="next">Next day</button></p><textarea id="t" rows="10" style="width:100%" placeholder="How was your day?"></textarea><p id="st" class="muted"></p><p id="days" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)},tm,idx={};
function shift(d,n){var t=new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10))+n*86400000);return t.toISOString().slice(0,10)}
function load(){var d=$('d').value;aurora.storage.get('j-'+d).then(function(v){$('t').value=typeof v==='string'?v:'';$('st').textContent=''}).catch(function(){})}
function listDays(){aurora.storage.keys().then(function(k){var ds=k.filter(function(x){return/^j-\d{4}-\d{2}-\d{2}$/.test(x)}).map(function(x){return x.slice(2)}).sort().reverse();$('days').textContent=ds.length?'Days with entries: '+ds.slice(0,10).join(', '):''}).catch(function(){})}
$('t').oninput=function(){clearTimeout(tm);var d=$('d').value,v=$('t').value.slice(0,20000);tm=setTimeout(function(){aurora.storage.set('j-'+d,v).then(function(){$('st').textContent='Saved';listDays()}).catch(function(){})},500)};
$('d').onchange=load;$('prev').onclick=function(){$('d').value=shift($('d').value,-1);load()};$('next').onclick=function(){$('d').value=shift($('d').value,1);load()};$('d').value=new Date().toISOString().slice(0,10);load();listDays();window.__j={shift:shift};`);

def('mood', 'mood-tracker', 'Mood tracker', '😊', 'Record how you feel each day and see the last two weeks.', ['storage'],
  `<h3>Mood</h3><p>How do you feel today?</p><p id="pick"></p><div id="chart" style="display:flex;gap:4px;align-items:flex-end;height:120px"></div><p class="muted" id="avg"></p>`,
  R`var $=function(i){return document.getElementById(i)},M={},E=['😞','😕','😐','🙂','😄'];
function dstr(d){return d.toISOString().slice(0,10)}
function last(map,n,today){var o=[];for(var i=n-1;i>=0;i--){var d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-i);var k=dstr(d);o.push({d:k,v:map[k]||0})}return o}
function average(arr){var x=arr.filter(function(a){return a.v>0});return x.length?Math.round(x.reduce(function(s,a){return s+a.v},0)/x.length*10)/10:0}
function draw(){var t=dstr(new Date()),a=last(M,14,t);$('chart').textContent='';a.forEach(function(x){var b=document.createElement('div');b.style.cssText='flex:1;border-radius:4px;background:'+(x.v?'var(--accent)':'rgba(128,128,128,.3)')+';height:'+(x.v?x.v*20:8)+'px';b.title=x.d+(x.v?' '+E[x.v-1]:'');$('chart').appendChild(b)});var av=average(a);$('avg').textContent=av?'Average over the last 14 days: '+av+' / 5':'No entries yet'}
E.forEach(function(e,i){var b=document.createElement('button');b.textContent=e;b.style.fontSize='24px';b.onclick=function(){M[dstr(new Date())]=i+1;aurora.storage.set('mood',M).catch(function(){});draw()};$('pick').appendChild(b);$('pick').appendChild(document.createTextNode(' '))});
aurora.storage.get('mood').then(function(v){if(v&&typeof v==='object')M=v;draw()}).catch(draw);draw();window.__mood={last:last,average:average};`);

def('gradient', 'gradient-maker', 'CSS gradient maker', '🌈', 'Build a gradient and copy the CSS.', ['clipboard'],
  `<h3>Gradient maker</h3><p><input type="color" id="a" value="#4cc2ff"> <input type="color" id="b" value="#c77dff"> Angle <input id="ang" type="range" min="0" max="360" value="135"> <select id="kind"><option value="linear">Linear</option><option value="radial">Radial</option></select></p><div id="prev" style="height:140px;border-radius:12px"></div><p><code id="css"></code></p><p><button class="p" id="copy">Copy CSS</button></p>`,
  R`var $=function(i){return document.getElementById(i)};
function css(kind,ang,a,b){return kind==='radial'?'background: radial-gradient(circle, '+a+', '+b+');':'background: linear-gradient('+ang+'deg, '+a+', '+b+');'}
function upd(){var c=css($('kind').value,$('ang').value,$('a').value,$('b').value);$('css').textContent=c;$('prev').style.cssText=c}
['a','b','ang','kind'].forEach(function(i){$(i).oninput=upd;$(i).onchange=upd});$('copy').onclick=function(){aurora.copy($('css').textContent).then(function(){aurora.toast('Copied')},function(){})};upd();window.__grad={css:css};`);

def('shadow', 'shadow-maker', 'Box shadow maker', '🔲', 'Design a box shadow visually and copy the CSS.', ['clipboard'],
  `<h3>Shadow maker</h3><p>X <input id="x" type="range" min="-50" max="50" value="8"> Y <input id="y" type="range" min="-50" max="50" value="12"> Blur <input id="bl" type="range" min="0" max="100" value="24"> Spread <input id="sp" type="range" min="-30" max="50" value="0"> Opacity <input id="o" type="range" min="0" max="100" value="30"></p><div style="padding:40px;background:#eee;border-radius:12px"><div id="box" style="width:140px;height:90px;background:#fff;border-radius:12px;margin:auto"></div></div><p><code id="css"></code></p><p><button class="p" id="copy">Copy CSS</button></p>`,
  R`var $=function(i){return document.getElementById(i)};
function css(x,y,bl,sp,o){return 'box-shadow: '+x+'px '+y+'px '+bl+'px '+sp+'px rgba(0, 0, 0, '+(o/100).toFixed(2)+');'}
function upd(){var c=css($('x').value,$('y').value,$('bl').value,$('sp').value,$('o').value);$('css').textContent=c;$('box').style.cssText='width:140px;height:90px;background:#fff;border-radius:12px;margin:auto;'+c}
['x','y','bl','sp','o'].forEach(function(i){$(i).oninput=upd});$('copy').onclick=function(){aurora.copy($('css').textContent).then(function(){aurora.toast('Copied')},function(){})};upd();window.__shadow={css:css};`);

def('csvview', 'csv-viewer', 'CSV viewer', '📊', 'Paste CSV data and see it as a table you can sort.', [],
  `<h3>CSV viewer</h3><textarea id="in" rows="6" style="width:100%" placeholder="name,age&#10;Ann,31&#10;Bob,25"></textarea><p class="muted" id="info"></p><div style="overflow:auto;max-height:340px"><table id="t" style="border-collapse:collapse;width:100%"></table></div>`,
  R`var $=function(i){return document.getElementById(i)},rows=[],sortCol=-1,asc=true;
function parse(text){var out=[],row=[],f='',q=false;for(var i=0;i<text.length;i++){var c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++}else if(c==='"')q=false;else f+=c}else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);f='';out.push(row);row=[]}else f+=c}if(f!==''||row.length){row.push(f);out.push(row)}return out.filter(function(r){return r.length>1||r[0]!==''})}
function sortRows(data,col,asc){var h=data[0],b=data.slice(1).sort(function(x,y){var a=x[col]||'',c=y[col]||'',na=parseFloat(a),nc=parseFloat(c);var r=(!isNaN(na)&&!isNaN(nc)&&String(na)===a.trim()&&String(nc)===c.trim())?na-nc:a.localeCompare(c);return asc?r:-r});return[h].concat(b)}
function draw(){var t=$('t');t.textContent='';rows.slice(0,500).forEach(function(r,ri){var tr=document.createElement('tr');r.forEach(function(c,ci){var td=document.createElement(ri?'td':'th');td.textContent=c;td.style.cssText='border:1px solid rgba(128,128,128,.4);padding:4px 8px;text-align:left';if(!ri){td.style.cursor='pointer';td.onclick=function(){asc=sortCol===ci?!asc:true;sortCol=ci;rows=sortRows(rows,ci,asc);draw()}}tr.appendChild(td)});t.appendChild(tr)});$('info').textContent=rows.length?(rows.length-1)+' rows, '+rows[0].length+' columns. Click a heading to sort.':''}
$('in').oninput=function(){if($('in').value.length>200000)return;rows=parse($('in').value);sortCol=-1;draw()};window.__csv={parse:parse,sortRows:sortRows};`);

def('percent', 'percent-calculator', 'Percentage calculator', '％', 'What is X% of Y, percentage change, and what percent is one number of another.', [],
  `<h3>Percentages</h3><p>What is <input id="a" type="number" value="15" style="width:70px">% of <input id="b" type="number" value="200" style="width:90px"> = <b id="r1"></b></p><p><input id="c" type="number" value="30" style="width:80px"> is what % of <input id="d" type="number" value="120" style="width:80px"> = <b id="r2"></b></p><p>Change from <input id="e" type="number" value="80" style="width:80px"> to <input id="f" type="number" value="100" style="width:80px"> = <b id="r3"></b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function of(p,v){return p/100*v}function whatPct(a,b){return b===0?NaN:a/b*100}function change(a,b){return a===0?NaN:(b-a)/Math.abs(a)*100}
function f(x,s){return isFinite(x)?(Math.round(x*100)/100).toLocaleString('en')+(s||''):'-'}
function calc(){$('r1').textContent=f(of(+$('a').value,+$('b').value));$('r2').textContent=f(whatPct(+$('c').value,+$('d').value),'%');var ch=change(+$('e').value,+$('f').value);$('r3').textContent=isFinite(ch)?(ch>0?'+':'')+f(ch,'%'):'-'}
document.querySelectorAll('input').forEach(function(i){i.oninput=calc});calc();window.__pct={of:of,whatPct:whatPct,change:change};`);

def('mathtools', 'math-tools', 'Math tools', '➗', 'Prime check, factors, GCD and LCM, and Fibonacci numbers.', [],
  `<h3>Math tools</h3><p><input id="n" type="number" value="360" style="width:120px"> <button class="p" id="go">Analyse</button></p><div id="out"></div><hr><p>GCD and LCM of <input id="a" type="number" value="12" style="width:70px"> and <input id="b" type="number" value="18" style="width:70px"> = <b id="gl"></b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function isPrime(n){if(n<2||n!==Math.floor(n))return false;if(n<4)return true;if(n%2===0)return false;for(var i=3;i*i<=n;i+=2)if(n%i===0)return false;return true}
function factors(n){var f=[];for(var p=2;p*p<=n;p++)while(n%p===0){f.push(p);n/=p}if(n>1)f.push(n);return f}
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){var t=a%b;a=b;b=t}return a}
function lcm(a,b){return a&&b?Math.abs(a*b)/gcd(a,b):0}
function fib(n){var a=0,b=1;for(var i=0;i<n;i++){var t=a+b;a=b;b=t}return a}
function analyse(){var n=Number($('n').value);if(!Number.isInteger(n)||n<1||n>1e12){$('out').textContent='Enter a whole number from 1 to 1,000,000,000,000';return}var f=factors(n),c={};f.forEach(function(p){c[p]=(c[p]||0)+1});$('out').innerHTML='<p>'+n.toLocaleString('en')+' is '+(isPrime(n)?'<b>prime</b>':'not prime')+'</p><p>Prime factors: '+(n===1?'none':Object.keys(c).map(function(p){return p+(c[p]>1?'^'+c[p]:'')}).join(' x '))+'</p>'+(n<=78?'<p>Fibonacci number '+n+' = '+fib(n)+'</p>':'')}
function gl(){var a=Math.round(+$('a').value),b=Math.round(+$('b').value);$('gl').textContent='GCD '+gcd(a,b)+', LCM '+lcm(a,b)}
$('go').onclick=analyse;$('a').oninput=$('b').oninput=gl;analyse();gl();window.__math={isPrime:isPrime,factors:factors,gcd:gcd,lcm:lcm,fib:fib};`);

def('speedread', 'speed-reader', 'Speed reader', '🏎️', 'Read text one word at a time at your own speed.', [],
  `<h3>Speed reader</h3><textarea id="in" rows="5" style="width:100%" placeholder="Paste text to read">Reading one word at a time helps your eyes stay still. Try raising the speed a little each day.</textarea><p>Words per minute <input id="wpm" type="range" min="100" max="900" value="300"> <b id="v">300</b> <button class="p" id="go">Start</button></p><div class="big" id="w" style="text-align:center;min-height:60px;font-size:34px"></div><p id="st" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)},iv=null;
function split(t){return t.trim().split(/\s+/).filter(Boolean).slice(0,20000)}
function delay(wpm){return Math.round(60000/Math.max(50,Math.min(1500,wpm)))}
$('wpm').oninput=function(){$('v').textContent=$('wpm').value};
$('go').onclick=function(){if(iv){clearTimeout(iv);iv=null;$('go').textContent='Start';return}var w=split($('in').value),i=0;if(!w.length)return;$('go').textContent='Stop';function step(){if(i>=w.length){iv=null;$('go').textContent='Start';$('st').textContent='Finished';return}$('w').textContent=w[i];$('st').textContent=(i+1)+' / '+w.length;var d=delay(Number($('wpm').value));if(/[.!?]$/.test(w[i]))d*=2;i++;iv=setTimeout(step,d)}step()};window.__sr={split:split,delay:delay};`);

def('spinner', 'wheel-spinner', 'Wheel spinner', '🎡', 'Spin a wheel to pick from your own list.', [],
  `<h3>Wheel spinner</h3><div style="display:flex;gap:14px;flex-wrap:wrap"><textarea id="list" rows="8" style="width:180px">Pizza\nSushi\nBurgers\nSalad\nTacos</textarea><div><canvas id="cv" width="260" height="260"></canvas><p><button class="p" id="spin">Spin</button> <b id="res"></b></p></div></div>`,
  R`var $=function(i){return document.getElementById(i)},ang=0,spinning=false;
function items(){return $('list').value.split('\n').map(function(s){return s.trim()}).filter(Boolean).slice(0,24)}
function winner(n,angle){var a=((-angle%(2*Math.PI))+2*Math.PI+3*Math.PI/2)%(2*Math.PI);return Math.floor(a/(2*Math.PI/n))%n}
function draw(){var it=items(),g=$('cv').getContext('2d'),n=it.length||1;g.clearRect(0,0,260,260);for(var i=0;i<n;i++){var a0=ang+i*2*Math.PI/n,a1=a0+2*Math.PI/n;g.beginPath();g.moveTo(130,130);g.arc(130,130,120,a0,a1);g.fillStyle='hsl('+(i*360/n)+' 60% 50%)';g.fill();g.save();g.translate(130,130);g.rotate((a0+a1)/2);g.fillStyle='#fff';g.font='13px sans-serif';g.textAlign='right';g.fillText((it[i]||'').slice(0,14),110,4);g.restore()}g.fillStyle='#fff';g.beginPath();g.moveTo(130,6);g.lineTo(122,-6);g.lineTo(138,-6);g.fill();g.fillStyle='#e33';g.beginPath();g.moveTo(130,14);g.lineTo(120,-4);g.lineTo(140,-4);g.fill()}
$('list').oninput=draw;$('spin').onclick=function(){if(spinning||!items().length)return;spinning=true;var t0=Date.now(),start=ang,total=(6+Math.random()*4)*2*Math.PI,dur=3000;(function f(){var p=Math.min(1,(Date.now()-t0)/dur),e=1-Math.pow(1-p,3);ang=start+total*e;draw();if(p<1)requestAnimationFrame(f);else{spinning=false;$('res').textContent=items()[winner(items().length,ang)]}})()};draw();window.__wheel={winner:winner};`);

def('rps', 'rock-paper-scissors', 'Rock paper scissors', '✂️', 'Beat the computer and keep your score.', [],
  `<h3>Rock paper scissors</h3><p><button id="r" style="font-size:28px">✊</button> <button id="p" style="font-size:28px">✋</button> <button id="s" style="font-size:28px">✌️</button></p><p class="big" id="res">Choose one</p><p id="score" class="muted">You 0 - Computer 0 - Draws 0</p>`,
  R`var $=function(i){return document.getElementById(i)},sc={w:0,l:0,d:0},N=['rock','paper','scissors'],E=['✊','✋','✌️'];
function outcome(a,b){return a===b?'draw':(a-b+3)%3===1?'win':'lose'}
function play(a){var b=crypto.getRandomValues(new Uint32Array(1))[0]%3,o=outcome(a,b);sc[o==='win'?'w':o==='lose'?'l':'d']++;$('res').textContent=E[a]+' vs '+E[b]+': '+(o==='win'?'You win!':o==='lose'?'Computer wins':'Draw');$('score').textContent='You '+sc.w+' - Computer '+sc.l+' - Draws '+sc.d}
$('r').onclick=function(){play(0)};$('p').onclick=function(){play(1)};$('s').onclick=function(){play(2)};window.__rps={outcome:outcome};`);

def('minesweeper', 'minesweeper', 'Minesweeper', '💣', 'The classic mine-finding puzzle. Click to reveal, right-click to flag.', [],
  `<h3>Minesweeper <span class="muted" id="st">9x9, 10 mines</span></h3><div id="g" style="display:grid;grid-template-columns:repeat(9,30px);gap:2px"></div><p><button class="p" id="new">New game</button></p>`,
  R`var $=function(i){return document.getElementById(i)},W=9,H=9,MINES=10,mines,rev,flag,over,first;
function neighbors(i,w,h){var x=i%w,y=Math.floor(i/w),o=[];for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;var nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h)o.push(ny*w+nx)}return o}
function count(m,i,w,h){return neighbors(i,w,h).filter(function(j){return m[j]}).length}
function place(avoid,w,h,n,rnd){var m=new Array(w*h).fill(false),c=0,ban=[avoid].concat(neighbors(avoid,w,h));while(c<n){var k=Math.floor((rnd?rnd():Math.random())*w*h);if(!m[k]&&ban.indexOf(k)<0){m[k]=true;c++}}return m}
function flood(m,r,i,w,h){var st=[i];while(st.length){var k=st.pop();if(r[k])continue;r[k]=true;if(count(m,k,w,h)===0)neighbors(k,w,h).forEach(function(j){if(!r[j]&&!m[j])st.push(j)})}}
function fresh(){mines=null;rev=new Array(W*H).fill(false);flag=new Array(W*H).fill(false);over=false;first=true;$('st').textContent='9x9, '+MINES+' mines';draw()}
function click(i){if(over||flag[i]||rev[i])return;if(first){mines=place(i,W,H,MINES);first=false}if(mines[i]){over=true;rev=rev.map(function(){return true});$('st').textContent='Boom! Game over'}else{flood(mines,rev,i,W,H);if(rev.filter(Boolean).length===W*H-MINES){over=true;$('st').textContent='You won!'}}draw()}
function draw(){var g=$('g');g.textContent='';for(var i=0;i<W*H;i++){(function(i){var b=document.createElement('button');b.style.cssText='width:30px;height:30px;padding:0';var t='';if(rev[i]){t=mines&&mines[i]?'💣':(count(mines||[],i,W,H)||'');b.style.opacity=.7}else if(flag[i])t='🚩';b.textContent=t;b.onclick=function(){click(i)};b.oncontextmenu=function(e){e.preventDefault();if(!over&&!rev[i]){flag[i]=!flag[i];draw()}};g.appendChild(b)})(i)}}
$('new').onclick=fresh;fresh();window.__ms={neighbors:neighbors,count:count,place:place,flood:flood};`);

def('reaction', 'reaction-test', 'Reaction time test', '⚡', 'Click as soon as the box turns green. How fast are you?', [],
  `<h3>Reaction time</h3><div id="box" style="height:160px;border-radius:12px;display:grid;place-items:center;background:#888;color:#fff;font-size:22px;cursor:pointer;user-select:none">Click to start</div><p id="res" class="big"></p><p id="best" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)},state='idle',t0=0,tm=null,best=null;
function rating(ms){return ms<200?'Lightning':ms<260?'Quick':ms<350?'Average':'Take a breath and try again'}
$('box').onclick=function(){var b=$('box');if(state==='idle'){state='wait';b.style.background='#c33';b.textContent='Wait for green...';tm=setTimeout(function(){state='go';t0=performance.now();b.style.background='#2a2';b.textContent='Click now!'},1000+Math.random()*3000)}else if(state==='wait'){clearTimeout(tm);state='idle';b.style.background='#888';b.textContent='Too early! Click to try again'}else{var ms=Math.round(performance.now()-t0);state='idle';b.style.background='#888';b.textContent='Click to try again';$('res').textContent=ms+' ms - '+rating(ms);if(best===null||ms<best)best=ms;$('best').textContent='Best: '+best+' ms'}};window.__rt={rating:rating};`);

def('hangman', 'hangman', 'Hangman', '🔤', 'Guess the word one letter at a time.', [],
  `<h3>Hangman <span class="muted" id="lives"></span></h3><p class="big" id="word" style="letter-spacing:6px"></p><div id="keys"></div><p id="msg"></p><p><button class="p" id="new">New word</button></p>`,
  R`var $=function(i){return document.getElementById(i)},WORDS=['planet','window','keyboard','mountain','journey','battery','network','compass','lantern','harvest','thunder','velvet','cactus','orbit','pencil','rocket','sunrise','bridge','garden','silver'],word,got,miss,MAX=7;
function mask(w,g){return w.split('').map(function(c){return g.indexOf(c)>=0?c:'_'}).join(' ')}
function status(w,g,m){return m>=MAX?'lost':w.split('').every(function(c){return g.indexOf(c)>=0})?'won':'play'}
function draw(){$('word').textContent=mask(word,got);$('lives').textContent=(MAX-miss)+' lives left';var s=status(word,got,miss);$('msg').textContent=s==='won'?'You won!':s==='lost'?'You lost. The word was '+word:'';var k=$('keys');k.textContent='';'abcdefghijklmnopqrstuvwxyz'.split('').forEach(function(c){var b=document.createElement('button');b.textContent=c;b.style.cssText='width:34px;margin:2px';b.disabled=got.indexOf(c)>=0||s!=='play';b.onclick=function(){got+=c;if(word.indexOf(c)<0)miss++;draw()};k.appendChild(b)})}
function fresh(){word=WORDS[crypto.getRandomValues(new Uint32Array(1))[0]%WORDS.length];got='';miss=0;draw()}$('new').onclick=fresh;fresh();window.__hm={mask:mask,status:status};`);

def('interval', 'interval-timer', 'Interval timer', '🏋️', 'Work and rest rounds for workouts, with a notification at each change.', ['notify'],
  `<h3>Interval timer</h3><p>Work <input id="w" type="number" value="30" min="5" max="600" style="width:70px">s Rest <input id="r" type="number" value="10" min="0" max="600" style="width:70px">s Rounds <input id="n" type="number" value="8" min="1" max="50" style="width:60px"> <button class="p" id="go">Start</button></p><div class="big" id="t">--</div><p id="ph" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)},iv=null;
function schedule(w,r,n){var s=[];for(var i=1;i<=n;i++){s.push({name:'Work',round:i,secs:w});if(r>0&&i<n)s.push({name:'Rest',round:i,secs:r})}return s}
$('go').onclick=function(){if(iv){clearInterval(iv);iv=null;$('go').textContent='Start';$('t').textContent='--';$('ph').textContent='';return}var cl=function(v,lo,hi){return Math.max(lo,Math.min(hi,Math.round(Number(v))||lo))};var sch=schedule(cl($('w').value,5,600),cl($('r').value,0,600),cl($('n').value,1,50)),k=0,left=sch[0].secs;$('go').textContent='Stop';function show(){$('t').textContent=left;$('ph').textContent=sch[k].name+' - round '+sch[k].round+' of '+cl($('n').value,1,50)}show();iv=setInterval(function(){left--;if(left<=0){k++;if(k>=sch.length){clearInterval(iv);iv=null;$('go').textContent='Start';$('t').textContent='Done!';$('ph').textContent='';aurora.notify('Workout finished').catch(function(){});return}left=sch[k].secs;aurora.notify(sch[k].name+' - round '+sch[k].round).catch(function(){})}show()},1000)};window.__int={schedule:schedule};`);

def('sleepcalc', 'sleep-calculator', 'Sleep calculator', '😴', 'Find the best time to go to bed or wake up, in 90-minute sleep cycles.', [],
  `<h3>Sleep calculator</h3><p>I want to wake up at <input type="time" id="wake" value="06:30"> <button class="p" id="go">Show bed times</button></p><p>or I go to bed at <input type="time" id="bed" value="23:00"> <button id="go2">Show wake times</button></p><div id="out"></div>`,
  R`var $=function(i){return document.getElementById(i)};
function toMin(s){var p=s.split(':');return(+p[0])*60+(+p[1])}function fmt(m){m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function bedTimes(wake){var w=toMin(wake),o=[];for(var c=6;c>=3;c--)o.push({time:fmt(w-c*90-15),cycles:c,hours:c*1.5});return o}
function wakeTimes(bed){var b=toMin(bed),o=[];for(var c=3;c<=6;c++)o.push({time:fmt(b+15+c*90),cycles:c,hours:c*1.5});return o}
function show(list,label){$('out').innerHTML='<p class="muted">'+label+' (includes 15 minutes to fall asleep)</p>'+list.map(function(x){return '<p><b>'+x.time+'</b> &nbsp; '+x.cycles+' cycles, '+x.hours+' hours of sleep</p>'}).join('')}
$('go').onclick=function(){show(bedTimes($('wake').value),'Go to bed at')};$('go2').onclick=function(){show(wakeTimes($('bed').value),'Wake up at')};$('go').onclick();window.__sleep={bedTimes:bedTimes,wakeTimes:wakeTimes,fmt:fmt};`);

def('emoji', 'emoji-picker', 'Emoji picker', '😀', 'Search emoji by name and copy one with a click.', ['clipboard'],
  `<h3>Emoji picker</h3><p><input id="q" placeholder="Search: smile, heart, food..." style="width:60%"></p><div id="g" style="display:flex;flex-wrap:wrap;gap:4px"></div>`,
  R`var $=function(i){return document.getElementById(i)},E=[['😀','grin smile happy'],['😂','laugh joy tears'],['🙂','smile slight'],['😉','wink'],['😍','love heart eyes'],['😎','cool sunglasses'],['🤔','think hmm'],['😢','sad cry'],['😡','angry mad'],['😴','sleep tired'],['🥳','party celebrate'],['🤝','handshake deal'],['👍','thumbs up yes good'],['👎','thumbs down no bad'],['👏','clap applause'],['🙏','pray thanks please'],['💪','strong muscle'],['👋','wave hello bye'],['❤️','heart love red'],['💔','broken heart'],['⭐','star favourite'],['🔥','fire hot'],['✨','sparkles magic'],['🎉','party popper celebrate'],['🎁','gift present'],['🎂','cake birthday'],['🍕','pizza food'],['🍔','burger food'],['🍎','apple fruit'],['☕','coffee tea drink'],['🍵','tea green'],['🍰','dessert cake sweet'],['🌙','moon night'],['☀️','sun day sunny'],['🌧️','rain cloud'],['⚡','lightning fast power'],['🌈','rainbow'],['🌸','flower blossom'],['🌳','tree nature'],['🐱','cat pet'],['🐶','dog pet'],['🐎','horse'],['🐪','camel'],['🚗','car drive'],['✈️','plane travel flight'],['🚀','rocket launch fast'],['🏠','home house'],['💻','laptop computer'],['📱','phone mobile'],['🎮','game controller play'],['🎧','headphones music'],['📷','camera photo'],['📚','books read study'],['✏️','pencil write'],['💡','idea light bulb'],['🔑','key'],['🔒','lock secure'],['⏰','alarm clock time'],['💰','money bag'],['✅','check done yes'],['❌','cross no wrong'],['⚠️','warning caution'],['❓','question'],['➡️','arrow right'],['🏆','trophy win'],['🎯','target goal'],['🧠','brain smart'],['👀','eyes look'],['🤖','robot ai'],['🌍','world earth globe'],['🕋','kaaba mecca'],['🌴','palm tree']];
function search(q){q=q.trim().toLowerCase();return q?E.filter(function(e){return e[1].indexOf(q)>=0}):E}
function draw(){var g=$('g');g.textContent='';var r=search($('q').value);r.forEach(function(e){var b=document.createElement('button');b.textContent=e[0];b.title=e[1];b.style.cssText='font-size:24px;padding:4px 8px';b.onclick=function(){aurora.copy(e[0]).then(function(){aurora.toast('Copied '+e[0])},function(){})};g.appendChild(b)});if(!r.length)g.textContent='No emoji match'}
$('q').oninput=draw;draw();window.__emoji={search:search,count:E.length};`);

def('shortcuts', 'windows-shortcuts', 'Windows shortcuts', '⌨️', 'A searchable cheat sheet of Windows keyboard shortcuts.', [],
  `<h3>Windows shortcuts</h3><p><input id="q" placeholder="Search: copy, screenshot, desktop..." style="width:60%"></p><div id="list"></div>`,
  R`var $=function(i){return document.getElementById(i)},S=[['Ctrl + C','Copy'],['Ctrl + X','Cut'],['Ctrl + V','Paste'],['Ctrl + Z','Undo'],['Ctrl + Y','Redo'],['Ctrl + A','Select all'],['Ctrl + F','Find'],['Ctrl + S','Save'],['Ctrl + P','Print'],['Ctrl + N','New window or document'],['Ctrl + W','Close tab or window'],['Ctrl + T','New browser tab'],['Ctrl + Shift + T','Reopen closed tab'],['Ctrl + Tab','Next tab'],['Alt + Tab','Switch between apps'],['Alt + F4','Close the app'],['Alt + Left','Go back'],['Win','Open Start'],['Win + D','Show the desktop'],['Win + E','Open File Explorer'],['Win + I','Open Settings'],['Win + L','Lock your PC'],['Win + R','Run a command'],['Win + V','Clipboard history'],['Win + Shift + S','Screenshot of part of the screen'],['Win + PrtScn','Save a screenshot of the screen'],['Win + Left or Right','Snap a window to one side'],['Win + Up','Maximise the window'],['Win + Down','Minimise the window'],['Win + Tab','Task view and desktops'],['Win + Ctrl + D','New virtual desktop'],['Win + Ctrl + Left or Right','Switch virtual desktop'],['Win + M','Minimise all windows'],['Win + P','Choose a display mode'],['Win + K','Cast to a display'],['Win + G','Open the Game Bar'],['Win + .','Emoji panel'],['Win + A','Quick settings'],['Win + N','Notifications'],['Win + W','Widgets'],['Win + X','Power user menu'],['Win + +','Zoom in with Magnifier'],['Ctrl + Shift + Esc','Open Task Manager'],['Ctrl + Alt + Del','Security options'],['F2','Rename the selected file'],['F5','Refresh'],['F11','Full screen'],['Shift + Delete','Delete without the Recycle Bin'],['Shift + F10','Open the right-click menu'],['Ctrl + Shift + N','New folder in Explorer'],['Alt + Enter','Show file properties'],['Ctrl + L','Select the address bar'],['Ctrl + D','Bookmark this page'],['Ctrl + +','Zoom in'],['Ctrl + -','Zoom out'],['Ctrl + 0','Reset zoom']];
function search(q){q=q.trim().toLowerCase();return q?S.filter(function(s){return(s[0]+' '+s[1]).toLowerCase().indexOf(q)>=0}):S}
function draw(){var l=$('list');l.textContent='';var r=search($('q').value);r.forEach(function(s){var p=document.createElement('p');var k=document.createElement('code');k.textContent=s[0];p.append(k,document.createTextNode('  '+s[1]));l.appendChild(p)});if(!r.length)l.textContent='No shortcut matches'}
$('q').oninput=draw;draw();window.__sc={search:search,count:S.length};`);

def('kanban', 'kanban-board', 'Kanban board', '🗒️', 'Move tasks across To do, Doing and Done.', ['storage'],
  `<h3>Kanban</h3><p><input id="in" placeholder="New task" style="width:50%"> <button class="p" id="add">Add to To do</button></p><div id="b" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"></div>`,
  R`var $=function(i){return document.getElementById(i)},C=['To do','Doing','Done'],T=[];
function moveTask(list,i,d){var t=list[i];if(!t)return list;var c=Math.max(0,Math.min(2,t.c+d));var o=list.slice();o[i]={t:t.t,c:c};return o}
function save(){aurora.storage.set('tasks',T).catch(function(){})}
function draw(){var b=$('b');b.textContent='';C.forEach(function(name,ci){var col=document.createElement('div');col.style.cssText='border:1px solid rgba(128,128,128,.4);border-radius:10px;padding:8px;min-height:120px';var h=document.createElement('b');h.textContent=name+' ('+T.filter(function(t){return t.c===ci}).length+')';col.appendChild(h);T.forEach(function(t,i){if(t.c!==ci)return;var d=document.createElement('div');d.style.cssText='margin:6px 0;padding:6px;border-radius:8px;background:rgba(128,128,128,.2)';d.append(document.createTextNode(t.t));[['◀',-1],['▶',1]].forEach(function(a){var x=document.createElement('button');x.textContent=a[0];x.style.marginLeft='4px';x.onclick=function(){T=moveTask(T,i,a[1]);save();draw()};d.appendChild(x)});var x=document.createElement('button');x.textContent='✕';x.style.marginLeft='4px';x.onclick=function(){T.splice(i,1);save();draw()};d.appendChild(x);col.appendChild(d)});b.appendChild(col)})}
$('add').onclick=function(){var t=$('in').value.trim().slice(0,100);if(!t||T.length>=200)return;T.push({t:t,c:0});$('in').value='';save();draw()};$('in').onkeydown=function(e){if(e.key==='Enter')$('add').click()};
aurora.storage.get('tasks').then(function(v){if(Array.isArray(v))T=v.filter(function(t){return t&&typeof t.t==='string'&&t.c>=0&&t.c<=2}).slice(0,200);draw()}).catch(draw);draw();window.__kb={moveTask:moveTask,get:function(){return T}};`);

lib.refresh();
module.exports = {};
