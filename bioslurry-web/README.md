# 🧬 BioSlurry Simulator

> Simulador de Biorremediación de Glifosato en Sistema Bioslurry

![React](https://img.shields.io/badge/React-18.2-61dafb?logo=react)
![Three.js](https://img.shields.io/badge/Three.js-0.160-black?logo=three.js)
![Vite](https://img.shields.io/badge/Vite-5.0-646cff?logo=vite)
![License](https://img.shields.io/badge/License-MIT-green)

## 🎯 Descripción

Modelo computacional interactivo para simular la degradación de glifosato en un reactor bioslurry. Incluye:

- **Reactor 3D** con visualización de partículas en tiempo real
- **Motor de simulación** basado en cinética de Monod
- **Gráficas dinámicas** de concentración y remoción
- **Exportación CSV** de resultados
- **Panel de control** con todos los parámetros ajustables

## 🚀 Demo en Vivo

👉 **[Ver Simulador](https://TU-USUARIO.github.io/bioslurry-simulator/)**

## 📸 Capturas

| Reactor 3D | Gráficas | Panel de Control |
|------------|----------|------------------|
| ![reactor](docs/reactor.png) | ![charts](docs/charts.png) | ![panel](docs/panel.png) |

## 🔬 Modelo Matemático

### Ecuaciones Diferenciales

```
Degradación de Glifosato:
dC_G/dt = -k_max · (C_G/(K_s+C_G)) · X - k_sorp · (C_G,aq - C_G,s/K_d)

Formación de AMPA:
dC_A/dt = Y_A · r_degradación - k_A · C_A

Crecimiento Microbiano (Monod):
dX/dt = μ_max · (C_G/(K_s+C_G)) · X - k_d · X

Sorción:
dC_G,s/dt = k_sorp · (C_G,aq - C_G,s/K_d) / θ
```

### Variables de Respuesta

| Variable | Descripción | Unidad |
|----------|-------------|--------|
| %R(t) | Remoción total | % |
| C_G,aq(t) | Concentración residual | mg/L |
| X_max | Biomasa máxima | mg/L |
| T₉₀ | Tiempo para 90% remoción | días |
| C_A,peak | Pico de AMPA | mg/L |

## 🛠️ Instalación Local

### Requisitos
- Node.js 18+ 
- npm o yarn

### Pasos

```bash
# 1. Clonar repositorio
git clone https://github.com/TU-USUARIO/bioslurry-simulator.git
cd bioslurry-simulator

# 2. Instalar dependencias
npm install

# 3. Ejecutar en desarrollo
npm run dev

# 4. Abrir en navegador
# http://localhost:5173
```

## 📦 Despliegue en GitHub Pages

### Configuración Inicial (solo una vez)

1. **Crear repositorio en GitHub**
   - Ve a [github.com/new](https://github.com/new)
   - Nombre: `bioslurry-simulator`
   - Público ✅

2. **Subir código**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/bioslurry-simulator.git
   git push -u origin main
   ```

3. **Activar GitHub Pages**
   - Ve a tu repositorio → Settings → Pages
   - Source: **GitHub Actions**
   - Guarda

4. **¡Listo!** Tu sitio estará en:
   ```
   https://TU-USUARIO.github.io/bioslurry-simulator/
   ```

### Actualizar el Simulador

Cada vez que quieras hacer cambios:

```bash
# 1. Hacer cambios en el código

# 2. Guardar cambios
git add .
git commit -m "Descripción de los cambios"

# 3. Subir a GitHub (se despliega automáticamente)
git push
```

## 📁 Estructura del Proyecto

```
bioslurry-simulator/
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions para deploy automático
├── public/
│   └── favicon.svg         # Icono del sitio
├── src/
│   ├── App.jsx             # Componente principal + simulador
│   ├── main.jsx            # Punto de entrada
│   └── index.css           # Estilos globales
├── index.html              # HTML principal
├── package.json            # Dependencias
├── vite.config.js          # Configuración de Vite
├── tailwind.config.js      # Configuración de Tailwind
└── README.md               # Este archivo
```

## ⚙️ Parámetros del Modelo

### Condiciones Iniciales
| Parámetro | Símbolo | Unidad | Rango |
|-----------|---------|--------|-------|
| Concentración inicial glifosato | C_G,aq,0 | mg/L | 1-1000 |
| Biomasa inicial | X₀ | mg/L | 1-100 |

### Cinética de Biodegradación
| Parámetro | Símbolo | Unidad | Rango |
|-----------|---------|--------|-------|
| Tasa máx. degradación | k_max | 1/h | 0.001-1 |
| Const. semisaturación | K_s | mg/L | 1-100 |
| Tasa máx. crecimiento | μ_max | 1/h | 0.001-0.5 |
| Tasa muerte microbiana | k_d | 1/h | 0.0001-0.1 |

### Sorción
| Parámetro | Símbolo | Unidad | Rango |
|-----------|---------|--------|-------|
| Coef. distribución | K_d | L/kg | 1-500 |
| Tasa de sorción | k_sorp | 1/h | 0.001-1 |
| Relación sólido/líquido | θ | kg/L | 0.01-0.5 |

## 🎨 Personalización

### Cambiar Parámetros por Defecto

Edita `src/App.jsx`, sección `DEFAULT_PARAMS`:

```javascript
const DEFAULT_PARAMS = {
  C_G_aq_0: 100,    // Tu valor inicial
  k_max: 0.08,      // Tu tasa de degradación
  // ... más parámetros
};
```

### Agregar Nuevo Contaminante

1. Modifica las ecuaciones en `runSimulation()`
2. Actualiza el panel `ContaminantInfo`
3. Ajusta las partículas 3D

## 📊 Exportar Resultados

1. Ejecuta una simulación
2. Ve a la pestaña "📊 Datos"
3. Clic en "📥 Exportar CSV"

El archivo CSV incluye:
- Tiempo (horas y días)
- Concentración de glifosato (acuoso y sorbido)
- Concentración de AMPA
- Biomasa
- % de remoción

## 🤝 Contribuir

1. Fork del repositorio
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`
3. Haz commit: `git commit -m 'Agrega nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

## 📄 Licencia

MIT License - Libre para uso académico y comercial.

## 👨‍🔬 Créditos

Desarrollado para el curso de **Biotecnología Ambiental**

---

⭐ Si te fue útil, ¡dale una estrella al repositorio!
