// ===================================================================
// CONFIGURAÇÕES GLOBAIS
// ===================================================================
const CONFIG = {
    map: {
        MIN_LON: -56.07384725735446,
        MAX_LON: -56.06187707154574,
        MIN_LAT: -15.61345366988482,
        MAX_LAT: -15.606074048769116,
        INITIAL_ZOOM: 18,
        MIN_ZOOM: 17,
        MAX_ZOOM: 25,
        LABEL_ZOOM_THRESHOLD: 19,
        ROUTE_ZOOM: 21
    },
    colors: {
        floor: {
            '0': '#fdfd96',
            '1': '#add8e6',
            '2': '#ffc0cb'
        },
        selected: '#0056b3',
        default: 'gray',
        route: '#0056b3'
    },
    debounce: {
        autocomplete: 300
    }
};

// ===================================================================
// CLASSE PRINCIPAL - GERENCIAMENTO DE ESTADO
// ===================================================================
class MapaInterativoState {
    constructor() {
        this.map = null;
        this.layers = {
            salas: null,
            rotas: null,
            pontos: null,
            floor: null,
            salasLabels: null
        };
        this.data = {
            salas: null,
            floor: null,
            rotas: null,
            pontos: null
        };
        this.selection = {
            sala: null,
            andar: '0'
        };
        this.isLoading = false;
    }

    setSala(nome) {
        this.selection.sala = nome;
    }

    setAndar(andar) {
        this.selection.andar = andar;
    }

    clearSelection() {
        this.selection.sala = null;
    }
}

