/* Optional add-ons that ship with Aurora Settings but are only installed when you choose them (Add-ons page > Get started). */
const { pack, page } = require('./addons');

const TEXT_TOOLS = page(`<h3>Text tools</h3><textarea id="in" rows="5" placeholder="Type or paste text here"></textarea>
<p id="row1"></p><p>Password length <input id="len" type="number" value="20" min="4" max="128" style="width:70px"> <label><input type="checkbox" id="lo" checked> a-z</label> <label><input type="checkbox" id="up" checked> A-Z</label> <label><input type="checkbox" id="di" checked> 0-9</label> <label><input type="checkbox" id="sy" checked> symbols</label> <button class="p" id="pw">Make password</button></p>
<textarea id="out" rows="5" readonly placeholder="Result"></textarea><p><button id="copy">Copy result</button></p>`, `
var $=function(i){return document.getElementById(i)};
function sha256(s){var K=[],i,j,m=new TextEncoder().encode(s),H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
for(i=2,j=0;j<64;i++){var p=1;for(var q=2;q*q<=i;q++)if(i%q==0){p=0;break}if(p){K[j++]=(Math.pow(i,1/3)*4294967296)|0}}
var l=m.length,n=((l+9+63)>>6)<<6,b=new Uint8Array(n);b.set(m);b[l]=128;var dv=new DataView(b.buffer);dv.setUint32(n-4,l*8>>>0);dv.setUint32(n-8,Math.floor(l/536870912));
function R(x,c){return(x>>>c)|(x<<(32-c))}
for(var o=0;o<n;o+=64){var w=[];for(i=0;i<16;i++)w[i]=dv.getUint32(o+i*4);for(i=16;i<64;i++){var s0=R(w[i-15],7)^R(w[i-15],18)^(w[i-15]>>>3),s1=R(w[i-2],17)^R(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
var a=H[0],B=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];for(i=0;i<64;i++){var S1=R(e,6)^R(e,11)^R(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+w[i])|0,S0=R(a,2)^R(a,13)^R(a,22),mj=(a&B)^(a&c)^(B&c),t2=(S0+mj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=B;B=a;a=(t1+t2)|0}
H[0]=(H[0]+a)|0;H[1]=(H[1]+B)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0}
return H.map(function(x){return('00000000'+(x>>>0).toString(16)).slice(-8)}).join('')}
function rnd(n){var m=Math.floor(4294967296/n)*n,x;do{x=crypto.getRandomValues(new Uint32Array(1))[0]}while(x>=m);return x%n}
function uuid(){var b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.prototype.map.call(b,function(x){return('0'+x.toString(16)).slice(-2)}).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)}
function pass(len,sets){var P={lo:'abcdefghijkmnopqrstuvwxyz',up:'ABCDEFGHJKLMNPQRSTUVWXYZ',di:'23456789',sy:'!@#$%^&*-_=+?'},ch=Object.keys(P).filter(function(k){return sets[k]});if(!ch.length)throw new Error('Pick at least one kind of character');len=Math.max(ch.length,Math.min(128,len|0));var all=ch.map(function(k){return P[k]}).join(''),out=ch.map(function(k){return P[k][rnd(P[k].length)]});while(out.length<len)out.push(all[rnd(all.length)]);for(var i=out.length-1;i>0;i--){var j=rnd(i+1),t=out[i];out[i]=out[j];out[j]=t}return out.join('')}
function b64e(t){var b=new TextEncoder().encode(t),s='';b.forEach(function(x){s+=String.fromCharCode(x)});return btoa(s)}
function b64d(t){var s=atob(t.trim());return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(s,function(c){return c.charCodeAt(0)}))}
var acts=[['JSON pretty',function(t){return JSON.stringify(JSON.parse(t),null,2)}],['JSON minify',function(t){return JSON.stringify(JSON.parse(t))}],['Base64 encode',b64e],['Base64 decode',b64d],['URL encode',encodeURIComponent],['URL decode',decodeURIComponent],['SHA-256 of text',sha256],['New UUID',uuid]];
acts.forEach(function(a){var b=document.createElement('button');b.textContent=a[0];b.onclick=function(){try{$('out').value=String(a[1]($('in').value))}catch(e){$('out').value='Error: '+e.message}};$('row1').appendChild(b);$('row1').appendChild(document.createTextNode(' '))});
$('pw').onclick=function(){try{$('out').value=pass(Number($('len').value),{lo:$('lo').checked,up:$('up').checked,di:$('di').checked,sy:$('sy').checked})}catch(e){$('out').value='Error: '+e.message}};
$('copy').onclick=function(){aurora.copy($('out').value).then(function(){aurora.toast('Copied')},function(){})};
window.__tt={sha256:sha256,uuid:uuid,pass:pass,b64e:b64e,b64d:b64d};`);

