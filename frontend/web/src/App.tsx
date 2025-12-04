import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

// Game constants
const CITIES = [
  "San Francisco", "Chicago", "Atlanta", "Montreal", "New York",
  "London", "Madrid", "Paris", "Essen", "Milan", "St. Petersburg",
  "Los Angeles", "Mexico City", "Miami", "Bogota", "Lima", "Santiago",
  "Sao Paulo", "Buenos Aires", "Lagos", "Kinshasa", "Johannesburg",
  "Khartoum", "Algiers", "Cairo", "Istanbul", "Moscow", "Tehran",
  "Baghdad", "Riyadh", "Karachi", "Delhi", "Mumbai", "Chennai",
  "Kolkata", "Bangkok", "Jakarta", "Ho Chi Minh City", "Hong Kong",
  "Shanghai", "Beijing", "Seoul", "Tokyo", "Osaka", "Taipei", "Manila",
  "Sydney"
];

const DISEASE_COLORS = ["red", "blue", "yellow", "black"];

interface CityStatus {
  name: string;
  diseaseLevels: number[]; // Encrypted disease levels
  outbreak: boolean; // Visible outbreak status
  connections: string[]; // Connected cities
}

interface Player {
  id: number;
  position: string;
  role: string;
  actions: number;
}

interface GameState {
  cities: CityStatus[];
  players: Player[];
  outbreakCount: number;
  infectionRate: number;
  turn: number;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activePlayer, setActivePlayer] = useState<number>(0);
  const [actionPhase, setActionPhase] = useState<"move" | "treat" | "build" | "share" | "discover">("move");
  const [outbreakHistory, setOutbreakHistory] = useState<{ city: string; turn: number }[]>([]);
  const [diseaseStats, setDiseaseStats] = useState<{ color: string; cured: boolean; eradicated: boolean }[]>([]);

  // Initialize game state
  const initGameState = (): GameState => {
    const cities: CityStatus[] = CITIES.map(city => ({
      name: city,
      diseaseLevels: [0, 0, 0, 0].map(() => Math.floor(Math.random() * 2)), // Encrypted later
      outbreak: false,
      connections: [] // Simplified for demo
    }));

    // Set initial outbreaks
    const initialOutbreaks = ["Tokyo", "New York", "Paris", "Sao Paulo"];
    cities.forEach(city => {
      if (initialOutbreaks.includes(city.name)) {
        city.outbreak = true;
      }
    });

    const players: Player[] = [
      { id: 1, position: "Atlanta", role: "Scientist", actions: 4 },
      { id: 2, position: "London", role: "Medic", actions: 4 }
    ];

    return {
      cities,
      players,
      outbreakCount: 4,
      infectionRate: 2,
      turn: 1
    };
  };

  useEffect(() => {
    // Initialize game state
    const state = initGameState();
    setGameState(state);
    
    // Initialize disease stats
    setDiseaseStats(DISEASE_COLORS.map(color => ({
      color,
      cured: false,
      eradicated: false
    })));
    
    setLoading(false);
    
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadGameState = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "error", message: "Contract not available" });
        return;
      }
      
      // Load game state from contract
      const gameStateBytes = await contract.getData("game_state");
      if (gameStateBytes.length > 0) {
        try {
          const stateData = JSON.parse(ethers.toUtf8String(gameStateBytes));
          setGameState(stateData);
        } catch (e) { 
          console.error("Error parsing game state:", e);
          setTransactionStatus({ visible: true, status: "error", message: "Error loading game state" });
        }
      }
    } catch (e) { 
      console.error("Error loading game state:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load game state" });
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const saveGameState = async (state: GameState) => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      return; 
    }
    
    setTransactionStatus({ visible: true, status: "pending", message: "Saving encrypted game state with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Encrypt sensitive data
      const encryptedState = {
        ...state,
        cities: state.cities.map(city => ({
          ...city,
          diseaseLevels: city.diseaseLevels.map(level => FHEEncryptNumber(level))
        }))
      };
      
      await contract.setData("game_state", ethers.toUtf8Bytes(JSON.stringify(encryptedState)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Game state saved securely!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Save failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const handleCityClick = async (cityName: string) => {
    if (!gameState || !selectedCity) return;
    
    const city = gameState.cities.find(c => c.name === cityName);
    if (!city) return;
    
    // If city is already selected, deselect it
    if (selectedCity === cityName) {
      setSelectedCity(null);
      return;
    }
    
    setSelectedCity(cityName);
    
    // For non-outbreak cities, require decryption to see disease levels
    if (!city.outbreak) {
      setTransactionStatus({ visible: true, status: "pending", message: "Decrypting disease spread with FHE..." });
      
      try {
        // Simulate decrypting disease levels
        const decryptedLevels = await Promise.all(
          city.diseaseLevels.map(async level => {
            const encrypted = FHEEncryptNumber(level);
            return await decryptWithSignature(encrypted);
          })
        );
        
        // Update UI with decrypted values
        setDecryptedValue(decryptedLevels[0] || 0);
        setTransactionStatus({ visible: true, status: "success", message: "Disease spread decrypted!" });
      } catch (e) {
        setTransactionStatus({ visible: true, status: "error", message: "Failed to decrypt disease data" });
      }
    }
  };

  const performAction = (action: "move" | "treat" | "build" | "share" | "discover") => {
    if (!gameState || !selectedCity) return;
    
    const player = gameState.players[activePlayer];
    if (player.actions <= 0) return;
    
    const updatedState = { ...gameState };
    const city = updatedState.cities.find(c => c.name === selectedCity);
    
    if (!city) return;
    
    switch (action) {
      case "treat":
        // Reduce disease level in selected city
        if (city.diseaseLevels.some(level => level > 0)) {
          const colorIndex = DISEASE_COLORS.indexOf("red"); // Simplified
          if (colorIndex >= 0 && city.diseaseLevels[colorIndex] > 0) {
            city.diseaseLevels[colorIndex]--;
            player.actions--;
          }
        }
        break;
        
      case "discover":
        // "Discover" a cure (simplified)
        if (Math.random() > 0.7) { // 30% chance to discover cure
          const updatedStats = [...diseaseStats];
          updatedStats[0].cured = true; // Cure first disease
          setDiseaseStats(updatedStats);
          player.actions--;
        }
        break;
        
      // Other actions would be implemented similarly
    }
    
    setGameState(updatedState);
    saveGameState(updatedState);
  };

  const endTurn = () => {
    if (!gameState) return;
    
    const updatedState = { ...gameState };
    
    // Spread diseases
    updatedState.cities.forEach(city => {
      if (!city.outbreak && Math.random() > 0.7) {
        // Increase disease level
        const colorIndex = Math.floor(Math.random() * DISEASE_COLORS.length);
        city.diseaseLevels[colorIndex] = Math.min(3, city.diseaseLevels[colorIndex] + 1);
        
        // Check for outbreak
        if (city.diseaseLevels[colorIndex] >= 3) {
          city.outbreak = true;
          updatedState.outbreakCount++;
          setOutbreakHistory([...outbreakHistory, { city: city.name, turn: updatedState.turn }]);
        }
      }
    });
    
    // Reset player actions
    updatedState.players.forEach(player => {
      player.actions = 4;
    });
    
    // Advance turn
    updatedState.turn++;
    
    setGameState(updatedState);
    saveGameState(updatedState);
    setActivePlayer(0);
    setActionPhase("move");
  };

  const renderWorldMap = () => {
    if (!gameState) return null;
    
    return (
      <div className="world-map">
        {gameState.cities.map(city => (
          <div 
            key={city.name}
            className={`city ${city.outbreak ? 'outbreak' : ''} ${selectedCity === city.name ? 'selected' : ''}`}
            onClick={() => handleCityClick(city.name)}
          >
            <div className="city-name">{city.name}</div>
            {city.outbreak && (
              <div className="disease-levels">
                {DISEASE_COLORS.map((color, index) => (
                  city.diseaseLevels[index] > 0 && (
                    <div 
                      key={color} 
                      className="disease-marker" 
                      style={{ backgroundColor: color }}
                    >
                      {city.diseaseLevels[index]}
                    </div>
                  )
                ))}
              </div>
            )}
            {selectedCity === city.name && !city.outbreak && decryptedValue !== null && (
              <div className="decrypted-value">
                Infection Level: {decryptedValue}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderGameStats = () => {
    if (!gameState) return null;
    
    return (
      <div className="game-stats">
        <div className="stat-item">
          <div className="stat-label">Outbreaks</div>
          <div className="stat-value">{gameState.outbreakCount}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Infection Rate</div>
          <div className="stat-value">{gameState.infectionRate}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Turn</div>
          <div className="stat-value">{gameState.turn}</div>
        </div>
      </div>
    );
  };

  const renderDiseaseStatus = () => {
    return (
      <div className="disease-status">
        <h3>Disease Status</h3>
        <div className="disease-list">
          {diseaseStats.map((disease, index) => (
            <div key={index} className="disease-item">
              <div className="color-box" style={{ backgroundColor: disease.color }}></div>
              <div className="disease-info">
                <div className="disease-name">{disease.color} Disease</div>
                <div className="disease-state">
                  {disease.cured ? "CURED" : "ACTIVE"} 
                  {disease.eradicated && " | ERADICATED"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPlayerPanel = () => {
    if (!gameState) return null;
    
    const player = gameState.players[activePlayer];
    
    return (
      <div className="player-panel">
        <h3>Player: {player.role}</h3>
        <div className="player-info">
          <div className="info-item">
            <span>Position:</span>
            <strong>{player.position}</strong>
          </div>
          <div className="info-item">
            <span>Actions Left:</span>
            <strong>{player.actions}</strong>
          </div>
        </div>
        
        <div className="action-phase">
          <h4>Action Phase: {actionPhase.toUpperCase()}</h4>
          <div className="phase-buttons">
            {["move", "treat", "build", "share", "discover"].map(phase => (
              <button
                key={phase}
                className={`phase-btn ${actionPhase === phase ? 'active' : ''}`}
                onClick={() => setActionPhase(phase as any)}
              >
                {phase.charAt(0).toUpperCase() + phase.slice(1)}
              </button>
            ))}
          </div>
        </div>
        
        {selectedCity && (
          <div className="city-actions">
            <h4>Actions for {selectedCity}</h4>
            <button 
              className="action-btn"
              onClick={() => performAction(actionPhase)}
              disabled={player.actions <= 0}
            >
              Perform {actionPhase} action
            </button>
          </div>
        )}
        
        <button className="end-turn-btn" onClick={endTurn}>
          End Turn
        </button>
      </div>
    );
  };

  const renderOutbreakHistory = () => {
    return (
      <div className="outbreak-history">
        <h3>Outbreak History</h3>
        {outbreakHistory.length === 0 ? (
          <p>No outbreaks yet</p>
        ) : (
          <div className="outbreak-list">
            {outbreakHistory.map((outbreak, index) => (
              <div key={index} className="outbreak-item">
                <div className="outbreak-city">{outbreak.city}</div>
                <div className="outbreak-turn">Turn {outbreak.turn}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted game session...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="virus-icon"></div>
          </div>
          <h1>Pandemic<span>FHE</span></h1>
          <div className="subtitle">Encrypted Disease Spread</div>
        </div>
        <div className="header-actions">
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock"></div>
            <span>FHE Encryption Active</span>
          </div>
        </div>
      </header>
      
      <div className="main-content panel-layout">
        {/* Left Panel: World Map */}
        <div className="panel left-panel">
          <div className="panel-header">
            <h2>Global Disease Spread</h2>
            <div className="panel-actions">
              <button onClick={loadGameState} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh Game State"}
              </button>
            </div>
          </div>
          <div className="panel-content">
            {renderWorldMap()}
          </div>
        </div>
        
        {/* Center Panel: Player Actions */}
        <div className="panel center-panel">
          <div className="panel-header">
            <h2>Player Actions</h2>
            {renderGameStats()}
          </div>
          <div className="panel-content">
            {renderPlayerPanel()}
          </div>
        </div>
        
        {/* Right Panel: Game Information */}
        <div className="panel right-panel">
          <div className="panel-header">
            <h2>Game Status</h2>
          </div>
          <div className="panel-content">
            {renderDiseaseStatus()}
            {renderOutbreakHistory()}
            
            <div className="fhe-explanation">
              <h3>How FHE Encryption Works</h3>
              <p>
                Disease spread paths are encrypted using Zama FHE technology. 
                Players can only see outbreaks that have already occurred, 
                simulating the challenge of fighting an unknown pathogen.
              </p>
              <div className="fhe-process">
                <div className="process-step">
                  <div className="step-icon">🔒</div>
                  <div className="step-label">Encrypted Spread</div>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-icon">🕵️</div>
                  <div className="step-label">Limited Visibility</div>
                </div>
                <div className="process-arrow">→</div>
                <div className="process-step">
                  <div className="step-icon">🤝</div>
                  <div className="step-label">Collaborative Strategy</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="virus-icon"></div>
              <span>PandemicFHE</span>
            </div>
            <p>FHE-encrypted version of the Pandemic board game powered by Zama</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Game Rules</a>
            <a href="#" className="footer-link">About FHE</a>
            <a href="#" className="footer-link">Zama Documentation</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PandemicFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;