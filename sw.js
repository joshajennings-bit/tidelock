// Tidelock offline cache: files with a content hash in their address never change, so they are served from the device;
// the page itself is fetched fresh when there is a connection (so updates arrive) and from the device when there isn't
const C='tidelock';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html'])).catch(()=>{}));});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
  if(u.searchParams.has('h'))e.respondWith(caches.open(C).then(c=>c.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res;}))));
  else e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.open(C).then(c=>c.match(r).then(hit=>hit||c.match(new URL('index.html',self.registration.scope).href)))));});
