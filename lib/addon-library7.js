/* Seventh batch: audio, developer and everyday tools. Each runs in the add-on sandbox and exposes its pure logic on window.__x for tests. */
const { def } = require('./addon-library'); const R = String.raw;

def('x7_btcodecs', 'bluetooth-codec-guide', 'Bluetooth codec guide', '🎧', 'Compare LDAC, aptX, AAC, SBC and LC3, and see the best codec your headphones and your device share.', [],
  `<h3>Bluetooth codec guide</h3><p class="muted">Pick what your <b>headphones</b> and your <b>phone or PC</b> support. The guide shows the best codec they have in common. Numbers are typical values.</p><div style="display:flex;gap:24px;flex-wrap:wrap"><div><b>Headphones</b><div id="ha"></div></div><div><b>Source device</b><div id="sa"></div></div></div><p id="res" class="big"></p><table id="tb" style="width:100%;border-collapse:collapse"></table><p class="muted">Tip: a higher bitrate needs a strong signal. If sound stutters, a lower mode is better than a high one.</p>`,
  R`var $=function(i){return document.getElementById(i)};
var C=[{id:'ldac',n:'LDAC',kbps:'330 / 660 / 990',q:'Hi-res, up to 96 kHz / 24-bit',lat:'high (about 150-200 ms)',who:'Sony, most Android phones, Linux (PipeWire)'},
{id:'aptxhd',n:'aptX HD',kbps:'576',q:'24-bit, 48 kHz',lat:'medium (about 150 ms)',who:'Qualcomm devices, many Android phones and PC dongles'},
{id:'aptxll',n:'aptX Low Latency',kbps:'352',q:'16-bit, 44.1 kHz',lat:'very low (about 40 ms)',who:'Gaming and video headsets with a matching transmitter'},
{id:'aptx',n:'aptX',kbps:'352',q:'16-bit, 44.1 or 48 kHz',lat:'medium (about 120 ms)',who:'Qualcomm devices'},
{id:'aac',n:'AAC',kbps:'up to about 256',q:'Good lossy quality',lat:'medium-high',who:'iPhone, Mac, many Android phones, AirPods'},
{id:'lc3',n:'LC3 (LE Audio)',kbps:'about 160-345',q:'Better than SBC at the same size',lat:'low',who:'Newer phones and earbuds with Bluetooth LE Audio'},
{id:'sbc',n:'SBC',kbps:'up to about 328',q:'Baseline, works everywhere',lat:'medium',who:'Every Bluetooth audio device'}];
function best(a,b){for(var i=0;i<C.length;i++){var id=C[i].id;if(a.indexOf(id)>-1&&b.indexOf(id)>-1)return C[i]}return C[C.length-1]}
function box(el,k){C.forEach(function(c){var l=document.createElement('label');l.style.display='block';var x=document.createElement('input');x.type='checkbox';x.value=c.id;x.checked=c.id==='sbc';x.onchange=upd;l.appendChild(x);l.appendChild(document.createTextNode(' '+c.n));el.appendChild(l)})}
function sel(el){return Array.prototype.map.call(el.querySelectorAll('input:checked'),function(x){return x.value})}
function upd(){var b=best(sel($('ha')),sel($('sa')));$('res').textContent='Best shared codec: '+b.n}
function table(){var t=$('tb');t.textContent='';var h=document.createElement('tr');['Codec','Bitrate (kbps)','Quality','Delay','Common on'].forEach(function(x){var th=document.createElement('th');th.textContent=x;th.style.textAlign='left';h.appendChild(th)});t.appendChild(h);
C.forEach(function(c){var r=document.createElement('tr');[c.n,c.kbps,c.q,c.lat,c.who].forEach(function(x){var td=document.createElement('td');td.textContent=x;td.style.padding='4px 6px';td.style.borderTop='1px solid rgba(128,128,128,.25)';r.appendChild(td)});t.appendChild(r)})}
box($('ha'));box($('sa'));table();upd();window.__bt={best:best,codecs:C};`);

