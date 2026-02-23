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
        route: {
            active: '#0056b3',      // Caminho à frente
            completed: '#90CAF9',   // Caminho já percorrido
            current: '#FFA726'      // Segmento atual
        }
    },
    navigation: {
        UPDATE_INTERVAL: 1000,           // Atualizar posição a cada 1 segundo
        PROXIMITY_THRESHOLD: 5,          // Metros para considerar que chegou ao waypoint
        RECALCULATE_THRESHOLD: 15,       // Metros de desvio para recalcular rota
        INSTRUCTION_DISTANCE: 20,        // Distância para mostrar próxima instrução (metros)
        ARRIVAL_DISTANCE: 3              // Distância para considerar chegada (metros)
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
            salasLabels: null,
            activeRoute: null,
            completedRoute: null,
            userMarker: null
        };
        this.data = {
            salas: null,
            floor: null,
            rotas: null,
            pontos: null,
            navigationGraph: null
        };
        this.selection = {
            sala: null,
            andar: '0'
        };
        this.navigation = {
            isActive: false,
            currentPosition: null,
            destination: null,
            route: null,
            currentSegmentIndex: 0,
            watchId: null,
            instructions: []
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

    showNotification(message, type = 'info') {
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

    abbreviateName(name, maxLength = 15) {
        if (!name || name.length <= maxLength) return name;
        
        const parts = name.split(' ');
        if (parts.length === 1) {
            return name.substring(0, maxLength) + '...';
        }
        
        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            const abbreviated = parts[i].substring(0, 3);
            if ((result + ' ' + abbreviated).length > maxLength) break;
            result += ' ' + abbreviated;
        }
        return result;
    },

    validateGeoJSON(data, type) {
        if (!data || !data.features || !Array.isArray(data.features)) {
            throw new Error(`Dados GeoJSON inválidos para ${type}`);
        }
        return true;
    },

    getMapCenter() {
        const centerLat = (CONFIG.map.MIN_LAT + CONFIG.map.MAX_LAT) / 2;
        const centerLon = (CONFIG.map.MIN_LON + CONFIG.map.MAX_LON) / 2;
        return [centerLat, centerLon];
    },

    // Calcular distância entre dois pontos (Haversine)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Raio da Terra em metros
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    },

    // Calcular bearing (direção) entre dois pontos
    calculateBearing(lat1, lon1, lat2, lon2) {
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
                Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        const θ = Math.atan2(y, x);

        return (θ * 180 / Math.PI + 360) % 360;
    },

    // Converter bearing em direção cardeal
    bearingToDirection(bearing) {
        const directions = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
        const index = Math.round(bearing / 45) % 8;
        return directions[index];
    },

    // Determinar tipo de curva baseado em mudança de ângulo
    getTurnType(angle) {
        const absAngle = Math.abs(angle);
        if (absAngle < 20) return 'siga em frente';
        if (absAngle < 60) return angle > 0 ? 'vire levemente à direita' : 'vire levemente à esquerda';
        if (absAngle < 120) return angle > 0 ? 'vire à direita' : 'vire à esquerda';
        return angle > 0 ? 'vire fortemente à direita' : 'vire fortemente à esquerda';
    },

    // Obter centro de um polígono ou ponto de entrada
    getFeatureEntryPoint(feature) {
        const props = feature.properties;
        
        // Se tem ponto de entrada definido, usar ele
        if (props.porta && props.porta.coordinates) {
            return {
                lat: props.porta.coordinates[1],
                lng: props.porta.coordinates[0]
            };
        }

        // Senão, calcular centroid
        const geojsonLayer = L.geoJson(feature);
        const center = geojsonLayer.getBounds().getCenter();
        return center;
    }
};

