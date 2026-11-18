/* Tenth batch: network, conversion and everyday tools. Pure logic is exposed on window.__x for tests. */
const { def } = require('./addon-library'); const R = String.raw;

def('x10_subnet', 'subnet-calculator', 'Subnet calculator', '🧭', 'Type an IPv4 address with a prefix (like 192.168.1.10/24) to see the network, mask, range and host count.', [],
  `<h3>Subnet calculator</h3><p><input id="i" value="192.168.1.10/24" style="width:200px"></p><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)};
function toInt(s){var p=String(s).trim().split('.');if(p.length!==4||p.some(function(x){return!/^\d{1,3}$/.test(x)||Number(x)>255}))throw new Error('Not a valid IPv4 address');return((Number(p[0])<<24)>>>0)+(Number(p[1])<<16)+(Number(p[2])<<8)+Number(p[3])}
function toStr(n){return[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.')}
function calc(text){var m=/^\s*([\d.]+)\s*\/\s*(\d{1,2})\s*$/.exec(text);if(!m)throw new Error('Use the form 192.168.1.10/24');var ip=toInt(m[1]),p=Number(m[2]);if(p<0||p>32)throw new Error('The prefix must be 0 to 32');var mask=p===0?0:(0xFFFFFFFF<<(32-p))>>>0,net=(ip&mask)>>>0,bc=(net|(~mask>>>0))>>>0,total=Math.pow(2,32-p),hosts=p>=31?(p===32?1:2):total-2;
return{network:toStr(net),mask:toStr(mask),wildcard:toStr(~mask>>>0),broadcast:p>=31?'n/a':toStr(bc),first:p>=31?toStr(net):toStr(net+1),last:p>=31?toStr(bc):toStr(bc-1),hosts:hosts,total:total,prefix:p,private:/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(toStr(ip))}}
function upd(){var o=$('o');o.textContent='';try{var r=calc($('i').value);[['Network',r.network+'/'+r.prefix],['Subnet mask',r.mask],['Wildcard',r.wildcard],['Broadcast',r.broadcast],['Usable range',r.first+' - '+r.last],['Usable hosts',r.hosts.toLocaleString()],['Address type',r.private?'Private':'Public']].forEach(function(x){var d=document.createElement('div');d.style.margin='3px 0';var b=document.createElement('b');b.textContent=x[0]+': ';d.appendChild(b);d.appendChild(document.createTextNode(x[1]));o.appendChild(d)})}catch(e){o.textContent=e.message}}
$('i').oninput=upd;upd();window.__net={calc:calc,toInt:toInt,toStr:toStr};`);

def('x10_datefacts', 'date-facts-finder', 'Date facts', '🗓️', 'Pick any date to see its weekday, week number, day of the year and whether it is a leap year.', [],
  `<h3>Date facts</h3><p><input id="d" type="date"></p><div id="o"></div>`,
  R`var $=function(i){return document.getElementById(i)};
var DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function leap(y){return y%4===0&&(y%100!==0||y%400===0)}
function facts(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)throw new Error('Pick a date');var y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),t=Date.UTC(y,mo-1,d),dt=new Date(t);if(dt.getUTCMonth()!==mo-1)throw new Error('That date does not exist');
var doy=Math.round((t-Date.UTC(y,0,1))/86400000)+1,wd=dt.getUTCDay(),thu=new Date(t+(3-((wd+6)%7))*86400000),isoYear=thu.getUTCFullYear(),wk=1+Math.floor((thu-Date.UTC(isoYear,0,4)+((new Date(Date.UTC(isoYear,0,4)).getUTCDay()+6)%7)*86400000)/604800000);
return{weekday:DAYS[wd],dayOfYear:doy,daysLeft:(leap(y)?366:365)-doy,leap:leap(y),isoWeek:wk,isoYear:isoYear,quarter:Math.floor((mo-1)/3)+1}}
function upd(){var o=$('o');o.textContent='';try{var f=facts($('d').value);[['Weekday',f.weekday],['Day of the year',f.dayOfYear+' ('+f.daysLeft+' left)'],['ISO week',f.isoWeek+' of '+f.isoYear],['Quarter','Q'+f.quarter],['Leap year',f.leap?'Yes':'No']].forEach(function(x){var r=document.createElement('div');r.style.margin='3px 0';var b=document.createElement('b');b.textContent=x[0]+': ';r.appendChild(b);r.appendChild(document.createTextNode(x[1]));o.appendChild(r)})}catch(e){o.textContent=e.message}}
$('d').value=new Date().toISOString().slice(0,10);$('d').oninput=upd;upd();window.__dfact={facts:facts,leap:leap};`);

