document.addEventListener('DOMContentLoaded', function() {

    // --- LÓGICA DA SIDEBAR (sem alterações) ---
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
    const LABEL_ZOOM_THRESHOLD = 19; 

    let map;
    let salasLayer, rotasLayer, pontosLayer, floorLayer, salasLabelsLayer;
    let salaSelecionadaAtual = null;
    let andarSelecionadoAtual = '0'; // Inicia no Térreo
    let salasData, floorData, rotasData, pontosData;

    const floorColors = {
        '0': '#fdfd96', // Amarelo Claro
        '1': '#add8e6', // Azul Claro
        '2': '#ffc0cb'  // Vermelho Claro (Rosa)
    };

    // Definição dos ícones personalizados com CSS
    // IMPORTANTE: Você precisa definir os estilos CSS correspondentes a estas classes!
    const customIcons = {
        'banheiro': L.divIcon({ className: 'poi-marker poi-marker-banheiro', html: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] }),
        'elevador': L.divIcon({ className: 'poi-marker poi-marker-elevador', html: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] }),
        'rampa':    L.divIcon({ className: 'poi-marker poi-marker-rampa',    html: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] }),
        'escada':   L.divIcon({ className: 'poi-marker poi-marker-escada',   html: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28] }),
        'totem':    L.divIcon({ className: 'poi-marker poi-marker-totem',    html: '', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] }),
        'default':  L.icon({ iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]})
    };

    function initMap() {
        map = L.map("map-container", {
            center: [CENTRO_LAT, CENTRO_LON],
            zoom: 18,
            minZoom: 17,
            maxZoom: 25,
            rotate: true,
            rotateControl: { closeOnZeroBearing: false }, 
            bearing: 0
        });

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 25,
        }).addTo(map);

        var lc = L.control.locate({
  position: 'topright',       // posição do botão
  strings: {
    title: "Mostrar minha localização atual"
  },
  drawCircle: true,           // desenha círculo de precisão
  showPopup: true,            // mostra popup com coordenadas
  locateOptions: {
    maxZoom: 16               // zoom ao localizar posição
  }
}).addTo(map);

        map.on('click', function() {
            if (salaSelecionadaAtual !== null) {
                salaSelecionadaAtual = null;
                document.getElementById('sala-input').value = '';
                limparRota(); // --- CORREÇÃO 1: Limpa a rota ao clicar no mapa
                drawSalas(); 
            }
        });

        loadGeoJSONData();
        // --- CORREÇÃO 4: Chama a função que atualiza labels E pontos no zoom ---
        map.on('zoomend moveend', updateZoomDependentLayers); 
    }

    async function loadGeoJSONData() {
        try {
            const [salasResponse, floorResponse, rotasResponse, pontosResponse] = await Promise.all([
                fetch("salas.geojson"),
                fetch("floor.geojson"),
                fetch("rotas.geojson"),
                fetch("pontos.geojson"),
            ]);

            salasData = await salasResponse.json();
            floorData = await floorResponse.json();
            rotasData = await rotasResponse.json();
            pontosData = await pontosResponse.json();

            setupAutocomplete();
            updateFloorView(); 
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            alert("Erro ao carregar dados do mapa. Verifique se os arquivos GeoJSON estão corretos e tente novamente.");
        }
    }

    // ---Função dedicada para limpar a camada da rota ---
    function limparRota() {
        if (rotasLayer && map.hasLayer(rotasLayer)) {
            map.removeLayer(rotasLayer);
        }
    }

    function drawFloor() {
        if (floorLayer) map.removeLayer(floorLayer);
        const floorFeature = floorData.features.filter(feature => 
            feature.properties.andar == andarSelecionadoAtual
        );

        if (floorFeature) {
             floorLayer = L.geoJson(floorFeature, {
                style: () => ({
                    fillColor: floorColors[andarSelecionadoAtual] || "#f0f0f0",
                    color: "transparent",
                    weight: 0,
                    fillOpacity: 1,
                }),
                interactive: false
            }).addTo(map);
            floorLayer.bringToBack();
        }
    }


    function drawSalas() {
        if (salasLayer) map.removeLayer(salasLayer);

        const salasFiltradas = salasData.features.filter(feature => 
            feature.properties.andar == andarSelecionadoAtual
        );
        const salasGeoJsonFiltrado = { ...salasData, features: salasFiltradas };

        salasLayer = L.geoJson(salasGeoJsonFiltrado, {
            style: (feature) => ({
                fillColor: feature.properties.nome === salaSelecionadaAtual ? "#0056b3" : "gray",
                color: "black",
                weight: feature.properties.nome === salaSelecionadaAtual ? 2.5 : 1,
                fillOpacity: 0.3,
            }),
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e);
                    salaSelecionadaAtual = feature.properties.nome;
                    document.getElementById('sala-input').value = salaSelecionadaAtual;
                    
                    limparRota(); // --- Limpa rota antiga ao selecionar nova sala
                    
                    const novoAndar = feature.properties.andar;
                    document.getElementById('andar-filter-select').value = novoAndar;
                    andarSelecionadoAtual = novoAndar;
                    updateFloorView();

                    const props = feature.properties;
                    const popupContent = `
                        <div class="custom-popup">
                            <img src="${props.imagem || 'https://placehold.co/400x200/eeeeee/cccccc?text=Sem+Imagem'}" alt="Imagem da sala ${props.nome}" class="popup-image" onerror="this.src='https://placehold.co/400x200/eeeeee/cccccc?text=Erro'">
                            <div class="popup-content">
                                <div class="popup-header">${props.nome || 'Sem nome'}</div>
                                <div class="popup-details">
                                    <b>Bloco:</b> ${props.bloco || 'N/A'}<br>
                                    <b>Andar:</b> ${props.andar == 0 ? 'Térreo' : props.andar + '° Andar'}<br>
                                    <b>Tipo:</b> ${props.tipo || 'N/A'}
                                </div>
                                <a href="${props.link || '#'}" target="_blank" rel="noopener noreferrer" class="popup-button">Mais Informações</a>
                            </div>
                        </div>
                    `;
                    L.popup({ minWidth: 280 }).setLatLng(e.latlng).setContent(popupContent).openOn(map);
                });
            },
        }).addTo(map);

        updateZoomDependentLayers(); // Atualiza os labels após desenhar as salas
    }

    // ---Renomeada e agora controla labels E pontos ---
    function updateZoomDependentLayers() {
        if (!salasData) return;

        // Gerencia Labels
        if (salasLabelsLayer) map.removeLayer(salasLabelsLayer);
        salasLabelsLayer = L.layerGroup();
        const showInfo = document.getElementById("mostrar-info-checkbox").checked;
        const currentZoom = map.getZoom();

        if (showInfo && currentZoom >= LABEL_ZOOM_THRESHOLD) {
            const salasParaEtiquetar = salasData.features.filter(feature => 
                feature.properties.andar == andarSelecionadoAtual
            );
            salasParaEtiquetar.forEach(feature => {
                if (feature.properties && feature.properties.nome) {
                    const featureLayer = L.geoJson(feature);
                    const center = featureLayer.getBounds().getCenter();
                    const nomeCompleto = feature.properties.nome;
                    const partesDoNome = nomeCompleto.split(' ');
                    let nomeAbreviado = partesDoNome.length > 1 ? `${partesDoNome[0]} ${partesDoNome[1].substring(0, 3)}` : nomeCompleto; 
                    
                    const label = L.marker(center, {
                        icon: L.divIcon({ className: 'sala-label', html: nomeAbreviado, iconSize: [100, 20], iconAnchor: [50, 10] }),
                        interactive: false
                    });
                    salasLabelsLayer.addLayer(label);
                }
            });
        }
        salasLabelsLayer.addTo(map);

        // ---Adicionado gerenciamento dos pontos aqui ---
        drawPontos();
    }

    function drawPontos() {
        if (pontosLayer && map.hasLayer(pontosLayer)) {
            map.removeLayer(pontosLayer);
        }

        // ---Condição de visibilidade baseada no zoom e no checkbox ---
        const currentZoom = map.getZoom();
        const checkboxChecked = document.getElementById("mostrar-pontos-checkbox").checked;
        if (!checkboxChecked || currentZoom < LABEL_ZOOM_THRESHOLD) {
            return; // Sai da função se não for para mostrar os pontos
        }
        
        const pontosFiltrados = pontosData.features.filter(feature => 
            feature.properties.andar == andarSelecionadoAtual
        );
        if (pontosFiltrados.length === 0) return;

        const pontosGeoJsonFiltrado = { ...pontosData, features: pontosFiltrados };

        pontosLayer = L.geoJson(pontosGeoJsonFiltrado, {
            pointToLayer: (feature, latlng) => {
                const tipo = feature.properties.tipo ? feature.properties.tipo.toLowerCase() : 'default';
                const icon = customIcons[tipo] || customIcons['default'];
                // ---Adiciona a opção 'draggable: false' ---
                return L.marker(latlng, { icon: icon, draggable: false });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.nome) {
                    layer.bindPopup(`<b>${feature.properties.nome}</b>`);
                }
            }
        });
        
        pontosLayer.addTo(map);
    }


    function drawRotas(destinationSalaName, accessibilityNeeded) {
        limparRota(); // ---Garante que qualquer rota antiga seja limpa primeiro

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
        let url, attr;
        map.eachLayer(l => { if (l instanceof L.TileLayer) map.removeLayer(l); });
        switch (type) {
            case "Híbrido": url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"; attr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'; break;
            case "Satélite": url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'; attr = 'Tiles &copy; Esri'; break;
            default: url = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"; attr = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
        }
        L.tileLayer(url, { attribution: attr, maxZoom: 25 }).addTo(map);
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

                        const salaAlvo = salasData.features.find(f => f.properties.nome === salaName);
                        if (salaAlvo) {
                            salaSelecionadaAtual = salaName;
                            const novoAndar = salaAlvo.properties.andar;
                            andarSelecionadoAtual = novoAndar;
                            document.getElementById('andar-filter-select').value = novoAndar;
                            
                            limparRota(); // --- CORREÇÃO 1: Limpa a rota ao escolher nova sala pelo autocomplete
                            updateFloorView(); 

                            const centroid = L.geoJson(salaAlvo).getBounds().getCenter();
                            map.setView(centroid, 21);
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

    function updateFloorView() {
        limparRota(); // --- CORREÇÃO 1: Limpa a rota ao mudar de andar
        drawFloor();
        drawSalas();
        // drawPontos e updateLabels são chamados por updateZoomDependentLayers
    }

    // --- Iniciar o mapa ---
    initMap();

    // --- Adicionar Event Listeners ---
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

    // --- CORREÇÃO 4: Checkbox de pontos agora chama a função de atualização geral ---
    document.getElementById("mostrar-pontos-checkbox").addEventListener("change", updateZoomDependentLayers);

    // --- CORREÇÃO 4: Checkbox de info agora chama a função de atualização geral ---
    document.getElementById("mostrar-info-checkbox").addEventListener("change", updateZoomDependentLayers);

    document.getElementById("andar-filter-select").addEventListener('change', (event) => {
        andarSelecionadoAtual = event.target.value;
        salaSelecionadaAtual = null;
        document.getElementById('sala-input').value = '';
        updateFloorView();
    });
});