// ===================================================================
// UTILITÁRIOS
// ===================================================================
const Utils = {
    // Debounce para otimizar eventos frequentes
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Mostrar notificação em vez de alert
    showNotification(message, type = 'info') {
        // Remove notificações anteriores
        const existing = document.querySelector('.map-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = `map-notification map-notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
            color: white;
            padding: 15px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    // Loading spinner
    showLoading(show = true) {
        let loader = document.getElementById('map-loader');
        if (show && !loader) {
            loader = document.createElement('div');
            loader.id = 'map-loader';
            loader.innerHTML = '<div class="spinner"></div>';
            loader.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255,255,255,0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            `;
            document.body.appendChild(loader);
        } else if (!show && loader) {
            loader.remove();
        }
    },

    // Abreviar nome de sala de forma inteligente
    abbreviateName(name, maxLength = 15) {
        if (!name || name.length <= maxLength) return name;
        
        const parts = name.split(' ');
        if (parts.length === 1) {
            return name.substring(0, maxLength) + '...';
        }
        
        // Mantém primeira palavra e abrevia as seguintes
        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            const abbreviated = parts[i].substring(0, 3);
            if ((result + ' ' + abbreviated).length > maxLength) break;
            result += ' ' + abbreviated;
        }
        return result;
    },

    // Validar dados GeoJSON
    validateGeoJSON(data, type) {
        if (!data || !data.features || !Array.isArray(data.features)) {
            throw new Error(`Dados GeoJSON inválidos para ${type}`);
        }
        return true;
    },

    // Calcular centro do mapa
    getMapCenter() {
        const centerLat = (CONFIG.map.MIN_LAT + CONFIG.map.MAX_LAT) / 2;
        const centerLon = (CONFIG.map.MIN_LON + CONFIG.map.MAX_LON) / 2;
        return [centerLat, centerLon];
    }
};

// ===================================================================
// GERENCIADOR DE ÍCONES
// ===================================================================
const IconManager = {
    customIcons: {
        'banheiro': L.divIcon({ 
            className: 'poi-marker poi-marker-banheiro', 
            html: '', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'elevador': L.divIcon({ 
            className: 'poi-marker poi-marker-elevador', 
            html: '', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'rampa': L.divIcon({ 
            className: 'poi-marker poi-marker-rampa', 
            html: '', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'escada': L.divIcon({ 
            className: 'poi-marker poi-marker-escada', 
            html: '', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'totem': L.divIcon({ 
            className: 'poi-marker poi-marker-totem', 
            html: '', 
            iconSize: [32, 32], 
            iconAnchor: [16, 32], 
            popupAnchor: [0, -32] 
        }),
        'default': L.icon({ 
            iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png', 
            iconSize: [25, 41], 
            iconAnchor: [12, 41], 
            popupAnchor: [1, -34], 
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', 
            shadowSize: [41, 41]
        })
    },

    getIcon(tipo) {
        const tipoLower = tipo ? tipo.toLowerCase() : 'default';
        return this.customIcons[tipoLower] || this.customIcons['default'];
    }
};

// ===================================================================
// GERENCIADOR DE LAYERS
// ===================================================================
class LayerManager {
    constructor(state) {
        this.state = state;
    }

    removeLayer(layerName) {
        const layer = this.state.layers[layerName];
        if (layer && this.state.map.hasLayer(layer)) {
            this.state.map.removeLayer(layer);
            this.state.layers[layerName] = null;
        }
    }

    clearRoute() {
        this.removeLayer('rotas');
    }

    drawFloor() {
        this.removeLayer('floor');
        
        if (!this.state.data.floor) return;

        const floorFeatures = this.state.data.floor.features.filter(
            feature => feature.properties.andar === this.state.selection.andar
        );

        if (floorFeatures.length === 0) return;

        this.state.layers.floor = L.geoJson(floorFeatures, {
            style: () => ({
                fillColor: CONFIG.colors.floor[this.state.selection.andar] || "#f0f0f0",
                color: "transparent",
                weight: 0,
                fillOpacity: 1,
            }),
            interactive: false
        }).addTo(this.state.map);
        
        this.state.layers.floor.bringToBack();
    }

    drawSalas() {
        this.removeLayer('salas');

        if (!this.state.data.salas) return;

        const salasFiltradas = this.state.data.salas.features.filter(
            feature => feature.properties.andar === this.state.selection.andar
        );

        if (salasFiltradas.length === 0) return;

        const salasGeoJsonFiltrado = { 
            ...this.state.data.salas, 
            features: salasFiltradas 
        };

        this.state.layers.salas = L.geoJson(salasGeoJsonFiltrado, {
            style: (feature) => ({
                fillColor: feature.properties.nome === this.state.selection.sala 
                    ? CONFIG.colors.selected 
                    : CONFIG.colors.default,
                color: "black",
                weight: feature.properties.nome === this.state.selection.sala ? 2.5 : 1,
                fillOpacity: 0.3,
            }),
            onEachFeature: (feature, layer) => {
                layer.on('click', (e) => this.handleSalaClick(e, feature));
            },
        }).addTo(this.state.map);

        this.updateZoomDependentLayers();
    }

    handleSalaClick(e, feature) {
        L.DomEvent.stopPropagation(e);
        
        this.state.setSala(feature.properties.nome);
        document.getElementById('sala-input').value = this.state.selection.sala;
        
        this.clearRoute();
        
        const novoAndar = feature.properties.andar;
        document.getElementById('andar-filter-select').value = novoAndar;
        this.state.setAndar(novoAndar);
        this.updateFloorView();

        const props = feature.properties;
        const popupContent = this.createPopupContent(props);
        
        L.popup({ minWidth: 280 })
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(this.state.map);
    }

    createPopupContent(props) {
        const andarText = props.andar === '0' ? 'Térreo' : `${props.andar}° Andar`;
        return `
            <div class="custom-popup">
                <img src="${props.imagem || 'https://placehold.co/400x200/eeeeee/cccccc?text=Sem+Imagem'}" 
                     alt="Imagem da sala ${props.nome}" 
                     class="popup-image" 
                     onerror="this.src='https://placehold.co/400x200/eeeeee/cccccc?text=Erro'">
                <div class="popup-content">
                    <div class="popup-header">${props.nome || 'Sem nome'}</div>
                    <div class="popup-details">
                        <b>Bloco:</b> ${props.bloco || 'N/A'}<br>
                        <b>Andar:</b> ${andarText}<br>
                        <b>Tipo:</b> ${props.tipo || 'N/A'}
                    </div>
                    <a href="${props.link || '#'}" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       class="popup-button">Mais Informações</a>
                </div>
            </div>
        `;
    }

    drawPontos() {
        this.removeLayer('pontos');

        const currentZoom = this.state.map.getZoom();
        const checkboxChecked = document.getElementById("mostrar-pontos-checkbox").checked;
        
        if (!checkboxChecked || currentZoom < CONFIG.map.LABEL_ZOOM_THRESHOLD) {
            return;
        }

        if (!this.state.data.pontos) return;

        const pontosFiltrados = this.state.data.pontos.features.filter(
            feature => feature.properties.andar === this.state.selection.andar
        );

        if (pontosFiltrados.length === 0) return;

        const pontosGeoJsonFiltrado = { 
            ...this.state.data.pontos, 
            features: pontosFiltrados 
        };

        this.state.layers.pontos = L.geoJson(pontosGeoJsonFiltrado, {
            pointToLayer: (feature, latlng) => {
                const icon = IconManager.getIcon(feature.properties.tipo);
                return L.marker(latlng, { icon: icon, draggable: false });
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties && feature.properties.nome) {
                    layer.bindPopup(`<b>${feature.properties.nome}</b>`);
                }
            }
        }).addTo(this.state.map);
    }

    drawLabels() {
        this.removeLayer('salasLabels');
        
        if (!this.state.data.salas) return;

        this.state.layers.salasLabels = L.layerGroup();
        
        const showInfo = document.getElementById("mostrar-info-checkbox").checked;
        const currentZoom = this.state.map.getZoom();

        if (!showInfo || currentZoom < CONFIG.map.LABEL_ZOOM_THRESHOLD) {
            this.state.layers.salasLabels.addTo(this.state.map);
            return;
        }

        const salasParaEtiquetar = this.state.data.salas.features.filter(
            feature => feature.properties.andar === this.state.selection.andar
        );

        salasParaEtiquetar.forEach(feature => {
            if (feature.properties && feature.properties.nome) {
                const featureLayer = L.geoJson(feature);
                const center = featureLayer.getBounds().getCenter();
                const nomeAbreviado = Utils.abbreviateName(feature.properties.nome);
                
                const label = L.marker(center, {
                    icon: L.divIcon({ 
                        className: 'sala-label', 
                        html: nomeAbreviado, 
                        iconSize: [100, 20], 
                        iconAnchor: [50, 10] 
                    }),
                    interactive: false
                });
                
                this.state.layers.salasLabels.addLayer(label);
            }
        });

        this.state.layers.salasLabels.addTo(this.state.map);
    }

    drawRotas(destinationSalaName, accessibilityNeeded) {
        this.clearRoute();

        if (!this.state.data.rotas) {
            Utils.showNotification('Dados de rotas não carregados', 'error');
            return;
        }

        const filteredRoutes = this.state.data.rotas.features.filter((feature) => {
            const isDestination = feature.properties.destino === destinationSalaName;
            const hasAccessibility = feature.properties.acessibilidade === "true";
            return isDestination && (accessibilityNeeded ? hasAccessibility : true);
        });

        if (filteredRoutes.length === 0) {
            Utils.showNotification(
                'Nenhuma rota encontrada para esta sala com o perfil escolhido', 
                'error'
            );
            return;
        }

        this.state.layers.rotas = L.geoJson(
            { type: "FeatureCollection", features: filteredRoutes }, 
            {
                style: () => ({ 
                    color: CONFIG.colors.route, 
                    weight: 5, 
                    opacity: 0.9 
                }),
                onEachFeature: (feature, layer) => {
                    if (feature.properties && feature.properties.destino) {
                        layer.bindTooltip("Rota até " + feature.properties.destino);
                    }
                },
            }
        ).addTo(this.state.map);

        this.state.map.fitBounds(this.state.layers.rotas.getBounds());
        Utils.showNotification('Rota traçada com sucesso!', 'success');
    }

    updateZoomDependentLayers() {
        this.drawLabels();
        this.drawPontos();
    }

    updateFloorView() {
        this.clearRoute();
        this.drawFloor();
        this.drawSalas();
    }
}

// ===================================================================
// GERENCIADOR DE AUTOCOMPLETE
// ===================================================================
class AutocompleteManager {
    constructor(state, layerManager) {
        this.state = state;
        this.layerManager = layerManager;
        this.setupAutocomplete();
    }

    setupAutocomplete() {
        const salaInput = document.getElementById('sala-input');
        const suggestionsContainer = document.getElementById('suggestions-container');

        const debouncedSearch = Utils.debounce((query) => {
            this.handleSearch(query, suggestionsContainer);
        }, CONFIG.debounce.autocomplete);

        salaInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });

        salaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
            }
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.autocomplete-container')) {
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
            }
        });
    }

    handleSearch(query, suggestionsContainer) {
        const normalizedQuery = query.toLowerCase().trim();
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';

        if (normalizedQuery.length === 0) return;

        if (!this.state.data.salas) return;

        const filteredSalas = this.state.data.salas.features
            .filter(feature =>
                feature.properties.nome && 
                feature.properties.nome.toLowerCase().includes(normalizedQuery)
            )
            .sort((a, b) => 
                a.properties.nome.localeCompare(b.properties.nome)
            );

        if (filteredSalas.length > 0) {
            suggestionsContainer.style.display = 'block';
            filteredSalas.forEach(feature => {
                this.createSuggestionItem(feature, suggestionsContainer);
            });
        }
    }

    createSuggestionItem(feature, container) {
        const salaName = feature.properties.nome;
        const suggestionItem = document.createElement('div');
        suggestionItem.classList.add('suggestion-item');
        suggestionItem.textContent = salaName;
        suggestionItem.setAttribute('role', 'option');
        suggestionItem.setAttribute('tabindex', '0');

        const selectSuggestion = () => {
            document.getElementById('sala-input').value = salaName;
            container.innerHTML = '';
            container.style.display = 'none';
            this.navigateToSala(salaName);
        };

        suggestionItem.addEventListener('click', selectSuggestion);
        suggestionItem.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') selectSuggestion();
        });

        container.appendChild(suggestionItem);
    }

    navigateToSala(salaName) {
        const salaAlvo = this.state.data.salas.features.find(
            f => f.properties.nome === salaName
        );

        if (!salaAlvo) return;

        this.state.setSala(salaName);
        const novoAndar = salaAlvo.properties.andar;
        this.state.setAndar(novoAndar);
        document.getElementById('andar-filter-select').value = novoAndar;
        
        this.layerManager.clearRoute();
        this.layerManager.updateFloorView();

        const centroid = L.geoJson(salaAlvo).getBounds().getCenter();
        this.state.map.setView(centroid, CONFIG.map.ROUTE_ZOOM);
    }
}

// ===================================================================
// GERENCIADOR DE TILES DO MAPA
// ===================================================================
class TileManager {
    constructor(map) {
        this.map = map;
        this.currentTileLayer = null;
    }

    updateMapTiles(type) {
        let url, attr;
        
        // Remove camada de tiles atual
        this.map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                this.map.removeLayer(layer);
            }
        });

        switch (type) {
            case "Híbrido":
                url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
                attr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
                break;
            case "Satélite":
                url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                attr = 'Tiles &copy; Esri';
                break;
            default:
                url = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
                attr = '&copy; <a href="https://carto.com/attributions">CARTO</a>';
        }

        this.currentTileLayer = L.tileLayer(url, {
            attribution: attr,
            maxZoom: CONFIG.map.MAX_ZOOM
        }).addTo(this.map);
    }
}

// ===================================================================
// CLASSE PRINCIPAL DA APLICAÇÃO
// ===================================================================
class MapaInterativo {
    constructor() {
        this.state = new MapaInterativoState();
        this.layerManager = null;
        this.tileManager = null;
        this.autocompleteManager = null;
    }

    async init() {
        try {
            Utils.showLoading(true);
            this.initMap();
            await this.loadGeoJSONData();
            this.setupEventListeners();
            this.setupSidebar();
            Utils.showLoading(false);
            Utils.showNotification('Mapa carregado com sucesso!', 'success');
        } catch (error) {
            Utils.showLoading(false);
            console.error("Erro ao inicializar mapa:", error);
            Utils.showNotification(
                'Erro ao carregar dados do mapa. Verifique o console.',
                'error'
            );
        }
    }

    initMap() {
        const center = Utils.getMapCenter();
        
        this.state.map = L.map("map-container", {
            center: center,
            zoom: CONFIG.map.INITIAL_ZOOM,
            minZoom: CONFIG.map.MIN_ZOOM,
            maxZoom: CONFIG.map.MAX_ZOOM,
            rotate: true,
            rotateControl: { closeOnZeroBearing: false },
            bearing: 0
        });

        this.tileManager = new TileManager(this.state.map);
        this.tileManager.updateMapTiles('Padrão');

        // Controle de localização
        L.control.locate({
            position: 'topleft',
            strings: {
                title: "Mostrar minha localização atual"
            },
            icon: 'fa-solid fa-location-crosshairs',
            iconLoading: 'fa-solid fa-spinner fa-spin',
            drawCircle: false,
            showPopup: true,
            locateOptions: {
                maxZoom: 20
            }
        }).addTo(this.state.map);

        // Evento de clique no mapa
        this.state.map.on('click', () => {
            if (this.state.selection.sala !== null) {
                this.state.clearSelection();
                document.getElementById('sala-input').value = '';
                this.layerManager.clearRoute();
                this.layerManager.drawSalas();
            }
        });

        // Eventos de zoom
        this.state.map.on('zoomend moveend', () => {
            if (this.layerManager) {
                this.layerManager.updateZoomDependentLayers();
            }
        });
    }

    async loadGeoJSONData() {
        try {
            const [salasResponse, floorResponse, rotasResponse, pontosResponse] = 
                await Promise.all([
                    fetch("salas.geojson"),
                    fetch("floor.geojson"),
                    fetch("rotas.geojson"),
                    fetch("pontos.geojson"),
                ]);

            if (!salasResponse.ok) throw new Error('Erro ao carregar salas.geojson');
            if (!floorResponse.ok) throw new Error('Erro ao carregar floor.geojson');
            if (!rotasResponse.ok) throw new Error('Erro ao carregar rotas.geojson');
            if (!pontosResponse.ok) throw new Error('Erro ao carregar pontos.geojson');

            this.state.data.salas = await salasResponse.json();
            this.state.data.floor = await floorResponse.json();
            this.state.data.rotas = await rotasResponse.json();
            this.state.data.pontos = await pontosResponse.json();

            // Validar dados
            Utils.validateGeoJSON(this.state.data.salas, 'salas');
            Utils.validateGeoJSON(this.state.data.floor, 'floor');
            Utils.validateGeoJSON(this.state.data.rotas, 'rotas');
            Utils.validateGeoJSON(this.state.data.pontos, 'pontos');

            this.layerManager = new LayerManager(this.state);
            this.autocompleteManager = new AutocompleteManager(this.state, this.layerManager);
            
            this.layerManager.updateFloorView();
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            throw error;
        }
    }

    setupEventListeners() {
        // Botão mostrar rota
        document.getElementById("mostrar-rota-btn").addEventListener("click", () => {
            this.handleMostrarRota();
        });

        // Seletor de tipo de mapa
        document.getElementById("map-type-select").addEventListener("change", (event) => {
            this.tileManager.updateMapTiles(event.target.value);
        });

        // Checkbox de pontos
        document.getElementById("mostrar-pontos-checkbox").addEventListener("change", () => {
            this.layerManager.updateZoomDependentLayers();
        });

        // Checkbox de info
        document.getElementById("mostrar-info-checkbox").addEventListener("change", () => {
            this.layerManager.updateZoomDependentLayers();
        });

        // Seletor de andar
        document.getElementById("andar-filter-select").addEventListener('change', (event) => {
            this.state.setAndar(event.target.value);
            this.state.clearSelection();
            document.getElementById('sala-input').value = '';
            this.layerManager.updateFloorView();
        });

        // Botão limpar (se existir)
        const clearBtn = document.getElementById("limpar-btn");
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.handleLimpar();
            });
        }
    }

    handleMostrarRota() {
        const salaInputValue = document.getElementById("sala-input").value.trim();
        
        if (!salaInputValue) {
            Utils.showNotification(
                'Por favor, digite o nome de uma sala',
                'error'
            );
            return;
        }

        const salaExists = this.state.data.salas.features.some(
            f => f.properties.nome === salaInputValue
        );

        if (!salaExists) {
            Utils.showNotification(
                'Por favor, selecione um local válido da lista',
                'error'
            );
            return;
        }

        this.state.setSala(salaInputValue);
        this.layerManager.drawSalas();
        
        const accessibilityNeeded = document.getElementById("acessibilidade-checkbox").checked;
        this.layerManager.drawRotas(this.state.selection.sala, accessibilityNeeded);
    }

    handleLimpar() {
        this.state.clearSelection();
        document.getElementById('sala-input').value = '';
        this.layerManager.clearRoute();
        this.layerManager.drawSalas();
        Utils.showNotification('Seleção limpa', 'info');
    }

    setupSidebar() {
        const toggleButton = document.getElementById('toggle-sidebar-btn');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');

        if (!toggleButton || !sidebar || !mainContent) return;

        const toggleSidebar = () => {
            sidebar.classList.toggle('visible');
            if (sidebar.classList.contains('visible')) {
                toggleButton.style.right = '355px';
            } else {
                toggleButton.style.right = '15px';
            }
        };

        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleSidebar();
        });

        mainContent.addEventListener('click', () => {
            if (sidebar.classList.contains('visible')) {
                toggleSidebar();
            }
        });
    }
}

// ===================================================================
// INICIALIZAÇÃO
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    const app = new MapaInterativo();
    app.init();
});