def('x10_sale', 'sale-price-calculator', 'Sale price calculator', '🏷️', 'See the price after a discount and tax, and how much you save.', [],
  `<h3>Sale price</h3><p>Price <input id="p" type="number" value="120" min="0" step="any" style="width:90px"> Discount <input id="d" type="number" value="25" min="0" max="100" step="any" style="width:60px">% Tax <input id="t" type="number" value="15" min="0" step="any" style="width:60px">%</p><p class="big" id="o"></p><p id="s" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function sale(price,disc,tax){disc=Math.min(100,Math.max(0,disc));var off=price*disc/100,after=price-off,tx=after*Math.max(0,tax)/100;return{off:off,after:after,tax:tx,total:after+tx}}
function m(v){return v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function upd(){var r=sale(Math.max(0,Number($('p').value)||0),Number($('d').value)||0,Number($('t').value)||0);$('o').textContent='You pay '+m(r.total);$('s').textContent='After discount '+m(r.after)+' · you save '+m(r.off)+' · tax '+m(r.tax)}
['p','d','t'].forEach(function(i){$(i).oninput=upd});upd();window.__sale={sale:sale};`);

def('x10_age', 'exact-age-calculator', 'Exact age calculator', '🎂', 'Work out an exact age in years, months and days, and the days until the next birthday.', [],
  `<h3>Exact age</h3><p>Born <input id="b" type="date" value="1990-05-17"> On <input id="n" type="date"></p><p class="big" id="o"></p><p id="s" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function parts(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)return null;return{y:Number(m[1]),m:Number(m[2]),d:Number(m[3])}}
function dim(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate()}
function anniv(b,months){var t=b.y*12+(b.m-1)+months,y=Math.floor(t/12),m=t%12+1;return Date.UTC(y,m-1,Math.min(b.d,dim(y,m)))}
function age(born,on){var b=parts(born),n=parts(on);if(!b||!n)throw new Error('Pick both dates');var nT=Date.UTC(n.y,n.m-1,n.d);if(nT<Date.UTC(b.y,b.m-1,b.d))throw new Error('The birth date is after the other date');
var months=(n.y*12+n.m)-(b.y*12+b.m);if(anniv(b,months)>nT)months--;var days=Math.round((nT-anniv(b,months))/86400000);
var yb=n.y,next=Date.UTC(yb,b.m-1,Math.min(b.d,dim(yb,b.m)));if(next<nT)next=Date.UTC(yb+1,b.m-1,Math.min(b.d,dim(yb+1,b.m)));
return{years:Math.floor(months/12),months:months%12,days:days,toNext:Math.round((next-nT)/86400000),totalDays:Math.round((nT-Date.UTC(b.y,b.m-1,b.d))/86400000)}}
function upd(){var n=$('n').value||new Date().toISOString().slice(0,10);try{var a=age($('b').value,n);$('o').textContent=a.years+' years, '+a.months+' months, '+a.days+' days';$('s').textContent=a.totalDays.toLocaleString()+' days old · '+(a.toNext===0?'birthday today!':a.toNext+' days to the next birthday')}catch(e){$('o').textContent=e.message;$('s').textContent=''}}
['b','n'].forEach(function(i){$(i).oninput=upd});upd();window.__age={age:age};`);

