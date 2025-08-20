// import L from 'leaflet';
// import 'leaflet/dist/leaflet.css';

// Limites do mapa (ajustados para o centro da UFMT)
const MIN_LON = -56.07384725735446;
const MAX_LON = -56.06187707154574;
const MIN_LAT = -15.61345366988482;
const MAX_LAT = -15.606074048769116;

const CENTER_LAT = (MIN_LAT + MAX_LAT) / 2;
const CENTER_LON = (MIN_LON + MAX_LON) / 2;

let map;
let salasLayer; // Camada para as salas
let rotasLayer; // Camada para as rotas
let banheirosLayer; // Camada para os banheiros
let currentSelectedSala = null; // Armazena a sala atualmente selecionada

// Dados GeoJSON (serão carregados)
let salasData;
let rotasData;
let banheirosData;

// Função para inicializar o mapa
function initMap() {
    map = L.map('map', {
        center: [CENTER_LAT, CENTER_LON],
        zoom: 20,
        minZoom: 16,
        maxZoom: 25,
        maxBounds: [[MIN_LAT, MIN_LON], [MAX_LAT, MAX_LON]]
    });

    // Adicionar camada de tiles padrão (CartoDB Positron)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 25
    }).addTo(map);

    // Adicionar controle de camadas
    L.control.layers({}, {}, { collapsed: false }).addTo(map);

    loadGeoJSONData();
}

// Função para carregar dados GeoJSON
async function loadGeoJSONData() {
    try {
        const [salasResponse, rotasResponse, banheirosResponse] = await Promise.all([
            fetch('salas_1.geojson'),
            fetch('rotas.geojson'),
            fetch('banheiros.geojson')
        ]);

        salasData = await salasResponse.json();
        rotasData = await rotasResponse.json();
        banheirosData = await banheirosResponse.json();

        populateSalaSelect();
        drawSalas();
        drawBanheiros(); // Desenha banheiros por padrão
        // Rotas não são desenhadas por padrão, apenas quando solicitadas
    } catch (error) {
        console.error("Erro ao carregar dados GeoJSON:", error);
        alert("Erro ao carregar dados do mapa. Por favor, tente novamente.");
    }
}

// Preencher o select de salas
function populateSalaSelect() {
    const salaSelect = document.getElementById('sala-select');
    const nomesSalas = salasData.features
        .map(feature => feature.properties.nome)
        .filter(nome => nome) // Remove valores nulos/vazios
        .sort();

    nomesSalas.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        salaSelect.appendChild(option);
    });
}

// Desenhar salas no mapa
function drawSalas() {
    if (salasLayer) {
        map.removeLayer(salasLayer);
    }

    salasLayer = L.geoJson(salasData, {
        style: function(feature) {
            const isSelected = feature.properties.nome === currentSelectedSala;
            return {
                fillColor: isSelected ? 'red' : '#3b89f6ff', // Cor da sala selecionada
                color: 'black',
                weight: 1,
                fillOpacity: 0.6
            };
        },
        onEachFeature: function(feature, layer) {
            if (feature.properties && feature.properties.nome) {
                const mostrarInfo = document.getElementById('mostrar-info-checkbox').checked;
                if (mostrarInfo) {
                    layer.bindTooltip(feature.properties.nome);
                }
            }
        }
    }).addTo(map);

    // Adicionar ao controle de camadas
    map.addLayer(salasLayer);
    map.removeLayer(salasLayer); // Remove temporariamente para que o controle de camadas possa adicioná-lo
    L.control.layers({}).addOverlay(salasLayer, "Salas").addTo(map);
    salasLayer.addTo(map); // Adiciona de volta
}