def('x7_audiosize', 'audio-size-calculator', 'Audio size calculator', '🎼', 'How much space does music take at a given bitrate? Includes LDAC, FLAC and CD quality.', [],
  `<h3>Audio size calculator</h3><p>Bitrate <input id="k" type="number" value="320" min="8" max="10000" style="width:90px"> kbps <span id="pre"></span></p><p>Length <input id="h" type="number" value="1" min="0" step="0.5" style="width:80px"> hours &rarr; <b id="o1"></b></p><p>Storage <input id="g" type="number" value="1" min="0" step="0.5" style="width:80px"> GB holds <b id="o2"></b></p><p class="muted">1 MB = 1,048,576 bytes. Streaming over Bluetooth uses the same bitrate per hour.</p>`,
  R`var $=function(i){return document.getElementById(i)};
function mb(kbps,seconds){return kbps*1000/8*seconds/1048576}
function hours(kbps,gb){return kbps>0?gb*1073741824/(kbps*1000/8)/3600:0}
var P=[['MP3 128',128],['MP3 320',320],['AAC 256',256],['LDAC 330',330],['LDAC 660',660],['LDAC 990',990],['FLAC ~900',900],['CD 1411',1411]];
P.forEach(function(p){var b=document.createElement('button');b.textContent=p[0];b.style.marginRight='4px';b.onclick=function(){$('k').value=p[1];upd()};$('pre').appendChild(b)});
function fmt(m){return m>=1024?(m/1024).toFixed(2)+' GB':m.toFixed(1)+' MB'}
function upd(){var k=Math.max(1,Number($('k').value)||0),h=Math.max(0,Number($('h').value)||0),g=Math.max(0,Number($('g').value)||0);$('o1').textContent=fmt(mb(k,h*3600));var hr=hours(k,g);$('o2').textContent=hr>=1?hr.toFixed(1)+' hours':Math.round(hr*60)+' minutes'}
['k','h','g'].forEach(function(i){$(i).oninput=upd});upd();window.__as={mb:mb,hours:hours};`);

def('x7_timestamps', 'timestamp-tools', 'Timestamp tools', '🕒', 'Convert Unix timestamps and dates, and count the days between two dates.', [],
  `<h3>Timestamp tools</h3><p>Unix time <input id="u" placeholder="1700000000" style="width:170px"> <button id="now">Now</button></p><p id="r1" class="muted"></p><p>Date and time <input id="d" type="datetime-local" step="1"> <span class="muted">(your local time)</span></p><p id="r2" class="muted"></p><hr><p>Days between <input id="a" type="date"> and <input id="b" type="date"> = <b id="r3">-</b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function fromUnix(v){var n=Number(String(v).trim());if(!isFinite(n)||String(v).trim()==='')throw new Error('Type a number');var ms=Math.abs(n)>=1e11?n:n*1000;var d=new Date(ms);if(isNaN(d.getTime()))throw new Error('That is outside the valid date range');return{iso:d.toISOString(),local:d.toString(),secs:Math.floor(ms/1000),ms:ms}}
function toUnix(s){var d=new Date(s);if(isNaN(d.getTime()))throw new Error('Pick a date');return Math.floor(d.getTime()/1000)}
function daysBetween(a,b){var x=Date.parse(a+'T00:00:00Z'),y=Date.parse(b+'T00:00:00Z');if(isNaN(x)||isNaN(y))throw new Error('Pick two dates');return Math.round((y-x)/86400000)}
$('u').oninput=function(){try{var r=fromUnix($('u').value);$('r1').textContent='UTC: '+r.iso+'  |  Local: '+r.local}catch(e){$('r1').textContent=e.message}};
$('now').onclick=function(){$('u').value=Math.floor(Date.now()/1000);$('u').oninput()};
$('d').oninput=function(){try{$('r2').textContent='Unix: '+toUnix($('d').value)+' seconds'}catch(e){$('r2').textContent=e.message}};
function dd(){try{$('r3').textContent=daysBetween($('a').value,$('b').value)}catch(e){$('r3').textContent='-'}}
$('a').oninput=dd;$('b').oninput=dd;window.__ts={fromUnix:fromUnix,toUnix:toUnix,daysBetween:daysBetween};`);

