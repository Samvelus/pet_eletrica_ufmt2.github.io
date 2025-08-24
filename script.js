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

        loadGeoJSONData(); // Carrega os dados e desenha o mapa inicial
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
        drawLayers(); // Redesenha para remover destaque
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
            drawLayers(); // CORREÇÃO: Garante que o mapa é desenhado após carregar os dados
            
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
            console.warn(`Nenhuma sala encontrada para o andar ${andarSelecionadoAtual}. Verifique os dados no GeoJSON.`);
        }

        const salasGeoJsonFiltrado = { ...salasData, features: salasFiltradas };

        salasLayer = L.geoJson(salasGeoJsonFiltrado, {
            style: (feature) => ({
                fillColor: feature.properties.nome === salaSelecionadaAtual ? "#0056b3" : "gray",
                color: feature.properties.nome === salaSelecionadaAtual ? "#003366" : "black",
                weight: feature.properties.nome === salaSelecionadaAtual ? 2 : 1,
                fillOpacity: 0.6,
            }),
            // ALTERADO: Lógica de clique unificada (removemos o duplo clique)
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                    L.DomEvent.stopPropagation(e); // Impede que o clique se propague para o mapa

                    // --- 1. Seleciona a sala como destino ---
                    salaSelecionadaAtual = feature.properties.nome;
                    document.getElementById('sala-input').value = salaSelecionadaAtual;
                    drawLayers(); // Redesenha para destacar a sala clicada

                    // --- 2. Abre o Pop-up estilizado ---
                    const props = feature.properties;
                    const andarTexto = props.andar == 0 ? 'Térreo' : `${props.andar}° Andar`;

                    // NOVO: HTML mais estruturado para o pop-up
                    let popupContent = `
                        <div class="custom-popup">
                            <h3>${props.nome || 'Sem nome'}</h3>
                            <p><strong>Bloco:</strong> ${props.bloco || 'N/A'}</p>
                            <p><strong>Andar:</strong> ${andarTexto}</p>
                            <p><strong>Tipo:</strong> ${props.tipo || 'N/A'}</p>
                            ${props.imagem ? `<img src="${props.imagem}" alt="Imagem de ${props.nome}">` : ''}
                        </div>
                    `;
                    
                    L.popup({
                        closeButton: true,
                        className: 'custom-popup-container' // Classe para o container do Leaflet
                    })
                    .setLatLng(e.latlng)
                    .setContent(popupContent)
                    .openOn(map);
                    
                    // --- 3. (Opcional) Abre a sidebar ---
                    if (!sidebar.classList.contains('visible')) {
                        toggleSidebar();
                    }
                });
            },
        }).addTo(map);
    }

    // ... (Função updateLabels não foi alterada) ...
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
                            interactive: false, // CORREÇÃO: Garante que o texto não é clicável
                        });
                        salasLabelsLayer.addLayer(label);
                    }
                }
            });
        }
        salasLabelsLayer.addTo(map);
    }
    
    // ... (As funções drawPontos, drawRotas, updateMapTiles, setupAutocomplete não foram alteradas e podem ser mantidas como no seu código original) ...
    function drawPontos() { /* ... (sem alterações) ... */ }
    function drawRotas(destinationSalaName, accessibilityNeeded) { /* ... (sem alterações) ... */ }
    function updateMapTiles(type) { /* ... (sem alterações) ... */ }
    function setupAutocomplete() { /* ... (sem alterações) ... */ }


    // --- Event Listeners ---
    document.getElementById("mostrar-rota-btn").addEventListener("click", () => {
        if (!salaSelecionadaAtual) {
            alert("Por favor, selecione um local de destino clicando no mapa.");
            return;
        }
        drawRotas(salaSelecionadaAtual, document.getElementById("acessibilidade-checkbox").checked);
    });

    // CORREÇÃO: Adiciona listeners para os botões de andar
    // Certifique-se que seus botões no HTML tenham a classe "andar-btn" e o atributo "data-andar"
    // Exemplo: <button class="andar-btn active" data-andar="0">Térreo</button>
    document.querySelectorAll('.andar-btn').forEach(button => {
        button.addEventListener('click', function() {
            const novoAndar = this.getAttribute('data-andar');
            if (novoAndar !== andarSelecionadoAtual) {
                andarSelecionadoAtual = novoAndar;

                // Atualiza visualmente qual botão está ativo
                document.querySelectorAll('.andar-btn').forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                clearSelection(); // Limpa a rota e a seleção ao trocar de andar
                drawLayers(); // Redesenha o mapa para o novo andar
            }
        });
    });

    document.getElementById("map-type-select").addEventListener("change", (event) => updateMapTiles(event.target.value));
    document.getElementById("mostrar-pontos-checkbox").addEventListener("change", (event) => {
        if (event.target.checked) drawPontos();
        else if (pontosLayer) map.removeLayer(pontosLayer);
    });
    document.getElementById("mostrar-info-checkbox").addEventListener("change", updateLabels);

    const clearBtn = document.getElementById("clear-selection-btn");
    if(clearBtn) {
        clearBtn.addEventListener("click", clearSelection);
    }

    // Iniciar o mapa
    initMap();
});