// Desenhar banheiros no mapa
function drawBanheiros() {
    if (banheirosLayer) {
        map.removeLayer(banheirosLayer);
    }

    banheirosLayer = L.geoJson(banheirosData, {
        pointToLayer: function(feature, latlng) {
            return L.marker(latlng, {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).bindPopup(feature.properties.nome || "Banheiro");
        }
    }).addTo(map);

    // Adicionar ao controle de camadas
    map.addLayer(banheirosLayer);
    map.removeLayer(banheirosLayer);
    L.control.layers({}).addOverlay(banheirosLayer, "Banheiros").addTo(map);
    banheirosLayer.addTo(map);
}


// Função para atualizar o tipo de mapa (tiles)
function updateMapTiles(type) {
    let tileUrl;
    let attribution;

    switch (type) {
        case "Normal":
            tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
            break;
        case "Híbrido":
            tileUrl = 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png';
            attribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
            break;
        case "Satélite":
            tileUrl = 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png';
            attribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
            break;
        default:
            tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    }

    // Remover todas as camadas de tiles existentes
    map.eachLayer(function(layer) {
        if (layer instanceof L.TileLayer) {
            map.removeLayer(layer);
        }
    });

    // Adicionar a nova camada de tiles
    L.tileLayer(tileUrl, {
        attribution: attribution,
        subdomains: 'abcd',
        maxZoom: 25
    }).addTo(map);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    const salaSelect = document.getElementById('sala-select');
    const acessibilidadeCheckbox = document.getElementById('acessibilidade-checkbox');
    const mostrarRotaBtn = document.getElementById('mostrar-rota-btn');
    const mapTypeRadios = document.querySelectorAll('input[name="map-type"]');
    const mostrarPontosCheckbox = document.getElementById('mostrar-pontos-checkbox');
    const mostrarRotasCheckbox = document.getElementById('mostrar-rotas-checkbox');
    const mostrarInfoCheckbox = document.getElementById('mostrar-info-checkbox');

    salaSelect.addEventListener('change', (event) => {
        currentSelectedSala = event.target.value;
        drawSalas(); // Redesenha as salas para atualizar a cor da sala selecionada
        if (currentSelectedSala) {
            const salaAlvo = salasData.features.find(f => f.properties.nome === currentSelectedSala);
            if (salaAlvo) {
                const centroid = L.geoJson(salaAlvo).getBounds().getCenter();
                map.setView(centroid, 20); // Centraliza o mapa na sala selecionada
            }
        }
    });

    mostrarRotaBtn.addEventListener('click', () => {
        if (!currentSelectedSala) {
            alert("Por favor, selecione um local para traçar a rota.");
            return;
        }
        drawRoute(currentSelectedSala, acessibilidadeCheckbox.checked);
    });

    mapTypeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            updateMapTiles(event.target.value);
        });
    });

    mostrarPontosCheckbox.addEventListener('change', (event) => {
        if (event.target.checked) {
            drawBanheiros();
        } else {
            if (banheirosLayer) {
                map.removeLayer(banheirosLayer);
            }
        }
    });

    mostrarRotasCheckbox.addEventListener('change', (event) => {
        if (!event.target.checked) {
            if (rotasLayer) {
                map.removeLayer(rotasLayer);
            }
        }
        // A rota só é desenhada quando o botão "Como chegar?" é clicado
        // Este checkbox apenas controla a visibilidade de uma rota já desenhada
    });

    mostrarInfoCheckbox.addEventListener('change', () => {
        // Redesenha as salas para aplicar/remover tooltips
        drawSalas();
    });
});

// Função para desenhar a rota
function drawRoute(destinationSalaName, accessibilityNeeded) {
    if (rotasLayer) {
        map.removeLayer(rotasLayer); // Remove a rota anterior, se houver
    }

    const filteredRoutes = rotasData.features.filter(feature => {
        const isDestination = feature.properties.destino === destinationSalaName;
        const hasAccessibility = feature.properties.acessibilidade === "true";
        return isDestination && (accessibilityNeeded ? hasAccessibility : true);
    });

    if (filteredRoutes.length > 0) {
        rotasLayer = L.geoJson({
            type: "FeatureCollection",
            features: filteredRoutes
        }, {
            style: function(feature) {
                return {
                    color: 'blue',
                    weight: 5,
                    opacity: 0.9
                };
            },
            onEachFeature: function(feature, layer) {
                if (feature.properties && feature.properties.destino) {
                    layer.bindTooltip("Rota até " + feature.properties.destino);
                }
            }
        }).addTo(map);

        // Adicionar ao controle de camadas
        map.addLayer(rotasLayer);
        map.removeLayer(rotasLayer);
        L.control.layers({}).addOverlay(rotasLayer, "Rota").addTo(map);
        rotasLayer.addTo(map);

        // Ajustar o mapa para mostrar a rota completa
        map.fitBounds(rotasLayer.getBounds());
    } else {
        alert("Nenhuma rota encontrada para esta sala com o perfil escolhido.");
    }
}