def('x10_pace', 'running-pace-calculator', 'Running pace calculator', '🏃', 'Convert between pace, speed and finish time for any distance.', [],
  `<h3>Running pace</h3><p>Distance <input id="d" type="number" value="10" min="0" step="any" style="width:80px"> <select id="u"><option value="km">km</option><option value="mi">miles</option></select></p><p>Time <input id="h" type="number" value="0" min="0" style="width:55px">h <input id="m" type="number" value="50" min="0" style="width:55px">m <input id="s" type="number" value="0" min="0" style="width:55px">s</p><p class="big" id="o"></p><p id="x" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function fmt(sec){sec=Math.round(sec);var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0')}
function pace(distance,seconds){if(!(distance>0)||!(seconds>0))return null;return{perUnit:seconds/distance,speed:distance/(seconds/3600)}}
var KM=1.609344;
function upd(){var d=Number($('d').value),t=(Number($('h').value)||0)*3600+(Number($('m').value)||0)*60+(Number($('s').value)||0),p=pace(d,t),u=$('u').value;if(!p){$('o').textContent='-';$('x').textContent='';return}
$('o').textContent=fmt(p.perUnit)+' per '+(u==='km'?'km':'mile');$('x').textContent=p.speed.toFixed(2)+' '+(u==='km'?'km/h':'mph')+' · same pace is '+fmt(u==='km'?p.perUnit*KM:p.perUnit/KM)+' per '+(u==='km'?'mile':'km')}
['d','u','h','m','s'].forEach(function(i){$(i).oninput=upd;$(i).onchange=upd});upd();window.__pace={pace:pace,fmt:fmt};`);

def('x10_morse', 'morse-code-translator', 'Morse code translator', '📡', 'Translate text to Morse code and back.', ['clipboard'],
  `<h3>Morse code</h3><textarea id="i" rows="3" placeholder="Type text or Morse (dots and dashes)">SOS help</textarea><p class="big" id="o" style="word-break:break-all"></p><p><button id="c">Copy</button></p>`,
  R`var $=function(i){return document.getElementById(i)};
var M={A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',5:'.....',6:'-....',7:'--...',8:'---..',9:'----.','.':'.-.-.-',',':'--..--','?':'..--..','!':'-.-.--','/':'-..-.','@':'.--.-.','-':'-....-'},REV={};Object.keys(M).forEach(function(k){REV[M[k]]=k});
function isMorse(s){return/^[.\-\s\/|_·•—−]+$/.test(s.trim())&&/[.\-·•—−]/.test(s)}
function encode(t){return t.toUpperCase().split(/\s+/).filter(Boolean).map(function(w){return w.split('').map(function(c){return M[c]||'?'}).join(' ')}).join(' / ')}
function decode(m){var n=m.replace(/[·•]/g,'.').replace(/[—−_]/g,'-').trim();return n.split(/\s*[\/|]\s*|\s{3,}/).map(function(w){return w.split(/\s+/).filter(Boolean).map(function(c){return REV[c]||'?'}).join('')}).join(' ')}
function conv(s){return isMorse(s)?decode(s):encode(s)}
function upd(){$('o').textContent=conv($('i').value)}$('i').oninput=upd;$('c').onclick=function(){aurora.copy($('o').textContent).then(function(){aurora.toast('Copied')},function(){})};upd();window.__morse={encode:encode,decode:decode,conv:conv};`);

