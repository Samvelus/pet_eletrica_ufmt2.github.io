document.addEventListener('DOMContentLoaded', function () {

    // --- SIDEBAR ---
    const toggleButton = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');

    function toggleSidebar() {
        sidebar.classList.toggle('visible');
        if (sidebar.classList.contains('visible')) {
            toggleButton.style.right = '355px';
        } else {
            toggleButton.style.right = '15px';
        }
    }
    
    // ... (código da sidebar continua o mesmo) ...
    toggleButton.addEventListener('click', function (event) {
        event.stopPropagation();
        toggleSidebar();
    });

    mainContent.addEventListener('click', function () {
        if (sidebar.classList.contains('visible')) {
            toggleSidebar();
        }
    });

    // --- MAPA LEAFLET ---
    const MIN_LON = -56.07384725735446;
    const MAX_LON = -56.06187707154574;
    const MIN_LAT = -15.61345366988482;
    const MAX_LAT = -15.606074048769116;
    const CENTRO_LAT = (MIN_LAT + MAX_LAT) / 2;
    const CENTRO_LON = (MIN_LON + MAX_LON) / 2;
    const LABEL_ZOOM_THRESHOLD = 18;

    let map;
    let salasLayer, rotasLayer, pontosLayer, salasLabelsLayer;
    let salaSelecionadaAtual = null;
    let andarSelecionadoAtual = '0';
    let salasData, rotasData, pontosData;
    
    function initMap() {
        map = L.map("map-container", { /* ... opções do mapa ... */
            center: [CENTRO_LAT, CENTRO_LON],
            zoom: 18, minZoom: 17, maxZoom: 25,
            maxBounds: [[MIN_LAT, MIN_LON], [MAX_LAT, MAX_LON]], rotate: true,
        });

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { /* ... opções do tile ... */
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd", maxZoom: 25,
        }).addTo(map);

        loadGeoJSONData();
        map.on('zoomend moveend', updateLabels);
        
        // NOVO: Listener para limpar seleção ao clicar no mapa
        map.on('click', () => {
            clearSelection();
        });
    }

    // NOVA FUNÇÃO: Limpa a sala selecionada e redesenha a interface
    function clearSelection() {
        salaSelecionadaAtual = null;
        document.getElementById('sala-input').value = '';

        if (rotasLayer) {
            map.removeLayer(rotasLayer);
        }
        
        drawLayers(); // Redesenha para remover destaque e atualizar rótulos
    }

    async function loadGeoJSONData() { /* ... (sem alterações) ... */ 
        try {
            const [salasResponse, rotasResponse, banheirosResponse] = await Promise.all([
                fetch("salas_1.geojson"), fetch("rotas.geojson"), fetch("banheiros.geojson"),
            ]);
            salasData = await salasResponse.json();
            rotasData = await rotasResponse.json();
            pontosData = await banheirosResponse.json();
            setupAutocomplete();
            drawLayers();
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            alert("Não foi possível carregar os dados do mapa.");
        }
    }
    
    function drawLayers() {
        drawSalas();
        updateLabels();
    }

    function drawSalas() {
        if (salasLayer) map.removeLayer(salasLayer);

        const salasFiltradas = salasData.features.filter(f => f.properties.andar == andarSelecionadoAtual);
        const salasGeoJsonFiltrado = { ...salasData, features: salasFiltradas };

        salasLayer = L.geoJson(salasGeoJsonFiltrado, {
            style: (feature) => ({
                fillColor: feature.properties.nome === salaSelecionadaAtual ? "#0056b3" : "gray",
                color: feature.properties.nome === salaSelecionadaAtual ? "#003366" : "black",
                weight: feature.properties.nome === salaSelecionadaAtual ? 2 : 1,
                fillOpacity: 0.6,
            }),
            // LÓGICA DE INTERAÇÃO ATUALIZADA
            onEachFeature: (feature, layer) => {
                // CLIQUE SIMPLES: Apenas mostra o Pop-up
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e); // Impede que o clique se propague para o mapa e chame clearSelection()
                    const props = feature.properties;
                    let popupContent = `<b>${props.nome || 'Sem nome'}</b><br>`;
                    popupContent += `<b>Bloco:</b> ${props.bloco || 'N/A'}<br>`;
                    popupContent += `<b>Andar:</b> ${props.andar == 0 ? 'Térreo' : props.andar + '° Andar'}<br>`;
                    popupContent += `<b>Tipo:</b> ${props.tipo || 'N/A'}`;
                    if (props.imagem) {
                        popupContent += `<br><img src="${props.imagem}" alt="Imagem de ${props.nome}" style="width:100%; max-width:200px;">`;
                    }
                    L.popup().setLatLng(e.latlng).setContent(popupContent).openOn(map);
                });

                // DUPLO CLIQUE: Seleciona como destino
                layer.on('dblclick', (e) => {
                    L.DomEvent.stopPropagation(e);
                    salaSelecionadaAtual = feature.properties.nome;
                    document.getElementById('sala-input').value = salaSelecionadaAtual;
                    drawLayers();
                    if (!sidebar.classList.contains('visible')) {
                        toggleSidebar();
                    }
                });
            },
        }).addTo(map);
    }

    // ... (Funções updateLabels, drawPontos, drawRotas, updateMapTiles, setupAutocomplete não foram alteradas)...
    function updateLabels() { /* ... (sem alterações) ... */
        if (!salasData) return;
        if (salasLabelsLayer) map.removeLayer(salasLabelsLayer);
        salasLabelsLayer = L.layerGroup();
        const showInfo = document.getElementById("mostrar-info-checkbox").checked;
        const currentZoom = map.getZoom();
        if (showInfo && currentZoom >= LABEL_ZOOM_THRESHOLD) {
            const currentBounds = map.getBounds();
            const salasParaEtiquetar = salasData.features.filter(
                (feature) => feature.properties.andar == andarSelecionadoAtual
            );
            salasParaEtiquetar.forEach((feature) => {
                if (feature.properties && feature.properties.nome && feature.properties.nome !== salaSelecionadaAtual) {
                    const featureLayer = L.geoJson(feature);
                    const center = featureLayer.getBounds().getCenter();
                    if (currentBounds.contains(center)) {
                        const label = L.marker(center, {
                            icon: L.divIcon({
                                className: "sala-label", html: `<span>${feature.properties.nome}</span>`,
                                iconSize: [100, 20], iconAnchor: [50, 10],
                            }),
                            interactive: false,
                        });
                        salasLabelsLayer.addLayer(label);
                    }
                }
            });
        }
        salasLabelsLayer.addTo(map);
    }
    function drawPontos() { /* ... (sem alterações) ... */
        if (pontosLayer) map.removeLayer(pontosLayer);
        pontosLayer = L.geoJson(pontosData, {
            pointToLayer: (feature, latlng) => L.marker(latlng, {
                icon: L.icon({
                    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
                    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
                    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
                }),
            }).bindPopup(feature.properties.nome || "Ponto de Interesse"),
        }).addTo(map);
    }
    function drawRotas(destinationSalaName, accessibilityNeeded) { /* ... (sem alterações) ... */
        if (rotasLayer) map.removeLayer(rotasLayer);
        const filteredRoutes = rotasData.features.filter((feature) => {
            const isDestination = feature.properties.destino === destinationSalaName;
            const hasAccessibility = String(feature.properties.acessibilidade).toLowerCase() === "true";
            return isDestination && (!accessibilityNeeded || hasAccessibility);
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
            alert("Nenhuma rota encontrada para este local com o perfil de acessibilidade escolhido.");
        }
    }
    function updateMapTiles(type) { /* ... (sem alterações) ... */
        let tileUrl, attribution;
        switch (type) {
            case "Híbrido":
                tileUrl = "https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png";
                attribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, ...';
                break;
            case "Satélite":
                tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                attribution = 'Tiles &copy; Esri &mdash; Source: Esri, ...';
                break;
            default:
                tileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
                attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
        }
        map.eachLayer((layer) => { if (layer instanceof L.TileLayer) map.removeLayer(layer); });
        L.tileLayer(tileUrl, { attribution, subdomains: "abcd", maxZoom: 25 }).addTo(map);
    }
    function setupAutocomplete() { /* ... (sem alterações) ... */
        const salaInput = document.getElementById('sala-input');
        const suggestionsContainer = document.getElementById('suggestions-container');
        salaInput.addEventListener('input', () => {
            const query = salaInput.value.toLowerCase().trim();
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.style.display = 'none';
            if (query.length === 0) return;
            const filteredSalas = salasData.features.filter(feature =>
                feature.properties.nome && feature.properties.nome.toLowerCase().includes(query)
            ).sort((a, b) => a.properties.nome.localeCompare(b.properties.nome));
            if (filteredSalas.length > 0) {
                suggestionsContainer.style.display = 'block';
                filteredSalas.forEach(feature => {
                    const props = feature.properties;
                    const suggestionItem = document.createElement('div');
                    suggestionItem.classList.add('suggestion-item');
                    const andarLabel = props.andar == 0 ? 'Térreo' : `${props.andar}° Andar`;
                    suggestionItem.textContent = `${props.nome} (${andarLabel})`;
                    suggestionItem.addEventListener('click', () => {
                        salaInput.value = props.nome;
                        suggestionsContainer.innerHTML = '';
                        suggestionsContainer.style.display = 'none';
                        andarSelecionadoAtual = props.andar;
                        salaSelecionadaAtual = props.nome;
                        drawLayers();
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

    // --- Event Listeners ---
    document.getElementById("mostrar-rota-btn").addEventListener("click", () => {
        // A lógica aqui continua a mesma, mas a seleção da sala agora é feita principalmente pelo duplo clique.
        if (!salaSelecionadaAtual) {
            alert("Por favor, selecione um local de destino dando um duplo clique no mapa.");
            return;
        }
        drawRotas(salaSelecionadaAtual, document.getElementById("acessibilidade-checkbox").checked);
    });

    document.getElementById("map-type-select").addEventListener("change", (event) => updateMapTiles(event.target.value));
    document.getElementById("mostrar-pontos-checkbox").addEventListener("change", (event) => {
        if (event.target.checked) drawPontos();
        else if (pontosLayer) map.removeLayer(pontosLayer);
    });
    document.getElementById("mostrar-info-checkbox").addEventListener("change", updateLabels);

    // NOVO: Listener para o botão de limpar seleção
    // Certifique-se de que o botão com id="clear-selection-btn" existe no seu HTML
    const clearBtn = document.getElementById("clear-selection-btn");
    if(clearBtn) {
        clearBtn.addEventListener("click", clearSelection);
    }
    
    // Iniciar o mapa
    initMap();
});