def('x7_pwmeter', 'password-meter', 'Password meter', '🔐', 'Check how strong a password is. Nothing you type leaves this box.', [],
  `<h3>Password meter</h3><p><input id="p" type="password" placeholder="Type a password to test" style="width:70%"> <label><input type="checkbox" id="sh"> Show</label></p><div style="height:8px;border-radius:8px;background:rgba(128,128,128,.25);overflow:hidden"><div id="bar" style="height:100%;width:0"></div></div><p id="v" class="big"></p><p id="d" class="muted"></p><p class="muted">This is an estimate that checks length, variety, common words and simple patterns. Use a different long password for every account and a password manager.</p>`,
  R`var $=function(i){return document.getElementById(i)};
var COMMON=['password','passw0rd','qwerty','letmein','welcome','admin','login','iloveyou','monkey','dragon','football','abc123','111111','123456','12345678','123456789','000000','master','sunshine','princess','azerty','trustno1','whatever','shadow'];
function pool(p){var n=0;if(/[a-z]/.test(p))n+=26;if(/[A-Z]/.test(p))n+=26;if(/[0-9]/.test(p))n+=10;if(/[^A-Za-z0-9]/.test(p))n+=33;return n}
function entropy(p){if(!p)return 0;var bits=p.length*Math.log2(Math.max(2,pool(p)));var low=p.toLowerCase();
COMMON.forEach(function(w){if(low.indexOf(w)>-1)bits-=Math.min(bits*0.6,w.length*3.2)});
var uniq={};for(var i=0;i<p.length;i++)uniq[p[i]]=1;var u=Object.keys(uniq).length;if(u<=Math.ceil(p.length/3))bits*=0.5;
if(/(.)\1{2,}/.test(p))bits-=6;if(/(012|123|234|345|456|567|678|789|abc|bcd|cde|def|qwe|wer|ert|asd|sdf|zxc)/i.test(p))bits-=8;
return Math.max(0,bits)}
function rate(bits){return bits<28?['Very weak','#e5484d']:bits<40?['Weak','#f5a524']:bits<60?['Fair','#f5d90a']:bits<80?['Strong','#30a46c']:['Very strong','#12a594']}
function crack(bits){var s=Math.pow(2,bits)/2/1e10;if(s<1)return'instantly';var u=[['seconds',60],['minutes',60],['hours',24],['days',365],['years',1000],['thousand years',1000],['million years',1000],['billion years',1e9]];var v=s,i=0;while(i<u.length-1&&v>=u[i][1]){v/=u[i][1];i++}return(v>=100?Math.round(v):v.toFixed(1))+' '+u[i][0]}
function upd(){var p=$('p').value,b=entropy(p),r=rate(b);$('bar').style.width=Math.min(100,b/100*100)+'%';$('bar').style.background=r[1];$('v').textContent=p?r[0]:'';$('d').textContent=p?'About '+Math.round(b)+' bits. At 10 billion guesses a second, an offline attack would take about '+crack(b)+'.':''}
$('p').oninput=upd;$('sh').onchange=function(){$('p').type=$('sh').checked?'text':'password'};upd();window.__pw={entropy:entropy,rate:rate};`);

def('x7_textstats', 'text-statistics', 'Text statistics', '📊', 'Count words, characters, sentences and reading time. Works with Arabic and other languages.', [],
  `<h3>Text statistics</h3><textarea id="t" rows="8" placeholder="Paste or type text"></textarea><p id="s" class="big"></p><p id="top" class="muted"></p>`,
  R`var $=function(i){return document.getElementById(i)};
function stats(t){var words=t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[];var sent=(t.match(/[^.!?؟۔]+[.!?؟۔]+|[^.!?؟۔]+$/g)||[]).filter(function(s){return /[\p{L}\p{N}]/u.test(s)});
var freq={};words.forEach(function(w){var k=w.toLowerCase();if(k.length>2)freq[k]=(freq[k]||0)+1});var top=Object.keys(freq).sort(function(a,b){return freq[b]-freq[a]||(a<b?-1:1)}).slice(0,5).map(function(k){return k+' ('+freq[k]+')'});
return{words:words.length,chars:t.length,noSpaces:t.replace(/\s/g,'').length,sentences:sent.length,lines:t?t.split('\n').length:0,minutes:Math.max(0,Math.round(words.length/200*10)/10),top:top}}
function upd(){var s=stats($('t').value);$('s').textContent=s.words+' words · '+s.chars+' characters · '+s.sentences+' sentences · about '+s.minutes+' min to read';$('top').textContent=s.top.length?'Most used: '+s.top.join(', '):''}
$('t').oninput=upd;upd();window.__ts2={stats:stats};`);