def('x10_unitprice', 'unit-price-compare', 'Unit price compare', '🛒', 'Which pack is the better deal? Compare the price per unit of two products.', [],
  `<h3>Unit price compare</h3><table><tr><td></td><td>Price</td><td>Amount</td></tr><tr><td>A</td><td><input id="pa" type="number" value="4.50" min="0" step="any" style="width:80px"></td><td><input id="qa" type="number" value="500" min="0" step="any" style="width:80px"></td></tr><tr><td>B</td><td><input id="pb" type="number" value="8.00" min="0" step="any" style="width:80px"></td><td><input id="qb" type="number" value="1000" min="0" step="any" style="width:80px"></td></tr></table><p class="big" id="o"></p><p id="s" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function compare(pa,qa,pb,qb){if(!(pa>=0&&qa>0&&pb>=0&&qb>0))return null;var a=pa/qa,b=pb/qb;if(Math.abs(a-b)<1e-12)return{winner:'same',a:a,b:b,pct:0};var w=a<b?'A':'B',lo=Math.min(a,b),hi=Math.max(a,b);return{winner:w,a:a,b:b,pct:hi>0?(hi-lo)/hi*100:0}}
function upd(){var n=function(i){return Number($(i).value)},r=compare(n('pa'),n('qa'),n('pb'),n('qb'));if(!r){$('o').textContent='Enter a price and an amount for both';$('s').textContent='';return}
$('o').textContent=r.winner==='same'?'Same price per unit':'Pack '+r.winner+' is the better deal';$('s').textContent='A: '+r.a.toFixed(4)+' per unit · B: '+r.b.toFixed(4)+' per unit'+(r.winner==='same'?'':' · '+r.pct.toFixed(1)+'% cheaper per unit')}
['pa','qa','pb','qb'].forEach(function(i){$(i).oninput=upd});upd();window.__unit={compare:compare};`);

def('x10_recipe', 'recipe-scaler', 'Recipe scaler', '🍳', 'Scale a list of ingredients up or down to a new number of servings.', ['clipboard'],
  `<h3>Recipe scaler</h3><p>Original servings <input id="a" type="number" value="4" min="1" style="width:60px"> New servings <input id="b" type="number" value="6" min="1" style="width:60px"></p><textarea id="i" rows="6" style="width:100%">2 cups flour\n1/2 tsp salt\n1 1/2 cups milk\n3 eggs\n250 g butter</textarea><pre id="o"></pre><p><button id="c">Copy</button></p>`,
  R`var $=function(i){return document.getElementById(i)};
function parseQty(tok){var m=/^(\d+)\s+(\d+)\/(\d+)$/.exec(tok);if(m)return Number(m[1])+Number(m[2])/Number(m[3]);m=/^(\d+)\/(\d+)$/.exec(tok);if(m)return Number(m[1])/Number(m[2]);m=/^\d+(?:[.,]\d+)?$/.exec(tok);return m?Number(tok.replace(',','.')):null}
function fmtQty(x){var whole=Math.floor(x+1e-9),f=x-whole,fr=[[0,''],[.125,'1/8'],[.25,'1/4'],[1/3,'1/3'],[.5,'1/2'],[2/3,'2/3'],[.75,'3/4'],[1,'']],best=fr[0],bd=9;fr.forEach(function(p){var d=Math.abs(f-p[0]);if(d<bd){bd=d;best=p}});if(bd>0.04||(!whole&&!best[1]))return String(Math.round(x*100)/100);if(best[0]===1)return String(whole+1);if(!best[1])return String(whole);return whole?whole+' '+best[1]:best[1]}
function scaleLine(line,k){var m=/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(.*)$/.exec(line);if(!m)return line;var q=parseQty(m[1].trim());if(q===null)return line;return fmtQty(q*k)+m[2]}
function scale(text,from,to){if(!(from>0)||!(to>0))throw new Error('Servings must be more than 0');var k=to/from;return text.split('\n').map(function(l){return scaleLine(l,k)}).join('\n')}
function upd(){try{$('o').textContent=scale($('i').value,Number($('a').value),Number($('b').value))}catch(e){$('o').textContent=e.message}}
['a','b','i'].forEach(function(i){$(i).oninput=upd});$('c').onclick=function(){aurora.copy($('o').textContent).then(function(){aurora.toast('Copied')},function(){})};upd();window.__rec={scale:scale,fmtQty:fmtQty,parseQty:parseQty};`);
