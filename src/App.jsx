import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Cylinder, Sphere, Box } from '@react-three/drei';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import * as THREE from 'three';

// ============================================================================
// CONFIGURACIÓN DE PARÁMETROS POR DEFECTO
// ============================================================================
const DEFAULT_PARAMS = {
  // Condiciones iniciales
  C_G_aq_0: 100,      // Concentración inicial de glifosato en agua (mg/L)
  C_G_s_0: 0,         // Concentración inicial de glifosato en sólido (mg/kg)
  C_A_aq_0: 0,        // Concentración inicial de AMPA (mg/L)
  X_0: 10,            // Biomasa inicial (mg/L)
  
  // Parámetros cinéticos
  k_max: 0.08,        // Tasa máxima de degradación (1/h)
  K_s: 20,            // Constante de semisaturación (mg/L)
  mu_max: 0.05,       // Tasa máxima de crecimiento microbiano (1/h)
  k_d: 0.005,         // Tasa de muerte microbiana (1/h)
  Y_x: 0.3,           // Rendimiento biomasa/sustrato (mg biomasa/mg glifosato)
  
  // Parámetros de sorción
  K_d: 50,            // Coeficiente de distribución (L/kg)
  k_sorp: 0.1,        // Tasa de sorción (1/h)
  theta: 0.1,         // Relación sólido/líquido (kg/L)
  
  // Parámetros AMPA
  Y_A: 0.6,           // Rendimiento AMPA/glifosato (mol/mol)
  k_A: 0.02,          // Tasa de degradación de AMPA (1/h)
  
  // Tiempo de simulación
  t_final: 336,       // Tiempo final (horas) = 14 días
  dt: 0.5,            // Paso de tiempo (horas)
};

// ============================================================================
// MOTOR DE SIMULACIÓN - ECUACIONES DIFERENCIALES
// ============================================================================
const runSimulation = (params) => {
  const {
    C_G_aq_0, C_G_s_0, C_A_aq_0, X_0,
    k_max, K_s, mu_max, k_d, Y_x,
    K_d, k_sorp, theta,
    Y_A, k_A,
    t_final, dt
  } = params;

  let C_G_aq = C_G_aq_0;
  let C_G_s = C_G_s_0;
  let C_A_aq = C_A_aq_0;
  let X = X_0;

  const results = [];
  const C_total_0 = C_G_aq_0 + theta * C_G_s_0;

  for (let t = 0; t <= t_final; t += dt) {
    const monod = C_G_aq / (K_s + C_G_aq + 1e-10);
    
    const r_degradation = k_max * monod * X;
    const r_sorption = k_sorp * (C_G_aq - C_G_s / K_d);
    const r_growth = mu_max * monod * X;
    const r_death = k_d * X;
    const r_AMPA_formation = Y_A * r_degradation;
    const r_AMPA_degradation = k_A * C_A_aq;

    const dC_G_aq = -r_degradation - r_sorption;
    const dC_G_s = r_sorption / theta;
    const dC_A_aq = r_AMPA_formation - r_AMPA_degradation;
    const dX = r_growth - r_death;

    const C_total = C_G_aq + theta * C_G_s;
    const removal_percent = 100 * (1 - C_total / C_total_0);
    
    results.push({
      time_h: t,
      time_days: t / 24,
      C_G_aq: Math.max(0, C_G_aq),
      C_G_s: Math.max(0, C_G_s),
      C_A_aq: Math.max(0, C_A_aq),
      X: Math.max(0, X),
      C_total: Math.max(0, C_total),
      removal_percent: Math.min(100, Math.max(0, removal_percent)),
      monod_factor: monod,
      r_degradation,
      r_sorption
    });

    C_G_aq = Math.max(0, C_G_aq + dC_G_aq * dt);
    C_G_s = Math.max(0, C_G_s + dC_G_s * dt);
    C_A_aq = Math.max(0, C_A_aq + dC_A_aq * dt);
    X = Math.max(0, X + dX * dt);
  }

  return results;
};

