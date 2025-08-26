document.addEventListener('DOMContentLoaded', function() {
    
    // --- LÓGICA DA SIDEBAR ---
    const toggleButton = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');

    function toggleSidebar() {
        sidebar.classList.toggle('visible');
        if (sidebar.classList.contains('visible')) {
            toggleButton.style.right = '355px'; // 340px da sidebar + 15px de margem
        } else {
            toggleButton.style.right = '15px';
        }
    }

    toggleButton.addEventListener('click', function(event) {
        event.stopPropagation();
        toggleSidebar();
    });

    mainContent.addEventListener('click', function() {
        if (sidebar.classList.contains('visible')) {
            toggleSidebar();
        }
    });

    // --- LÓGICA DO MAPA LEAFLET ---
    const MIN_LON = -56.07384725735446;
    const MAX_LON = -56.06187707154574;
    const MIN_LAT = -15.61345366988482;
    const MAX_LAT = -15.606074048769116;
    const CENTRO_LAT = (MIN_LAT + MAX_LAT) / 2;
    const CENTRO_LON = (MIN_LON + MAX_LON) / 2;
    const LABEL_ZOOM_THRESHOLD = 19; // Nível de zoom para mostrar as etiquetas

    let map;
    let salasLayer, rotasLayer, pontosLayer, floorLayer, salasLabelsLayer;
    let salaSelecionadaAtual = null;
    let andarSelecionadoAtual = '0'; // Inicia no Térreo
    let salasData, floorData, rotasData, pontosData;

    function initMap() {
        map = L.map("map-container", {
            center: [CENTRO_LAT, CENTRO_LON],
            zoom: 18,
            minZoom: 17,
            maxZoom: 25,
            maxBounds: [[MIN_LAT, MIN_LON], [MAX_LAT, MAX_LON]],
            rotate: true, // Ativa a funcionalidade de rotação
        });

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 25,
        }).addTo(map);

    map.on('click', function() {
        if (salaSelecionadaAtual !== null) { // Apenas executa se algo estiver selecionado
            salaSelecionadaAtual = null; // 1. Limpa a variável de seleção
            document.getElementById('sala-input').value = ''; // Opcional: limpa o campo de busca
            drawSalas(); // 2. Redesenha as salas para aplicar o estilo padrão (sem borda)
        }
    });
        
        loadGeoJSONData();
        
        map.on('zoomend moveend', updateLabels);
    }

    async function loadGeoJSONData() {
        try {
            const [salasResponse, floorResponse, rotasResponse, pontosResponse] = await Promise.all([
                fetch("salas.geojson"),
                fetch("floor_1.geojson"),
                fetch("rotas.geojson"),
                fetch("banheiros.geojson"),
            ]);

            salasData = await salasResponse.json();
            floorData = await floorResponse.json();
            rotasData = await rotasResponse.json();
            pontosData = await pontosResponse.json();
            
            setupAutocomplete();
            drawSalas();
            drawPontos();
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            alert("Erro ao carregar dados do mapa. Verifique se a pasta 'data' está no local correto e tente novamente.");
        }
    }

    function drawSalas() {
        if (salasLayer) map.removeLayer(salasLayer);

        // Filtra as salas com base no andar selecionado
        const salasFiltradas = salasData.features.filter(feature => 
            feature.properties.andar == andarSelecionadoAtual
        );
        const salasGeoJsonFiltrado = { ...salasData, features: salasFiltradas };


        salasLayer = L.geoJson(salasGeoJsonFiltrado, {
            style: (feature) => ({
                fillColor: feature.properties.nome === salaSelecionadaAtual ? "#0056b3" : "gray",
                color:"black", // Borda mais escura na seleção
                weight: feature.properties.nome === salaSelecionadaAtual ? 0 : 1,
                fillOpacity: 0.6,
            }),
            onEachFeature: (feature, layer) => {
                // Evento de clique na sala
                layer.on('click', (e) => {
                    salaSelecionadaAtual = feature.properties.nome;
                    document.getElementById('sala-input').value = salaSelecionadaAtual;
                    drawSalas(); // Redesenha para destacar a sala clicada

                    // Cria e abre o popup
                    const props = feature.properties;
                    let popupContent = `<b>${props.nome || 'Sem nome'}</b><br>`;
                    popupContent += `<b>Bloco:</b> ${props.bloco || 'N/A'}<br>`;
                    popupContent += `<b>Andar:</b> ${props.andar == 0 ? 'Térreo' : props.andar + '° Andar'}<br>`;
                    popupContent += `<b>Tipo:</b> ${props.tipo || 'N/A'}`;
                    if (props.imagem) {
                        popupContent += `<br><img src="${props.imagem}" alt="Imagem de ${props.nome}">`;
                    }
                    
                    L.popup()
                        .setLatLng(e.latlng)
                        .setContent(popupContent)
                        .openOn(map);
                });

                // Adiciona tooltip (ao passar o rato)
                if (feature.properties && feature.properties.nome) {
                    if (document.getElementById("mostrar-info-checkbox").checked) {
                        layer.bindTooltip(feature.properties.nome);
                    }
                }
            },
        }).addTo(map);
        
        updateLabels();
    }
    
    function updateLabels() {
        if (!salasData) return;
        
        if (salasLabelsLayer) map.removeLayer(salasLabelsLayer);
        salasLabelsLayer = L.layerGroup();

        const showInfo = document.getElementById("mostrar-info-checkbox").checked;
        const currentZoom = map.getZoom();

        if (showInfo && currentZoom >= LABEL_ZOOM_THRESHOLD) {
            const currentBounds = map.getBounds();
            
            const salasParaEtiquetar = salasData.features.filter(feature => 
                feature.properties.andar == andarSelecionadoAtual
            );

            salasParaEtiquetar.forEach(feature => {
                if (feature.properties && feature.properties.nome) {
                    const featureLayer = L.geoJson(feature);
                    const center = featureLayer.getBounds().getCenter();

                    if (currentBounds.contains(center)) {
const nomeCompleto = feature.properties.nome;
            const partesDoNome = nomeCompleto.split(' '); // Divide o nome em um array de palavras
            let nomeAbreviado = nomeCompleto; // Por padrão, usa o nome completo

            // Se o nome tiver mais de uma palavra, cria a abreviação
            if (partesDoNome.length > 1) {
                nomeAbreviado = `${partesDoNome[0]} ${partesDoNome[1].substring(0, 3)}`;
            }
                        const label = L.marker(center, {
                            icon: L.divIcon({
                                className: 'sala-label',
                                html: nomeAbreviado,
                                iconSize: [100, 20],
                                iconAnchor: [50, 10]
                            }),
                            interactive: false
                        });
                        salasLabelsLayer.addLayer(label);
                    }
                }
            });
        }
        salasLabelsLayer.addTo(map);
    }


    function drawPontos() {
        if (pontosLayer) map.removeLayer(pontosLayer);
        
        pontosLayer = L.geoJson(pontosData, {
            pointToLayer: (feature, latlng) => L.marker(latlng, {
                icon: L.icon({
                    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
                    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
                    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
                }),
            }).bindPopup(feature.properties.nome || "Banheiro"),
        }).addTo(map);
    }
    
    function drawRotas(destinationSalaName, accessibilityNeeded) {
        if (rotasLayer) map.removeLayer(rotasLayer);

        const filteredRoutes = rotasData.features.filter((feature) => {
            const isDestination = feature.properties.destino === destinationSalaName;
            const hasAccessibility = feature.properties.acessibilidade === "true";
            return isDestination && (accessibilityNeeded ? hasAccessibility : true);
        });

        if (filteredRoutes.length > 0) {
            rotasLayer = L.geoJson({ type: "FeatureCollection", features: filteredRoutes }, {
                style: () => ({ color: "#0056b3", weight: 5, opacity: 0.9 }),
                onEachFeature: (feature, layer) => {
                    if (feature.properties && feature.properties.destino) {
                        layer.bindTooltip("Rota até " + feature.properties.destino);
                    }
                },
            }).addTo(map);
            map.fitBounds(rotasLayer.getBounds());
        } else {
            alert("Nenhuma rota encontrada para esta sala com o perfil escolhido.");
        }
    }

    function updateMapTiles(type) {
        let tileUrl, attribution;
        switch (type) {
            case "Híbrido":
                tileUrl = "https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png";
                attribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
                break;
            case "Satélite":
                 tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                 attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
                break;
            default:
                tileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
                attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
        }
        map.eachLayer((layer) => { if (layer instanceof L.TileLayer) map.removeLayer(layer); });
        L.tileLayer(tileUrl, { attribution, subdomains: "abcd", maxZoom: 25 }).addTo(map);
    }
    
    function setupAutocomplete() {
        const salaInput = document.getElementById('sala-input');
        const suggestionsContainer = document.getElementById('suggestions-container');

        salaInput.addEventListener('input', () => {
            const query = salaInput.value.toLowerCase().trim();
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';

            if (query.length === 0) return;

            const filteredSalas = salasData.features.filter(feature =>
                feature.properties.nome && feature.properties.nome.toLowerCase().includes(query)
            ).sort((a,b) => a.properties.nome.localeCompare(b.properties.nome));

            if (filteredSalas.length > 0) {
                suggestionsContainer.style.display = 'block';
                filteredSalas.forEach(feature => {
                    const salaName = feature.properties.nome;
                    const suggestionItem = document.createElement('div');
                    suggestionItem.classList.add('suggestion-item');
                    suggestionItem.textContent = salaName;
                    suggestionItem.addEventListener('click', () => {
                        salaInput.value = salaName;
                        suggestionsContainer.innerHTML = '';
                        suggestionsContainer.style.display = 'none';

                        salaSelecionadaAtual = salaName;
                        drawSalas();
                        const salaAlvo = salasData.features.find(f => f.properties.nome === salaSelecionadaAtual);
                        if (salaAlvo) {
                            const centroid = L.geoJson(salaAlvo).getBounds().getCenter();
                            map.setView(centroid, 20);
                        }
                    });
                    suggestionsContainer.appendChild(suggestionItem);
                });
            }
        });
        
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.autocomplete-container')) {
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
            }
        });
    }

    // Iniciar o mapa
    initMap();

    // Adicionar Event Listeners para os controles do mapa
    document.getElementById("mostrar-rota-btn").addEventListener("click", () => {
        const salaInputValue = document.getElementById("sala-input").value;
        const salaExists = salasData.features.some(f => f.properties.nome === salaInputValue);

        if (!salaExists) {
            alert("Por favor, selecione um local válido da lista para traçar a rota.");
            return;
        }
        salaSelecionadaAtual = salaInputValue;
        drawSalas();
        drawRotas(salaSelecionadaAtual, document.getElementById("acessibilidade-checkbox").checked);
    });

    document.getElementById("map-type-select").addEventListener("change", (event) => updateMapTiles(event.target.value));

    document.getElementById("mostrar-pontos-checkbox").addEventListener("change", (event) => {
        if (event.target.checked) drawPontos();
        else if (pontosLayer) map.removeLayer(pontosLayer);
    });
    
    document.getElementById("mostrar-info-checkbox").addEventListener("change", drawSalas);
    
    document.getElementById("andar-filter-select").addEventListener('change', (event) => {
        andarSelecionadoAtual = event.target.value;
        drawSalas();
    });
});

