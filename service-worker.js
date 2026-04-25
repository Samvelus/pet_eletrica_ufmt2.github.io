
const CACHE_NAME = "totem-pet-cache-v2";
const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./mapa.html",
    "./assets/css/style.css",
    "./assets/css/home.css",
    "./assets/js/script.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