const COLOUR_TOOLS = page(`<h3>Colour tools</h3><p>Text <input id="fg" value="#ffffff" style="width:100px"> Background <input id="bg" value="#1b2a41" style="width:100px"> <button class="p" id="go">Check</button></p><p id="res"></p><div id="sw" style="display:flex;flex-wrap:wrap;gap:6px"></div><p class="muted">Click a colour to copy it.</p>`, `
var $=function(i){return document.getElementById(i)};
function rgb(h){var m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h).trim());if(!m)throw new Error('Type a colour like #3366ff');var x=m[1];if(x.length==3)x=x.split('').map(function(c){return c+c}).join('');return[0,2,4].map(function(i){return parseInt(x.slice(i,i+2),16)})}
function hex(r,g,b){return'#'+[r,g,b].map(function(v){return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')}).join('')}
function lum(c){var a=rgb(c).map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]}
function contrast(f,b){var x=lum(f),y=lum(b),r=(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);return{ratio:Math.round(r*100)/100,aa:r>=4.5,large:r>=3,aaa:r>=7}}
function hsl(h){var a=rgb(h).map(function(v){return v/255}),r=a[0],g=a[1],b=a[2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),H=0,S=0,l=(mx+mn)/2;if(mx!==mn){var d=mx-mn;S=l>0.5?d/(2-mx-mn):d/(mx+mn);H=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;H*=60}return[Math.round(H),Math.round(S*100),Math.round(l*100)]}
function fromHsl(h,s,l){s/=100;l/=100;var k=function(n){return(n+h/30)%12},a=s*Math.min(l,1-l),f=function(n){return l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)))};return hex(f(0)*255,f(8)*255,f(4)*255)}
function palette(h0){var p=hsl(h0),rot=function(d){return fromHsl((p[0]+d+360)%360,p[1],p[2])};return[hex.apply(null,rgb(h0)),rot(180),rot(-30),rot(30),rot(120),rot(240)].concat([20,35,50,65,80].map(function(x){return fromHsl(p[0],p[1],x)}))}
function run(){try{var r=contrast($('fg').value,$('bg').value);$('res').textContent='Contrast '+r.ratio+':1   Normal text: '+(r.aa?'pass':'fail')+'   Large text: '+(r.large?'pass':'fail')+'   AAA: '+(r.aaa?'pass':'no');var sw=$('sw');sw.textContent='';palette($('bg').value).forEach(function(c){var b=document.createElement('button');b.style.cssText='width:34px;height:34px;padding:0;background:'+c;b.title=c;b.className='swatch';b.onclick=function(){aurora.copy(c).then(function(){aurora.toast('Copied '+c)},function(){})};sw.appendChild(b)})}catch(e){$('res').textContent=e.message;$('sw').textContent=''}}
$('go').onclick=run;run();window.__ct={contrast:contrast,palette:palette,rgb:rgb,hsl:hsl,fromHsl:fromHsl};`);

const PULSE = page(`<h3>Pulse</h3><p>CPU <b id="cn">-</b> &nbsp; Memory <b id="rn">-</b></p><canvas id="cv" width="600" height="140" style="width:100%;height:140px"></canvas>
<p>Alert me when CPU stays at or above <input id="lim" type="number" value="90" min="10" max="100" style="width:70px">% for <input id="sec" type="number" value="10" min="3" max="120" style="width:70px"> seconds</p><p id="msg" class="muted">Recording…</p>`, `
var $=function(i){return document.getElementById(i)},cpu=[],ram=[],last=0;
function sustained(a,l,s){return a.length>=s&&a.slice(-s).every(function(v){return v>=l})}
function paint(){var cv=$('cv'),g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);g.strokeStyle='rgba(128,128,128,.3)';[.25,.5,.75].forEach(function(y){g.beginPath();g.moveTo(0,cv.height*y);g.lineTo(cv.width,cv.height*y);g.stroke()});
[[cpu,getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#4cc2ff'],[ram,'#ffb347']].forEach(function(s){if(s[0].length<2)return;g.strokeStyle=s[1];g.lineWidth=2;g.beginPath();s[0].forEach(function(v,i){var x=i/119*cv.width,y=cv.height-Math.min(100,v)/100*(cv.height-4)-2;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()})}
function tick(){aurora.system.stats().then(function(s){cpu.push(Math.max(0,Math.min(100,s.cpu)));ram.push(s.ramTotal?Math.max(0,Math.min(100,s.ramUsed/s.ramTotal*100)):0);if(cpu.length>120){cpu.shift();ram.shift()}
$('cn').textContent=cpu[cpu.length-1].toFixed(0)+'%  (blue line)';$('rn').textContent=ram[ram.length-1].toFixed(0)+'%  (orange line)';paint();
var l=Number($('lim').value)||90,sc=Number($('sec').value)||10;if(sustained(cpu,l,sc)){$('msg').textContent='CPU has been high for '+sc+' seconds';if(Date.now()-last>60000){last=Date.now();aurora.notify('CPU has been at '+l+'% or more for '+sc+' seconds').catch(function(){})}}else $('msg').textContent=cpu.length+' seconds recorded.'}).catch(function(){})}
setInterval(tick,1000);tick();window.__pulse={sustained:sustained};`);

const SAMPLES = {
  texttools: () => pack({ id: 'text-tools', name: 'Text tools', version: '1.0.0', icon: '🔤', description: 'JSON, Base64, web addresses, SHA-256, UUIDs and a password maker.', author: 'Aurora', permissions: ['clipboard'] }, TEXT_TOOLS),
  colourtools: () => pack({ id: 'colour-tools', name: 'Colour tools', version: '1.0.0', icon: '🎨', description: 'Check text contrast and make matching colour palettes.', author: 'Aurora', permissions: ['clipboard'] }, COLOUR_TOOLS),
  pulse: () => pack({ id: 'pulse', name: 'Pulse', version: '1.0.0', icon: '📊', description: 'Live CPU and memory graph with a spike alert.', author: 'Aurora', permissions: ['system', 'notify'] }, PULSE)
};
module.exports = { SAMPLES, TEXT_TOOLS, COLOUR_TOOLS, PULSE };