// ===================================================================
// GERENCIADOR DE ÍCONES
// ===================================================================
const IconManager = {
    customIcons: {
        'banheiro': L.divIcon({ 
            className: 'poi-marker poi-marker-banheiro', 
            html: '🚻', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'elevador': L.divIcon({ 
            className: 'poi-marker poi-marker-elevador', 
            html: '🛗', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'rampa': L.divIcon({ 
            className: 'poi-marker poi-marker-rampa', 
            html: '♿', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'escada': L.divIcon({ 
            className: 'poi-marker poi-marker-escada', 
            html: '🪜', 
            iconSize: [28, 28], 
            iconAnchor: [14, 28], 
            popupAnchor: [0, -28] 
        }),
        'totem': L.divIcon({ 
            className: 'poi-marker poi-marker-totem', 
            html: 'ℹ️', 
            iconSize: [32, 32], 
            iconAnchor: [16, 32], 
            popupAnchor: [0, -32] 
        }),
        'user': L.divIcon({
            className: 'user-location-marker',
            html: '📍',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
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
// GRAFO DE NAVEGAÇÃO
// ===================================================================
class NavigationGraph {
    constructor(pontosData, salasData) {
        this.nodes = new Map();
        this.edges = [];
        this.buildGraph(pontosData, salasData);
    }

    buildGraph(pontosData, salasData) {
        // Adicionar pontos de interesse como nós
        pontosData.features.forEach(feature => {
            const coords = feature.geometry.coordinates;
            const nodeId = `poi_${feature.properties.nome}_${feature.properties.andar}`;
            
            this.nodes.set(nodeId, {
                id: nodeId,
                lat: coords[1],
                lng: coords[0],
                andar: feature.properties.andar,
                tipo: feature.properties.tipo,
                acessivel: feature.properties.acessibilidade === 'true',
                nome: feature.properties.nome
            });
        });

        // Adicionar salas como nós (usando ponto de entrada ou centroid)
        salasData.features.forEach(feature => {
            const entryPoint = Utils.getFeatureEntryPoint(feature);
            const nodeId = `sala_${feature.properties.nome}_${feature.properties.andar}`;
            
            this.nodes.set(nodeId, {
                id: nodeId,
                lat: entryPoint.lat,
                lng: entryPoint.lng,
                andar: feature.properties.andar,
                tipo: 'sala',
                nome: feature.properties.nome,
                acessivel: true
            });
        });

        // Criar arestas automáticas (conectar nós próximos no mesmo andar)
        this.autoConnectNodes();
        
        // Conectar escadas/elevadores entre andares
        this.connectVerticalTransitions();
    }

    autoConnectNodes() {
        const nodesArray = Array.from(this.nodes.values());
        const MAX_CONNECTION_DISTANCE = 50; // metros

        for (let i = 0; i < nodesArray.length; i++) {
            for (let j = i + 1; j < nodesArray.length; j++) {
                const node1 = nodesArray[i];
                const node2 = nodesArray[j];

                // Só conectar nós do mesmo andar
                if (node1.andar !== node2.andar) continue;

                const distance = Utils.calculateDistance(
                    node1.lat, node1.lng,
                    node2.lat, node2.lng
                );

                if (distance <= MAX_CONNECTION_DISTANCE) {
                    this.edges.push({
                        from: node1.id,
                        to: node2.id,
                        distance: distance,
                        acessivel: node1.acessivel && node2.acessivel
                    });
                }
            }
        }
    }

    connectVerticalTransitions() {
        const escadas = Array.from(this.nodes.values()).filter(n => n.tipo === 'escada');
        const elevadores = Array.from(this.nodes.values()).filter(n => n.tipo === 'elevador');
        const rampas = Array.from(this.nodes.values()).filter(n => n.tipo === 'rampa');

        // Conectar escadas com mesma localização em andares diferentes
        this.connectVerticalNodes(escadas, false);
        
        // Conectar elevadores (acessíveis)
        this.connectVerticalNodes(elevadores, true);
        
        // Conectar rampas (acessíveis)
        this.connectVerticalNodes(rampas, true);
    }

    connectVerticalNodes(nodes, acessivel) {
        const VERTICAL_PROXIMITY = 5; // metros de tolerância horizontal

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const node1 = nodes[i];
                const node2 = nodes[j];

                // Não conectar o mesmo andar
                if (node1.andar === node2.andar) continue;

                const horizontalDist = Utils.calculateDistance(
                    node1.lat, node1.lng,
                    node2.lat, node2.lng
                );

                if (horizontalDist <= VERTICAL_PROXIMITY) {
                    // Custo maior para mudança de andar
                    const verticalCost = 10 + Math.abs(parseInt(node1.andar) - parseInt(node2.andar)) * 5;
                    
                    this.edges.push({
                        from: node1.id,
                        to: node2.id,
                        distance: verticalCost,
                        acessivel: acessivel,
                        vertical: true
                    });
                }
            }
        }
    }

    findNearestNode(lat, lng, andar) {
        let nearest = null;
        let minDistance = Infinity;

        this.nodes.forEach(node => {
            if (node.andar !== andar) return;

            const distance = Utils.calculateDistance(lat, lng, node.lat, node.lng);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = node;
            }
        });

        return nearest;
    }

    // Algoritmo A* para encontrar melhor caminho
    findPath(startLat, startLng, startAndar, endNodeId, requireAccessible = false) {
        const startNode = this.findNearestNode(startLat, startLng, startAndar);
        if (!startNode) return null;

        const endNode = this.nodes.get(endNodeId);
        if (!endNode) return null;

        const openSet = new Set([startNode.id]);
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        this.nodes.forEach((_, id) => {
            gScore.set(id, Infinity);
            fScore.set(id, Infinity);
        });

        gScore.set(startNode.id, 0);
        fScore.set(startNode.id, this.heuristic(startNode, endNode));

        while (openSet.size > 0) {
            let current = this.getLowestFScore(openSet, fScore);
            
            if (current === endNode.id) {
                return this.reconstructPath(cameFrom, current);
            }

            openSet.delete(current);

            const neighbors = this.getNeighbors(current, requireAccessible);
            neighbors.forEach(({ nodeId, distance }) => {
                const tentativeGScore = gScore.get(current) + distance;

                if (tentativeGScore < gScore.get(nodeId)) {
                    cameFrom.set(nodeId, current);
                    gScore.set(nodeId, tentativeGScore);
                    
                    const neighbor = this.nodes.get(nodeId);
                    fScore.set(nodeId, tentativeGScore + this.heuristic(neighbor, endNode));

                    openSet.add(nodeId);
                }
            });
        }

        return null; // Sem caminho encontrado
    }

    heuristic(node1, node2) {
        const horizontalDist = Utils.calculateDistance(
            node1.lat, node1.lng,
            node2.lat, node2.lng
        );
        const verticalDist = Math.abs(parseInt(node1.andar) - parseInt(node2.andar)) * 10;
        return horizontalDist + verticalDist;
    }

    getLowestFScore(openSet, fScore) {
        let lowest = null;
        let lowestScore = Infinity;

        openSet.forEach(nodeId => {
            const score = fScore.get(nodeId);
            if (score < lowestScore) {
                lowestScore = score;
                lowest = nodeId;
            }
        });

        return lowest;
    }

    getNeighbors(nodeId, requireAccessible) {
        const neighbors = [];
        
        this.edges.forEach(edge => {
            if (requireAccessible && !edge.acessivel) return;

            if (edge.from === nodeId) {
                neighbors.push({ nodeId: edge.to, distance: edge.distance });
            } else if (edge.to === nodeId) {
                neighbors.push({ nodeId: edge.from, distance: edge.distance });
            }
        });

        return neighbors;
    }

    reconstructPath(cameFrom, current) {
        const path = [current];
        
        while (cameFrom.has(current)) {
            current = cameFrom.get(current);
            path.unshift(current);
        }

        return path.map(nodeId => this.nodes.get(nodeId));
    }
}

// ===================================================================
// GERENCIADOR DE NAVEGAÇÃO
// ===================================================================
class NavigationManager {
    constructor(state, layerManager) {
        this.state = state;
        this.layerManager = layerManager;
        this.instructionPanel = this.createInstructionPanel();
    }

    createInstructionPanel() {
        // Overlay de fundo
        const overlay = document.createElement('div');
        overlay.id = 'navigation-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 10, 30, 0.55);
            backdrop-filter: blur(2px);
            z-index: 2000;
            display: none;
            pointer-events: none;
        `;
        document.body.appendChild(overlay);

        // Painel principal
        const panel = document.createElement('div');
        panel.id = 'navigation-panel';
        panel.style.cssText = `
            position: fixed;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: min(420px, 96vw);
            background: linear-gradient(160deg, #0a1628 0%, #0d2147 100%);
            border-radius: 0 0 24px 24px;
            box-shadow: 0 8px 40px rgba(0,86,179,0.45), 0 2px 8px rgba(0,0,0,0.4);
            z-index: 2100;
            display: none;
            font-family: 'Segoe UI', system-ui, sans-serif;
            border: 1px solid rgba(100,160,255,0.18);
            border-top: none;
            overflow: hidden;
        `;

        // Barra de topo com título e botão X
        const topBar = document.createElement('div');
        topBar.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 18px 10px;
            background: rgba(0,86,179,0.22);
            border-bottom: 1px solid rgba(100,160,255,0.15);
        `;

        const titleEl = document.createElement('div');
        titleEl.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            color: #90CAF9;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 1.5px;
            text-transform: uppercase;
        `;
        titleEl.innerHTML = `<span style="font-size:16px;">🧭</span> Navegação`;

        const closeBtn = document.createElement('button');
        closeBtn.id = 'nav-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'Fechar e voltar ao mapa';
        closeBtn.style.cssText = `
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #aac8f0;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s, color 0.2s;
            flex-shrink: 0;
        `;
        closeBtn.onmouseover = () => {
            closeBtn.style.background = 'rgba(244,67,54,0.25)';
            closeBtn.style.color = '#ff6b6b';
            closeBtn.style.borderColor = 'rgba(244,67,54,0.4)';
        };
        closeBtn.onmouseout = () => {
            closeBtn.style.background = 'rgba(255,255,255,0.08)';
            closeBtn.style.color = '#aac8f0';
            closeBtn.style.borderColor = 'rgba(255,255,255,0.15)';
        };
        closeBtn.addEventListener('click', () => {
            if (window.mapaApp && window.mapaApp.navigationManager) {
                window.mapaApp.navigationManager.stopNavigation();
            }
        });

        topBar.appendChild(titleEl);
        topBar.appendChild(closeBtn);

        // Corpo do painel
        const body = document.createElement('div');
        body.id = 'navigation-panel-body';
        body.style.cssText = `padding: 18px 20px 22px;`;

        panel.appendChild(topBar);
        panel.appendChild(body);
        document.body.appendChild(panel);

        // Guardar referência ao overlay para uso posterior
        this._overlay = overlay;
        this._panelBody = body;

        return panel;
    }

    async startNavigation(destinationName) {
        // Solicitar permissão de localização
        if (!navigator.geolocation) {
            Utils.showNotification('Geolocalização não suportada', 'error');
            return;
        }

        Utils.showLoading(true);

        try {
            // Obter posição atual
            const position = await this.getCurrentPosition();
            const currentLat = position.coords.latitude;
            const currentLng = position.coords.longitude;

            // Encontrar nó de destino
            const destinationFeature = this.state.data.salas.features.find(
                f => f.properties.nome === destinationName
            );

            if (!destinationFeature) {
                throw new Error('Destino não encontrado');
            }

            const destNodeId = `sala_${destinationName}_${destinationFeature.properties.andar}`;
            const requireAccessible = document.getElementById("acessibilidade-checkbox").checked;

            // Calcular rota
            const path = this.state.data.navigationGraph.findPath(
                currentLat,
                currentLng,
                this.state.selection.andar,
                destNodeId,
                requireAccessible
            );

            if (!path || path.length === 0) {
                throw new Error('Nenhuma rota encontrada');
            }

            // Configurar navegação
            this.state.navigation.isActive = true;
            this.state.navigation.currentPosition = { lat: currentLat, lng: currentLng };
            this.state.navigation.route = path;
            this.state.navigation.currentSegmentIndex = 0;
            this.state.navigation.destination = destinationName;
            this.state.navigation.instructions = this.generateInstructions(path);

            // Desenhar rota
            this.drawNavigationRoute();

            // Adicionar marcador do usuário
            this.updateUserMarker(currentLat, currentLng);

            // Iniciar rastreamento
            this.startTracking();

            // Mostrar primeira instrução
            this.showCurrentInstruction();

            Utils.showLoading(false);
            Utils.showNotification('Navegação iniciada!', 'success');

        } catch (error) {
            Utils.showLoading(false);
            Utils.showNotification(error.message, 'error');
            console.error('Erro ao iniciar navegação:', error);
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
    }

    generateInstructions(path) {
        const instructions = [];

        for (let i = 0; i < path.length - 1; i++) {
            const current = path[i];
            const next = path[i + 1];
            const distance = Utils.calculateDistance(
                current.lat, current.lng,
                next.lat, next.lng
            );

            let instruction = '';

            // Mudança de andar
            if (current.andar !== next.andar) {
                if (next.tipo === 'elevador') {
                    instruction = `Use o elevador para o ${next.andar === '0' ? 'térreo' : next.andar + 'º andar'}`;
                } else if (next.tipo === 'escada') {
                    instruction = `Suba/desça as escadas para o ${next.andar === '0' ? 'térreo' : next.andar + 'º andar'}`;
                } else if (next.tipo === 'rampa') {
                    instruction = `Use a rampa para o ${next.andar === '0' ? 'térreo' : next.andar + 'º andar'}`;
                }
            } else {
                // Instrução de direção
                if (i > 0) {
                    const prev = path[i - 1];
                    const bearing1 = Utils.calculateBearing(prev.lat, prev.lng, current.lat, current.lng);
                    const bearing2 = Utils.calculateBearing(current.lat, current.lng, next.lat, next.lng);
                    const angle = bearing2 - bearing1;
                    const normalizedAngle = ((angle + 180) % 360) - 180;
                    
                    instruction = Utils.getTurnType(normalizedAngle);
                } else {
                    const direction = Utils.bearingToDirection(
                        Utils.calculateBearing(current.lat, current.lng, next.lat, next.lng)
                    );
                    instruction = `Siga em direção ao ${direction}`;
                }

                instruction += ` por ${Math.round(distance)} metros`;
            }

            instructions.push({
                step: i + 1,
                instruction: instruction,
                distance: distance,
                from: current,
                to: next
            });
        }

        // Instrução final
        instructions.push({
            step: instructions.length + 1,
            instruction: `Você chegou ao destino: ${this.state.navigation.destination}`,
            distance: 0,
            from: path[path.length - 1],
            to: path[path.length - 1]
        });

        return instructions;
    }

    drawNavigationRoute() {
        // Limpar rotas anteriores
        this.layerManager.removeLayer('activeRoute');
        this.layerManager.removeLayer('completedRoute');

        const route = this.state.navigation.route;
        const currentIndex = this.state.navigation.currentSegmentIndex;

        // Rota já percorrida (cinza/azul claro)
        if (currentIndex > 0) {
            const completedCoords = route.slice(0, currentIndex + 1).map(node => [node.lat, node.lng]);
            this.state.layers.completedRoute = L.polyline(completedCoords, {
                color: CONFIG.colors.route.completed,
                weight: 6,
                opacity: 0.6
            }).addTo(this.state.map);
        }

        // Rota ativa (azul escuro)
        if (currentIndex < route.length - 1) {
            const activeCoords = route.slice(currentIndex).map(node => [node.lat, node.lng]);
            this.state.layers.activeRoute = L.polyline(activeCoords, {
                color: CONFIG.colors.route.active,
                weight: 6,
                opacity: 0.9
            }).addTo(this.state.map);
        }

        // Ajustar visualização para mostrar toda a rota
        const allCoords = route.map(node => [node.lat, node.lng]);
        this.state.map.fitBounds(L.polyline(allCoords).getBounds(), { padding: [50, 50] });
    }

    updateUserMarker(lat, lng) {
        if (this.state.layers.userMarker) {
            this.state.layers.userMarker.setLatLng([lat, lng]);
        } else {
            this.state.layers.userMarker = L.marker([lat, lng], {
                icon: IconManager.getIcon('user'),
                zIndexOffset: 1000
            }).addTo(this.state.map);
        }
    }

    startTracking() {
        if (this.state.navigation.watchId) {
            navigator.geolocation.clearWatch(this.state.navigation.watchId);
        }

        this.state.navigation.watchId = navigator.geolocation.watchPosition(
            (position) => this.handlePositionUpdate(position),
            (error) => console.error('Erro de geolocalização:', error),
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    }

    handlePositionUpdate(position) {
        if (!this.state.navigation.isActive) return;

        const currentLat = position.coords.latitude;
        const currentLng = position.coords.longitude;

        this.state.navigation.currentPosition = { lat: currentLat, lng: currentLng };
        this.updateUserMarker(currentLat, currentLng);

        const route = this.state.navigation.route;
        const currentIndex = this.state.navigation.currentSegmentIndex;

        if (currentIndex >= route.length - 1) {
            // Chegou ao destino
            this.handleArrival();
            return;
        }

        const nextWaypoint = route[currentIndex + 1];
        const distanceToNext = Utils.calculateDistance(
            currentLat, currentLng,
            nextWaypoint.lat, nextWaypoint.lng
        );

        // Verificar se chegou ao próximo waypoint
        if (distanceToNext <= CONFIG.navigation.PROXIMITY_THRESHOLD) {
            this.state.navigation.currentSegmentIndex++;
            this.drawNavigationRoute();
            this.showCurrentInstruction();
        }

        // Verificar se desviou da rota
        const distanceToRoute = this.calculateDistanceToRoute(currentLat, currentLng);
        if (distanceToRoute > CONFIG.navigation.RECALCULATE_THRESHOLD) {
            Utils.showNotification('Recalculando rota...', 'info');
            this.recalculateRoute();
        }

        // Atualizar instrução se estiver próximo
        if (distanceToNext <= CONFIG.navigation.INSTRUCTION_DISTANCE) {
            this.showCurrentInstruction();
        }
    }

    calculateDistanceToRoute(lat, lng) {
        const route = this.state.navigation.route;
        const currentIndex = this.state.navigation.currentSegmentIndex;
        
        if (currentIndex >= route.length - 1) return 0;

        const nextWaypoint = route[currentIndex + 1];
        return Utils.calculateDistance(lat, lng, nextWaypoint.lat, nextWaypoint.lng);
    }

    async recalculateRoute() {
        const pos = this.state.navigation.currentPosition;
        const destName = this.state.navigation.destination;
        
        this.stopNavigation(false);
        await this.startNavigation(destName);
    }

    showCurrentInstruction() {
        const index = this.state.navigation.currentSegmentIndex;
        const instructions = this.state.navigation.instructions;
        
        if (index >= instructions.length) {
            this.handleArrival();
            return;
        }

        const current = instructions[index];
        const next = instructions[index + 1];

        const getArrowIcon = (instr) => {
            if (!instr) return '⬆️';
            if (instr.includes('direita')) return '↪️';
            if (instr.includes('esquerda')) return '↩️';
            if (instr.includes('elevador')) return '🛗';
            if (instr.includes('escada')) return '🪜';
            if (instr.includes('rampa')) return '♿';
            if (instr.includes('chegou') || instr.includes('destino')) return '🎯';
            return '⬆️';
        };

        const totalDistance = this.calculateRemainingDistance();
        const progress = Math.round(((index + 1) / instructions.length) * 100);

        let html = `
            <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:16px;">
                <div style="
                    width:52px; height:52px; flex-shrink:0;
                    background: rgba(0,86,179,0.3);
                    border: 2px solid rgba(100,160,255,0.35);
                    border-radius: 14px;
                    display:flex; align-items:center; justify-content:center;
                    font-size:24px;
                ">${getArrowIcon(current.instruction)}</div>
                <div style="flex:1;">
                    <div style="color:#e8f0fe; font-size:16px; font-weight:600; line-height:1.35;">
                        ${current.instruction}
                    </div>
                    ${current.distance > 0 ? `<div style="color:#64b5f6; font-size:12px; margin-top:4px;">por ${Math.round(current.distance)} m</div>` : ''}
                </div>
            </div>
        `;

        if (next && next.instruction !== current.instruction) {
            html += `
            <div style="
                display:flex; align-items:center; gap:10px;
                background: rgba(255,255,255,0.05);
                border-radius: 10px; padding: 10px 12px;
                margin-bottom: 14px;
                border: 1px solid rgba(255,255,255,0.07);
            ">
                <div style="font-size:18px; opacity:0.7;">${getArrowIcon(next.instruction)}</div>
                <div>
                    <div style="color:#78909c; font-size:10px; letter-spacing:1px; text-transform:uppercase; margin-bottom:2px;">Em seguida</div>
                    <div style="color:#b0bec5; font-size:13px;">${next.instruction}</div>
                </div>
            </div>
            `;
        }

        html += `
            <div style="margin-bottom:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="color:#78909c; font-size:11px;">Passo ${index + 1} de ${instructions.length}</span>
                    <span style="color:#64b5f6; font-size:11px; font-weight:600;">${Math.round(totalDistance)} m restantes</span>
                </div>
                <div style="height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden;">
                    <div style="height:100%; width:${progress}%; background: linear-gradient(90deg, #1565c0, #42a5f5); border-radius:2px; transition: width 0.4s;"></div>
                </div>
            </div>
        `;

        const body = this._panelBody || this.instructionPanel;
        body.innerHTML = html;
        this.instructionPanel.style.display = 'block';
        if (this._overlay) this._overlay.style.display = 'block';
    }

    calculateRemainingDistance() {
        const route = this.state.navigation.route;
        const currentIndex = this.state.navigation.currentSegmentIndex;
        let total = 0;

        for (let i = currentIndex; i < route.length - 1; i++) {
            total += Utils.calculateDistance(
                route[i].lat, route[i].lng,
                route[i + 1].lat, route[i + 1].lng
            );
        }

        return total;
    }

    handleArrival() {
        const html = `
            <div style="text-align:center; padding: 8px 0 4px;">
                <div style="font-size:48px; margin-bottom:10px;">🎯</div>
                <div style="color:#a5d6a7; font-size:20px; font-weight:700; margin-bottom:6px;">Você chegou!</div>
                <div style="color:#b0bec5; font-size:14px; margin-bottom:18px;">${this.state.navigation.destination}</div>
                <button onclick="window.mapaApp.navigationManager.stopNavigation()"
                    style="
                        padding: 11px 28px;
                        background: linear-gradient(135deg, #2e7d32, #43a047);
                        color: white; border: none; border-radius: 10px;
                        cursor: pointer; font-size: 14px; font-weight: 600;
                        box-shadow: 0 4px 14px rgba(67,160,71,0.4);
                    ">
                    Finalizar Navegação
                </button>
            </div>
        `;
        const body = this._panelBody || this.instructionPanel;
        body.innerHTML = html;
        this.instructionPanel.style.display = 'block';
        if (this._overlay) this._overlay.style.display = 'block';

        Utils.showNotification('Você chegou ao destino!', 'success');
    }

    stopNavigation(showMessage = true) {
        if (this.state.navigation.watchId) {
            navigator.geolocation.clearWatch(this.state.navigation.watchId);
            this.state.navigation.watchId = null;
        }

        this.state.navigation.isActive = false;
        this.instructionPanel.style.display = 'none';
        if (this._overlay) this._overlay.style.display = 'none';

        this.layerManager.removeLayer('activeRoute');
        this.layerManager.removeLayer('completedRoute');
        
        if (this.state.layers.userMarker) {
            this.state.map.removeLayer(this.state.layers.userMarker);
            this.state.layers.userMarker = null;
        }

        if (showMessage) {
            Utils.showNotification('Navegação cancelada', 'info');
        }
    }
}

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
        this.removeLayer('activeRoute');
        this.removeLayer('completedRoute');
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
        const andarText = props.andar === '0' ? 'Térreo' : `${props.andar}º Andar`;
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
// [CONTINUA: AUTOCOMPLETE, TILES, APLICAÇÃO PRINCIPAL...]
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

class TileManager {
    constructor(map) {
        this.map = map;
        this.currentTileLayer = null;
    }

    updateMapTiles(type) {
        let url, attr;
        
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
        this.navigationManager = null;
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

        this.state.map.on('click', () => {
            if (this.state.selection.sala !== null) {
                this.state.clearSelection();
                document.getElementById('sala-input').value = '';
                this.layerManager.clearRoute();
                this.layerManager.drawSalas();
            }
        });

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

            Utils.validateGeoJSON(this.state.data.salas, 'salas');
            Utils.validateGeoJSON(this.state.data.floor, 'floor');
            Utils.validateGeoJSON(this.state.data.rotas, 'rotas');
            Utils.validateGeoJSON(this.state.data.pontos, 'pontos');

            // Construir grafo de navegação
            this.state.data.navigationGraph = new NavigationGraph(
                this.state.data.pontos,
                this.state.data.salas
            );

            this.layerManager = new LayerManager(this.state);
            this.autocompleteManager = new AutocompleteManager(this.state, this.layerManager);
            this.navigationManager = new NavigationManager(this.state, this.layerManager);
            
            // Expor globalmente para botões inline
            window.mapaApp = this;
            
            this.layerManager.updateFloorView();
        } catch (error) {
            console.error("Erro ao carregar dados GeoJSON:", error);
            throw error;
        }
    }

    setupEventListeners() {
        document.getElementById("mostrar-rota-btn").addEventListener("click", () => {
            this.handleMostrarRota();
        });

        document.getElementById("map-type-select").addEventListener("change", (event) => {
            this.tileManager.updateMapTiles(event.target.value);
        });

        document.getElementById("mostrar-pontos-checkbox").addEventListener("change", () => {
            this.layerManager.updateZoomDependentLayers();
        });

        document.getElementById("mostrar-info-checkbox").addEventListener("change", () => {
            this.layerManager.updateZoomDependentLayers();
        });

        document.getElementById("andar-filter-select").addEventListener('change', (event) => {
            this.state.setAndar(event.target.value);
            this.state.clearSelection();
            document.getElementById('sala-input').value = '';
            this.layerManager.updateFloorView();
        });

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
        
        // Iniciar navegação em tempo real
        this.navigationManager.startNavigation(salaInputValue);
    }

    handleLimpar() {
        this.state.clearSelection();
        document.getElementById('sala-input').value = '';
        
        if (this.navigationManager && this.state.navigation.isActive) {
            this.navigationManager.stopNavigation(false);
        }
        
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