const calculateMetrics = (results, params) => {
  const day3 = results.find(r => Math.abs(r.time_days - 3) < 0.1) || results[0];
  const day7 = results.find(r => Math.abs(r.time_days - 7) < 0.1) || results[0];
  const day14 = results.find(r => Math.abs(r.time_days - 14) < 0.1) || results[results.length - 1];
  
  const X_max_point = results.reduce((max, r) => r.X > max.X ? r : max, results[0]);
  const AMPA_peak = results.reduce((max, r) => r.C_A_aq > max.C_A_aq ? r : max, results[0]);
  
  const T90_point = results.find(r => r.removal_percent >= 90);
  const T90 = T90_point ? T90_point.time_days : null;

  return {
    removal_day3: day3.removal_percent,
    removal_day7: day7.removal_percent,
    removal_day14: day14.removal_percent,
    C_G_aq_day3: day3.C_G_aq,
    C_G_aq_day7: day7.C_G_aq,
    C_G_aq_day14: day14.C_G_aq,
    X_max: X_max_point.X,
    t_X_max: X_max_point.time_days,
    X_final: results[results.length - 1].X,
    C_A_peak: AMPA_peak.C_A_aq,
    t_A_peak: AMPA_peak.time_days,
    T90: T90,
    final_removal: results[results.length - 1].removal_percent
  };
};

// ============================================================================
// COMPONENTES 3D DEL REACTOR
// ============================================================================

const ContaminantParticles = ({ concentration, maxConcentration, phase = 'aqueous' }) => {
  const particlesRef = useRef();
  const count = Math.floor((concentration / maxConcentration) * 200) + 10;
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.8;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = phase === 'aqueous' 
        ? -1 + Math.random() * 3 
        : -2.5 + Math.random() * 1;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return pos;
  }, [count, phase]);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.002;
      const positions = particlesRef.current.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] += Math.sin(state.clock.elapsedTime + i) * 0.001;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  const color = phase === 'aqueous' ? '#ff6b6b' : '#ffa502';

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color={color}
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
};

const BacteriaParticles = ({ biomass, maxBiomass }) => {
  const groupRef = useRef();
  const count = Math.floor((biomass / maxBiomass) * 50) + 5;

  const positions = useMemo(() => {
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 3.5,
      y: -1.5 + Math.random() * 3,
      z: (Math.random() - 0.5) * 3.5,
      speed: 0.5 + Math.random() * 1
    }));
  }, [count]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const pos = positions[i];
        if (pos) {
          child.position.x = pos.x + Math.sin(state.clock.elapsedTime * pos.speed + i) * 0.1;
          child.position.y = pos.y + Math.cos(state.clock.elapsedTime * pos.speed + i) * 0.05;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {positions.map((pos, i) => (
        <Sphere key={i} args={[0.06, 8, 8]} position={[pos.x, pos.y, pos.z]}>
          <meshStandardMaterial color="#2ed573" emissive="#2ed573" emissiveIntensity={0.3} />
        </Sphere>
      ))}
    </group>
  );
};

const AMPAParticles = ({ concentration, maxConcentration }) => {
  const particlesRef = useRef();
  const count = Math.floor((concentration / Math.max(maxConcentration, 1)) * 100) + 5;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.8;
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = -1 + Math.random() * 3;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y -= 0.001;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        color="#a55eea"
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
};

const AgitatorBlades = () => {
  const bladesRef = useRef();

  useFrame(() => {
    if (bladesRef.current) {
      bladesRef.current.rotation.y += 0.02;
    }
  });

  return (
    <group ref={bladesRef} position={[0, -0.5, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <Box
          key={i}
          args={[0.8, 0.05, 0.15]}
          position={[0.5 * Math.cos(i * Math.PI / 2), 0, 0.5 * Math.sin(i * Math.PI / 2)]}
          rotation={[0, i * Math.PI / 2, 0]}
        >
          <meshStandardMaterial color="#95a5a6" metalness={0.8} />
        </Box>
      ))}
    </group>
  );
};

