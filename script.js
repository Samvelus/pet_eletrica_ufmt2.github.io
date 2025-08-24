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
    let andarSelecionadoAtual = '0'; // Começa no térreo por padrão
    let salasData, rotasData, pontosData;

    function initMap() {
        map = L.map("map-container", {
            center: [CENTRO_LAT, CENTRO_LON],
            zoom: 18,
            minZoom: 17,
            maxZoom: 25,
            maxBounds: [[MIN_LAT, MIN_LON], [MAX_LAT, MAX_LON]],
            rotate: true,
        });

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 25,
        }).addTo(map);

        map.addControl(new L.Control.Rotate());

        loadGeoJSONData();
        map.on('zoomend moveend', updateLabels);

        map.on('click', () => {
            clearSelection();
        });
    }

    function clearSelection() {
        salaSelecionadaAtual = null;
        document.getElementById('sala-input').value = '';

        if (rotasLayer) {
            map.removeLayer(rotasLayer);
        }
        drawLayers();
    }

    async function loadGeoJSONData() {
        try {
            const [salasResponse, rotasResponse, banheirosResponse] = await Promise.all([
                fetch("salas_1.geojson"),
                fetch("rotas.geojson"),
                fetch("banheiros.geojson"),
            ]);
            if (!salasResponse.ok) throw new Error(`Erro ao carregar salas: ${salasResponse.statusText}`);
            
            salasData = await salasResponse.json();
            rotasData = await rotasResponse.json();
            pontosData = await banheirosResponse.json();

            setupAutocomplete();
            drawLayers();
            
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            alert("Não foi possível carregar os dados do mapa. Verifique o console para mais detalhes.");
        }
    }

    function drawLayers() {
        drawSalas();
        updateLabels();
    }

    function drawSalas() {
        if (salasLayer) map.removeLayer(salasLayer);

        const salasFiltradas = salasData.features.filter(f => f.properties.andar == andarSelecionadoAtual);
        
        if (salasFiltradas.length === 0) {
            console.warn(`Nenhuma sala encontrada para o andar ${andarSelecionadoAtual}.`);
        }

        const salasGeoJsonFiltrado = { ...salasData, features: salasFiltradas };

        salasLayer = L.geoJson(salasGeoJsonFiltrado, {
            style: (feature) => ({
                fillColor: feature.properties.nome === salaSelecionadaAtual ? "#0056b3" : "gray",
                color: feature.properties.nome === salaSelecionadaAtual ? "#003366" : "black",
                weight: feature.properties.nome === salaSelecionadaAtual ? 2 : 1,
                fillOpacity: 0.6,
            }),
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    salaSelecionadaAtual = feature.properties.nome;
                    document.getElementById('sala-input').value = salaSelecionadaAtual;
                    drawLayers();

                    const props = feature.properties;
                    const andarTexto = props.andar == 0 ? 'Térreo' : `${props.andar}° Andar`;
                    let popupContent = `
                        <div class="custom-popup">
                            <h3>${props.nome || 'Sem nome'}</h3>
                            <p><strong>Bloco:</strong> ${props.bloco || 'N/A'}</p>
                            <p><strong>Andar:</strong> ${andarTexto}</p>
                            <p><strong>Tipo:</strong> ${props.tipo || 'N/A'}</p>
                            ${props.imagem ? `<img src="${props.imagem}" alt="Imagem de ${props.nome}">` : ''}
                        </div>
                    `;
                    L.popup({ closeButton: true, className: 'custom-popup-container' })
                     .setLatLng(e.latlng).setContent(popupContent).openOn(map);
                    
                    if (!sidebar.classList.contains('visible')) {
                        toggleSidebar();
                    }
                });
            },
        }).addTo(map);
    }

    function updateLabels() {
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
                                className: "sala-label",
                                html: `<span>${feature.properties.nome}</span>`,
                                iconSize: [100, 20],
                                iconAnchor: [50, 10],
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
    
    // --- FUNÇÕES RESTAURADAS ---

    function drawPontos() {
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

    function drawRotas(destinationSalaName, accessibilityNeeded) {
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

    function updateMapTiles(type) {
        let tileUrl, attribution;
        map.eachLayer((layer) => { if (layer instanceof L.TileLayer) map.removeLayer(layer); });

        switch (type) {
            case "Híbrido":
                tileUrl = "https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png";
                attribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, ...';
                break;
            case "Satélite":
                tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                attribution = 'Tiles &copy; Esri &mdash; Source: Esri, ...';
                break;
            default: // "Normal"
                tileUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
                attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
        }
        
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

            const filteredSalas = salasData.features
                .filter(feature => feature.properties.nome && feature.properties.nome.toLowerCase().includes(query))
                .sort((a, b) => a.properties.nome.localeCompare(b.properties.nome));

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

                        // Simula o clique no botão do andar correspondente para atualizar a UI
                        document.querySelector(`.andar-btn[data-andar='${props.andar}']`)?.click();
                        
                        drawLayers(); // Redesenha com a sala selecionada

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
        if (!salaSelecionadaAtual) {
            alert("Por favor, selecione um local de destino clicando no mapa ou buscando na barra lateral.");
            return;
        }
        drawRotas(salaSelecionadaAtual, document.getElementById("acessibilidade-checkbox").checked);
    });

    document.querySelectorAll('.andar-btn').forEach(button => {
        button.addEventListener('click', function() {
            const novoAndar = this.getAttribute('data-andar');
            if (novoAndar !== andarSelecionadoAtual) {
                andarSelecionadoAtual = novoAndar;
                document.querySelectorAll('.andar-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                clearSelection();
                drawLayers();
            }
        });
    });

    document.getElementById("map-type-select").addEventListener("change", (event) => updateMapTiles(event.target.value));
    
    document.getElementById("mostrar-pontos-checkbox").addEventListener("change", (event) => {
        if (event.target.checked) {
            drawPontos();
        } else if (pontosLayer) {
            map.removeLayer(pontosLayer);
        }
    });

    document.getElementById("mostrar-info-checkbox").addEventListener("change", updateLabels);

    const clearBtn = document.getElementById("clear-selection-btn");
    if(clearBtn) {
        clearBtn.addEventListener("click", clearSelection);
    }

    // Iniciar o mapa
    initMap();
});