def('x7_jwt', 'jwt-decoder', 'JWT decoder', '🪪', 'Read what is inside a JSON Web Token. It is only decoded here, never sent anywhere, and the signature is NOT checked.', [],
  `<h3>JWT decoder</h3><textarea id="t" rows="4" placeholder="Paste a token: xxxxx.yyyyy.zzzzz"></textarea><p id="msg" class="muted"></p><b>Header</b><pre id="h"></pre><b>Payload</b><pre id="p"></pre><p class="muted">Decoding is not verification. Anyone can read a token's contents, and this tool cannot tell you whether it is genuine.</p>`,
  R`var $=function(i){return document.getElementById(i)};
function b64u(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new TextDecoder('utf-8',{fatal:true}).decode(u)}
function decode(tok){var p=String(tok).trim().split('.');if(p.length!==3)throw new Error('A token has three parts separated by dots');var h,l;try{h=JSON.parse(b64u(p[0]));l=JSON.parse(b64u(p[1]))}catch(e){throw new Error('This does not look like a valid token')}
var info=[];var now=Math.floor(Date.now()/1000);['exp','nbf','iat'].forEach(function(k){if(typeof l[k]==='number'){var d=new Date(l[k]*1000).toISOString();info.push(k+' = '+d+(k==='exp'?(l[k]<now?' (EXPIRED)':' (valid)'):''))}});
return{header:h,payload:l,info:info,alg:h&&h.alg}}
function upd(){try{var r=decode($('t').value);$('h').textContent=JSON.stringify(r.header,null,2);$('p').textContent=JSON.stringify(r.payload,null,2);$('msg').textContent=(r.alg==='none'?'Warning: this token says it has no signature. ':'')+r.info.join('  |  ')}catch(e){$('h').textContent='';$('p').textContent='';$('msg').textContent=$('t').value.trim()?e.message:''}}
$('t').oninput=upd;upd();window.__jwt={decode:decode};`);

def('x7_percent', 'percentage-calculator', 'Percentage calculator', '％', 'Three quick answers: X% of a number, what percent one number is of another, and the change between two numbers.', [],
  `<h3>Percentage calculator</h3><p><input id="a1" type="number" value="15" style="width:80px">% of <input id="b1" type="number" value="200" style="width:100px"> = <b id="r1"></b></p><p><input id="a2" type="number" value="30" style="width:80px"> is what % of <input id="b2" type="number" value="120" style="width:100px"> = <b id="r2"></b></p><p>From <input id="a3" type="number" value="80" style="width:90px"> to <input id="b3" type="number" value="100" style="width:90px"> is a change of <b id="r3"></b></p>`,
  R`var $=function(i){return document.getElementById(i)};
function pctOf(p,n){return p/100*n}
function whatPct(a,b){if(b===0)return null;return a/b*100}
function change(a,b){if(a===0)return null;return (b-a)/Math.abs(a)*100}
function f(v,sfx){return v===null||!isFinite(v)?'n/a':(Math.round(v*100)/100).toLocaleString()+(sfx||'')}
function upd(){var n=function(i){return Number($(i).value)};$('r1').textContent=f(pctOf(n('a1'),n('b1')));$('r2').textContent=f(whatPct(n('a2'),n('b2')),'%');var c=change(n('a3'),n('b3'));$('r3').textContent=c===null?'n/a':(c>0?'+':'')+f(c,'%')}
['a1','b1','a2','b2','a3','b3'].forEach(function(i){$(i).oninput=upd});upd();window.__pct={pctOf:pctOf,whatPct:whatPct,change:change};`);

// Older library entries that duplicate a newer, better tool (same add-on id). Installed copies keep working; they just stop being offered twice.
const RETIRED = ['breathe', 'lava', 'gradmaker2'];
{ const { L } = require('./addon-library'); for (const k of RETIRED) delete L[k]; }
module.exports = { RETIRED };