const AerationBubbles = () => {
  const [bubbles, setBubbles] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBubbles(prev => {
        const newBubbles = prev
          .map(b => ({ ...b, y: b.y + 0.05 }))
          .filter(b => b.y < 2);
        
        if (Math.random() > 0.7) {
          newBubbles.push({
            id: Date.now(),
            x: (Math.random() - 0.5) * 2,
            y: -2,
            z: (Math.random() - 0.5) * 2,
            size: 0.02 + Math.random() * 0.03
          });
        }
        return newBubbles.slice(-30);
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <group>
      {bubbles.map(b => (
        <Sphere key={b.id} args={[b.size, 8, 8]} position={[b.x, b.y, b.z]}>
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={0.6}
            roughness={0}
          />
        </Sphere>
      ))}
    </group>
  );
};

const BioslurryReactor = ({ currentData, params }) => {
  const waterRef = useRef();

  useFrame((state) => {
    if (waterRef.current) {
      waterRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
  });

  const waterLevel = 2.5;
  const sedimentLevel = 0.8;

  return (
    <group>
      {/* Tanque del reactor */}
      <Cylinder args={[2.2, 2.2, 5, 32, 1, true]} position={[0, 0, 0]}>
        <meshPhysicalMaterial
          color="#88c8f7"
          transparent
          opacity={0.15}
          roughness={0}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </Cylinder>

      {/* Base del reactor */}
      <Cylinder args={[2.3, 2.5, 0.3, 32]} position={[0, -2.65, 0]}>
        <meshStandardMaterial color="#34495e" metalness={0.8} roughness={0.2} />
      </Cylinder>

      {/* Tapa superior */}
      <Cylinder args={[2.4, 2.2, 0.2, 32]} position={[0, 2.6, 0]}>
        <meshStandardMaterial color="#34495e" metalness={0.8} roughness={0.2} />
      </Cylinder>

      {/* Agua/medio líquido */}
      <group ref={waterRef}>
        <Cylinder args={[2.1, 2.1, waterLevel, 32]} position={[0, -0.5, 0]}>
          <meshPhysicalMaterial
            color="#74b9ff"
            transparent
            opacity={0.4}
            roughness={0}
            transmission={0.6}
          />
        </Cylinder>
      </group>

      {/* Sedimento/lodo */}
      <Cylinder args={[2.1, 2.1, sedimentLevel, 32]} position={[0, -2.1, 0]}>
        <meshStandardMaterial color="#795548" roughness={0.9} />
      </Cylinder>

      {/* Agitador central */}
      <Cylinder args={[0.08, 0.08, 4, 8]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color="#7f8c8d" metalness={0.9} />
      </Cylinder>

      <AgitatorBlades />

      <ContaminantParticles 
        concentration={currentData.C_G_aq} 
        maxConcentration={params.C_G_aq_0}
        phase="aqueous"
      />

      <ContaminantParticles 
        concentration={currentData.C_G_s} 
        maxConcentration={params.C_G_aq_0 * 2}
        phase="solid"
      />

      <BacteriaParticles 
        biomass={currentData.X} 
        maxBiomass={params.X_0 * 5}
      />

      <AMPAParticles 
        concentration={currentData.C_A_aq}
        maxConcentration={params.C_G_aq_0 * 0.5}
      />

      <AerationBubbles />

      <Text position={[0, 3.2, 0]} fontSize={0.25} color="#2c3e50">
        REACTOR BIOSLURRY
      </Text>
      <Text position={[3, 1, 0]} fontSize={0.15} color="#e74c3c" anchorX="left">
        ● Glifosato (aq)
      </Text>
      <Text position={[3, 0.6, 0]} fontSize={0.15} color="#f39c12" anchorX="left">
        ● Glifosato (sorbido)
      </Text>
      <Text position={[3, 0.2, 0]} fontSize={0.15} color="#27ae60" anchorX="left">
        ● Biomasa
      </Text>
      <Text position={[3, -0.2, 0]} fontSize={0.15} color="#9b59b6" anchorX="left">
        ● AMPA
      </Text>
    </group>
  );
};

// ============================================================================
// COMPONENTES DE UI
// ============================================================================

const ParameterPanel = ({ params, setParams, onSimulate }) => {
  const paramGroups = [
    {
      title: '🧪 Condiciones Iniciales',
      params: [
        { key: 'C_G_aq_0', label: 'Glifosato inicial (C_G,aq,0)', unit: 'mg/L', min: 1, max: 1000, step: 1 },
        { key: 'X_0', label: 'Biomasa inicial (X₀)', unit: 'mg/L', min: 1, max: 100, step: 1 },
      ]
    },
    {
      title: '⚗️ Cinética de Biodegradación',
      params: [
        { key: 'k_max', label: 'Tasa máx. degradación (k_max)', unit: '1/h', min: 0.001, max: 1, step: 0.001 },
        { key: 'K_s', label: 'Const. semisaturación (Ks)', unit: 'mg/L', min: 1, max: 100, step: 1 },
        { key: 'mu_max', label: 'Tasa máx. crecimiento (μ_max)', unit: '1/h', min: 0.001, max: 0.5, step: 0.001 },
        { key: 'k_d', label: 'Tasa muerte microbiana (k_d)', unit: '1/h', min: 0.0001, max: 0.1, step: 0.0001 },
        { key: 'Y_x', label: 'Rendimiento biomasa (Y_x)', unit: 'mg/mg', min: 0.01, max: 1, step: 0.01 },
      ]
    },
    {
      title: '🔄 Sorción',
      params: [
        { key: 'K_d', label: 'Coef. distribución (Kd)', unit: 'L/kg', min: 1, max: 500, step: 1 },
        { key: 'k_sorp', label: 'Tasa de sorción (k_sorp)', unit: '1/h', min: 0.001, max: 1, step: 0.001 },
        { key: 'theta', label: 'Relación sólido/líquido (θ)', unit: 'kg/L', min: 0.01, max: 0.5, step: 0.01 },
      ]
    },
    {
      title: '☠️ Metabolito AMPA',
      params: [
        { key: 'Y_A', label: 'Rendimiento AMPA (Y_A)', unit: 'mol/mol', min: 0.1, max: 1, step: 0.01 },
        { key: 'k_A', label: 'Degradación AMPA (k_A)', unit: '1/h', min: 0.001, max: 0.5, step: 0.001 },
      ]
    },
    {
      title: '⏱️ Simulación',
      params: [
        { key: 't_final', label: 'Tiempo final', unit: 'horas', min: 24, max: 720, step: 24 },
      ]
    }
  ];

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 shadow-2xl">
      <h2 className="text-xl font-bold text-cyan-400 mb-6 flex items-center gap-2">
        <span className="text-2xl">⚙️</span> Panel de Control
      </h2>
      
      {paramGroups.map((group, idx) => (
        <div key={idx} className="mb-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 border-b border-slate-700 pb-2">
            {group.title}
          </h3>
          <div className="space-y-4">
            {group.params.map((p) => (
              <div key={p.key} className="group">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-400 group-hover:text-cyan-400 transition-colors">
                    {p.label}
                  </label>
                  <span className="text-xs font-mono text-cyan-300 bg-slate-800 px-2 py-0.5 rounded">
                    {params[p.key]} {p.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={params[p.key]}
                  onChange={(e) => setParams({ ...params, [p.key]: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={onSimulate}
        className="w-full py-3 px-6 bg-gradient-to-r from-cyan-500 to-blue-600 
          text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30
          hover:shadow-cyan-500/50 hover:scale-[1.02] transition-all duration-300
          flex items-center justify-center gap-2"
      >
        <span className="text-xl">▶️</span> EJECUTAR SIMULACIÓN
      </button>
    </div>
  );
};

const ContaminantInfo = () => (
  <div className="bg-gradient-to-br from-red-900/40 to-orange-900/40 backdrop-blur-xl rounded-2xl p-6 border border-red-700/30">
    <h2 className="text-xl font-bold text-red-400 mb-4 flex items-center gap-2">
      <span className="text-2xl">☣️</span> Contaminante: Glifosato
    </h2>
    
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div className="bg-slate-900/50 rounded-lg p-3">
        <p className="text-slate-400 text-xs">Fórmula molecular</p>
        <p className="text-white font-mono font-bold">C₃H₈NO₅P</p>
      </div>
      <div className="bg-slate-900/50 rounded-lg p-3">
        <p className="text-slate-400 text-xs">Peso molecular</p>
        <p className="text-white font-mono font-bold">169.07 g/mol</p>
      </div>
      <div className="bg-slate-900/50 rounded-lg p-3">
        <p className="text-slate-400 text-xs">Solubilidad en agua</p>
        <p className="text-white font-mono font-bold">10,500 mg/L</p>
      </div>
      <div className="bg-slate-900/50 rounded-lg p-3">
        <p className="text-slate-400 text-xs">Log Kow</p>
        <p className="text-white font-mono font-bold">-3.2</p>
      </div>
    </div>

    <div className="mt-4 p-3 bg-slate-900/50 rounded-lg">
      <p className="text-slate-400 text-xs mb-1">Rutas de degradación</p>
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 bg-red-600/30 text-red-300 rounded">Glifosato</span>
        <span className="text-slate-500">→</span>
        <span className="px-2 py-1 bg-purple-600/30 text-purple-300 rounded">AMPA</span>
        <span className="text-slate-500">→</span>
        <span className="px-2 py-1 bg-green-600/30 text-green-300 rounded">CO₂ + NH₃</span>
      </div>
    </div>

    <div className="mt-4 p-3 bg-amber-900/30 rounded-lg border border-amber-700/30">
      <p className="text-amber-400 text-xs font-semibold mb-1">⚠️ Impacto Ambiental</p>
      <p className="text-slate-300 text-xs">
        El glifosato puede contaminar agua, suelo y aire. El metabolito AMPA 
        es igualmente tóxico y más persistente en el ambiente.
      </p>
    </div>
  </div>
);

const MetricsDisplay = ({ metrics }) => {
  const metricCards = [
    { label: 'Remoción día 3', value: metrics?.removal_day3?.toFixed(1) || '—', unit: '%', color: 'cyan' },
    { label: 'Remoción día 7', value: metrics?.removal_day7?.toFixed(1) || '—', unit: '%', color: 'blue' },
    { label: 'Remoción día 14', value: metrics?.removal_day14?.toFixed(1) || '—', unit: '%', color: 'indigo' },
    { label: 'T₉₀', value: metrics?.T90?.toFixed(1) || 'N/A', unit: 'días', color: 'green' },
    { label: 'Biomasa máx', value: metrics?.X_max?.toFixed(1) || '—', unit: 'mg/L', color: 'emerald' },
    { label: 'Pico AMPA', value: metrics?.C_A_peak?.toFixed(2) || '—', unit: 'mg/L', color: 'purple' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {metricCards.map((m, i) => (
        <div 
          key={i}
          className="bg-slate-900/60 backdrop-blur rounded-xl p-4 border border-slate-600/20
            hover:border-cyan-500/50 transition-colors"
        >
          <p className="text-slate-400 text-xs mb-1">{m.label}</p>
          <p className="text-2xl font-bold text-cyan-400 font-mono">
            {m.value}
            <span className="text-sm text-slate-500 ml-1">{m.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
};

const ResultsTable = ({ results, onExport }) => {
  const displayResults = results.filter((_, i) => i % 48 === 0 || i === results.length - 1);

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-200">📊 Tabla de Resultados</h3>
        <button
          onClick={onExport}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold
            rounded-lg transition-colors flex items-center gap-2"
        >
          <span>📥</span> Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-3 text-slate-400 font-medium">Día</th>
              <th className="text-right py-2 px-3 text-red-400 font-medium">C_G,aq (mg/L)</th>
              <th className="text-right py-2 px-3 text-orange-400 font-medium">C_G,s (mg/kg)</th>
              <th className="text-right py-2 px-3 text-purple-400 font-medium">AMPA (mg/L)</th>
              <th className="text-right py-2 px-3 text-green-400 font-medium">X (mg/L)</th>
              <th className="text-right py-2 px-3 text-cyan-400 font-medium">Remoción (%)</th>
            </tr>
          </thead>
          <tbody>
            {displayResults.map((r, i) => (
              <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                <td className="py-2 px-3 text-slate-300 font-mono">{r.time_days.toFixed(1)}</td>
                <td className="py-2 px-3 text-right text-red-300 font-mono">{r.C_G_aq.toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-orange-300 font-mono">{r.C_G_s.toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-purple-300 font-mono">{r.C_A_aq.toFixed(3)}</td>
                <td className="py-2 px-3 text-right text-green-300 font-mono">{r.X.toFixed(2)}</td>
                <td className="py-2 px-3 text-right text-cyan-300 font-mono">{r.removal_percent.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SimulationCharts = ({ results }) => {
  const chartData = results.filter((_, i) => i % 4 === 0);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-bold text-slate-200 mb-4">📈 Cinética de Degradación</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="time_days" 
              stroke="#94a3b8"
              label={{ value: 'Tiempo (días)', position: 'bottom', fill: '#94a3b8' }}
            />
            <YAxis stroke="#94a3b8" label={{ value: 'mg/L', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Legend />
            <Line type="monotone" dataKey="C_G_aq" name="Glifosato (aq)" stroke="#ef4444" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="C_A_aq" name="AMPA" stroke="#a855f7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="X" name="Biomasa" stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-bold text-slate-200 mb-4">🎯 Eficiencia de Remoción</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time_days" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
            <Area 
              type="monotone" 
              dataKey="removal_percent" 
              name="% Remoción"
              stroke="#06b6d4"
              fill="url(#removalGradient)"
              strokeWidth={2}
            />
            <defs>
              <linearGradient id="removalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <h3 className="text-lg font-bold text-slate-200 mb-4">🔄 Distribución Glifosato</h3>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="time_days" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }} />
            <Legend />
            <Area type="monotone" dataKey="C_G_aq" name="Fase acuosa" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
            <Area type="monotone" dataKey="C_G_s" name="Fase sorbida" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function App() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [results, setResults] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState('reactor');

  const handleSimulate = useCallback(() => {
    const simResults = runSimulation(params);
    setResults(simResults);
    setMetrics(calculateMetrics(simResults, params));
    setCurrentTimeIndex(0);
    setIsPlaying(true);
  }, [params]);

  useEffect(() => {
    if (!isPlaying || results.length === 0) return;

    const interval = setInterval(() => {
      setCurrentTimeIndex(prev => {
        if (prev >= results.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 2;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, results.length]);

  const exportToCSV = () => {
    if (results.length === 0) return;

    const headers = ['Tiempo (h)', 'Tiempo (días)', 'C_G_aq (mg/L)', 'C_G_s (mg/kg)', 'C_A_aq (mg/L)', 'X (mg/L)', 'Remoción (%)'];
    const rows = results.map(r => [
      r.time_h.toFixed(2),
      r.time_days.toFixed(3),
      r.C_G_aq.toFixed(4),
      r.C_G_s.toFixed(4),
      r.C_A_aq.toFixed(4),
      r.X.toFixed(4),
      r.removal_percent.toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bioslurry_simulation_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const currentData = results[currentTimeIndex] || {
    C_G_aq: params.C_G_aq_0,
    C_G_s: 0,
    C_A_aq: 0,
    X: params.X_0,
    time_days: 0,
    removal_percent: 0
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 
                flex items-center justify-center text-2xl shadow-lg shadow-cyan-500/30">
                🧬
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 
                  bg-clip-text text-transparent">
                  BioSlurry Simulator
                </h1>
                <p className="text-sm text-slate-400">
                  Modelación de Biorremediación de Glifosato
                </p>
              </div>
            </div>

            {results.length > 0 && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  {isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">Día:</span>
                  <span className="text-cyan-400 font-mono font-bold text-lg">
                    {currentData.time_days.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={results.length - 1}
                  value={currentTimeIndex}
                  onChange={(e) => {
                    setCurrentTimeIndex(parseInt(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-48 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel */}
          <div className="lg:col-span-3 space-y-6">
            <ParameterPanel 
              params={params} 
              setParams={setParams} 
              onSimulate={handleSimulate}
            />
            <ContaminantInfo />
          </div>

          {/* Center */}
          <div className="lg:col-span-6 space-y-6">
            <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl">
              {[
                { id: 'reactor', label: '🏭 Reactor 3D' },
                { id: 'charts', label: '📈 Gráficas' },
                { id: 'table', label: '📊 Datos' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'reactor' && (
              <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 
                overflow-hidden relative" style={{ height: '600px' }}>
                <Canvas camera={{ position: [8, 4, 8], fov: 50 }}>
                  <color attach="background" args={['#0f172a']} />
                  <ambientLight intensity={0.4} />
                  <pointLight position={[10, 10, 10]} intensity={1} />
                  <pointLight position={[-10, 5, -10]} intensity={0.5} color="#06b6d4" />
                  <BioslurryReactor currentData={currentData} params={params} />
                  <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} minDistance={5} maxDistance={20} />
                  <gridHelper args={[20, 20, '#1e3a5f', '#1e3a5f']} position={[0, -3, 0]} />
                </Canvas>

                <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur rounded-xl p-4 border border-slate-700/50">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-red-400">● Glifosato (aq):</span>
                      <span className="text-white font-mono">{currentData.C_G_aq.toFixed(1)} mg/L</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-orange-400">● Glifosato (s):</span>
                      <span className="text-white font-mono">{currentData.C_G_s.toFixed(1)} mg/kg</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-green-400">● Biomasa:</span>
                      <span className="text-white font-mono">{currentData.X.toFixed(1)} mg/L</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-purple-400">● AMPA:</span>
                      <span className="text-white font-mono">{currentData.C_A_aq.toFixed(2)} mg/L</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'charts' && results.length > 0 && (
              <SimulationCharts results={results} />
            )}

            {activeTab === 'table' && results.length > 0 && (
              <ResultsTable results={results} onExport={exportToCSV} />
            )}

            {(activeTab === 'charts' || activeTab === 'table') && results.length === 0 && (
              <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-12 border border-slate-700/50
                flex flex-col items-center justify-center text-center" style={{ height: '400px' }}>
                <span className="text-6xl mb-4">🔬</span>
                <h3 className="text-xl font-bold text-slate-300 mb-2">Sin datos de simulación</h3>
                <p className="text-slate-400">
                  Configura los parámetros y haz clic en "Ejecutar Simulación"
                </p>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
              <h2 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                <span className="text-2xl">📊</span> Variables de Respuesta
              </h2>
              <MetricsDisplay metrics={metrics} />
            </div>

            <div className="bg-gradient-to-br from-blue-900/30 to-indigo-900/30 backdrop-blur-xl 
              rounded-2xl p-6 border border-blue-700/30">
              <h3 className="text-lg font-bold text-blue-400 mb-4">📐 Modelo Matemático</h3>
              <div className="space-y-3 text-sm font-mono">
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Cinética de Monod</p>
                  <p className="text-blue-300">μ = μ_max · S / (K_s + S)</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Degradación</p>
                  <p className="text-red-300">dC_G/dt = -k_max · (C_G/(K_s+C_G)) · X</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Sorción</p>
                  <p className="text-orange-300">r_sorp = k_sorp · (C_aq - C_s/K_d)</p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Remoción total</p>
                  <p className="text-cyan-300">%R = 100 · (1 - C_tot(t)/C_tot(0))</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-lg font-bold text-slate-200 mb-4">⏱️ Estado Actual</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Tiempo</span>
                  <span className="text-cyan-400 font-mono font-bold">
                    {currentData.time_days.toFixed(2)} días
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Remoción</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {currentData.removal_percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
                    style={{ width: `${currentData.removal_percent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 bg-slate-900/30 mt-8">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex justify-between items-center text-sm text-slate-500 flex-wrap gap-2">
            <p>BioSlurry Simulator v1.0 — Biorremediación de Glifosato</p>
            <p>Biotecnología Ambiental | Simulación Computacional</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
