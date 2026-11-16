// Browser side of Drop's end-to-end encryption. A page opened over plain http:// has no Web Crypto, so this is a small,
// dependency-free ChaCha20-Poly1305 (RFC 8439) decryptor for the "AUR1" format in lib/e2ee.js. It is served as part of the Drop page.
// Security notes (also shown to users): the key lives only in the link's #fragment, which browsers never send over the network.
// The page itself arrives over http, so someone who can ALTER traffic on your network could change this script; passive
// eavesdroppers (and anything that stores the traffic) only ever see ciphertext. For untrusted networks use Aurora's own receiver.
const DECRYPTOR_JS = String.raw`
(function (root) {
  'use strict';
  var HEADER_LEN = 32, TAG = 16;
  function rotl(v, c) { return (v << c) | (v >>> (32 - c)); }
  function qr(s, a, b, c, d) {
    s[a] = (s[a] + s[b]) | 0; s[d] = rotl(s[d] ^ s[a], 16); s[c] = (s[c] + s[d]) | 0; s[b] = rotl(s[b] ^ s[c], 12);
    s[a] = (s[a] + s[b]) | 0; s[d] = rotl(s[d] ^ s[a], 8); s[c] = (s[c] + s[d]) | 0; s[b] = rotl(s[b] ^ s[c], 7);
  }
  function le32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function block(key, counter, nonce, out, outOff) {
    var st = new Uint32Array(16), w = new Uint32Array(16), i;
    st[0] = 0x61707865; st[1] = 0x3320646e; st[2] = 0x79622d32; st[3] = 0x6b206574;
    for (i = 0; i < 8; i++) st[4 + i] = le32(key, i * 4);
    st[12] = counter >>> 0; for (i = 0; i < 3; i++) st[13 + i] = le32(nonce, i * 4);
    w.set(st);
    for (i = 0; i < 10; i++) { qr(w, 0, 4, 8, 12); qr(w, 1, 5, 9, 13); qr(w, 2, 6, 10, 14); qr(w, 3, 7, 11, 15); qr(w, 0, 5, 10, 15); qr(w, 1, 6, 11, 12); qr(w, 2, 7, 8, 13); qr(w, 3, 4, 9, 14); }
    for (i = 0; i < 16; i++) { var v = (w[i] + st[i]) | 0; out[outOff + i * 4] = v & 255; out[outOff + i * 4 + 1] = (v >>> 8) & 255; out[outOff + i * 4 + 2] = (v >>> 16) & 255; out[outOff + i * 4 + 3] = (v >>> 24) & 255; }
  }
  function xorStream(key, nonce, data) { // counter starts at 1 (block 0 is used for the Poly1305 key)
    var out = new Uint8Array(data.length), ks = new Uint8Array(64), ctr = 1;
    for (var off = 0; off < data.length; off += 64) { block(key, ctr++, nonce, ks, 0); var n = Math.min(64, data.length - off); for (var i = 0; i < n; i++) out[off + i] = data[off + i] ^ ks[i]; }
    return out;
  }
  var P = (1n << 130n) - 5n, M128 = (1n << 128n) - 1n;
  function leBig(b, o, len) { var r = 0n; for (var i = len - 1; i >= 0; i--) r = (r << 8n) | BigInt(b[o + i]); return r; }
  function poly1305(otk, msg) { // msg: ONE Uint8Array whose length is a multiple of 16 (RFC 8439 2.8: padded AAD | padded ciphertext | lengths)
    var r = leBig(otk, 0, 16) & 0x0ffffffc0ffffffc0ffffffc0fffffffn, s = leBig(otk, 16, 16), acc = 0n, hib = 1n << 128n;
    for (var o = 0; o < msg.length; o += 16) acc = ((acc + leBig(msg, o, 16) + hib) * r) % P;
    var t = (acc + s) & M128, tag = new Uint8Array(16); for (var i = 0; i < 16; i++) { tag[i] = Number(t & 255n); t >>= 8n; } return tag;
  }
  function pad16(len) { return new Uint8Array((16 - (len % 16)) % 16); }
  function u64le(n) { var b = new Uint8Array(8); for (var i = 0; i < 8; i++) { b[i] = n % 256; n = Math.floor(n / 256); } return b; }
  function openChunk(key, nonce, aad, sealed) {
    if (sealed.length < TAG) throw new Error('The file is damaged or cut short');
    var ct = sealed.subarray(0, sealed.length - TAG), tag = sealed.subarray(sealed.length - TAG), otk = new Uint8Array(64); block(key, 0, nonce, otk, 0);
    var ap = aad.length + pad16(aad.length).length, cp = ct.length + pad16(ct.length).length, msg = new Uint8Array(ap + cp + 16);
    msg.set(aad, 0); msg.set(ct, ap); msg.set(u64le(aad.length), ap + cp); msg.set(u64le(ct.length), ap + cp + 8);
    var want = poly1305(otk, msg), diff = 0;
    for (var i = 0; i < 16; i++) diff |= want[i] ^ tag[i];
    if (diff !== 0) throw new Error('Wrong key, or the file was changed');
    return xorStream(key, nonce, ct);
  }
  function decrypt(key, data, onProgress) {
    if (!(key instanceof Uint8Array) || key.length !== 32) throw new Error('That key is not valid');
    var magic = String.fromCharCode(data[0], data[1], data[2], data[3]);
    if (data.length < HEADER_LEN || magic !== 'AUR1') throw new Error('This is not an Aurora-encrypted file');
    var log2 = data[4]; if (log2 < 10 || log2 > 22 || data[5] !== 0) throw new Error('This file needs a password or a newer Aurora');
    var header = data.subarray(0, HEADER_LEN), full = (1 << log2) + TAG, off = HEADER_LEN, i = 0, parts = [], total = 0;
    if (data.length - off < TAG) throw new Error('The file is damaged or cut short');
    for (;;) {
      var rem = data.length - off, last = rem <= full, len = last ? rem : full, aad = new Uint8Array(HEADER_LEN + 1); aad.set(header); aad[HEADER_LEN] = last ? 1 : 0;
      var nonce = new Uint8Array(12), hi = Math.floor(i / 4294967296), lo = i >>> 0; nonce[4] = (hi >>> 24) & 255; nonce[5] = (hi >>> 16) & 255; nonce[6] = (hi >>> 8) & 255; nonce[7] = hi & 255; nonce[8] = (lo >>> 24) & 255; nonce[9] = (lo >>> 16) & 255; nonce[10] = (lo >>> 8) & 255; nonce[11] = lo & 255;
      var plain = openChunk(key, nonce, aad, data.subarray(off, off + len)); parts.push(plain); total += plain.length; off += len; i++;
      if (onProgress) onProgress(off, data.length); if (last) break;
    }
    return { parts: parts, size: total };
  }
  function b64uToBytes(s) { if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('That key is not valid'); s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  root.AuroraE2EE = { decrypt: decrypt, b64uToBytes: b64uToBytes };
})(typeof window !== 'undefined' ? window : globalThis);
`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The page a receiver opens. It knows only the (encrypted) download path and size: the key and the file name are in the link's #fragment.
function viewerPage({ blobPath, size }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Aurora Drop</title>
<style>body{font:16px system-ui,sans-serif;background:#0f1218;color:#f3f4f6;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:460px;padding:28px;text-align:center}.card{background:#181c25;border:1px solid #2a2f3a;border-radius:18px;padding:26px}h1{font-size:20px;margin:0 0 8px}p{color:#a0a5b1;font-size:14px;line-height:1.5}button{background:#4cc2ff;color:#00263a;border:0;border-radius:10px;padding:12px 22px;font:inherit;font-weight:600;cursor:pointer;margin-top:10px}button:disabled{opacity:.5}.bar{height:6px;background:#2a2f3a;border-radius:6px;overflow:hidden;margin-top:14px}.bar i{display:block;height:100%;width:0;background:#4cc2ff}.err{color:#ff6b6b}small{color:#7d8290}</style></head><body><main><div class="card">
<h1>🔒 Encrypted file</h1><p id="msg">Sent with Aurora Drop. It is encrypted end to end: the key is in this link and is never sent over the network.</p><p id="name"></p><button id="go">Decrypt and save</button><div class="bar"><i id="pr"></i></div><p><small>Size on the wire: ${esc(Math.round(size / 1024).toLocaleString('en-US'))} KB</small></p></div></main>
<script>${DECRYPTOR_JS}</script>
<script>
(function(){var $=function(i){return document.getElementById(i)},msg=$('msg'),go=$('go'),MAX=600*1024*1024;
function fail(t){msg.textContent=t;msg.className='err';go.disabled=true}
var h=location.hash.slice(1),q={};h.split('&').forEach(function(p){var i=p.indexOf('=');if(i>0)q[p.slice(0,i)]=p.slice(i+1)});
var key=null,name='file';try{key=AuroraE2EE.b64uToBytes(q.k||'');if(key.length!==32)throw 0;if(q.n){var raw=atob(q.n.replace(/-/g,'+').replace(/_/g,'/'));var b=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)b[i]=raw.charCodeAt(i);name=new TextDecoder().decode(b).replace(/[\\\\/:*?"<>|\\u0000-\\u001f]/g,'_').slice(0,150)||'file'}}catch(e){fail('This link is missing its key. Ask the sender for the full link, including the part after #.')}
if(key)$('name').textContent=name;
if(${size} > MAX){ if(key) fail('This file is too large to decrypt in a browser. Open the link in Aurora instead.') }
go.onclick=function(){go.disabled=true;msg.textContent='Downloading…';fetch(${JSON.stringify(blobPath)},{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('The share has ended or was already used (HTTP '+r.status+')');return r.arrayBuffer()}).then(function(buf){msg.textContent='Decrypting…';return new Promise(function(res,rej){setTimeout(function(){try{res(AuroraE2EE.decrypt(key,new Uint8Array(buf),function(a,t){$('pr').style.width=Math.round(a/t*100)+'%'}))}catch(e){rej(e)}},30)})}).then(function(out){var blob=new Blob(out.parts,{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();msg.textContent='Done. Your file was decrypted on this device.';$('pr').style.width='100%'}).catch(function(e){fail(e.message||'Could not decrypt this file')})}})();
</script></body></html>`;
}
module.exports = { DECRYPTOR_JS, viewerPage };
