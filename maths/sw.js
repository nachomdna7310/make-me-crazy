/* Guarda el juego completo en el celular la primera vez: despues abre sin internet. */
var CACHE='maths-v3';
var ARCHIVOS=['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(ARCHIVOS).catch(function(){}); }));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET') return;
  e.respondWith(
    fetch(e.request).then(function(r){
      var copia=r.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request,copia); }).catch(function(){});
      return r;
    }).catch(function(){ return caches.match(e.request).then(function(m){ return m || caches.match('./index.html'); }); })
  );
});
