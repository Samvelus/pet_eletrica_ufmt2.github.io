document.addEventListener('DOMContentLoaded', function() {
    
    // --- LÓGICA DA SIDEBAR (sem alterações) ---
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
    const LABEL_ZOOM_THRESHOLD = 19; 

    let map;
    let salasLayer, rotasLayer, pontosLayer, floorLayer, salasLabelsLayer;
    let salaSelecionadaAtual = null;
    let andarSelecionadoAtual = '0'; // Inicia no Térreo
    let salasData, floorData, rotasData, pontosData;

    // --- NOVO: Mapeamento de cores para os andares ---
    const floorColors = {
        '0': '#ffffe0', // Amarelo Claro
        '1': '#add8e6', // Azul Claro
        '2': '#ffc0cb'  // Vermelho Claro (Rosa)
    };
    
    // ---Ícones personalizados para os pontos de interesse ---
    const customIcons = {
        'banheiro': L.icon({
            iconUrl: 'https://img.icons8.com/ios-filled/50/000000/toilet-bowl.png',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        }),
        'elevador': L.icon({
            iconUrl: 'https://img.icons8.com/ios-filled/50/000000/elevator.png',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        }),
        'rampa': L.icon({
            iconUrl: 'https://img.icons8.com/ios-filled/50/000000/wheelchair.png',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        }),
        'escada': L.icon({
            iconUrl: 'https://img.icons8.com/ios-filled/50/000000/stairs.png',
            iconSize: [28, 28],
            iconAnchor: [14, 28],
            popupAnchor: [0, -28]
        }),
        'default': L.icon({ // Ícone padrão caso o tipo não seja encontrado
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            shadowSize: [41, 41]
        })
    };


    function initMap() {
        map = L.map("map-container", {
            center: [CENTRO_LAT, CENTRO_LON],
            zoom: 18,
            minZoom: 17,
            maxZoom: 25,
           // maxBounds: [[MIN_LAT, MIN_LON], [MAX_LAT, MAX_LON]],
            rotate: true,
            rotateControl: { closeOnZeroBearing: false }, 
            bearing: 0
        });

        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 25,
        }).addTo(map);

        map.on('click', function() {
            if (salaSelecionadaAtual !== null) {
                salaSelecionadaAtual = null;
                document.getElementById('sala-input').value = '';
                drawSalas(); 
            }
        });
        
        loadGeoJSONData();
        map.on('zoomend moveend', updateLabels);
    }

    async function loadGeoJSONData() {
        try {
            const [salasResponse, floorResponse, rotasResponse, pontosResponse] = await Promise.all([
                fetch("salas.geojson"),
                fetch("floor.geojson"), // Assumindo um único arquivo para todos os andares
                fetch("rotas.geojson"),
                fetch("pontos.geojson"),
            ]);

            salasData = await salasResponse.json();
            floorData = await floorResponse.json();
            rotasData = await rotasResponse.json();
            pontosData = await pontosResponse.json();
            
            setupAutocomplete();
            // Chama a função principal de atualização ---
            updateFloorView(); 
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            alert("Erro ao carregar dados do mapa. Verifique se os arquivos GeoJSON estão corretos e tente novamente.");
        }
    }
    
    // --- Função para desenhar o fundo do andar ---
    function drawFloor() {
        if (floorLayer) map.removeLayer(floorLayer);

        // Filtra o polígono do chão para o andar atual
        const floorFeature = floorData.features.filter(feature => 
            feature.properties.andar == andarSelecionadoAtual
        );

        if (floorFeature) {
             floorLayer = L.geoJson(floorFeature, {
                style: () => ({
                    fillColor: floorColors[andarSelecionadoAtual] || "#f0f0f0", // Cor padrão
                    color: "transparent",
                    weight: 0,
                    fillOpacity: 1,
                }),
                interactive: false // O chão não é clicável
            }).addTo(map);
            // Envia o chão para o fundo do mapa
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
                weight: feature.properties.nome === salaSelecionadaAtual ? 2.5 : 1, // Borda mais grossa
                fillOpacity: 0.3,
            }),
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e); // Impede que o clique se propague para o mapa
                    salaSelecionadaAtual = feature.properties.nome;
                    document.getElementById('sala-input').value = salaSelecionadaAtual;
                    
                    // --- MODIFICADO: Atualiza a visualização completa do andar ---
                    const novoAndar = feature.properties.andar;
                    document.getElementById('andar-filter-select').value = novoAndar;
                    andarSelecionadoAtual = novoAndar;
                    updateFloorView();

                    // Popup
                    const props = feature.properties;
                    let popupContent = `<b>${props.nome || 'Sem nome'}</b><br>`;
                    popupContent += `<b>Bloco:</b> ${props.bloco || 'N/A'}<br>`;
                    popupContent += `<b>Andar:</b> ${props.andar == 0 ? 'Térreo' : props.andar + '° Andar'}<br>`;
                    popupContent += `<b>Tipo:</b> ${props.tipo || 'N/A'}`;
                    
                    L.popup()
                        .setLatLng(e.latlng)
                        .setContent(popupContent)
                        .openOn(map);
                });
            },
        }).addTo(map);
        
        updateLabels();
    }
    
    function updateLabels() {
        // (sem alterações nesta função)
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
                        const partesDoNome = nomeCompleto.split(' ');
                        let nomeAbreviado = nomeCompleto; 

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

    // --- MODIFICADO: Função para desenhar pontos filtrados e com ícones ---
    function drawPontos() {
        if (pontosLayer) map.removeLayer(pontosLayer);
        
        // 1. Filtra os pontos pelo andar selecionado
        const pontosFiltrados = pontosData.features.filter(feature => 
            feature.properties.andar == andarSelecionadoAtual
        );
        
        if (pontosFiltrados.length === 0) return; // Sai se não houver pontos para este andar

        const pontosGeoJsonFiltrado = { ...pontosData, features: pontosFiltrados };

        pontosLayer = L.geoJson(pontosGeoJsonFiltrado, {
            pointToLayer: (feature, latlng) => {
                // 2. Escolhe o ícone com base na propriedade 'tipo'
                const tipo = feature.properties.tipo ? feature.properties.tipo.toLowerCase() : 'default';
                const icon = customIcons[tipo] || customIcons['default'];
                
                return L.marker(latlng, { icon: icon })
                        .bindPopup(`<b>${feature.properties.nome || 'Ponto de Interesse'}</b>`);
            },
        });

        // Adiciona ao mapa apenas se o checkbox estiver marcado
        if (document.getElementById("mostrar-pontos-checkbox").checked) {
            pontosLayer.addTo(map);
        }
    }
    
    function drawRotas(destinationSalaName, accessibilityNeeded) {
        // (sem alterações nesta função)
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
                        
                        // --- MODIFICADO: Lógica de seleção de sala ---
                        const salaAlvo = salasData.features.find(f => f.properties.nome === salaName);
                        if (salaAlvo) {
                            salaSelecionadaAtual = salaName;
                            const novoAndar = salaAlvo.properties.andar;
                            
                            // Atualiza o estado global e o seletor
                            andarSelecionadoAtual = novoAndar;
                            document.getElementById('andar-filter-select').value = novoAndar;

                            // Redesenha tudo com base no novo andar
                            updateFloorView(); 

                            // Centraliza na sala
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

    // --- NOVO: Função central para atualizar todas as camadas baseadas no andar ---
    function updateFloorView() {
        drawFloor();
        drawSalas();
        drawPontos();
        updateLabels(); // Labels também dependem do andar
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
        drawSalas(); // Apenas para destacar a sala antes da rota
        drawRotas(salaSelecionadaAtual, document.getElementById("acessibilidade-checkbox").checked);
    });

    document.getElementById("map-type-select").addEventListener("change", (event) => updateMapTiles(event.target.value));

    // --- Checkbox de pontos agora chama a função correta ---
    document.getElementById("mostrar-pontos-checkbox").addEventListener("change", (event) => {
        // A função drawPontos já verifica internamente se deve ou não adicionar a camada
        drawPontos();
    });
    
    document.getElementById("mostrar-info-checkbox").addEventListener("change", updateLabels);
    
    //Seletor de andar agora usa a função central ---
    document.getElementById("andar-filter-select").addEventListener('change', (event) => {
        andarSelecionadoAtual = event.target.value;
        salaSelecionadaAtual = null; // Limpa a seleção ao mudar de andar manualmente
        document.getElementById('sala-input').value = '';
        updateFloorView();
    });
});
